# Project Flamingo — Evaluación Arquitectónica
> Auditoría del estado actual y crítica del `ideal_state_spec.md`. Julio 2026.
> Objetivo: la mejor arquitectura posible para un club de lectura de 5 personas con coste de infraestructura ~0€.

---

## 1. Crítica directa del `ideal_state_spec.md`

### 1.1 Problema de fondo: no es una especificación, es una foto
Las secciones 2–4 documentan el estado **actual** (paleta, componentes, pipeline existente) y lo etiquetan como "ideal". Solo la sección 5 (roadmap) mira hacia delante. El efecto perverso: consagra como "ideal" decisiones que son precisamente los mayores problemas del proyecto (orquestación del pipeline en el navegador, token OAuth `cloud-platform` en localStorage, monolito `VoiceAssistant.jsx` de 2.452 líneas).

### 1.2 Veredicto por ítem del roadmap

| Ítem del spec | Veredicto | Razón |
|---|---|---|
| 1. Voice signature matching automático | **Rechazar (tal como está planteado)** | GCP STT v1 no ofrece *speaker identification* por huella de voz (solo diarización anónima). "Entrenar un modelo" para 5 personas es absurdo en coste/beneficio. Los `audioBase64` guardados en Firestore (`speakers_registry`) son peso muerto que infla documentos hacia el límite de 1 MB. **Alternativa barata**: pedir a Gemini que *sugiera* el mapeo Speaker N → miembro usando los snippets + las personas del registro, manteniendo la confirmación humana de un clic. Coste: ~0. |
| 2. Transcripción en tiempo real (WebSocket) | **Rechazar** | Es lo contrario de "coste casi cero": el streaming STT es más caro por minuto, exige el navegador abierto y con micrófono 2 horas, la diarización en streaming es peor, y una desconexión pierde la sesión. Además destruye el CUJ real: grabar con el móvil y subir después. |
| 3. Chunking automático de audio | **Innecesario** | `longrunningrecognize` con URI de GCS soporta hasta 480 minutos. Ninguna sesión del club se acerca. El problema real es otro (ver §2.2: el *fallback* base64 inline y el timeout de polling de 5 min están rotos para audios reales). |
| 4. Export PDF/EPUB (antología anual) | **Aceptar, versión barata** | Generación 100% cliente (print CSS + `window.print()` o jsPDF). Cero infra. Buen "momento mágico" anual. |
| 5. PWA | **Aceptar** | Manifest + service worker de cacheo estático. Coste cero, valor real en móvil. |

### 1.3 Lo que al spec le falta (y es lo más grave)
1. **Modelo de seguridad.** Ni una línea sobre: el token OAuth con scope `cloud-platform` (acceso total al proyecto GCP) viviendo en `localStorage`; la API key de Gemini tecleada por el usuario y guardada en `localStorage`; la autorización de admin verificada **solo en cliente** (`authorizedEmails` + `signOut` forzado en `App.jsx` — cualquiera con la consola abierta lo salta; la única defensa real son las reglas de Firestore, que no están versionadas en el repo).
2. **Modelo de coste.** El spec dice "premium" pero nunca cuantifica. Sin números no se puede decidir (ver §4.3: los números cambian la arquitectura entera).
3. **Resiliencia del pipeline.** Qué pasa si se cierra la pestaña a mitad de transcripción (hoy: se pierde la operación STT, no se persiste `operationName`), si Gemini devuelve JSON malformado (hoy: un parser regex heroico de 90 líneas), si el token caduca a mitad de polling (hoy: error y a empezar de cero, audio incluido).
4. **Esquema de datos.** El spec lista colecciones pero no critica que `transcriptions` guarda el transcript completo + `result` duplicado "por compatibilidad", y que el historial descarga **todos** los documentos completos cada vez que se abre el modal (y se re-descarga en cada cambio de pestaña por el `useEffect` con `activeTab` en deps).

---

## 2. Hallazgos de la auditoría del código actual

### 2.1 Seguridad (bloqueante antes de cualquier feature nueva)
- `firebase.js:36` — `googleProvider.addScope('cloud-platform')`: el token de acceso resultante puede administrar TODO el proyecto GCP y se guarda en `localStorage`. No existe un scope OAuth más estrecho para Speech-to-Text, lo cual es en sí el argumento definitivo para sacar STT del navegador.
- `App.jsx:59-92` — el gate de admin es teatro del lado cliente. Además expulsa a cualquier usuario Google sin token GCP, lo que rompe el caso "miembro no-admin que solo quiere leer".
- Config de Firebase con fallbacks hardcodeados en `firebase.js` (las keys de Firebase son públicas por diseño, pero el patrón invita a hardcodear otras que no lo son).

