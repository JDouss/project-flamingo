import { useState, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, Search, Filter, SlidersHorizontal, BookOpen, BookMarked, Volume2 } from 'lucide-react';

import BookCard from '../catalog/BookCard';
import BookDetails from '../book-details/BookDetails';
import AdminPanel from '../admin/AdminPanel';
import SessionStudio from '../session-studio/SessionStudio';
import PersonalReadDetails from '../personal/PersonalReadDetails';
import { OpenBook } from '../../ui/ornaments';
import Loading from '../../ui/Loading';
import { useAuth } from '../../app/authContext';
import { usePersonalReads } from '../../data/usePersonalReads';
import { readToCard, bookToCard, PERSONAL_SOURCE } from '../personal/readAdapter';

// The club shelf: the catalog, its filters, and the modals that edit what is
// on it. Session Studio stays a modal opened from here — it acts on this
// club's sessions, so it belongs to this page rather than the global header.
export default function ClubShelfPage() {
  const { clubId, books, loading, isClubAdmin } = useOutletContext();
  const { ownerEmail } = useAuth();
  const navigate = useNavigate();
  // Every signed-in reader has their own log now, under their own email, so
  // the shelf can offer to merge it in for anyone.
  const { reads } = usePersonalReads(ownerEmail);

  // Modal states
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [selectedReadId, setSelectedReadId] = useState(null);
  const [includePersonal, setIncludePersonal] = useState(false);

  // Filters and sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Keep the details modal in sync with realtime book updates.
  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) || null,
    [books, selectedBookId]
  );

  // The shelf: club books, plus your own reads when the toggle is on. They
  // are normalized to one card shape so search, filters and sorting apply
  // across both without special cases below.
  const shelf = useMemo(() => {
    const clubCards = books.map(bookToCard);
    if (!includePersonal || !ownerEmail) return clubCards;
    return [...clubCards, ...reads.map(readToCard)];
  }, [books, reads, includePersonal, ownerEmail]);

  const selectedRead = useMemo(
    () => reads.find((r) => r.id === selectedReadId) || null,
    [reads, selectedReadId]
  );

  const genres = useMemo(() => {
    const allGenres = shelf.map((b) => b.genre).filter(Boolean);
    return [...new Set(allGenres)];
  }, [shelf]);

  const filteredAndSortedBooks = useMemo(() => {
    let result = [...shelf];

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.summary || '').toLowerCase().includes(q) ||
        (b.genre || '').toLowerCase().includes(q)
      );
    }

    if (selectedGenre) {
      result = result.filter((b) => b.genre === selectedGenre);
    }
    if (selectedStatus) {
      result = result.filter((b) => b.status === selectedStatus);
    }

    // Date ordering follows when the book was READ (endDate), not when it
    // was entered into the system — bulk-added books all share a createdAt.
    const readDate = (b) => new Date(b.endDate || b.startDate || b.createdAt || 0);
    result.sort((a, b) => {
      if (sortBy === 'newest') return readDate(b) - readDate(a);
      if (sortBy === 'oldest') return readDate(a) - readDate(b);
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return 0;
    });

    return result;
  }, [shelf, searchQuery, selectedGenre, selectedStatus, sortBy]);

  // A card can be either kind of book, so opening and editing dispatch on the
  // source rather than assuming the club catalog.
  const openCard = (card) => {
    if (card.source === PERSONAL_SOURCE) setSelectedReadId(card.id);
    else setSelectedBookId(card.id);
  };

  // Editing a personal read is the library's job, so the shelf hands it over
  // to /biblioteca instead of opening an editor the club page doesn't own.
  const editRead = (read) => {
    setSelectedReadId(null);
    navigate('/biblioteca', { state: { editReadId: read.id } });
  };

  const editCard = (card) => {
    if (card.source === PERSONAL_SOURCE) {
      editRead(card.read || card);
      return;
    }
    setEditingBook(card);
    setIsAdminOpen(true);
  };

  const startEdit = (book) => {
    setEditingBook(book);
    setIsAdminOpen(true);
  };

  const startAdd = () => {
    setEditingBook(null);
    setIsAdminOpen(true);
  };

  return (
    <main className="container" style={{ paddingTop: '2.5rem' }}>
      {/* Club admin actions live with the club's data, not in the app header. */}
      {isClubAdmin && (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <button className="btn btn-secondary" onClick={() => setIsStudioOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Volume2 size={15} /> Sesión de Club
          </button>
          <button className="btn btn-primary" onClick={startAdd}>
            <Plus size={15} /> Añadir Reseña
          </button>
        </div>
      )}

      {/* Controls Card */}
      <div className="controls-card">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Buscar por título, autor, género o contenido..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              style={{ fontSize: '0.85rem' }}
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
            >
              <option value="">Todos los géneros</option>
              {genres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              style={{ fontSize: '0.85rem' }}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="completed">Leído</option>
              <option value="reading">Leyendo</option>
              <option value="to-read">Por leer</option>
              {/* Only reachable when your own reads are on the shelf. */}
              {includePersonal && ownerEmail && <option value="abandoned">Abandonado</option>}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <SlidersHorizontal size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-select"
              style={{ fontSize: '0.85rem' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Últimos leídos</option>
              <option value="oldest">Primeros leídos</option>
              <option value="rating">Mejor valorados</option>
              <option value="title">Título A-Z</option>
            </select>
          </div>

          {/* Merge your own reads into the club shelf. Signed-in only, and
              off by default so the catalog opens as the club's. */}
          {ownerEmail && (
            <label className={`shelf-toggle ${includePersonal ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={includePersonal}
                onChange={(e) => setIncludePersonal(e.target.checked)}
              />
              <BookMarked size={14} />
              Incluir mis lecturas
              {includePersonal && reads.length > 0 && (
                <span className="shelf-toggle-count">{reads.length}</span>
              )}
            </label>
          )}
        </div>
      </div>

      {/* Reviews Grid */}
      {loading ? (
        <Loading />
      ) : filteredAndSortedBooks.length > 0 ? (
        <div className="books-grid">
          {filteredAndSortedBooks.map((book) => (
            <BookCard
              key={`${book.source}-${book.id}`}
              book={book}
              onClick={() => openCard(book)}
              onEdit={editCard}
              isAdmin={isClubAdmin}
            />
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '5rem 2rem',
          background: '#ffffff',
          border: '1px dashed rgba(42, 26, 46, 0.14)',
          borderRadius: 'var(--radius-md)'
        }}>
          <OpenBook size={84} style={{ color: 'var(--primary-ink)', marginBottom: '1.5rem', opacity: 0.55 }} />
          <h3 className="serif-title" style={{ fontSize: '1.35rem', marginBottom: '0.5rem', fontWeight: '600' }}>No se encontraron reseñas</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', fontSize: '0.9rem' }}>
            No pudimos encontrar ningún libro que coincida con tus criterios de búsqueda. Intenta ajustar el texto o los filtros.
          </p>
        </div>
      )}

      {/* Editors and details, scoped to this page's data. */}
      {isAdminOpen && (
        <AdminPanel
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          clubId={clubId}
          editBook={editingBook}
          books={books}
        />
      )}

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          clubId={clubId}
          onClose={() => setSelectedBookId(null)}
          onEdit={(book) => {
            setSelectedBookId(null);
            startEdit(book);
          }}
          isAdmin={isClubAdmin}
        />
      )}

      {isStudioOpen && (
        <SessionStudio
          isOpen={isStudioOpen}
          onClose={() => setIsStudioOpen(false)}
          clubId={clubId}
          books={books}
        />
      )}

      {selectedRead && (
        <PersonalReadDetails
          read={selectedRead}
          ownerEmail={ownerEmail}
          onClose={() => setSelectedReadId(null)}
          onEdit={editRead}
        />
      )}
    </main>
  );
}
