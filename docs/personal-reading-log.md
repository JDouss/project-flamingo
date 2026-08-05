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

Lives at **`users/{email}/reads/{readId}`** — under the reader, so the path
itself is the ownership. (It began as a root `personal_reads` collection; the
documents were copied across unchanged, and the old collection is frozen
read-only until the cleanup phase removes it.)

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
| `pages` | number \| null | optional; feeds the "páginas leídas" stat |
| `country` | string \| null | optional; country of origin — author's nationality or original publication |
| `publicationYear` | number \| null | optional; year of the *original* edition, not a reprint |
| `originalLanguage` | string \| null | optional; language the book was written in |
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

1. **Firestore rules** — a read is readable and writable only by the email in
   its own path, and an update may not rewrite `ownerEmail`. There is no
   public-read clause anywhere in the tree.
2. **Storage rules** — voice notes live under `users/{email}/voice-notes/`,
   readable and writable only by that email. Club recordings sit under
   `clubs/{clubId}/recordings/` behind the membership claim; neither is public
   any more.
3. **Client** — the whole feature is mounted behind the existing auth gate, so
   a logged-out visitor never even renders the entry point.

The subscription reads the collection directly — the path already scopes it to
one reader, so there is no filter and no composite index to maintain. Sorting
stays client-side; the collection is small.

## Voice-note pipeline

One callable, `analyzeReadingNote({ readId })`, in `functions/index.js`,
reusing the existing Gemini helpers (`uploadToGeminiFiles`,
`generateJsonWithRetry`, the temperature-varying retry logic).

1. Address the read under the caller's own email — the path *is* the ownership
   check — and mark it `transcribing`.
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
nothing. A call that never reaches the analysis (signed-out session, rejected
precondition, dropped connection) is recorded by the *client* as
`noteStatus: "error"` with `errorStage: "invocation"`, so the read does not sit
in `queued` until the 15-minute staleness check notices. The client never
overwrites a doc the function has already claimed (`transcribing`) or
finished (`ready`).

**Limits.** Voice notes are capped at 25 MB by the Storage rules (roughly 25
minutes of Opus). Longer recordings belong in the club Session Studio, which
has the segmenting machinery for hour-long audio.

## UI

The feature has two surfaces, split by intent: **the shelf is for browsing,
Mi Biblioteca is for managing.**

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

Two pages behind a header link that only appears when signed in, plus one
modal for the form itself:

- **`/biblioteca`** (`LibraryPage`) — compact rows with cover thumbnails,
  search and a status filter, each showing its voice-note state. Opening one
  shows the same `PersonalReadDetails` the shelf opens, so there is a single
  detail view rather than two that drift apart. The club shelf hands an edit
  over to this page by read id, so the editor always opens against live data.
- **`/biblioteca/estadisticas`** (`LibraryStatsPage`) — personal dashboard:
  totals, average rating, reads per month, genre breakdown, best-rated, and a
  this-year-vs-last-year comparison. Scoped to personal reads only until the
  unified library lands.
- **`LogReadFlow`** — a modal *within* `/biblioteca`: the log form (title,
  author, genre, format, rating 1-10 in half steps shown as stars, dates,
  free-text notes, cover by upload or pasted URL) and the voice note. The
  recorder uses `MediaRecorder` with a live timer and playback-before-upload;
  there is a file-upload fallback for browsers that deny microphone access.

Both pages hang off a router layout that owns the `usePersonalReads`
subscription and the auth gate, so the query is issued once and only ever for
a signed-in owner.

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

## Bibliographic fields

`pages`, `country`, `publicationYear` and `originalLanguage` exist on **both**
`books` and `personal_reads`, with the same names and meaning, so the merged
shelf and the dashboards can treat the two sources alike.

All four are optional everywhere. A missing value never blocks saving and
simply does not contribute to an aggregate — `PersonalStats` only shows the
"páginas leídas" and "países" tiles once there is something to count. Books
that predate the fields are filled in by hand from each review's edit form.

### Where the aggregates surface

- **Mi Biblioteca → Estadísticas** — "páginas leídas" and "países" tiles over
  your personal reads.
- **Panel de Estadísticas (club)** — the same two as highlight cards, plus a
  "De dónde y de cuándo leemos" block: books per country, original languages,
  and the span between the oldest and newest publication year.

The club aggregates deliberately count **every finished book**, not just the
graded subset the rest of that dashboard is built on: a book was read whether
or not the club recorded debate grades for it. Every tile and block is hidden
until at least one book carries the relevant field, so a half-filled shelf
never shows a misleading zero.