### 2.2 Pipeline (fragilidad funcional)
- **El navegador es rehén del pipeline**: subida → STT → polling → Gemini → escritura, todo en la pestaña. Cerrarla a mitad = trabajo perdido, audio huérfano en Storage.
- `VoiceAssistant.jsx:781` — polling con `maxAttempts = 60 × 5s = 5 minutos`. Una sesión real de 2h tarda bastante más en transcribirse. **El timeout está roto para el caso de uso principal.**
- `VoiceAssistant.jsx:710-714` — fallback a base64 inline para `longrunningrecognize`: el límite de payload (~10 MB) hace este camino inviable para cualquier sesión real. Es código muerto que da falsa sensación de resiliencia.
- **Bug aparente prompt/validación**: el prompt final a Gemini (`handleConfirmMapping`) pide `{bookTitle, bookAuthor, generalSummary, grades, sessionSummaryMarkdown}` — sin campo `speakers` — pero la validación inmediata (`VoiceAssistant.jsx:1134`) lanza error si `parsedResult.speakers` está vacío. O el prompt o la validación quedaron desincronizados en un refactor. Verificar con una ejecución real.
- El parser regex de rescate (`parseGeminiResponseFallback`, ~90 líneas) es un síntoma: la API de Gemini soporta `responseSchema` (structured output) que garantiza JSON válido y elimina ese código entero.

### 2.3 Datos y costes de lectura
- `fetchHistory()` descarga la colección `transcriptions` completa (con transcripts íntegros de horas de conversación) al abrir el modal, y se re-ejecuta con cada cambio de pestaña interna. Es la mayor fuente de lecturas/ancho de banda de la app.
- `speakers_registry` guarda audio en base64 dentro de documentos Firestore.
- Doble escala de notas sin conversión definida: `book.rating` (1–5 estrellas) vs `grades` (1–10).

### 2.4 Frontend
- `VoiceAssistant.jsx` (2.452 líneas) es un god-component: grabadora, cliente STT, cliente Gemini, parsers, registro de miembros, historial y 4 vistas de UI.
- `isDemoMode` ramifica **cada** operación de datos en **cada** componente (Firestore vs localStorage). Es el mayor impuesto de complejidad del código; y `MOCK_BOOKS = []`, así que el modo demo ni siquiera muestra nada.
- El spec presume del design system de `index.css`, pero los componentes están llenos de estilos inline con hex hardcodeados (`#f59e0b`, `#10b981` en los charts) que ignoran las variables (`--accent-gold`, `--sage`).
- Prop drilling moderado pero real: `books`, `isDemoMode` y 5 callbacks bajan desde `App` a todo.

**Lo que SÍ está bien y hay que conservar**: `onSnapshot` sobre `books` (tiempo real gratis para una colección pequeña), charts SVG a mano (cero dependencias), el paso de mapeo humano de speakers, los mensajes de carga graciosos, el design system de tokens.

---

## 3. CUJs redefinidos

| # | CUJ | Hoy | Ideal |
|---|---|---|---|
| 1 | **"Suelta el audio y vete"** (admin) | Subir y mantener la pestaña abierta ~30+ min con polling; si falla, repetir desde cero | Subir → cerrar pestaña. El pipeline corre en servidor. El estado (`transcribiendo → analizando → listo para revisar`) se ve en tiempo real vía `onSnapshot` desde cualquier dispositivo |
| 2 | **"Revisar y bendecir"** (admin, human-in-the-loop) | Mapeo de speakers bloqueante a mitad de pipeline; si Gemini falla después, se repite el mapeo | El análisis llega *borrador completo* con mapeo **sugerido por Gemini**; el admin corrige nombres/notas/resumen en una sola pantalla de revisión y publica. Editable, no repetible |
| 3 | **"Revivir la sesión"** (miembros, público) | Ya funciona razonablemente (BookDetails con audio + memoria) | Igual + transcript bajo demanda (no descargado por defecto), PWA instalable |
| 4 | **"El ritual de los datos"** (grupo) | Ya funciona (ClubDashboard) | Igual + antología anual exportable (PDF cliente) |

El cambio que importa es el CUJ 1: pasar de *pipeline síncrono con el navegador de rehén* a *pipeline asíncrono con revisión posterior*.

---

## 4. Arquitectura propuesta

### 4.1 La decisión central: eliminar GCP STT y orquestar en servidor

**Propuesta: sustituir todo el pipeline STT+polling por una única Cloud Function (2ª gen) que envía el audio directamente a Gemini.**

