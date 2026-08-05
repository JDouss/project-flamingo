// Bridges the two book shapes so one library can hold both. A club book and a
// personal read are stored separately and graded differently; this is the
// single place that reconciles them into one item shape.

export const CLUB_SOURCE = 'club';
export const PERSONAL_SOURCE = 'personal';

// The club shows 1-5 stars derived from 1-10 debate grades. A personal grade
// is on the same 1-10 ritual scale, so it converts the same way — that is
// what makes a merged library sortable by rating at all.
export function starsFromTen(rating) {
  const value = Number(rating);
  if (rating == null || isNaN(value)) return 0;
  return Math.max(1, Math.min(5, Math.round(value / 2)));
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

// The club's own verdict on a book: the average of the final debate grades.
export function clubAverage(grades) {
  const values = Object.values(grades?.end || {})
    .map(toNumberOrNull)
    .filter((v) => v !== null && v > 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Which name in this club's roster is me. Roster entries carry an optional
// linked email; grades are keyed by the roster NAME, permanently, so this is
// the only bridge between "my account" and "my grades".
export function rosterNameFor(club, email) {
  if (!club || !email) return null;
  const entry = (club.roster || []).find(
    (r) => (r.email || '').toLowerCase() === email.toLowerCase()
  );
  return entry ? entry.name : null;
}

// ---------------------------------------------------------------------------
// One item shape, two sources
// ---------------------------------------------------------------------------
//   source      'personal' | 'club'
//   myRating    my own 1-10 grade, or null when I never graded it
//   clubAvg     the club's average final grade (club items only)
// Dates are normalized to finishedAt/startDate/createdAt so the stats can
// treat both sides alike.

export function readToLibraryItem(read) {
  return {
    id: read.id,
    source: PERSONAL_SOURCE,
    clubId: null,
    clubName: null,
    title: read.title || '',
    author: read.author || '',
    genre: read.genre || '',
    status: read.status || 'completed',
    myRating: toNumberOrNull(read.rating),
    clubAvg: null,
    // Prefer what the voice note distilled; fall back to typed notes.
    summary: read.insights?.summary || read.notes || '',
    coverUrl: read.coverUrl || '',
    finishedAt: read.finishedAt || '',
    startDate: read.startDate || '',
    createdAt: read.createdAt || '',
    pages: toNumberOrNull(read.pages),
    country: (read.country || '').trim(),
    publicationYear: toNumberOrNull(read.publicationYear),
    originalLanguage: (read.originalLanguage || '').trim(),
    // Voice-note state belongs to personal reads alone.
    insights: read.insights || null,
    voiceNote: read.voiceNote || null,
    noteStatus: read.noteStatus,
    updatedAt: read.updatedAt || '',
    // The untouched doc, for the detail view and the editor.
    read,
  };
}

export function clubBookToLibraryItem(book, club, myRosterName) {
  return {
    id: book.id,
    source: CLUB_SOURCE,
    clubId: club.id,
    clubName: club.name || club.id,
    title: book.title || '',
    author: book.author || '',
    genre: book.genre || '',
    status: book.status || 'completed',
    // My grade is the one the club recorded under my roster name. No grade
    // under it means the book still counts as read — it just contributes
    // nothing to my rating averages.
    myRating: myRosterName ? toNumberOrNull(book.grades?.end?.[myRosterName]) : null,
    clubAvg: clubAverage(book.grades),
    summary: book.summary || '',
    coverUrl: book.imageUrl || '',
    finishedAt: book.endDate || '',
    startDate: book.startDate || '',
    createdAt: book.createdAt || '',
    pages: toNumberOrNull(book.pages),
    country: (book.country || '').trim(),
    publicationYear: toNumberOrNull(book.publicationYear),
    originalLanguage: (book.originalLanguage || '').trim(),
    insights: null,
    voiceNote: null,
    noteStatus: undefined,
    updatedAt: book.updatedAt || '',
    book,
  };
}

// My library: everything I have read, wherever I read it. Never stored —
// recomputed from the two sources every time, never duplicated.
//
// `clubLibraries` is [{ club, books }]. A club whose roster does not link my
// email contributes nothing: I can still see those books on the club page,
// but they are not *mine* until an admin links me in the roster.
export function myLibrary(personalReads, clubLibraries, email) {
  const personal = (personalReads || []).map(readToLibraryItem);

  const club = (clubLibraries || []).flatMap(({ club, books }) => {
    const myRosterName = rosterNameFor(club, email);
    if (!myRosterName) return [];
    return (books || [])
      .filter((b) => b.status === 'completed')
      .map((b) => clubBookToLibraryItem(b, club, myRosterName));
  });

  // Newest first, by when the book was read rather than when it was logged.
  const readDate = (i) => new Date(i.finishedAt || i.startDate || i.createdAt || 0);
  return [...personal, ...club].sort((a, b) => readDate(b) - readDate(a));
}

// The club shelf still renders raw club books through BookCard.
export function bookToCard(book) {
  return { ...book, source: CLUB_SOURCE };
}
