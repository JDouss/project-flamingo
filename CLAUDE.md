# CLAUDE.md

Guidance for agents working in this repository.

## Engineering principles

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.

- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.

- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.

- Keep components modular and concerns clearly separated.

- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.

- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.

- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

- **This applies to code, never to data.** Anything a user entered — reviews, sessions, grades, recordings, personal reads — must stay accessible forever. Reading paths for older document shapes are not "obsolete paths": deleting them makes real content unreachable. If a shape genuinely must change, migrate the documents first and verify, then remove the old path.

## Project notes

- **Deploys are automatic on merge to `main`.** The workflow ships hosting, Firestore/Storage rules, and Cloud Functions together — the frontend must never depend on rules or functions that have not shipped with it.
- **Cloud Functions run on Node 20, which is decommissioned 2026-10-30.** After that date functions deploys fail; `functions/package.json` needs bumping before then.
- **`personal_reads` is private per owner.** Its Firestore rules scope every document to `ownerEmail`, and voice notes under `voice-notes/` are admin-read as well as admin-write — unlike club recordings, which are deliberately world-readable. Do not add a public-read path to either.
- Feature docs live in `docs/`. See `docs/personal-reading-log.md` for Mi Biblioteca.