Gemini 3.5 Flash acepta audio nativo (hasta ~9,5 h vía Files API) y hace transcripción + diarización + análisis + notas **en una sola llamada** con `responseSchema`. Esto elimina de un golpe:
- El cliente STT completo (~300 líneas), el polling, el timeout roto, el fallback base64 muerto.
- El token OAuth `cloud-platform` en localStorage (la function usa su service account).
- La API key de Gemini en el navegador.
- El parser regex de rescate (structured output garantiza JSON).
- La configuración IAM manual de la cuenta de servicio de Speech (todo el bloque de diagnóstico de `storage.objects.get`).

**Coste** (sesión de 2h, ~1–2 sesiones/mes):
- GCP STT actual (`latest_long` + `useEnhanced`): ~0,026 €/min ≈ **~3 €/sesión**.
- Gemini Flash con audio (~32 tokens/seg → 2h ≈ ~230k tokens entrada): **céntimos por sesión**.
- Cloud Functions 2ª gen: dentro del free tier con margen enorme (requiere plan Blaze, pero Blaze con uso free-tier = 0 €; poner alerta de presupuesto de 5 €).

La diarización de Gemini es algo menos precisa que la de STT en audios muy solapados, pero: (a) el paso de revisión humana del CUJ 2 ya existe como red de seguridad, y (b) se le pueden pasar las *personas* del registro de miembros como pista para que etiquete directamente con nombres. Ganamos el mapeo sugerido gratis.

### 4.2 Flujo resultante

```
[Admin: sube .mp3 desde la SPA]
      → Firebase Storage (recordings/{sessionId}.mp3)
      → (trigger) Cloud Function onFinalize
           1. crea sessions/{id} {status:'processing'}
           2. Gemini Files API ← audio desde GCS
           3. generateContent con responseSchema
              (transcript diarizado + mapeo sugerido + resumen + notas + grades)
           4. transcript completo → Storage (transcripts/{id}.txt)
           5. resultado estructurado → sessions/{id} {status:'draft'}
      → SPA (onSnapshot en sessions/{id}) muestra progreso en vivo
[Admin: pantalla de revisión → corrige → publica]
      → sessions/{id} {status:'published'} + update en books/{bookId}
```

El cliente queda reducido a: subir archivo, escuchar un documento, renderizar, y una pantalla de edición. Toda la inteligencia y credenciales viven en la function.

### 4.3 Modelo de datos (Firestore + Storage)

```
books/{bookId}            ← lectura pública; solo cambia: añadir gradesSummary
  {title, author, genre, rating, status, dates, summary, review,
   imageUrl, quotes[], references[], sessionId, privateNotes,
   grades: {start:{}, end:{}}}

sessions/{sessionId}      ← renombra 'transcriptions'; SIN transcript inline
  {status: 'processing'|'draft'|'published'|'error',
   bookId, audioPath, transcriptPath,        ← paths de Storage, no contenido
   transcriptExcerpt,                        ← primeras ~1.500 chars para preview
   generalSummary, notesMarkdown, grades, suggestedMapping,
   error?, createdAt}

members/{memberId}        ← renombra 'speakers_registry'; SIN audioBase64
  {name, persona}

Storage:
  recordings/{sessionId}.mp3     transcripts/{sessionId}.txt     covers/
```

Reglas versionadas en el repo (`firestore.rules`, `storage.rules`): lectura pública de `books`/`members`/`sessions` publicadas; escritura solo `request.auth.token.email in [lista]` (o custom claim `admin`). La lista del historial pasa de "N docs × transcript completo" a "N docs ligeros"; el transcript se baja de Storage solo al expandir el `<details>`.

### 4.4 Frontend: estructura propuesta

Ni Feature-Sliced Design completo ni Zustand — para 7 componentes y un solo flujo de escritura es sobre-ingeniería. La receta: **carpetas por feature + hooks de datos + eliminar el modo demo**.

```
src/
  data/                     ← ÚNICO sitio que importa firebase/*
    firebase.js
    useBooks.js             ← onSnapshot books (lo que hoy hace App)
    useSession.js           ← onSnapshot sessions/{id}
    useMembers.js
    mutations.js            ← createBook, publishSession, updateBook...
  features/
    catalog/                ← BookCard, filtros, grid (hoy inline en App)
    book-details/           ← BookDetails + GradesChart (extraer el SVG)
    session-studio/         ← el actual VoiceAssistant partido en:
        SessionStudio.jsx        (shell + tabs)
        UploadStep.jsx
        ReviewStep.jsx           (mapeo sugerido + edición del borrador)
        SessionHistory.jsx
        MembersRegistry.jsx
    dashboard/              ← ClubDashboard + charts SVG extraídos
    admin/                  ← AdminPanel, LoginModal
  ui/                       ← FlamingoIcon, Markdown, StatCard...
  App.jsx                   ← solo composición + estado de modales
functions/
  index.js                  ← processSession (trigger Storage)
firestore.rules
storage.rules
```

