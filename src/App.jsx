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
  Volume2
} from 'lucide-react';

import BookCard from './components/BookCard';
import BookDetails from './components/BookDetails';
import AdminPanel from './components/AdminPanel';
import LoginModal from './components/LoginModal';
import FlamingoIcon from './components/FlamingoIcon';
import VoiceAssistant from './components/VoiceAssistant';

// High-quality mock books for Demo Mode
const MOCK_BOOKS = [
  {
    id: 'mock-1',
    title: 'La sombra del viento',
    author: 'Carlos Ruiz Zafón',
    genre: 'Ficción',
    rating: 5,
    status: 'completed',
    startDate: '2026-04-01',
    endDate: '2026-04-12',
    summary: 'Un asombroso misterio literario sobre un niño que descubre un libro olvidado en el Cementerio de los Libros Olvidados, lo que desencadena una oscura y peligrosa búsqueda en la Barcelona de la posguerra.',
    review: 'Este libro es una carta de amor a la literatura. La prosa de Zafón es increíblemente atmosférica, convirtiendo a Barcelona en un país de las maravillas gótico lleno de sombras, lluvia y secretos. El personaje de Fermín Romero de Torres es uno de los compañeros más entrañables de toda la literatura, aportando ingenio y calidez a una historia que a menudo se adentra en profundidades trágicas. El misterio en sí está bellamente estructurado, manteniéndote en vilo mientras revela gradualmente las tragedias paralelas de dos autores. Una obra maestra que releeré por el resto de mi vida.',
    imageUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600',
    quotes: [
      { text: 'Los libros son espejos: solo se ve en ellos lo que uno ya lleva dentro.', page: 'Página 190', context: 'Daniel hablando con Julián Carax' },
      { text: 'Cada libro, cada tomo que ves, tiene alma. El alma de quien lo escribió y de quienes lo leyeron y vivieron y soñaron con él.', page: 'Página 5', context: 'El padre de Daniel presentándole el Cementerio' }
    ],
    references: [
      { title: 'Resumen de la saga El Cementerio de los Libros Olvidados', url: 'https://www.goodreads.com/series/62657-el-cementerio-de-los-libros-olvidados' }
    ],
    privateNotes: 'Es necesario escribir una sección que compare a Julián Carax con los autores reales de la posguerra. Revisar las entrevistas de Zafón sobre las influencias góticas de Barcelona.',
    createdAt: '2026-04-12T20:00:00.000Z'
  },
  {
    id: 'mock-2',
    title: 'Hábitos atómicos',
    author: 'James Clear',
    genre: 'Autoayuda',
    rating: 4,
    status: 'completed',
    startDate: '2026-05-01',
    endDate: '2026-05-10',
    summary: 'Una guía sumamente práctica sobre cómo crear buenos hábitos, romper los malos y dominar los pequeños comportamientos que conducen a resultados extraordinarios.',
    review: 'A diferencia de muchos libros de autoayuda llenos de generalidades, Hábitos atómicos está repleto de pautas prácticas y aplicables. Clear estructura el libro en torno a las Cuatro Leyes del Cambio de Conducta: Hacerlo obvio, Hacerlo atractivo, Hacerlo sencillo y Hacerlo satisfactorio. El concepto de hábitos basados en la identidad —centrarse en quién deseas llegar a ser en lugar de en lo que quieres lograr— resultó especialmente revelador. Una lectura sólida para cualquiera que busque optimizar sus rutinas diarias.',
    imageUrl: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=600',
    quotes: [
      { text: 'No te elevas al nivel de tus metas. Caes al nivel de tus sistemas.', page: 'Página 27', context: 'Sobre metas vs. sistemas' },
      { text: 'Cada acción que realizas es un voto a favor del tipo de persona en la que deseas convertirte.', page: 'Página 38', context: 'Discutiendo hábitos basados en la identidad' }
    ],
    references: [
      { title: 'Boletín de hábitos de James Clear', url: 'https://jamesclear.com/3-2-1' }
    ],
    privateNotes: 'Revisar el bucle de retroalimentación de las señales de los hábitos. Quizás añadir un diagrama que represente el ciclo de Señal-Anhelo-Respuesta-Recompensa.',
    createdAt: '2026-05-10T18:00:00.000Z'
  },
  {
    id: 'mock-3',
    title: 'Proyecto Hail Mary',
    author: 'Andy Weir',
    genre: 'Ciencia ficción',
    rating: 5,
    status: 'reading',
    startDate: '2026-05-15',
    endDate: '',
    summary: 'Un astronauta solitario debe salvar a la Tierra de un evento de extinción masiva, utilizando su ingenio científico y con la ayuda de un sorprendente aliado alienígena.',
    review: 'Actualmente leyendo. Weir regresa al emocionante formato de resolución de problemas científicos de El marciano (The Martian), pero a escala interestelar. La química entre el protagonista, Ryland Grace, y su compañero alienígena es absolutamente estelar (sin juego de palabras). La ciencia es detallada pero accesible, y el ritmo es increíblemente adictivo.',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600',
    quotes: [
      { text: 'Tú eres científico. Yo soy ingeniero. Juntos somos listos.', page: 'Capítulo 15', context: 'Amigo alienígena comunicándose' }
    ],
    references: [
      { title: 'Sitio web oficial de Andy Weir', url: 'https://www.andyweirauthor.com/' }
    ],
    privateNotes: 'Comprobar la fecha de estreno de la próxima adaptación cinematográfica. Preparar una publicación comparativa una vez que se estrene.',
    createdAt: '2026-05-15T09:00:00.000Z'
  }
];

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

  const handleApplyNotesToBook = async (bookId, notesMarkdown) => {
    if (isDemoMode) {
      setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, privateNotes: notesMarkdown } : b));
    } else {
      const bookRef = doc(db, 'books', bookId);
      await updateDoc(bookRef, { privateNotes: notesMarkdown });
    }
    if (selectedBook && selectedBook.id === bookId) {
      setSelectedBook(prev => ({ ...prev, privateNotes: notesMarkdown }));
    }
  };

  return (
    <div>
      {/* Demo Mode Notice */}
      {isDemoMode && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
          padding: '0.75rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          fontWeight: '500'
        }}>
          <AlertCircle size={16} />
          <span>Estás viendo en <strong>Modo de Demostración</strong>. Configura Firebase en un archivo <code>.env</code> para sincronizar con GCP. Lee la <a href="file:///Users/dous/.gemini/antigravity/brain/437e6910-277f-4c84-8790-e40dcf39dbd6/gcp_setup_instructions.md" style={{ color: '#fff', textDecoration: 'underline' }}>Guía de Configuración</a>.</span>
        </div>
      )}

      {/* Main Navbar */}
      <header className="header-wrapper">
        <div className="header-content">
          <a href="#" className="logo">
            <FlamingoIcon size={28} style={{ color: 'var(--primary)' }} />
            <span>Reseñas <span style={{ fontWeight: '300' }}>Flamingo</span></span>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserCheck size={14} className="star-filled" /> Administrador Activo
                </span>
                <button className="btn btn-secondary" onClick={() => setIsGeneralVoiceOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Volume2 size={16} /> Grabaciones y Voz
                </button>
                <button className="btn btn-primary" onClick={startAdd}>
                  <Plus size={16} /> Añadir Reseña
                </button>
                <button className="btn btn-secondary btn-icon" onClick={handleLogout} title="Cerrar Sesión">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setIsLoginOpen(true)}>
                <LogIn size={16} /> Iniciar Sesión de Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Intro */}
      <section style={{
        padding: '5rem 1.5rem 3rem 1.5rem',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 className="hero-title">
            Flamingo Library
          </h1>
        </div>
      </section>

      {/* Main Shelves */}
      <main className="container" style={{ paddingTop: '1rem' }}>
        {/* Controls Card */}
        <div className="glass-card controls-card">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Buscar por título, autor, términos clave..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-group">
            {/* Genre filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                className="form-select"
                style={{ padding: '0.5rem 1.5rem 0.5rem 0.75rem', fontSize: '0.85rem' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                className="form-select"
                style={{ padding: '0.5rem 1.5rem 0.5rem 0.75rem', fontSize: '0.85rem' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <SlidersHorizontal size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                className="form-select"
                style={{ padding: '0.5rem 1.5rem 0.5rem 0.75rem', fontSize: '0.85rem' }}
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
            <p>Recogiendo libros de las estanterías...</p>
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
            background: 'var(--card-bg)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-lg)'
          }}>
            <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', opacity: 0.5 }} />
            <h3 className="serif-title" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No se encontraron reseñas</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
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
        background: 'rgba(4, 6, 13, 0.4)',
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
    </div>
  );
}
