# Architecture refactor: multi-club, private-by-default, one library per reader

**Status: in progress — P0–P3 shipped; the migration has been run and
verified, and the app now reads and writes the clubs/users tree. P4 next.**
This document is the hand-off
spec for the implementing model. Read it fully before writing code, implement
the phases **in order**, one PR per phase, and re-read the *Guardrails*
section before every phase. When this document and improvisation disagree,
this document wins; when this document and `CLAUDE.md` disagree, `CLAUDE.md`
wins (especially its data-preservation rule).

---

## 1. Why we are refactoring

Three structural problems, in the owner's words and in code terms:

1. **Mi Biblioteca is bolted on.** The app is a single page (`App.jsx`) where
   every feature is a modal. The personal library is a drawer over the club
   shelf, merged in through a toggle. It works, but the seams show, and a
   second club has nowhere to live.
2. **The club is public.** `books`, `transcriptions`, `speakers_registry`,
   recordings and transcripts are world-readable. The owner wants club content
   visible **only to authenticated members of that club**.
3. **A reader's history is fragmented.** Books read with the club live in
   `books`; books read alone live in `personal_reads`. But they are one fact —
   "books I have read" — and the reader should see them as one library with
   one set of stats, while each club keeps its own dashboard.

Target: **users belong to clubs; clubs are private; a user's library is the
union of their personal reads and their club reads; stats exist at both the
club level and the personal level and share the same underlying numbers.**

## 2. Product model (vocabulary — use these names in code)

- **User** — anyone who signs in with Google. Identified by lowercased email.
- **Club** — a reading group with its own catalog, sessions, roster and
  dashboard. Flamingo Rock becomes the first club, id `flamingo`.
- **Member** — a login account attached to a club, with role `admin` or
  `member`. Admins edit books, run sessions, manage the club.
- **Roster entry** — a *human* inside the club's ritual: a name that appears
  in grade tables ("Almu", "Zepe"), with an optional linked email. Roster and
  members are different sets: most graders have never logged in, and that
  must keep working. **Grades stay keyed by roster name forever.**
- **Club book** — a book the club read: review, session memory, grades,
  quotes. Lives under the club.
- **Personal read** — a book a user read alone: rating, notes, voice note,
  insights. Lives under the user. Unchanged in shape from today.
- **My library (derived)** — NOT a collection. The runtime union of: my
  personal reads + finished books of every club where a roster entry links to
  my email. Computed client-side. Never materialized, never duplicated.

## 3. Data model

Identity key everywhere is **lowercased email** (matches every existing rule,
function and document in the project; Google sign-in guarantees it; no
uid↔email migration needed).

```
users/{email}                     — profile: { displayName, photoURL, createdAt }
users/{email}/reads/{readId}      — personal read, exact shape of today's
                                    personal_reads doc (ownerEmail field kept
                                    for defense-in-depth)

clubs/{clubId}                    — { name, slug, inviteCode, createdBy,
                                      createdAt,
                                      roster: [ { name, personaHint,
                                                  email|null } ] }
clubs/{clubId}/members/{email}    — { role: 'admin'|'member', joinedAt }
clubs/{clubId}/books/{bookId}     — exact shape of today's `books` doc
                                    (grades still keyed by roster NAME)
clubs/{clubId}/sessions/{sessId}  — exact shape of today's `transcriptions` doc
```

Design decisions the implementer must not "improve":

- **Roster is an array on the club doc**, not a subcollection. It is small
  (a handful of humans), read as a unit by the AI pipeline and the grade UIs,
  and edited as a unit in the roster editor. `members` must be a subcollection
  because security rules address it by deterministic path
  (`exists(.../members/$(request.auth.token.email.lower()))`).
- **Grades stay keyed by roster name.** Historical grade maps
  (`grades.end["Almu"]`) are user data and are never rewritten. "My grades"
  are resolved at read time: find the roster entry with `email == mine`, take
  its `name`, index the grade map. Enforce roster-name uniqueness per club in
  the roster editor, not by migration.
- **Book and session docs migrate byte-identical** (same doc ids, same
  fields). Every legacy quirk that today's readers handle (`speakers` vs
  `analysis`, missing `status`, inline `transcript`) still exists in the
  copied docs, so **all legacy-shape reading code stays**.
- `personal_reads` moves to `users/{email}/reads` purely for a clean per-user
  namespace; the doc shape does not change.

## 4. Authorization model

