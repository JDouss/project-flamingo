# Deployment Guide — Serverless Pipeline (callable, two stages)

Setup after the architecture refactor + pipeline v2. Commands run from the repo root with the Firebase CLI (`firebase login`).

> **Why your session got stuck on 2026-07-12:** the Cloud Function was never deployed (`firebase functions:list` returned empty), so the uploaded audio had nothing processing it. Pipeline v2 also removes the design flaws that would have bitten later: Storage triggers cap at 9 min (too short for 2h audio) and have no retry path. The pipeline is now two callable functions with 60-min timeouts and an explicit retry button in the UI.

## 1. Upgrade to the Blaze plan (required for Cloud Functions)

Console → https://console.firebase.google.com/project/project-flamingo-497112/usage/details → **Modify plan → Blaze**.
Expected real cost: **0 €** at club volume. Set a 5 €/month budget alert in GCP Billing as a safety belt.

## 2. Rotate the old exposed API keys (if not done yet)

The pre-refactor frontend embedded `VITE_GEMINI_API_KEY` and `VITE_GCP_API_KEY` in deployed bundles — treat them as public. Delete/regenerate in GCP Console → Credentials, and create one new Gemini key (https://aistudio.google.com/apikey).

## 3. Store the Gemini key as a function secret

```powershell
firebase functions:secrets:set GEMINI_API_KEY
```

## 4. Deploy everything

```powershell
cd functions; npm install; cd ..
firebase deploy --only firestore:rules,storage
firebase deploy --only functions
npm run build
firebase deploy --only hosting
```

> The functions bundle `ffmpeg-static` (a ~80 MB binary pulled in by
> `npm install`) to split long recordings before transcription — see §6.
> `transcribeSession` runs with 2 GiB memory / 3600 s for this reason.

Notes:
- Deploys two callables to `europe-west1`: `transcribeSession` and `analyzeSession` (1 GiB, 3600 s). First deploy may ask to enable Cloud Build / Artifact Registry — accept.
- No Storage trigger anymore: the SPA invokes the functions after upload; they keep running server-side even if the tab closes.
- Admin emails are whitelisted in **three** places that must stay in sync: `firestore.rules`, `storage.rules`, and `ADMIN_EMAILS` in `functions/index.js`.

## 5. Rescue the stuck session from 2026-07-12

After deploying: open the app → **Sesión de Club → Historial de sesiones**. The old session will show **"Atascada — necesita reintento"** → click **Ver problema → Reintentar procesado**. It will re-enter the pipeline from the transcription stage (the audio is already in Storage; no re-upload needed).

## 6. Pipeline flow (what to expect)

```
Subir audio  →  queued  →  transcribing        (ffmpeg splits audio into 30-min
                                                segments; each transcribed by Gemini
                                                with anonymous [Speaker N] tags,
                                                numbering carried across segments)
             →  needs_mapping                  (HUMAN: confirm who each voice is;
                                                AI suggestions pre-filled with confidence)
             →  analyzing                      (Gemini, names locked; grades validated
                                                against confirmed participants only)
             →  draft                          (HUMAN: review + publish)
             →  published
```

Long recordings are split because a single Gemini generation over ~2 h of
audio degenerates (`finishReason: MALFORMED_RESPONSE`), and prompting it to
transcribe only a time window does not bound the work — it still ingests the
whole file. Segmenting the actual audio is what keeps each generation small.
A stable 5-person panel may surface as 6–8 detected voices (numbering can
drift across segment boundaries); the mapping step collapses extras onto the
right member and grades dedupe by name, so stats stay correct.

Any stage can fail or stall → the session shows an error/stale badge in the history with a retry that resumes from the right stage. Correcting a bad voice assignment later: open the draft → "Corregir asignación de voces" → re-analyze.

## 7. End-to-end verification

1. Log in → Sesión de Club → upload `las_uvas_de_la_ira_7min.mp3`.
2. Close the tab after the upload hits 100 %. Watch `firebase functions:log` if curious.
3. Reopen → Historial: within minutes the session shows *Esperando asignación de voces* → **Asignar voces**.
4. Check the AI suggestions, listen to the audio, confirm the 5 members → *analyzing* → *Borrador*.
5. Review deduced title/grades/memory → publish → verify BookDetails (memory, grades chart, audio, transcript with real names) and the dashboard.
6. Negative paths: `.m4a` rejected; logged-out writes blocked by rules; calling the functions without an admin token returns permission-denied.

## Data compatibility

- Legacy docs (no `status`) behave as **published**. The retired `processing` status is treated as `queued` (retryable).
- Transcripts: `transcripts/{id}.txt` (anonymous, kept so mapping can be redone) and `transcripts/{id}_named.txt` (shown in BookDetails).
- `speakers_registry` personas are used as hints for the AI mapping suggestions — keeping them descriptive improves suggestions, but the human confirmation is always the source of truth.
