import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, adminEmail, authorizedEmails } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { 
  LogIn, 
  LogOut, 
  Plus, 
  Search, 
  Filter, 
  SlidersHorizontal, 
  BookOpen, 
  UserCheck,
  AlertCircle,
  Volume2,
  TrendingUp
} from 'lucide-react';

import BookCard from './components/BookCard';
import BookDetails from './components/BookDetails';
import AdminPanel from './components/AdminPanel';
import LoginModal from './components/LoginModal';
import FlamingoIcon from './components/FlamingoIcon';
import VoiceAssistant from './components/VoiceAssistant';
import ClubDashboard from './components/ClubDashboard';

// High-quality mock books for Demo Mode
const MOCK_BOOKS = [];

export default function App() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Modal states
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [isGeneralVoiceOpen, setIsGeneralVoiceOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  // Filters and sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Verify Firebase credentials are present, otherwise activate Demo Mode
  const hasFirebaseConfig = !!(
    import.meta.env.VITE_FIREBASE_API_KEY && 
    import.meta.env.VITE_FIREBASE_API_KEY !== 'your_api_key_here' &&
    auth &&
    db
  );

  // 1. Auth Listener
  useEffect(() => {
    if (!auth) {
      setUser(null);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Double check admin email restrictions
        const emailLower = currentUser.email ? currentUser.email.toLowerCase() : '';
        const isAuthorized = authorizedEmails.includes(emailLower);
        if (!isAuthorized) {
          signOut(auth).catch(err => console.error(err));
          setUser(null);
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Books (Firestore or Demo Fallback)
  useEffect(() => {
    if (!hasFirebaseConfig || !db) {
      console.warn("Firebase configuration not found or database not initialized. Running in Demo Mode.");
      setBooks(MOCK_BOOKS);
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    setIsDemoMode(false);
    const booksRef = collection(db, 'books');
    const q = query(booksRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBooks(booksData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore loading error, falling back to Demo Mode:", error);
      setIsDemoMode(true);
      setBooks(MOCK_BOOKS);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [hasFirebaseConfig]);

  // Log out handler
  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Log out failed:", err);
    }
  };

  // Extract unique genres dynamically
  const genres = useMemo(() => {
    const allGenres = books.map(b => b.genre).filter(Boolean);
    return ['All', ...new Set(allGenres)];
  }, [books]);

  // Filtering and Sorting logic
  const filteredAndSortedBooks = useMemo(() => {
    let result = [...books];

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q)
      );
    }

    // Genre filter
    if (selectedGenre && selectedGenre !== 'All') {
      result = result.filter(b => b.genre === selectedGenre);
    }

    // Status filter
    if (selectedStatus) {
      result = result.filter(b => b.status === selectedStatus);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sortBy === 'rating') {
        return b.rating - a.rating;
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }, [books, searchQuery, selectedGenre, selectedStatus, sortBy]);

  // Trigger editing a book
  const startEdit = (book) => {
    setEditingBook(book);
    setIsAdminOpen(true);
  };

  // Trigger adding a book
  const startAdd = () => {
    setEditingBook(null);
    setIsAdminOpen(true);
  };

  const handleSaveSuccess = () => {
    // If we were viewing details of the book being edited, update selectedBook
    if (selectedBook && editingBook && selectedBook.id === editingBook.id) {
      const updated = books.find(b => b.id === editingBook.id);
      setSelectedBook(updated || null);
    }
  };

  const handleDeleteBook = async (bookId) => {
    if (isDemoMode) {
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } else {
      await deleteDoc(doc(db, 'books', bookId));
    }
    if (selectedBook && selectedBook.id === bookId) {
      setSelectedBook(null);
    }
  };

  const handleApplyNotesToBook = async (bookId, notesMarkdown, grades = null, generalSummary = null) => {
    const updateData = { privateNotes: notesMarkdown };
    if (grades) updateData.grades = grades;
    if (generalSummary) updateData.summary = generalSummary;

    if (isDemoMode) {
      setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, ...updateData } : b));
    } else {
      const bookRef = doc(db, 'books', bookId);
      await updateDoc(bookRef, updateData);
    }
    if (selectedBook && selectedBook.id === bookId) {
      setSelectedBook(prev => ({ ...prev, ...updateData }));
    }
  };

  return (
    <div>
      {/* Demo Mode Notice */}
      {isDemoMode && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 42, 122, 0.1) 0%, rgba(255, 190, 59, 0.1) 100%)',
          borderBottom: '1px solid rgba(255, 42, 122, 0.18)',
          padding: '0.75rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#f4f4f7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontWeight: '500',
          backdropFilter: 'blur(8px)',
          position: 'relative',
          zIndex: 101
        }}>
          <AlertCircle size={16} style={{ color: 'var(--primary)' }} />
          <span>Estás en <strong>Modo Demo</strong>. Configura Firebase en <code>.env</code> para sincronizar en la nube. Lee la <a href="file:///Users/dous/.gemini/antigravity/brain/437e6910-277f-4c84-8790-e40dcf39dbd6/gcp_setup_instructions.md" style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: '600' }}>Guía de Configuración</a>.</span>
        </div>
      )}

      {/* Main Navbar */}
      <header className="header-wrapper">
        <div className="header-content">
          <a href="#" className="logo" style={{ transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
            <FlamingoIcon size={28} />
            <span>Flamingo<span style={{ fontWeight: '300', opacity: 0.8 }}>Reviews</span></span>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => setIsStatsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={15} style={{ color: 'var(--primary)' }} /> Estadísticas
            </button>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sage)', display: 'inline-block', boxShadow: '0 0 8px var(--sage)' }}></span>
                  Admin Activo
                </span>
                <button className="btn btn-secondary" onClick={() => setIsGeneralVoiceOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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

      {/* Hero Intro */}
      <section style={{
        padding: '6rem 1.5rem 4rem 1.5rem',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h1 className="hero-title">
            Flamingo Library
          </h1>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.25rem',
            fontStyle: 'italic',
            color: 'var(--text-muted)',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: '1.6'
          }}>
            Reseñas literarias del club, citas memorables, y transcripciones automatizadas con análisis inteligente de nuestras tertulias.
          </p>
        </div>
      </section>

      {/* Main Shelves */}
      <main className="container" style={{ paddingTop: '0.5rem' }}>
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
            {/* Genre filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                className="form-select"
                style={{ fontSize: '0.85rem' }}
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
              >
                <option value="">Todos los géneros</option>
                {genres.filter(g => g !== 'All').map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
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

            {/* Sort options */}
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
            {filteredAndSortedBooks.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => setSelectedBook(book)}
                onEdit={startEdit}
                isAdmin={!!user}
              />
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '5rem 2rem',
            background: 'rgba(255, 255, 255, 0.01)',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
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
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(7, 7, 9, 0.6)',
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
          onSaveSuccess={handleSaveSuccess}
          isDemoMode={isDemoMode}
          books={books}
          setBooks={setBooks}
          onDeleteBook={handleDeleteBook}
        />
      )}

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onEdit={(book) => {
            setSelectedBook(null); // close details
            startEdit(book); // open edit panel
          }}
          isAdmin={!!user}
        />
      )}

      {isGeneralVoiceOpen && (
        <VoiceAssistant
          isOpen={isGeneralVoiceOpen}
          onClose={() => setIsGeneralVoiceOpen(false)}
          isDemoMode={isDemoMode}
          books={books}
          onApplyNotesToBook={handleApplyNotesToBook}
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
