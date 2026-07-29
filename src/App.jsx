import { useState, useEffect, useMemo } from 'react';
import { auth, authorizedEmails } from './data/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  LogIn,
  LogOut,
  Plus,
  Search,
  Filter,
  SlidersHorizontal,
  BookOpen,
  BookMarked,
  Volume2,
  TrendingUp
} from 'lucide-react';

import BookCard from './features/catalog/BookCard';
import BookDetails from './features/book-details/BookDetails';
import AdminPanel from './features/admin/AdminPanel';
import LoginModal from './features/admin/LoginModal';
import FlamingoIcon from './ui/FlamingoIcon';
import { OpenBook, Bookshelf } from './ui/ornaments';
import SessionStudio from './features/session-studio/SessionStudio';
import ClubDashboard from './features/dashboard/ClubDashboard';
import PersonalLibrary from './features/personal/PersonalLibrary';
import PersonalReadDetails from './features/personal/PersonalReadDetails';
import { useBooks } from './data/useBooks';
import { usePersonalReads } from './data/usePersonalReads';
import { readToCard, bookToCard, PERSONAL_SOURCE } from './features/personal/readAdapter';

export default function App() {
  const { books, loading } = useBooks();
  const [user, setUser] = useState(null);
  const ownerEmail = user ? (user.email || '').toLowerCase() : null;
  // Personal reads are only ever fetched for a signed-in owner; a visitor's
  // session never issues the query at all.
  const { reads } = usePersonalReads(ownerEmail);

  // Modal states
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isPersonalOpen, setIsPersonalOpen] = useState(false);
  const [editingRead, setEditingRead] = useState(null);
  const [selectedReadId, setSelectedReadId] = useState(null);
  const [includePersonal, setIncludePersonal] = useState(false);

  // Filters and sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Auth listener. This is a UX gate only: write access is enforced by
  // firestore.rules / storage.rules on the server.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        return;
      }
      const emailLower = currentUser.email ? currentUser.email.toLowerCase() : '';
      if (authorizedEmails.includes(emailLower)) {
        setUser(currentUser);
      } else {
        signOut(auth).catch((err) => console.error(err));
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Log out failed:', err);
    }
  };

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

  const editCard = (card) => {
    if (card.source === PERSONAL_SOURCE) {
      setSelectedReadId(null);
      setEditingRead(card.read || card);
      setIsPersonalOpen(true);
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
    <div>
      {/* Main Navbar */}
      <header className="header-wrapper">
        <div className="header-content">
          <a href="#" className="logo" style={{ transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
            <FlamingoIcon size={32} />
            <span className="logo-lockup">
              <span className="logo-eyebrow">Club de lectura · Flamingo Rock</span>
              <span className="logo-title">Reseñas <em>Flamíngueras</em></span>
            </span>
          </a>

          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setIsStatsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={15} style={{ color: 'var(--primary)' }} /> Estadísticas
            </button>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span className="admin-pill" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(42, 26, 46, 0.04)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sage)', display: 'inline-block', boxShadow: '0 0 8px var(--sage)' }}></span>
                  Admin Activo
                </span>
                <button className="btn btn-secondary" onClick={() => setIsPersonalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BookMarked size={15} /> Mi Biblioteca
                </button>
                <button className="btn btn-secondary" onClick={() => setIsStudioOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Volume2 size={15} /> Sesión de Club
                </button>
                <button className="btn btn-primary" onClick={startAdd}>
                  <Plus size={15} /> Añadir Reseña
                </button>
                <button className="btn btn-secondary btn-icon" onClick={handleLogout} title="Cerrar Sesión">
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setIsLoginOpen(true)}>
                <LogIn size={15} /> Iniciar Sesión de Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Shelves */}
      <main className="container" style={{ paddingTop: '2.5rem' }}>
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
          <div className="loading-container">
            <OpenBook size={72} className="loading-book" />
            <p className="serif-title" style={{ fontSize: '1.05rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Abriendo la biblioteca…
            </p>
          </div>
        ) : filteredAndSortedBooks.length > 0 ? (
          <div className="books-grid">
            {filteredAndSortedBooks.map((book) => (
              <BookCard
                key={`${book.source}-${book.id}`}
                book={book}
                onClick={() => openCard(book)}
                onEdit={editCard}
                isAdmin={!!user}
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
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <Bookshelf style={{ color: 'var(--text-muted)' }} />
        <p>© 2026 Reseñas Flamíngueras · Club de lectura Flamingo Rock</p>
      </footer>

      {/* Overlays / Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />

      {isAdminOpen && (
        <AdminPanel
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          editBook={editingBook}
          books={books}
        />
      )}

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          onClose={() => setSelectedBookId(null)}
          onEdit={(book) => {
            setSelectedBookId(null);
            startEdit(book);
          }}
          isAdmin={!!user}
        />
      )}

      {isStudioOpen && (
        <SessionStudio
          isOpen={isStudioOpen}
          onClose={() => setIsStudioOpen(false)}
          books={books}
        />
      )}

      {isStatsOpen && (
        <ClubDashboard
          isOpen={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          books={books}
        />
      )}

      {/* Private reading log — mounted only while signed in, and the
          Firestore rules scope every doc to the owner's email anyway. */}
      {isPersonalOpen && ownerEmail && (
        <PersonalLibrary
          isOpen={isPersonalOpen}
          onClose={() => {
            setIsPersonalOpen(false);
            setEditingRead(null);
          }}
          ownerEmail={ownerEmail}
          initialEditRead={editingRead}
        />
      )}

      {selectedRead && (
        <PersonalReadDetails
          read={selectedRead}
          onClose={() => setSelectedReadId(null)}
          onEdit={(read) => {
            setSelectedReadId(null);
            setEditingRead(read);
            setIsPersonalOpen(true);
          }}
        />
      )}
    </div>
  );
}
