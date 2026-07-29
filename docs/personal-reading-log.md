# Mi Biblioteca (Personal Reading Log)

Your own reads, kept privately but shelved alongside the club's. The club
catalog and your personal reading are two halves of the same reading life, so
the app treats them as one shelf you can switch on, rather than two apps
bolted together.

## Goals

1. Log a book you read on your own, in seconds, without ceremony.
2. Grade it on the same 1-10 scale the club uses.
3. Record (or upload) a short voice note; the pipeline turns it into
   structured takeaways: key insights, what stood out, themes, verdict.
4. **Optionally merge your reads into the main shelf**, so the catalog shows
   everything you have read — club and personal — in one grid.
5. A personal dashboard over your own reads only.
6. **Private.** Never visible in the public catalog, never readable by a
   logged-out visitor, enforced server-side.

## Non-goals (deliberately out of scope for this iteration)

- Multi-user personal libraries. The data model is future-proofed with an
  `ownerEmail` on every doc, but only authorized (admin) emails can sign in
  today, so in practice there is exactly one owner.
- Promoting a personal read into the public club catalog. Easy to add later
  (copy fields into `books`), not built now.
- Editing the AI output field by field. You can re-run the analysis or edit
  the free-text notes; the generated insights are regenerated wholesale.

## Data model

New Firestore collection **`personal_reads`** — separate from `books` so the
public catalog query can never pick it up by accident.

| Field | Type | Notes |
|---|---|---|
| `ownerEmail` | string | lowercased; the ownership key the rules match on |
| `title`, `author`, `genre` | string | `title` required, rest optional |
| `rating` | number \| null | 1-10, 0.5 steps — same ritual scale as the club |
| `status` | string | `completed` \| `reading` \| `abandoned` |
| `startDate`, `finishedAt` | string (yyyy-mm-dd) | either may be empty |
| `format` | string | `papel` \| `ebook` \| `audiolibro` |
| `notes` | string | free text you type yourself |
| `coverUrl` | string \| null | optional; uploaded to the club's `covers/` prefix, or a pasted URL |
| `voiceNote` | object \| null | `{ audioPath, audioName, uploadedAt }` |
| `noteStatus` | string | pipeline state, see below |
| `transcript` | string | verbatim transcript of the voice note |
| `insights` | object \| null | see schema below |
| `error`, `errorStage` | string \| null | surfaced in the UI with a retry |
| `createdAt`, `updatedAt` | ISO string | |

`insights`:

```jsonc
{
  "summary": "2-3 sentence gist of what you said",
  "keyInsights": ["…"],   // ideas worth keeping
  "standouts": ["…"],     // what stood out: scenes, prose, structure
  "themes": ["…"],        // short tags
  "verdict": "one line, in your own register",
  "suggestedRating": 8.5  // null unless you actually said a number
}
```

`noteStatus` state machine (mirrors the club pipeline vocabulary):

```
idle → uploading → queued → transcribing → ready
                                 ↓
                               error  →  (retry) → queued
```

`idle` means the read has no voice note at all — a perfectly valid end state
for a book you just want to grade and move on from.

## Privacy model

This is the part that must not be got wrong, so it is enforced in three
independent places:

1. **Firestore rules** — `personal_reads` docs are readable and writable only
   when `request.auth.token.email` matches the doc's `ownerEmail`. There is no
   public-read clause, unlike `books`.
2. **Storage rules** — voice notes live under `voice-notes/`, which is
   admin-only for **both read and write**. Note the contrast with
   `recordings/` (club sessions), which is deliberately world-readable so
   `BookDetails` can embed the player. Personal audio never is.
3. **Client** — the whole feature is mounted behind the existing auth gate, so
   a logged-out visitor never even renders the entry point.

Queries are `where("ownerEmail", "==", myEmail)` and sort client-side. Sorting
server-side would need a composite index; the collection is small enough that
this is not worth a deploy dependency.

## Voice-note pipeline

One callable, `analyzeReadingNote({ readId })`, in `functions/index.js`,
reusing the existing Gemini helpers (`uploadToGeminiFiles`,
`generateJsonWithRetry`, the temperature-varying retry logic).

