// Envío de los formularios del sitio (inscripción y consulta).
//
// 1) Hoja de cálculo de Google vía Apps Script (google-apps-script/Code.gs).
//    El éxito se muestra SOLO si el script responde {"ok":true}. Si falla por
//    un motivo pasajero (red, 401/403, página de error de Google, script
//    ocupado) se reintenta; cada envío lleva un ID único (_id) para que un
//    reintento no duplique una fila que ya se guardó.
// 2) Copia de respaldo en Netlify Forms, con el resultado del paso 1. No cuenta
//    para el éxito: sirve para no perder el dato y para ver por qué falló.
//
// Se carga en el <head> antes que el runtime; los handlers del template llaman
// a window.foroEnviar(form, tipo).

(function () {
  // URL de la aplicación web de Apps Script (termina en /exec).
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbxGwXWC5eloutaY1rGIWri3hLS55ExgsQ9XTLCnks2LI_h68mVbCRJHEwQaX0KeyYBrwA/exec";

  var TIMEOUT_MS = 12000;      // por intento
  var INTENTOS = 3;            // total, contando el primero
  var ESPERA_MS = [1000, 2500]; // pausa antes del 2.º y del 3.er intento

  function espera(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function idEnvio() {
    var u = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2);
    return "s-" + u;
  }

  function post(url, body, extra) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var init = { method: "POST", body: body, signal: ctrl ? ctrl.signal : undefined };
    for (var k in extra) init[k] = extra[k];
    return fetch(url, init).finally(function () { clearTimeout(timer); });
  }

  // Un intento. Cuerpo urlencoded = petición "simple": sin preflight CORS, que Apps Script no responde.
  // reintentar = true si el fallo puede ser pasajero; false si el script rechazó los datos.
  function unIntento(body) {
    return post(ENDPOINT, body)
      .then(function (r) { return r.json(); }) // una página de error 401/403 no es JSON: cae al catch
      .then(function (res) {
        if (res && res.ok === true) return { ok: true };
        var motivo = res && res.error;
        return { ok: false, motivo: motivo || "respuesta inválida", reintentar: !motivo || motivo === "ocupado, reintentar" };
      })
      .catch(function (err) { return { ok: false, motivo: err.message, reintentar: true }; });
  }

  // Resuelve "ok" o un texto "error: motivo (intentos: n)".
  function enviarHoja(tipo, fd) {
    if (!ENDPOINT) return Promise.resolve("error: sin configurar");
    var body = new URLSearchParams();
    fd.forEach(function (v, k) { body.append(k, v); });
    body.set("_form", tipo);
    body.set("_page", location.href);
    body.set("_id", idEnvio()); // el mismo en todos los reintentos
    var intento = 0;
    function probar() {
      intento++;
      return unIntento(body).then(function (r) {
        if (r.ok) return "ok";
        if (!r.reintentar || intento >= INTENTOS) return "error: " + r.motivo + " (intentos: " + intento + ")";
        return espera(ESPERA_MS[intento - 1]).then(probar);
      });
    }
    return probar();
  }

  // Respaldo: no se espera y no cuenta para el éxito. keepalive permite que termine aunque se cierre la pestaña.
  function respaldarEnNetlify(tipo, fd, hoja) {
    var body = new URLSearchParams();
    body.append("form-name", tipo);
    fd.forEach(function (v, k) {
      // Netlify usa el campo "email" como Reply-To de sus notificaciones.
      body.append(k === "correo" && tipo === "consulta" ? "email" : k, v);
    });
    body.set("hoja", hoja);
    body.set("pagina", location.href);
    post("/", body, { keepalive: true }).catch(function () {});
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

  // Resuelve true solo si el script de la hoja confirmó el guardado; si no, muestra el error.
  window.foroEnviar = function (form, tipo) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return Promise.resolve(false);
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; btn.style.cursor = "wait"; }
    var viejo = form.querySelector("[data-foro-error]");
    if (viejo) viejo.remove();

    var fd = new FormData(form);
    return enviarHoja(tipo, fd).then(function (hoja) {
      respaldarEnNetlify(tipo, fd, hoja);
      var ok = hoja === "ok";
      if (!ok) console.warn("[forms] no se guardó en la hoja:", hoja);
      if (btn) { btn.disabled = false; btn.style.opacity = ""; btn.style.cursor = ""; }
      if (!ok) mostrarError(form, "No pudimos registrar tu envío. Revisa tu conexión e inténtalo de nuevo.");
      return ok;
    });
  };
})();