### 4.1 Firestore rules (membership via `exists()`)

```
function signedInEmail() {
  return request.auth != null && request.auth.token.email != null
    ? request.auth.token.email.lower() : null;
}
function isClubMember(clubId) {
  return signedInEmail() != null
    && exists(/databases/$(database)/documents/clubs/$(clubId)/members/$(signedInEmail()));
}
function isClubAdmin(clubId) {
  return isClubMember(clubId)
    && get(/databases/$(database)/documents/clubs/$(clubId)/members/$(signedInEmail())).data.role == 'admin';
}

match /users/{email}/{document=**}     — read/write only if signedInEmail() == email
                                         (updates must not change ownerEmail)
match /clubs/{clubId}                  — read: isClubMember(clubId)
                                         write: isClubAdmin(clubId)
match /clubs/{clubId}/members/{email}  — read: isClubMember(clubId)
                                         write: isClubAdmin(clubId)
match /clubs/{clubId}/books/{bookId}   — read: isClubMember(clubId)
                                         write: isClubAdmin(clubId)
match /clubs/{clubId}/sessions/{id}    — read: isClubMember(clubId)
                                         create/update/delete: isClubAdmin(clubId)
```

`exists()`/`get()` in rules cost one read per check — fine at this scale.
There is **no public-read clause anywhere** in the new tree. Club creation and
joining go through callables (4.3), never direct writes.

### 4.2 Storage rules (membership via custom claims)

Storage rules cannot read Firestore, so club-scoped media is gated with a
**custom claim**: `{ clubs: { flamingo: 'admin', otroclub: 'member' } }`.

- A trigger function (`onDocumentWritten` on `clubs/{clubId}/members/{email}`)
  rewrites that user's claims from their memberships. Claims are ≤1000 bytes —
  roles for dozens of clubs fit; do not store anything else in them.
- Claims go stale until token refresh: after `joinClub` or claim changes, the
  client calls `user.getIdToken(true)`. The migration section covers the
  owner's own refresh.

```
match /clubs/{clubId}/recordings/{f=**}  — read/write: request.auth.token.clubs[clubId] != null
                                           (write also size<100MB, audio/*)
match /clubs/{clubId}/transcripts/{f=**} — read: claim; write: false (Admin SDK only)
match /users/{email}/voice-notes/{f=**}  — read/write: token.email.lower() == email
                                           (write also size<25MB, audio/*)
match /covers/{f=**}                     — unchanged: public read, authed write.
                                           Book jackets are not personal data;
                                           per-card signed URLs flicker. Accepted.

LEGACY paths — files are NOT moved (stored paths in migrated docs point at them):
match /recordings/{f=**}   — read: token.clubs.flamingo != null; write: false
match /transcripts/{f=**}  — read: token.clubs.flamingo != null; write: false
match /voice-notes/{f=**}  — read: owner email check against the one existing
                             owner (doussinague95@gmail.com); write: false
match /voiceprints/{f=**}  — read: token.clubs.flamingo != null; write: false
```

Note: locking legacy `recordings/` breaks any *stored* public `audioUrl` only
for non-members — members still resolve URLs via `getDownloadURL`, which
passes the claim check. That is the point of the change.

### 4.3 Callables replace the allowlist

`ADMIN_EMAILS`, `VITE_ADMIN_EMAIL` and `VITE_AUTHORIZED_EMAILS` are deleted at
the end (Phase 6, only after everything else works). Authorization becomes:

- `createClub({ name })` — any signed-in user; creates club + membership
  (role admin) + invite code; returns clubId.
- `joinClub({ inviteCode })` — any signed-in user; finds the club by invite
  code, creates membership (role member). Client refreshes token after.
- Pipeline callables (`transcribeSession`, `analyzeSession`) take a `clubId`
  and assert **club admin** via the membership doc, not a hardcoded list.
  They read the roster from the club doc instead of `speakers_registry`.
- `analyzeReadingNote` asserts doc ownership (unchanged logic, new path).

## 5. Frontend architecture

### 5.1 Add `react-router-dom` and real pages

This is the fix for "bolted together": pages own data scope; modals only ever
show details/editors *within* a page.

