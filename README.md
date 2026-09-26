# foro-mif

Sitio del Foro de Gobernanza y Co-gestión Territorial para el Manejo Integral del Fuego — https://foromif.org/

## Estructura

| Carpeta | Qué es |
|---|---|
| `export/foro-mif.html` | El export original de un solo archivo (fuente del diseño). No se edita a mano. |
| `tools/unbundle.mjs` | Lo convierte en un sitio estático normal dentro de `site/`. |
| `public/` | Archivos escritos a mano que se copian tal cual a `site/` (p. ej. `forms.js`). |
| `site/` | Lo que publica Netlify. Se genera; no editar directamente. |
| `google-apps-script/Code.gs` | Recibe los formularios en la hoja de cálculo de Google (instrucciones dentro). |

## Actualizar el sitio

```sh
npm install        # solo la primera vez
npm run build      # regenera site/ desde export/foro-mif.html
```

Si llega un export nuevo del diseño: reemplazar `export/foro-mif.html`, correr `npm run build`,
revisar y subir. Si el build falla con `parche "...": se esperaba 1 coincidencia`, el export cambió
en una parte que el script modifica (formularios o `<head>`) y hay que ajustar `tools/unbundle.mjs`.

Para ver el sitio en local: `python3 -m http.server -d site 8080` y abrir http://localhost:8080.

## Formularios

Inscripción y consulta se guardan en una hoja de cálculo de Google (pestañas *Inscripciones* y
*Consultas*) a través de `google-apps-script/Code.gs`. No se envían correos. Cada envío también
queda como respaldo en Netlify Forms (columna `hoja`: `ok`, `error: …` o `sin configurar`); ese
respaldo solo funciona si en Netlify se activa *Forms → Enable form detection*.

Enlace directo al formulario para redes: **https://foromif.org/inscripcion**. Cada sección tiene
su URL (`/programa`, `/expositores`, `/noticias`, `/contacto`), definidas en `netlify.toml`.

Los dos formularios llevan un campo señuelo invisible (`bot-field`). Si un bot lo llena, el envío
se descarta sin guardarse.

## Hoja de inscripciones (Google Sheets)

`ENDPOINT` en `public/forms.js` está vacío hasta que el script se despliega; mientras tanto los
envíos solo llegan al respaldo de Netlify.

**Publicar el script con clasp**, desde esta carpeta, con la cuenta de Google dueña de los datos
(activar antes *Google Apps Script API* en https://script.google.com/home/usersettings):

```sh
npx @google/clasp@3.4.1 login --no-localhost
chmod 600 ~/.clasprc.json
npx @google/clasp@3.4.1 create-script --type sheets --title "Foro MIF — Base de inscripciones" --rootDir google-apps-script
git checkout -- google-apps-script     # por si create-script pisó Code.gs o appsscript.json
npx @google/clasp@3.4.1 push
npx @google/clasp@3.4.1 open-script    # en el editor: ejecutar doGet una vez y autorizar
npx @google/clasp@3.4.1 create-deployment --description "foromif.org"
```

La URL de la aplicación web es `https://script.google.com/macros/s/<ID de implementación>/exec`;
abierta en el navegador debe mostrar `{"ok":true,…}`. Ponerla en `ENDPOINT`, correr
`npm run build` y subir.

**Cambiar el script después:** revisar el cambio, luego
`npx @google/clasp@3.4.1 push && npx @google/clasp@3.4.1 create-deployment --deploymentId <ID>`
(mismo ID = misma URL).

**Seguridad:**
- `~/.clasprc.json` (sesión de clasp) nunca va al repositorio; `.gitignore` lo excluye, y también
  `*.csv` y `*.xlsx` porque las listas de personas no deben subirse.
- `appsscript.json` limita el script a su propia hoja (`spreadsheets.currentonly`).
- La hoja se comparte como *Lector* con correos concretos, nunca con "cualquier persona con el
  enlace": contiene DNIs.
- La URL `/exec` es pública (como cualquier destino de un formulario): solo acepta inscripciones y
  consultas, y no devuelve datos.

Notas sobre la lista de invitados oficiales y funciones que quedaron pendientes:
[docs/lista-invitados.md](docs/lista-invitados.md).
