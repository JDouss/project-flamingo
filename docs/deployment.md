# Deployment Guide — Serverless Pipeline

One-time setup after the architecture refactor. Commands run from the repo root with the Firebase CLI (`npm i -g firebase-tools`, `firebase login`).

## 1. Upgrade to the Blaze plan (required for Cloud Functions)

Console → https://console.firebase.google.com/project/project-flamingo-497112/usage/details → **Modify plan → Blaze**.
Expected real cost: **0 €** at club volume (everything fits the free tier; Gemini calls are cents/session on the API key's own billing).

**Set a budget alert** (belt and suspenders): GCP Console → Billing → Budgets & alerts → create a 5 €/month budget for the project.

## 2. Rotate the old exposed API keys

The previous frontend embedded `VITE_GEMINI_API_KEY` and `VITE_GCP_API_KEY` in the deployed JS bundle, so treat them as public:

- GCP Console → APIs & Services → Credentials → delete (or regenerate) both keys.
- Create **one new Gemini API key** (AI Studio → https://aistudio.google.com/apikey). It will only ever live in Secret Manager.

## 3. Store the Gemini key as a function secret

```powershell
firebase functions:secrets:set GEMINI_API_KEY
# paste the new key when prompted
```

## 4. Deploy rules + functions + hosting

```powershell
cd functions; npm install; cd ..
firebase deploy --only firestore:rules,storage:rules
firebase deploy --only functions
npm run build
firebase deploy --only hosting
```

Notes:
- The function `processSession` deploys to `europe-west1` with 1 GiB / 540 s. First deploy may ask to enable Cloud Build, Eventarc and Artifact Registry APIs — accept.
- The Storage trigger listens on the default bucket; recordings upload to `recordings/{sessionId}/{file}`.
- Firestore/Storage rules whitelist admin emails **inside the rules files** — keep them in sync with `VITE_AUTHORIZED_EMAILS` when members change.

## 5. Re-authenticate

The `cloud-platform` OAuth scope is gone. Everyone must simply log out / log in once; no GCP token is stored in the browser anymore.

## 6. End-to-end verification

1. Log in as admin → **Sesión de Club** → upload `las_uvas_de_la_ira_7min.mp3` (repo root).
2. When the upload hits 100 %, close the tab. Watch progress with `firebase functions:log` if curious.
3. Reopen the app → Sesión de Club → **Historial de sesiones**: the session should show *Borrador — pendiente de revisión* within a few minutes.
4. **Revisar y publicar** → check the deduced title/author, grades and session memory → *Publicar como nueva reseña*.
5. Open the new book card: session memory, grades chart, audio player, and lazy-loaded transcript should all render. The star rating should equal `round(avg(final grades)/2)`.
6. Negative paths: upload a `.m4a` (client rejects it); log out and confirm Firestore writes fail (rules).

## Data compatibility

- Legacy `transcriptions` docs (no `status` field) are treated as **published**; their inline transcripts keep working in BookDetails.
- New sessions store the transcript at `transcripts/{sessionId}.txt` in Storage and only a 1,500-char excerpt in Firestore.
- `speakers_registry` keeps its members; the old `audioUrl`/`audioBase64` voiceprint fields are simply ignored (feature removed — GCP has no public voice-ID API). You can delete those fields whenever you like to slim the docs.
