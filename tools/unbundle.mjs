// Convierte el export de un solo archivo (export/foro-mif.html) en un sitio
// estático normal en site/: index.html + assets/ con imágenes, fuentes y JS.
//
//   npm install
//   npm run build            # imágenes optimizadas (WebP, redimensionadas)
//   npm run build -- --raw   # imágenes originales, útil para comparar píxel a píxel
//
// Si llega un export nuevo, se reemplaza export/foro-mif.html y se vuelve a
// correr. Los parches al template fallan con error si el export cambió de
// forma que ya no calzan, en vez de aplicarse a medias.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "export/foro-mif.html");
const OUT = path.join(ROOT, "site");
const PUBLIC = path.join(ROOT, "public");
const RAW = process.argv.includes("--raw");

const SITE_URL = "https://foromif.org/";
const TITLE = "Foro de Gobernanza y Co-gestión Territorial para el Manejo Integral del Fuego";
const DESCRIPTION = "4 y 5 de octubre de 2026 · Lima, Perú. Pueblos indígenas, comunidades, instituciones y aliados reunidos para prevenir, gestionar y responder de manera integral a los incendios forestales. Inscripción libre y gratuita.";

// Assets con un rol conocido dentro del template.
const HERO_LOGO = "84b5b273-1921-437c-abb7-a3debdc738a4"; // logo blanco sobre la foto principal
const HERO_PHOTO = "d6d182f0-26a7-4093-9b29-f26abe0777cf";
const HEADER_LOGO = "b15b7325-6970-4402-b5ea-5f34e8d58270";
const RUNTIME = "3aa5ddbb-97a3-49d5-9849-2a2420327d00";

// ── Leer el bundle ──────────────────────────────────────────────────────────

const bundle = fs.readFileSync(SRC, "utf8");
function island(type) {
  const m = bundle.match(new RegExp(`<script type="__bundler/${type}">\\n([\\s\\S]*?)\\n  </script>`));
  if (!m) throw new Error(`bundle sin bloque __bundler/${type}`);
  return JSON.parse(m[1]);
}
const manifest = island("manifest");
const extResources = island("ext_resources");
let html = island("template");

function decode(entry) {
  const buf = Buffer.from(entry.data, "base64");
  return entry.compressed ? zlib.gunzipSync(buf) : buf;
}

// ── Nombres de archivo ──────────────────────────────────────────────────────

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 6).join("-");
const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);

// Nombre legible a partir del alt de la primera <img> que usa el asset.
const names = {};
for (const m of html.matchAll(/<img src="([0-9a-f-]{36})" alt="([^"]*)"/g)) {
  names[m[1]] ??= slug(m[2]);
}
names[HERO_LOGO] = "logo-foro-blanco";
names[RUNTIME] = "dc-runtime";
const extIds = Object.fromEntries(extResources.map((r) => [r.uuid, r.id]));
const extNames = { nConv: "foto-n-convocatoria", nProg: "foto-n-programa", nLibro: "foto-n-libro" };
for (const [uuid, id] of Object.entries(extIds)) {
  names[uuid] = extNames[id] ?? path.basename(id).replace(/\.js$/, "");
}

// ── Escribir assets ─────────────────────────────────────────────────────────

fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["assets/img", "assets/fonts", "assets/js"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

async function optimize(uuid, entry, buf) {
  if (RAW || !/^image\/(png|jpeg)$/.test(entry.mime)) return null;
  const img = sharp(buf);
  if (entry.mime === "image/png") {
    // Logos: se muestran a ≤ 86px de alto; 240px cubre pantallas 2.8x.
    return img.resize({ height: 240, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  }
  const width = uuid === HERO_PHOTO ? 1920 : 1600;
  return img.resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
}

const urlFor = {};
const used = new Set();
const report = [];
for (const [uuid, entry] of Object.entries(manifest)) {
  const buf = decode(entry);
  let out = buf;
  let ext = { "image/png": "png", "image/jpeg": "jpg", "font/woff2": "woff2", "text/javascript": "js" }[entry.mime];
  if (!ext) throw new Error(`tipo no contemplado: ${entry.mime} (${uuid})`);
  const opt = await optimize(uuid, entry, buf);
  if (opt && opt.length < buf.length) { out = opt; ext = "webp"; }
  const dir = ext === "woff2" ? "fonts" : ext === "js" ? "js" : "img";
  let base = names[uuid] || `${dir === "fonts" ? "font" : "asset"}-${uuid.slice(0, 8)}`;
  while (used.has(base)) base += "-" + uuid.slice(0, 4);
  used.add(base);
  const rel = `assets/${dir}/${base}.${hash(out)}.${ext}`;
  fs.writeFileSync(path.join(OUT, rel), out);
  urlFor[uuid] = rel;
  report.push([rel, buf.length, out.length]);
}

// ── Template → index.html ───────────────────────────────────────────────────

function patch(label, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`parche "${label}": se esperaba 1 coincidencia, hay ${n}. ¿Cambió el export?`);
  html = html.replace(from, () => to);
}

// Reemplaza lo que hay entre `start` (único, se conserva) y el siguiente `end` (se conserva).
function patchBetween(label, start, end, to) {
  const n = html.split(start).length - 1;
  if (n !== 1) throw new Error(`parche "${label}": se esperaba 1 inicio, hay ${n}. ¿Cambió el export?`);
  const a = html.indexOf(start) + start.length;
  const b = html.indexOf(end, a);
  if (b < 0) throw new Error(`parche "${label}": no se encontró el final. ¿Cambió el export?`);
  html = html.slice(0, a) + to + html.slice(b);
}

for (const [uuid, rel] of Object.entries(urlFor)) html = html.split(uuid).join(rel);

// El runtime busca React (y las fotos de noticias) en window.__resources; sin
// esto lo descarga de unpkg y vuelve a pedir la página para re-parsearla.
const resources = Object.fromEntries(extResources.map((r) => [r.id, urlFor[r.uuid]]));

const head = [
  `<title>${TITLE}</title>`,
  `<meta name="description" content="${DESCRIPTION}">`,
  `<link rel="canonical" href="${SITE_URL}">`,
  `<meta name="theme-color" content="#14100D">`,
  `<link rel="icon" href="favicon.ico" sizes="any">`,
  `<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">`,
  `<link rel="apple-touch-icon" href="apple-touch-icon.png">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:locale" content="es_PE">`,
  `<meta property="og:url" content="${SITE_URL}">`,
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESCRIPTION}">`,
  `<meta property="og:image" content="${SITE_URL}og-image.jpg">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<link rel="preload" as="image" href="${urlFor[HERO_PHOTO]}">`,
  `<script>window.__resources = ${JSON.stringify(resources)};</script>`,
  `<script src="forms.js"></script>`,
].join("\n");

patch("lang", "<!DOCTYPE html>\n<html><head>", "<!DOCTYPE html>\n<html lang=\"es\"><head>");
patch("head", '<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src=',
  `<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}\n<script src=`);

// Formulario de inscripción: mismas preguntas que el formulario de Google del
// comité (forms.js envía cada campo a su pregunta), más el consentimiento.
const FIELD_STYLE = "padding:12px 14px;border:1px solid #D8CFC2;border-radius:3px;background:#FCFAF7;color:#16120F;font-size:15px";
const field = (label, name, { required = false, type = "", placeholder = "" } = {}) => `
          <label style="display:flex;flex-direction:column;gap:7px">
            <span style="font-family:Oswald,sans-serif;text-transform:uppercase;font-size:12px;letter-spacing:.08em;color:#3B332B">${label}${required ? " *" : ""}</span>
            <input name="${name}"${type ? ` type="${type}"` : ""}${required ? ' required="required"' : ""} placeholder="${placeholder}" style="${FIELD_STYLE}" style-focus="border-color:#B4342A;outline:none;background:#fff">
          </label>`;
const row = (...fields) => `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:18px">${fields.join("")}
        </div>`;
patchBetween("campos de inscripción",
  '<form sc-camel-on-submit="{{ submit }}" style="background:#fff;border:1px solid #E3DCD1;padding:clamp(24px,3vw,40px);display:flex;flex-direction:column;gap:20px">',
  '\n        <label style="display:flex;gap:11px;align-items:flex-start',
  row(field("Nombre completo", "nombre", { required: true, placeholder: "Nombres y apellidos" }),
      field("Documento de identidad", "dni", { required: true, placeholder: "DNI / CE / Pasaporte" })) +
  row(field("Institución u organización", "institucion", { required: true, placeholder: "Entidad, comunidad, universidad o empresa" }),
      field("Cargo", "cargo", { placeholder: "Opcional" })) +
  row(field("Correo electrónico", "correo", { required: true, type: "email", placeholder: "nombre@institucion.pe" }),
      field("Teléfono / WhatsApp", "telefono", { placeholder: "+51" })));

// El formulario de Google no envía confirmación por correo: no prometerla.
patch("texto banda", "Inscripción libre y gratuita. Aforo limitado al auditorio: la confirmación se envía por correo electrónico.",
  "Inscripción libre y gratuita. Aforo limitado al auditorio.");
patch("texto intro registro", "Participación libre y gratuita, con aforo limitado. Al completar el formulario recibirás la confirmación de tu inscripción y, al cierre del evento, tu constancia de asistencia virtual.",
  "Participación libre y gratuita, con aforo limitado. Al cierre del evento, las personas registradas recibirán su constancia de asistencia virtual.");
patch("texto éxito", "Recibirás un correo con la confirmación y los detalles de acceso al auditorio.",
  "Tus datos fueron enviados al comité organizador.");
patch("texto aforo", "Aforo limitado. La inscripción no garantiza cupo hasta recibir el correo de confirmación del comité organizador.",
  "Aforo limitado, sujeto a la capacidad del auditorio.");

// Netlify detecta formularios leyendo el HTML al desplegar; los del sitio los
// crea JavaScript, así que se declaran aquí ocultos con los mismos campos que envía forms.js.
patch("formularios Netlify", "</body></html>", `<form name="inscripcion" data-netlify="true" hidden>
<input name="nombre"><input name="dni"><input name="institucion"><input name="cargo"><input name="correo"><input name="telefono"><input name="consent"><input name="google_form"><input name="pagina">
</form>
<form name="consulta" data-netlify="true" hidden>
<input name="nombre"><input name="email"><input name="motivo"><textarea name="mensaje"></textarea>
</form>
</body></html>`);

// Formularios: enviar vía forms.js y mostrar el éxito solo si el envío se registró.
patch("submit inscripción",
  'submit: (e) => { e.preventDefault(); this.setState({ enviado: true }); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); },',
  'submit: (e) => { e.preventDefault(); window.foroEnviar(e.target, "inscripcion").then((ok) => { if (!ok) return; this.setState({ enviado: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }); },');
patch("submit consulta",
  "submitConsulta: (e) => { e.preventDefault(); e.target.reset(); this.setState({ consultaEnviada: true }); }",
  'submitConsulta: (e) => { e.preventDefault(); const f = e.target; window.foroEnviar(f, "consulta").then((ok) => { if (!ok) return; f.reset(); this.setState({ consultaEnviada: true }); }); }');

// Carga diferida para todo lo que no está en la primera pantalla.
const eager = [urlFor[HEADER_LOGO], urlFor[HERO_LOGO], urlFor[HERO_PHOTO]];
html = html.replace(/<img src="([^"]*)"/g, (m, src) => eager.includes(src) ? m : `<img loading="lazy" decoding="async" src="${src}"`);