- **Estado**: colocado. `useBooks()` puede consumirse donde haga falta (onSnapshot con listeners compartidos no duplica lecturas facturadas de forma relevante a esta escala); un `AuthContext` mínimo para `user/isAdmin`. Nada más.
- **Modo demo**: eliminarlo. `MOCK_BOOKS` está vacío; el proyecto tiene config real hardcodeada como fallback, así que el modo nunca se usa legítimamente. Borra cientos de líneas de ramas `isDemoMode` en todos los componentes. (Si se quiere demo para enseñar la app, se resuelve con un proyecto Firebase separado y datos seed, no con ramas en el código.)
- **Estilos**: mantener CSS puro y tokens, pero mover los estilos inline repetidos a clases y sustituir hex hardcodeados por las variables existentes (`--accent-gold`, `--sage`, `--accent-coral`).

### 4.5 Medidas explícitas de coste ~0
1. Hosting estático (Firebase Hosting free tier) — sin cambios.
2. `sessions` ligeras + transcript en Storage → lecturas de Firestore por visita: decenas, no megabytes.
3. Sin streaming, sin colas, sin Cloud Run siempre-encendido: **una** function con trigger de Storage, 0 invocaciones = 0 €.
4. Gemini Flash en vez de STT enhanced: de ~3 €/sesión a céntimos.
5. Alerta de presupuesto GCP a 5 €/mes como cinturón de seguridad del plan Blaze.

---

## 5. Plan de ejecución por fases

Cada fase deja la app funcionando y desplegable.

**Fase 0 — Seguridad y reglas (medio día)**
1. Escribir y versionar `firestore.rules` + `storage.rules` (lectura pública, escritura solo admins vía custom claim o email).
2. Quitar el scope `cloud-platform` y el flujo de token en localStorage del login (queda temporalmente sin STT por OAuth: aceptable porque la Fase 2 lo reemplaza; si se necesita puente, mantenerlo aislado y documentado como deuda).
3. Eliminar `audioBase64` de `members` (migración trivial de 5 docs).

**Fase 1 — Reestructuración frontend sin cambio funcional (1–2 días)**
1. Crear `src/data/` con hooks y mutaciones; los componentes dejan de importar `firebase/*`.
2. Eliminar modo demo.
3. Partir `VoiceAssistant.jsx` en `features/session-studio/*`; extraer charts SVG.
4. Arreglar de paso: re-fetch por `activeTab`, timeout de polling, hex → variables CSS.

**Fase 2 — Pipeline serverless (1–2 días)**
1. Activar Blaze + alerta de presupuesto. `firebase init functions`.
2. Function `processSession` (trigger Storage): Gemini Files API + `responseSchema` con personas de `members` como pista de mapeo.
3. Cliente: UploadStep sube y escucha; ReviewStep edita el borrador y publica.
4. Retirar: cliente STT, polling, parser regex, key de Gemini en localStorage.
5. Migrar `transcriptions` → `sessions` (script one-shot: mover transcript a Storage, renombrar campos).

**Fase 3 — Los extras que sí valen (según apetito)**
- PWA (manifest + SW de estáticos).
- Antología anual en PDF (cliente, print CSS).
- Sugerencia automática de mapeo refinada con snippets por speaker.

**Verificación end-to-end** (tras Fase 2): subir el audio de prueba del repo (`las_uvas_de_la_ira_7min.mp3`), cerrar la pestaña, reabrir a los minutos → la sesión debe aparecer en `draft`; revisar mapeo, publicar, y comprobar que `BookDetails` muestra memoria + audio + grades y que el dashboard agrega el libro. Probar además: archivo `.m4a` rechazado en cliente, usuario no-admin sin permisos de escritura (reglas), y Gemini devolviendo error (doc en `status:'error'` con mensaje).

---

## 6. Resumen de decisiones a debatir

1. **¿Gemini sustituye a GCP STT por completo?** (mi recomendación: sí; la red de seguridad es la revisión humana). Alternativa conservadora: mantener STT pero movido a la function — más caro (~3 €/sesión) y más piezas.
2. **¿Aceptamos plan Blaze?** Sin él no hay Cloud Functions y el navegador sigue siendo rehén del pipeline. Con free tier + alerta, el coste real esperado es 0 €.
3. **¿Eliminamos el modo demo?** Recomiendo que sí, sin sustituto.
4. **¿Escala de notas única?** Propongo derivar `rating` (estrellas) automáticamente de `grades.end` (media/2) en vez de mantener dos escalas manuales.
