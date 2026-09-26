/**
 * Recibe los formularios de foromif.org y los guarda en esta hoja de cálculo.
 * Es una aplicación web: el sitio envía cada formulario a su URL /exec y este
 * script, que corre con la cuenta dueña de la hoja, agrega una fila.
 *
 * Instalación y despliegue: ver README.md (sección "Hoja de inscripciones").
 * Instalación manual, si no se usa clasp:
 *   1. Crear una hoja de cálculo nueva en la cuenta dueña de los datos.
 *   2. Extensiones > Apps Script. Pegar este archivo y appsscript.json
 *      (Configuración del proyecto > "Mostrar appsscript.json") y guardar.
 *   3. Implementar > Nueva implementación > Aplicación web
 *        Ejecutar como: Yo        Quién tiene acceso: Cualquier usuario
 *   4. Abierta en el navegador, la URL /exec debe mostrar {"ok":true,...}.
 *   5. Compartir la hoja como "Lector" con correos concretos, nunca con
 *      "cualquier persona con el enlace": contiene DNIs.
 */

var HOJAS = {
  inscripcion: {
    nombre: 'Inscripciones',
    campos: ['nombre', 'dni', 'institucion', 'cargo', 'correo', 'telefono'],
    titulos: ['Nombre completo', 'DNI', 'Institución', 'Cargo', 'Correo', 'Teléfono'],
    extra: ['Origen', 'DNI repetido', 'Página', 'ID envío'],
    requeridos: ['nombre', 'dni']
  },
  consulta: {
    nombre: 'Consultas',
    campos: ['nombre', 'correo', 'motivo', 'mensaje'],
    titulos: ['Nombre', 'Correo', 'Motivo', 'Mensaje'],
    extra: ['Página', 'ID envío'],
    requeridos: ['nombre', 'mensaje']
  }
};

// Campo señuelo: invisible para las personas (ver tools/unbundle.mjs). Si llega
// con contenido, es un bot: se responde "ok" sin guardar nada.
var SENUELO = 'bot-field';

var COL_DNI = 3; // Fecha, Nombre completo, DNI…

function doGet() {
  return json({ ok: true, servicio: 'formularios foromif.org' });
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (String(p[SENUELO] || '').trim()) return json({ ok: true });

  var hoja = HOJAS[p._form];
  if (!hoja) return json({ ok: false, error: 'formulario desconocido' });
  for (var i = 0; i < hoja.requeridos.length; i++) {
    if (!String(p[hoja.requeridos[i]] || '').trim()) return json({ ok: false, error: 'faltan datos' });
  }

  // Identificador único por envío, el mismo en todos los reintentos del navegador.
  var id = String(p._id || '').replace(/[^A-Za-z0-9\-]/g, '').slice(0, 64);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json({ ok: false, error: 'ocupado, reintentar' });
  try {
    var sh = obtenerHoja(hoja);
    // Reintento de un envío que ya se guardó (se perdió la respuesta): no duplicar.
    if (yaGuardado(sh, hoja, id)) return json({ ok: true });
    var fila = [new Date()].concat(hoja.campos.map(function (c) { return texto(p[c]); }));
    if (p._form === 'inscripcion') {
      fila.push('web', dniExiste(sh, p.dni) ? 'sí' : '', texto(p._page), id);
    } else {
      fila.push(texto(p._page), id);
    }
    sh.appendRow(fila);
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

function obtenerHoja(hoja) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(hoja.nombre);
  if (!sh) {
    ss.setSpreadsheetTimeZone('America/Lima');
    sh = ss.insertSheet(hoja.nombre);
    sh.appendRow(['Fecha'].concat(hoja.titulos, hoja.extra));
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Busca el ID entre las últimas 200 filas (los reintentos ocurren a los pocos segundos).
function yaGuardado(sh, hoja, id) {
  var ultima = sh.getLastRow();
  if (!id || ultima < 2) return false;
  var col = 1 + hoja.campos.length + hoja.extra.length; // "ID envío" es la última columna
  var desde = Math.max(2, ultima - 199);
  var valores = sh.getRange(desde, col, ultima - desde + 1, 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][0]) === id) return true;
  }
  return false;
}

function normalizarDni(v) {
  return String(v || '').replace(/[\s.\-']/g, '').toUpperCase();
}

function dniExiste(sh, dni) {
  var buscado = normalizarDni(dni);
  var n = sh.getLastRow() - 1;
  if (!buscado || n < 1) return false;
  var valores = sh.getRange(2, COL_DNI, n, 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (normalizarDni(valores[i][0]) === buscado) return true;
  }
  return false;
}

// Se guarda como texto: evita que Sheets lea "+51…" o "=…" como fórmula y que
// quite los ceros iniciales de un DNI. El apóstrofo no se ve en la celda.
function texto(v) {
  v = v == null ? '' : String(v).slice(0, 5000);
  return /^[=+\-@0-9]/.test(v) ? "'" + v : v;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