```
/                         Landing: sign-in; then club switcher or redirect to
                          the user's only club. Logged out: login + invite-code
                          entry. No book content, ever.
/club/:clubId             The shelf (today's catalog page), club-scoped.
/club/:clubId/estadisticas ClubDashboard as a page, club-scoped.
/biblioteca               My library: unified list (personal + club reads),
                          with source chips ("Flamingo" / "Mi lectura").
/biblioteca/estadisticas  Personal stats over the unified library.
/join/:inviteCode         Join flow → joinClub → token refresh → redirect.
```

Component moves (moves, not rewrites — reuse today's components):

```
src/app/routes.jsx                — router shell, auth context, club context
src/features/club/ClubShelfPage   — from App.jsx catalog JSX + BookCard grid
src/features/club/ClubStatsPage   — ClubDashboard, modal shell removed
src/features/library/LibraryPage  — from PersonalLibrary list tab (page, not modal)
src/features/library/LibraryStatsPage — PersonalStats over merged reads
src/features/library/logReadFlow  — ReadForm/recorder, reachable from /biblioteca
Session Studio                    — stays a modal, opened from the club page,
                                    club admins only
```

### 5.2 The adapter grows up (this is the stats-integration core)

`readAdapter.js` becomes the single module that produces **one card/stat
shape** from three sources:

```js
// source: 'personal' | 'club'
// clubId, clubName          — set for club reads
// myRating (1-10 | null)    — personal: rating
//                           — club: grades.end[myRosterName] ?? null
// clubAvg (1-10 | null)     — club: average of grades.end values
// pages/country/publicationYear/originalLanguage — same names both sides (done)
myLibrary(personalReads, clubs) =>
  [...personalReads.map(readToCard),
   ...clubs.flatMap(({club, books, myRosterName}) =>
      books.filter(b => b.status === 'completed')
           .map(b => clubBookToCard(b, club, myRosterName)))]
```

Resolution of `myRosterName`: the club doc's roster entry where
`email == signedInEmail`. If no roster entry links to me, my library simply
does not include that club's books (I can see them on the club page; they are
not "mine" until an admin links me in the roster editor).

**Stats integration requirement, made precise:**
- `/club/:clubId/estadisticas` — today's ClubDashboard numbers, scoped to that
  club's books. Unchanged content.
- `/biblioteca/estadisticas` — PersonalStats computed over `myLibrary(...)`:
  totals, pages, countries, genres, per-month all include club reads; rating
  aggregates use `myRating` (my own club grade — NOT the club average — so the
  stats are *mine*); plus one new breakdown "Por origen": personal vs. each
  club (count + my average). A club book where I have no end-grade counts for
  pages/countries/totals but not for rating averages.

### 5.3 De-duplication is out of scope

If the same title exists as a personal read and a club book, it appears twice
in the library, honestly sourced. Title-matching heuristics are speculative
complexity — explicitly rejected for this refactor.

## 6. Cloud Functions changes

| Function | Change |
|---|---|
| `transcribeSession` / `analyzeSession` | take `clubId`; assert club admin; paths `clubs/{clubId}/...`; roster from club doc |
| `analyzeReadingNote` | path `users/{email}/reads/{readId}`; ownership check unchanged |
| `syncClubClaims` (new trigger) | on members write → rebuild that user's claims |
| `createClub` / `joinClub` (new) | see 4.3 |
| `migrateFlamingo` (new, temporary) | see §7; deleted in Phase 6 |

## 7. Migration (the part that must not go wrong)

Constraints: the deploy pipeline ships hosting+rules+functions **together on
every merge**, so each merge must be self-consistent; and per `CLAUDE.md`,
old data must remain reachable until the copy is verified.

`migrateFlamingo` — callable, gated to the current owner email, idempotent
(re-run overwrites copies, never deletes sources):

1. Create `clubs/flamingo` (name "Flamingo Rock", invite code), roster from
   `speakers_registry` (emails null), `members/doussinague95@gmail.com` role
   admin. Owner's roster link is set manually afterwards in the roster editor
   (the owner knows which reader they are; code must not guess).
2. Copy `books/*` → `clubs/flamingo/books/*`, `transcriptions/*` →
   `clubs/flamingo/sessions/*`, `personal_reads/*` →
   `users/{ownerEmail}/reads/*` — same ids, unmodified payloads. Storage
   files are not moved.
3. Return `{ books: {source, copied}, sessions: {...}, reads: {...} }`.

The owner runs it from `/migracion` — an owner-only page, linked from nowhere,
which calls the callable and renders those counts side by side so the first
verification step is the screen itself. Page and callable are deleted together
in P6.

