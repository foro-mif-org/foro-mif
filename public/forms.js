// Envío de los formularios del sitio.
//
// Inscripción → 1) formulario de Google del comité organizador (dueño de los datos)
//               2) copia de respaldo en Netlify Forms, con el resultado del paso 1
// Consulta    → Netlify Forms (notificación por correo, Reply-To = quien consulta)
//
// Se carga en el <head> antes que el runtime; los handlers del template llaman
// a window.foroEnviar(form, tipo).

(function () {
  var GFORM = "https://docs.google.com/forms/d/e/1FAIpQLScqn2OOsv4fJMaEzjJmr15-3xQ0yPcywmOzaNsziMxihvbz_Q/formResponse";

  // Campo del sitio → pregunta del formulario de Google. Si el comité edita sus
  // preguntas, estos IDs dejan de calzar y los envíos a Google se pierden en
  // silencio (el respaldo en Netlify los conserva).
  var GFORM_ENTRIES = {
    nombre: "entry.877086558",       // Nombre Completo
    dni: "entry.1498135098",         // DNI
    institucion: "entry.1424661284", // Institución / Organización
    cargo: "entry.2606285",          // Cargo
    correo: "entry.451631947",       // Correo Electrónico
    telefono: "entry.233409494"      // Celular
  };

  // Solo producción escribe en el formulario del comité. En previews y en local
  // se omite, salvo ?gform=1 para una prueba deliberada.
  var ESCRIBIR_EN_GOOGLE = /(^|\.)foromif\.org$/.test(location.hostname) || /[?&]gform=1(&|$)/.test(location.search);

  var TIMEOUT_MS = 12000;

  function post(url, body, opts) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var init = { method: "POST", body: body, signal: ctrl ? ctrl.signal : undefined };
    for (var k in opts) init[k] = opts[k];
    return fetch(url, init).finally(function () { clearTimeout(timer); });
  }

  // Google no permite leer la respuesta (no-cors): "enviado" significa que la
  // petición salió, no que Google la aceptó.
  function enviarGoogle(fd) {
    if (!ESCRIBIR_EN_GOOGLE) return Promise.resolve("omitido");
    var body = new URLSearchParams();
    for (var campo in GFORM_ENTRIES) {
      var v = fd.get(campo);
      if (v) body.append(GFORM_ENTRIES[campo], v);
    }
    return post(GFORM, body, { mode: "no-cors" }).then(
      function () { return "enviado"; },
      function () { return "error"; }
    );
  }

  function enviarNetlify(nombreForm, fd, extra) {
    var body = new URLSearchParams();
    body.append("form-name", nombreForm);
    fd.forEach(function (v, k) { body.append(k, v); });
    for (var k in extra) body.set(k, extra[k]);
    return post("/", body, {}).then(
      function (r) { return r.ok; },
      function () { return false; }
    );
  }

  function mostrarError(form, msg) {
    var box = form.querySelector("[data-foro-error]");
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("data-foro-error", "");
      box.setAttribute("role", "alert");
      box.style.cssText = "background:#FAEEEC;border-left:3px solid #B4342A;padding:12px 14px;font-size:14.5px;line-height:1.55;color:#7A231B";
      form.insertBefore(box, form.querySelector('button[type="submit"]'));
    }
    box.textContent = msg;
  }

  // Resuelve true si el envío quedó registrado; false si falló (y muestra el error).
  window.foroEnviar = function (form, tipo) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return Promise.resolve(false);
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; btn.style.cursor = "wait"; }
    var viejo = form.querySelector("[data-foro-error]");
    if (viejo) viejo.remove();

    var fd = new FormData(form);
    var envio;
    if (tipo === "inscripcion") {
      envio = enviarGoogle(fd).then(function (google) {
        return enviarNetlify("inscripcion", fd, { google_form: google, pagina: location.href }).then(function (respaldo) {
          if (!respaldo) console.warn("[forms] respaldo en Netlify falló; Google:", google);
          return respaldo || google === "enviado";
        });
      });
    } else {
      // Netlify usa el campo "email" como Reply-To de la notificación.
      fd.set("email", fd.get("correo") || "");
      fd.delete("correo");
      envio = enviarNetlify("consulta", fd, {});
    }

    return envio.then(function (ok) {
      if (btn) { btn.disabled = false; btn.style.opacity = ""; btn.style.cursor = ""; }
      if (!ok) mostrarError(form, "No pudimos registrar tu envío. Revisa tu conexión e inténtalo de nuevo.");
      return ok;
    });
  };
})();
