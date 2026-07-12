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
  Volume2,
  TrendingUp
} from 'lucide-react';

import BookCard from './features/catalog/BookCard';
import BookDetails from './features/book-details/BookDetails';
import AdminPanel from './features/admin/AdminPanel';
import LoginModal from './features/admin/LoginModal';
import FlamingoIcon from './ui/FlamingoIcon';
import SessionStudio from './features/session-studio/SessionStudio';
import ClubDashboard from './features/dashboard/ClubDashboard';
import { useBooks } from './data/useBooks';

export default function App() {
  const { books, loading } = useBooks();
  const [user, setUser] = useState(null);

  // Modal states
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

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

  const genres = useMemo(() => {
    const allGenres = books.map((b) => b.genre).filter(Boolean);
    return [...new Set(allGenres)];
  }, [books]);

  const filteredAndSortedBooks = useMemo(() => {
    let result = [...books];

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

    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return 0;
    });

    return result;
  }, [books, searchQuery, selectedGenre, selectedStatus, sortBy]);

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
            <FlamingoIcon size={28} />
            <span>Reseñas<span style={{ fontWeight: '300', opacity: 0.8 }}> Flamingueras</span></span>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsStatsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={15} style={{ color: 'var(--primary)' }} /> Estadísticas
            </button>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(42, 26, 46, 0.04)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sage)', display: 'inline-block', boxShadow: '0 0 8px var(--sage)' }}></span>
                  Admin Activo
                </span>
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
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguos</option>
                <option value="rating">Mejor valorados</option>
                <option value="title">Título A-Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reviews Grid */}
        {loading ? (
          <div className="loading-container">
            <div className="spinner" style={{ width: '2.5rem', height: '2.5rem' }} />
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Cargando estanterías de libros...</p>
          </div>
        ) : filteredAndSortedBooks.length > 0 ? (
          <div className="books-grid">
            {filteredAndSortedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => setSelectedBookId(book.id)}
                onEdit={startEdit}
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
            <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', opacity: 0.3 }} />
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: '700' }}>No se encontraron reseñas</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', fontSize: '0.9rem' }}>
              No pudimos encontrar ningún libro que coincida con tus criterios de búsqueda. Intenta ajustar el texto o los filtros.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: '6rem',
        padding: '3rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: 'var(--text-muted)'
      }}>
        <p>© 2026 Reseñas de Libros Project Flamingo. Creado con Vite, React y GCP.</p>
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
    </div>
  );
}