fs.writeFileSync(path.join(OUT, "index.html"), html);

// ── Íconos e imagen para redes ──────────────────────────────────────────────

// Solo la marca (llama y plumas): columnas 0–295 del logo blanco, sobre el fondo oscuro del sitio.
const mark = await sharp(decode(manifest[HERO_LOGO])).extract({ left: 0, top: 0, width: 296, height: 284 }).trim().png().toBuffer();
async function icon(size, pad, radius) {
  const inner = Math.round(size * (1 - 2 * pad));
  const art = await sharp(mark).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const rx = Math.round(size * radius);
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="#14100D"/></svg>`);
  return sharp(bg).composite([{ input: art, gravity: "center" }]).png().toBuffer();
}
fs.writeFileSync(path.join(OUT, "favicon.ico"), await pngToIco(await Promise.all([16, 32, 48].map((s) => icon(s, 0.06, 0.18)))));
fs.writeFileSync(path.join(OUT, "icon-192.png"), await icon(192, 0.1, 0.18));
fs.writeFileSync(path.join(OUT, "icon-512.png"), await icon(512, 0.1, 0.18));
fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), await icon(180, 0.12, 0));

// Vista previa al compartir el enlace (WhatsApp, Facebook, LinkedIn): foto principal con el logo.
const ogLogo = await sharp(decode(manifest[HERO_LOGO])).resize({ height: 150 }).png().toBuffer();
const shade = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g"><stop offset="0" stop-color="#14100D" stop-opacity=".9"/><stop offset=".65" stop-color="#14100D" stop-opacity=".35"/><stop offset="1" stop-color="#14100D" stop-opacity=".1"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>');
await sharp(decode(manifest[HERO_PHOTO]))
  .resize(1200, 630, { fit: "cover", position: "right" })
  .composite([{ input: shade }, { input: ogLogo, left: 64, top: 240 }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(path.join(OUT, "og-image.jpg"));

// ── Archivos escritos a mano ────────────────────────────────────────────────

fs.cpSync(PUBLIC, OUT, { recursive: true });

// ── Resumen ─────────────────────────────────────────────────────────────────

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + " KB";
let before = 0, after = 0;
for (const [rel, a, b] of report) { before += a; after += b; if (!rel.includes("/fonts/")) console.log(kb(a), "→", kb(b), " ", rel); }
console.log(`\nassets: ${kb(before)} → ${kb(after)}  (${report.length} archivos, ${RAW ? "sin optimizar" : "optimizado"})`);
console.log(`bundle original: ${kb(fs.statSync(SRC).size)}   index.html nuevo: ${kb(fs.statSync(path.join(OUT, "index.html")).size)}`);
