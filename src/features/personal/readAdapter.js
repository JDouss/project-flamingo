// Bridges the two book shapes so one shelf can render both. Club books
// (`books`) and personal reads (`personal_reads`) are stored separately and
// graded on different scales; this is the single place that reconciles them.

export const CLUB_SOURCE = 'club';
export const PERSONAL_SOURCE = 'personal';

// The club shows 1-5 stars derived from 1-10 debate grades. A personal grade
// is on the same 1-10 ritual scale, so it converts the same way — that is
// what makes a merged shelf sortable by rating at all.
export function starsFromTen(rating) {
  const value = Number(rating);
  if (rating == null || isNaN(value)) return 0;
  return Math.max(1, Math.min(5, Math.round(value / 2)));
}

export function readToCard(read) {
  return {
    id: read.id,
    source: PERSONAL_SOURCE,
    title: read.title || '',
    author: read.author || '',
    genre: read.genre || '',
    rating: starsFromTen(read.rating),
    status: read.status || 'completed',
    // Prefer what the voice note distilled; fall back to typed notes.
    summary: read.insights?.summary || read.notes || '',
    imageUrl: read.coverUrl || '',
    endDate: read.finishedAt || '',
    startDate: read.startDate || '',
    createdAt: read.createdAt || '',
    // The untouched doc, for the detail view and the editor.
    read,
  };
}

export function bookToCard(book) {
  return { ...book, source: CLUB_SOURCE };
}
