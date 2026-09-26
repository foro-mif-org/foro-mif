// Envío de los formularios del sitio (inscripción y consulta).
//
// 1) Hoja de cálculo de Google vía Apps Script (google-apps-script/Code.gs)
// 2) Copia de respaldo en Netlify Forms, con el resultado del paso 1
//
// Se carga en el <head> antes que el runtime; los handlers del template llaman
// a window.foroEnviar(form, tipo).

(function () {
  // URL de la aplicación web de Apps Script (termina en /exec). Vacía = solo Netlify.
  var ENDPOINT = "";

  var TIMEOUT_MS = 15000;

  function post(url, body) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return fetch(url, { method: "POST", body: body, signal: ctrl ? ctrl.signal : undefined })
      .finally(function () { clearTimeout(timer); });
  }

  // Cuerpo urlencoded = petición "simple": sin preflight CORS, que Apps Script no responde.
  function enviarHoja(tipo, fd) {
    if (!ENDPOINT) return Promise.resolve("sin configurar");
    var body = new URLSearchParams();
    fd.forEach(function (v, k) { body.append(k, v); });
    body.set("_form", tipo);
    body.set("_page", location.href);
    return post(ENDPOINT, body)
      .then(function (r) { return r.json(); })
      .then(function (res) { return res && res.ok ? "ok" : "error: " + ((res && res.error) || "respuesta inválida"); })
      .catch(function (err) { return "error: " + err.message; });
  }

  function enviarNetlify(tipo, fd, hoja) {
    var body = new URLSearchParams();
    body.append("form-name", tipo);
    fd.forEach(function (v, k) {
      // Netlify usa el campo "email" como Reply-To de sus notificaciones.
      body.append(k === "correo" && tipo === "consulta" ? "email" : k, v);
    });
    body.set("hoja", hoja);
    body.set("pagina", location.href);
    return post("/", body).then(
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

  // Resuelve true si el envío quedó registrado en al menos un lugar; si no, muestra el error.
  window.foroEnviar = function (form, tipo) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return Promise.resolve(false);
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; btn.style.cursor = "wait"; }
    var viejo = form.querySelector("[data-foro-error]");
    if (viejo) viejo.remove();

    var fd = new FormData(form);
    return enviarHoja(tipo, fd).then(function (hoja) {
      return enviarNetlify(tipo, fd, hoja).then(function (respaldo) {
        if (hoja !== "ok") console.warn("[forms] hoja:", hoja, "| respaldo Netlify:", respaldo);
        var ok = hoja === "ok" || respaldo;
        if (btn) { btn.disabled = false; btn.style.opacity = ""; btn.style.cursor = ""; }
        if (!ok) mostrarError(form, "No pudimos registrar tu envío. Revisa tu conexión e inténtalo de nuevo.");
        return ok;
      });
    });
  };
})();
