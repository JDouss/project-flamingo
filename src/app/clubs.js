// P1 knows about exactly one club. The catalog still lives in the root
// `books` / `transcriptions` collections, which are Flamingo Rock's — only the
// URL is club-scoped for now. The `clubs` collection, a switcher and real
// membership arrive in later phases.
export const DEFAULT_CLUB_ID = "flamingo";
export const DEFAULT_CLUB_NAME = "Flamingo Rock";

export function isKnownClub(clubId) {
  return clubId === DEFAULT_CLUB_ID;
}
