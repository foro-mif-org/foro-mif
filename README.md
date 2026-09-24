# foro-mif

Sitio del Foro de Gobernanza y Co-gestión Territorial para el Manejo Integral del Fuego — https://foromif.org/

## Estructura

| Carpeta | Qué es |
|---|---|
| `export/foro-mif.html` | El export original de un solo archivo (fuente del diseño). No se edita a mano. |
| `tools/unbundle.mjs` | Lo convierte en un sitio estático normal dentro de `site/`. |
| `public/` | Archivos escritos a mano que se copian tal cual a `site/` (p. ej. `forms.js`). |
| `site/` | Lo que publica Netlify. Se genera; no editar directamente. |

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

- **Inscripción**: se envía al formulario de Google del comité organizador (los datos son suyos) y,
  como respaldo, a Netlify Forms. La columna `google_form` del respaldo indica si el envío a Google
  salió (`enviado`), falló (`error`) o se omitió (`omitido`, en previews y local).
- **Consulta**: solo Netlify Forms, con notificación por correo.
- Los IDs de las preguntas de Google están en `public/forms.js`. Si el comité edita las preguntas
  de su formulario, hay que actualizarlos; mientras tanto el respaldo en Netlify conserva todo.
- En Netlify: *Forms → Enable form detection* y configurar las notificaciones por correo.