1. Verify the caller owns the doc, mark it `transcribing`.
2. Download the audio from Storage.
3. **Transcode to 16 kHz mono WAV with ffmpeg** (already a dependency via
   `ffmpeg-static`). This is what makes in-browser recording work at all:
   `MediaRecorder` in Chrome produces `audio/webm;codecs=opus`, which the
   Gemini Files API does not accept. WAV/PCM needs no encoder to be compiled
   in, so it works with any ffmpeg build, and 16 kHz mono is plenty for
   speech (~2 MB/minute). If ffmpeg fails we fall back to sending the
   original bytes with a guessed MIME type.
4. One multimodal structured-output call: audio in, `{ transcript, summary,
   keyInsights, standouts, themes, verdict, suggestedRating }` out. The club
   pipeline splits transcription and analysis across two calls because its
   recordings run for hours; a voice note is minutes, so one call is cheaper
   and simpler.
5. Write `transcript` + `insights`, set `noteStatus: "ready"`.

Failures write `error`/`errorStage` onto the doc and the UI offers a retry —
same contract as the club pipeline, so a browser that closes mid-run loses
nothing.

**Limits.** Voice notes are capped at 25 MB by the Storage rules (roughly 25
minutes of Opus). Longer recordings belong in the club Session Studio, which
has the segmenting machinery for hour-long audio.

## UI

The feature has two surfaces, split by intent: **the shelf is for browsing,
the modal is for managing.**

### The shared shelf (browsing)

A signed-in-only **"Incluir mis lecturas"** toggle in the catalog controls
merges your reads into the main grid. It is off by default, so the catalog
opens as the club's.

`readAdapter.js` is the only place that reconciles the two shapes. Club books
and personal reads are stored separately and graded differently (1-5 stars
vs 1-10), so the adapter normalizes a read into the card shape — including
`starsFromTen`, which works precisely because a personal grade uses the same
1-10 ritual scale as a club debate grade. Search, genre/status filters and
sorting then apply across both with no special cases.

Personal cards are rendered by the same `BookCard`, marked **"Mi lectura"** in
the slot where club books show their session label. A read logged without a
cover gets a cover-shaped placeholder rather than a broken image, so a book
can still be logged in seconds. Clicking one opens `PersonalReadDetails`;
clicking a club book still opens `BookDetails`. Editing dispatches the same
way — personal reads open the library editor, club books the admin panel.

### Mi Biblioteca (managing)

A header button, visible only when signed in, opening a modal with three tabs
(the `SessionStudio` shell pattern):

- **Nueva lectura** — the log form: title, author, genre, format, rating
  (1-10 in half steps, shown as stars), dates, free-text notes, cover
  (upload or pasted URL), and the voice note. The recorder uses
  `MediaRecorder` with a live timer and playback-before-upload; there is a
  file-upload fallback for browsers that deny microphone access.
- **Mis lecturas** — compact rows with cover thumbnails, search and a status
  filter, each showing its voice-note state. Opening one shows the same
  `PersonalReadDetails` the shelf opens, so there is a single detail view
  rather than two that drift apart.
- **Estadísticas** — personal dashboard: totals, average rating, reads per
  month, genre breakdown, best-rated, and a this-year-vs-last-year
  comparison. Scoped to personal reads only.

## Known trade-off: cover privacy

Covers go to the same public-read `covers/` prefix the club uses, so a
personal cover is served like any other image. The image is a book jacket,
not personal content, and the path is unguessable — but it is not *private*
the way the doc and the voice note are. Keeping covers behind the auth wall
would mean fetching a signed URL per card, which flickers on a grid. If that
trade is wrong, the fix is a private prefix plus on-demand URL resolution,
the same pattern the voice-note player already uses.

## Edge cases handled

- A read with no voice note is fully valid; nothing in the UI blocks on it.
- Re-recording replaces the note and re-runs the analysis; the old audio
  object is deleted from Storage.
- `suggestedRating` never silently overwrites a rating you set yourself — the
  UI offers it as a one-click fill.
- Microphone permission denied, no `MediaRecorder` support, or an empty
  recording all degrade to the file-upload path with an explicit message.
- Deleting a read deletes its audio too (best effort; a failure there is
  logged, not surfaced, since the doc is already gone).