**Verification before any cutover** (owner + implementer together):
counts match for all three pairs; spot-open in the UI: one legacy-format
session, one book with grades, one personal read with a voice note (audio must
play — proves legacy voice-note path rule works).

**Cutover sequencing** (details in §8): rules keep legacy collections
readable-as-today until the frontend flip merges; the same PR that points the
frontend at new paths locks legacy collections to flamingo-members-only; a
final cleanup PR deletes legacy *copies* and migration code only after the
owner confirms weeks of normal use. Deleting the old copies then is not a
data-preservation violation — the data lives, verified, in the new location.

## 8. Implementation phases — one PR each, prod works after every merge

**P0 — prerequisites (two tiny PRs, do first)**
- P0.1: bump `functions/package.json` to Node 22 (runtime dies 2026-10-30).
  Verify the merge deploy stays green before anything else.
- P0.2: `requestNoteAnalysis` failure writes `noteStatus:'error'` + message to
  the doc instead of only console (kills the 15-minute silent stall).

**P1 — router shell, no data changes.** Add `react-router-dom`. Recast
today's app as `/club/flamingo` + `/biblioteca` pages reading the **old**
collections. Modals for Session Studio/details/editors survive within pages.
`/` redirects; unknown routes redirect. Acceptance: app behaves identically,
URLs exist, deploy green.

**P2 — clubs data model + migration, dark.** New collections' rules
(members-only), `createClub`/`joinClub`/`syncClubClaims`/`migrateFlamingo`,
any-Google sign-in allowed (non-members see only landing/join — they can
*authenticate* without being *authorized*). Legacy rules untouched. After
merge: owner runs migration, does §7 verification, sets their roster link.
Acceptance: verification checklist passes; public site still works as today.

**P3 — the flip.** Frontend reads clubs/users paths everywhere (shelf, stats,
session studio incl. pipeline `clubId`, library, voice notes to new Storage
path). Same PR: legacy collections' public read revoked (flamingo-member
read-only), legacy Storage paths claim-gated. Landing replaces public
catalog for logged-out visitors. Acceptance: member sees everything incl.
legacy sessions/audio; logged-out sees landing only; new voice note works
end-to-end; club dashboard identical numbers pre/post.

**P4 — unified library.** Adapter per §5.2, `/biblioteca` merges club reads,
`/biblioteca/estadisticas` per the stats spec, roster editor gets email
linking, "Incluir mis lecturas" toggle dies (inverted by design: the club
page is the club's; the library is where union lives). Acceptance: club book
with my grade appears in my library with `myRating` = my end grade; stats
match hand-computation on real data.

**P5 — multi-club UX.** Club switcher, create-club flow, `/join/:code`,
per-club Session Studio guards. Acceptance: second club created end-to-end
in prod stays fully isolated from Flamingo.

**P6 — cleanup (only after owner sign-off on weeks of use).** Delete legacy
collection copies, migration callable, allowlist constants and env vars,
`useMembers`/`speakers_registry` code, old rules blocks. Legacy *Storage*
rules stay (files were never moved). Acceptance: grep finds no reference to
`books`-at-root, `transcriptions`, `speakers_registry`, `personal_reads`,
`ADMIN_EMAILS`, `VITE_AUTHORIZED_EMAILS`.

## 9. Guardrails for the implementing model

1. **Never delete or rewrite user data.** Copies are byte-identical; sources
   survive until P6; P6 needs explicit owner sign-off in the PR thread.
2. **Grades are keyed by roster names forever.** No "normalization."
3. **Every merge deploys.** No PR may depend on a manual step happening
   *before* its own deploy completes; manual steps (migration run,
   verification) happen strictly between merges as sequenced in §8.
4. **Keep legacy-format readers** (`sessionStatus` mapping, `speakers`/
   `attendees` import, inline transcripts). They now serve migrated docs.
5. **No speculative features**: no de-dup, no public club option, no
   roles beyond admin/member, no notifications, no SSR.
6. **Reuse before rebuilding**: pages wrap existing components; the only
   sanctioned new dependency is `react-router-dom`.
7. **Spanish UI, English code/comments**, matching the codebase.
8. When genuinely blocked or when a rule here proves wrong in practice, stop
   and ask the owner — do not improvise around the spec.

## 10. Consciously deferred

Public read-only club pages; club avatars/theming; per-book club discussion
threads; reading goals; export; email invites (invite code only for now).
