# Lista de invitados oficiales y funciones pendientes

Notas para retomar esto sin volver a discutirlo. **No contiene datos de personas**: el archivo con
la lista (`.xlsx`/`.csv`) se guarda fuera del repositorio (p. ej. `~/data/`); `.gitignore` excluye
`*.csv` y `*.xlsx`.

## Decisión actual

Los invitados oficiales **no pasan por la web**: no se importan a la hoja de inscripciones ni se
les pide que se registren. La hoja recoge solo las inscripciones hechas en
`foromif.org/inscripcion` (y las consultas). Si más adelante hace falta consolidar ambas cosas en
un solo lugar, esta es la información para hacerlo.

## Columnas de la lista de invitados

`Nº · Nombres · Género · Sector · Entidad · Área/cargo · Teléfono · Correo electrónico`

| Lista de invitados | Formulario / hoja de inscripciones | Nota |
|---|---|---|
| Nombres | Nombre completo | igual |
| Género | — | el formulario no lo pide |
| Sector | — | el formulario no lo pide |
| Entidad | Institución | mismo dato, otro nombre |
| Área/cargo | Cargo | igual |
| Teléfono, Correo electrónico | Teléfono, Correo | igual |
| — | **DNI** | **la lista no tiene DNI** |
| Nº | — | la hoja numera sus propias filas |

**Consecuencia:** la detección de repetidos de `Code.gs` compara DNI. Contra la lista de invitados
habría que comparar **correo** (sin distinguir mayúsculas ni espacios).

## Cómo consolidarlas, si se decide

1. Una sola pestaña *Inscripciones* con columna `Origen`: `Invitado (lista)` o `Web`.
   Columnas propuestas: `Fecha · Origen · Nombres · Género · Sector · Entidad · Área/cargo · DNI ·
   Correo · Teléfono · Repetido · Página`.
2. Importar la lista con *Archivo → Importar → Insertar filas nuevas en la hoja actual*.
3. Ampliar `Code.gs` para marcar repetidos también por correo.
4. Opcional en el formulario: **Género** (Femenino / Masculino / Otro / Prefiero no decir) y
   **Sector**, ambos como listas desplegables **no obligatorias**, para que las inscripciones web
   también se puedan filtrar por ellos.

## Observaciones sobre la lista (vistas solo en Sector, Entidad y Área/cargo)

- **Sector** tiene 6 valores limpios: Público, Academia/Investig., Cooperación, ONG,
  Org. indígena, Privado. Un séptimo, **"Profonanpe"** (unas 20 filas), es una entidad, no un sector:
  hay que decidir a cuál pertenece.
- **Una misma entidad escrita de varias formas:** Ministerio del Ambiente / Minam / MINAM-Profonanpe;
  INDECI en tres variantes; PCM / Presidencia del Consejo de Ministros - PCM; Cenepred / CENEPRED;
  "sernanp" en minúsculas; "Fuerza Area del Perú" (sin tilde). "CARE Perú" es una ONG distinta de
  "Central Asháninka del Río Ene-CARE". Para conteos por institución conviene una columna
  normalizada al lado, sin tocar el texto original.
- **Área/cargo** a veces contiene el nombre de una oficina (p. ej. "DGECIA") en vez de un cargo, y
  está vacío para FIDA, FAO, ANECAP, AIDESEP y CONAP.
- **Una celda** (Regional Disaster Assistance Program - Amentum) tiene comillas y un salto de línea
  dentro; rompería una importación CSV sin limpiar.
- **Al menos 8 filas aparecen dos veces** con Sector, Entidad y Cargo idénticos (SENAMHI
  "Especialista en Investigación Meteorológica", Landscapes Alliance "Investigadora", INDECI
  "Asistente en gestión reactiva" y "Analista GRD", MINAM "Coordinadora FCLP", Cenepred
  "Especialista en Capacitación", Ministerio de Cultura "Especialista en Medio Ambiente y Recursos
  Naturales", CESAL "Jefe de Proyectos"). Parece un bloque pegado dos veces; solo los nombres y
  correos dicen si son la misma persona.

## Aviso por correo de nuevas inscripciones (no implementado)

Se descartó por ahora. Si se retoma:

- **Resumen programado, no un correo por inscripción.** Gmail gratuito permite 100 destinatarios
  por día *en total* y cada destinatario cuenta: 3 destinatarios × 1 correo = 3. Un correo por
  inscripción se agotaría con ~33 inscripciones al día.
- **Propuesta:** un resumen a horas fijas (p. ej. 08:00 y 18:00 hora de Lima), enviado solo si hay
  filas nuevas, a varios destinatarios, con el número de inscripciones nuevas, el total y el enlace
  a la hoja. **Sin nombres ni DNIs** en el correo: eso se ve en la hoja, con acceso controlado.
- **Cambios necesarios:** una función en `Code.gs` que cuente filas nuevas (guardando la última
  fila avisada), un activador por tiempo instalado una vez desde el editor de Apps Script, y
  ampliar `oauthScopes` en `appsscript.json` con `script.send_mail` y `script.scriptapp` (hoy solo
  `spreadsheets.currentonly`).
- Las notificaciones propias de Google Sheets (*Herramientas → Reglas de notificación*) las
  configura cada persona por su cuenta; no se comprobó que se activen con filas agregadas por un
  script ni que un usuario "Lector" pueda usarlas.

## Confirmación al inscrito (no implementada)

La web ya no promete correo de confirmación. Mandarlo requeriría los mismos permisos de envío y
consumiría el mismo límite diario de 100.
