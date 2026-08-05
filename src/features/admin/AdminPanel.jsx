import { useState, useEffect } from 'react';
import { X, Plus, Trash2, UploadCloud, BookOpen, Save, Link, Quote, Star, Sparkles, Maximize2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { renderMarkdown } from '../../utils/markdown';
import { useRoster } from '../../data/useClub';
import { useSessionList } from '../../data/useSessions';
import { saveBook, deleteBook, uploadCover, linkSessionToBook } from '../../data/mutations';

export default function AdminPanel({ isOpen, onClose, clubId, editBook, books }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [suggestedBy, setSuggestedBy] = useState('');
  // Optional bibliographic data. Empty is always valid: never block saving a
  // review because a page count is unknown.
  const [pages, setPages] = useState('');
  const [country, setCountry] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState('');
  const [rating, setRating] = useState(5);
  const [status, setStatus] = useState('completed');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [summary, setSummary] = useState('');
  const [review, setReview] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [transcriptionId, setTranscriptionId] = useState(null);
  
  // Image upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(-1);
  const [dragging, setDragging] = useState(false);

  // Quotes and References states
  const [quotes, setQuotes] = useState([{ text: '', page: '', context: '' }]);
  const [references, setReferences] = useState([{ title: '', url: '' }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fullscreen editor state
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);
  const [fullscreenReviewText, setFullscreenReviewText] = useState('');

  const [showDraftSelector, setShowDraftSelector] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [selectedAttendeeName, setSelectedAttendeeName] = useState('');

  // Member grades states
  const [grades, setGrades] = useState({ start: {}, end: {} });
  const { roster } = useRoster(clubId);
  const {
    sessions: sessionDrafts,
    loading: loadingDrafts,
    refresh: fetchSessionDrafts,
  } = useSessionList(clubId, isOpen);

  const handleImportSessionDraft = () => {
    if (!selectedDraftId) return;
    const session = sessionDrafts.find(d => d.id === selectedDraftId || d.createdAt === selectedDraftId);
    if (!session) return;
    
    // Pipeline sessions carry their result under `analysis`; older formats
    // stored fields at the top level or under `result`.
    const analysis = session.analysis || session.result || session;
    const isNewFormat = !!analysis.sessionSummaryMarkdown;

    if (isNewFormat) {
      setPrivateNotes(analysis.sessionSummaryMarkdown || '');
      setSummary(analysis.generalSummary || '');
      setTranscriptionId(session.id || null);

      if (session.bookId && session.bookId !== 'new_book') {
        const matchingBook = books.find(b => b.id === session.bookId);
        if (matchingBook) {
          setTitle(matchingBook.title || '');
          setAuthor(matchingBook.author || '');
          setGenre(matchingBook.genre || '');
        }
      } else {
        if (analysis.bookTitle) setTitle(analysis.bookTitle);
        if (analysis.bookAuthor) setAuthor(analysis.bookAuthor);
        if (analysis.bookGenre || analysis.genre) setGenre(analysis.bookGenre || analysis.genre);
      }

      if (analysis.grades || session.grades) {
        setGrades(analysis.grades || session.grades);
      }

      alert("Borrador de sesión cargado con éxito. Se ha importado el resumen de la sesión y las calificaciones.");
      setShowDraftSelector(false);
      setSelectedDraftId('');
      setSelectedAttendeeName('');
    } else {
      // Old format fallback
      const attendees = session.speakers || session.attendees || [];
      const attendee = attendees.find(a => a.name === selectedAttendeeName || a.id === selectedAttendeeName);
      
      if (attendee) {
        setPrivateNotes(attendee.notesMarkdown || '');
        setSummary(attendee.summary || session.generalSummary || '');
        setTranscriptionId(session.id || null);
        
        if (session.bookId && session.bookId !== 'new_book') {
          const matchingBook = books.find(b => b.id === session.bookId);
          if (matchingBook) {
            setTitle(matchingBook.title || '');
            setAuthor(matchingBook.author || '');
            setGenre(matchingBook.genre || '');
          }
        }

        if (session.grades) {
          setGrades(session.grades);
        }
        
        alert(`Borrador de sesión cargado con éxito para ${selectedAttendeeName}. Las notas, resumen y calificaciones han sido actualizados.`);
        setShowDraftSelector(false);
        setSelectedDraftId('');
        setSelectedAttendeeName('');
      } else {
        alert("No se pudo encontrar las notas para el miembro seleccionado en esta sesión.");
      }
    }
  };

  // Load existing book data for editing
  useEffect(() => {
    if (editBook) {
      setTitle(editBook.title || '');
      setAuthor(editBook.author || '');
      setGenre(editBook.genre || '');
      setSessionLabel(editBook.sessionLabel || '');
      setSuggestedBy(editBook.suggestedBy || '');
      setPages(editBook.pages ?? '');
      setCountry(editBook.country || '');
      setPublicationYear(editBook.publicationYear ?? '');
      setOriginalLanguage(editBook.originalLanguage || '');
      setRating(editBook.rating || 5);
      setStatus(editBook.status || 'completed');
      setStartDate(editBook.startDate || '');
      setEndDate(editBook.endDate || '');
      setSummary(editBook.summary || '');
      setReview(editBook.review || '');
      setPrivateNotes(editBook.privateNotes || '');
      setTranscriptionId(editBook.transcriptionId || null);
      setImageUrl(editBook.imageUrl || '');
      setImagePreview(editBook.imageUrl || '');
      setQuotes(editBook.quotes && editBook.quotes.length > 0 ? editBook.quotes : [{ text: '', page: '', context: '' }]);
      setReferences(editBook.references && editBook.references.length > 0 ? editBook.references : [{ title: '', url: '' }]);
      setGrades(editBook.grades || { start: {}, end: {} });
    } else {
      // Reset form
      setTitle('');
      setAuthor('');
      setGenre('');
      setSessionLabel('');
      setSuggestedBy('');
      setPages('');
      setCountry('');
      setPublicationYear('');
      setOriginalLanguage('');
      setRating(5);
      setStatus('completed');
      setStartDate('');
      setEndDate('');
      setSummary('');
      setReview('');
      setPrivateNotes('');
      setTranscriptionId(null);
      setImageFile(null);
      setImagePreview('');
      setImageUrl('');
      setUploadProgress(-1);
      setQuotes([{ text: '', page: '', context: '' }]);
      setReferences([{ title: '', url: '' }]);
      
      const initialGrades = { start: {}, end: {} };
      roster.forEach(m => {
        initialGrades.start[m.name] = '';
        initialGrades.end[m.name] = '';
      });
      setGrades(initialGrades);
    }
    setError('');
  }, [editBook, isOpen, roster]);

  if (!isOpen) return null;

  // File Upload Handlers
  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecciona un archivo de imagen (PNG, JPG, WebP).');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const removeImagePreview = () => {
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
  };

  // Quotes Dynamic Handlers
  const handleQuoteChange = (index, field, value) => {
    const updated = [...quotes];
    updated[index][field] = value;
    setQuotes(updated);
  };

  const addQuote = () => {
    setQuotes([...quotes, { text: '', page: '', context: '' }]);
  };

  const removeQuote = (index) => {
    const updated = quotes.filter((_, i) => i !== index);
    setQuotes(updated.length > 0 ? updated : [{ text: '', page: '', context: '' }]);
  };

  // References Dynamic Handlers
  const handleReferenceChange = (index, field, value) => {
    const updated = [...references];
    updated[index][field] = value;
    setReferences(updated);
  };

  const addReference = () => {
    setReferences([...references, { title: '', url: '' }]);
  };

  const removeReference = (index) => {
    const updated = references.filter((_, i) => i !== index);
    setReferences(updated.length > 0 ? updated : [{ title: '', url: '' }]);
  };

  // Upload Cover to Storage (keeps the existing URL when no new file chosen)
  const uploadImage = async () => {
    if (!imageFile) return imageUrl;
    try {
      return await uploadCover(imageFile, setUploadProgress);
    } catch (err) {
      console.error(err);
      throw new Error('Error al subir la imagen de portada. Verifica las reglas de seguridad de almacenamiento.');
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      // 1. Upload Cover Image if a new file is chosen
      const finalImageUrl = await uploadImage();
      if (!finalImageUrl) {
        throw new Error('Por favor, sube una imagen de portada o proporciona una URL de la imagen.');
      }

      // Filter empty quotes or references
      const cleanedQuotes = quotes.filter(q => q.text.trim() !== '');
      const cleanedReferences = references.filter(r => r.title.trim() !== '' && r.url.trim() !== '');

      const bookData = {
        title: title.trim(),
        author: author.trim(),
        genre: genre.trim(),
        sessionLabel: sessionLabel.trim() || null,
        suggestedBy: suggestedBy.trim() || null,
        pages: pages === '' ? null : Number(pages),
        country: country.trim() || null,
        publicationYear: publicationYear === '' ? null : Number(publicationYear),
        originalLanguage: originalLanguage.trim() || null,
        rating: Number(rating),
        status,
        startDate,
        endDate,
        summary: summary.trim(),
        review: review.trim(),
        privateNotes: privateNotes.trim(),
        transcriptionId: transcriptionId || null,
        imageUrl: finalImageUrl,
        quotes: cleanedQuotes,
        references: cleanedReferences,
        grades,
        updatedAt: new Date().toISOString()
      };

      if (!editBook) {
        bookData.createdAt = new Date().toISOString();
      }
      const savedBookId = await saveBook(clubId, editBook ? editBook.id : null, bookData);

      // Bidirectional reference update
      if (transcriptionId && savedBookId) {
        try {
          await linkSessionToBook(clubId, transcriptionId, savedBookId);
        } catch (e) {
          console.warn('Failed to link session to book:', e);
        }
      }

      // Confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#fec313', '#ff1a75', '#00f0ff', '#00f5a0']
      });

      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ocurrió un error al guardar la reseña.');
    } finally {
      setSaving(false);
      setUploadProgress(-1);
    }
  };

  const handleDelete = async () => {
    if (!editBook) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas borrar la reseña de "${title}"? Esta acción no se puede deshacer.`);
    if (confirmDelete) {
      setSaving(true);
      setError('');
      try {
        await deleteBook(clubId, editBook.id);
        onClose();
      } catch (err) {
        console.error(err);
        setError(err.message || 'Ocurrió un error al borrar la reseña.');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <>
      <div className="admin-drawer-overlay" onClick={onClose}></div>
      <div className="admin-drawer">
        <div className="admin-header">
          <h2 className="serif-title" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={22} className="star-filled" />
            {editBook ? 'Editar reseña de libro' : 'Añadir nueva reseña de libro'}
          </h2>
          <button className="close-btn" style={{ position: 'static' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="admin-body">
          {error && (
            <div style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              color: 'var(--danger)',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} id="admin-book-form">
            {/* Session Draft Loading Section */}
            <div style={{
              background: 'rgba(255, 42, 122, 0.04)',
              border: '1px solid rgba(255, 42, 122, 0.15)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    Cargar reseña desde Sesión del Club
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto' }}
                  onClick={() => {
                    setShowDraftSelector(!showDraftSelector);
                    if (!showDraftSelector) {
                      fetchSessionDrafts();
                    }
                  }}
                >
                  {showDraftSelector ? 'Ocultar' : 'Cargar desde Sesión'}
                </button>
              </div>

              {showDraftSelector && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {loadingDrafts ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cargando sesiones pasadas...</p>
                  ) : sessionDrafts.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No se encontraron sesiones previas en el historial.</p>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Seleccionar Sesión de Grabación:</label>
                        <select
                          className="form-select"
                          value={selectedDraftId}
                          onChange={(e) => {
                            setSelectedDraftId(e.target.value);
                            setSelectedAttendeeName('');
                          }}
                          style={{ width: '100%', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                        >
                          <option value="">-- Seleccionar sesión --</option>
                          {sessionDrafts.map((d) => (
                            <option key={d.id || d.createdAt} value={d.id || d.createdAt}>
                              {d.audioName} ({new Date(d.createdAt).toLocaleDateString('es-ES')})
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedDraftId && (() => {
                        const session = sessionDrafts.find(d => d.id === selectedDraftId || d.createdAt === selectedDraftId);
                        const sessionAnalysis = session ? (session.analysis || session.result || session) : null;
                        const isNewFormat = !!sessionAnalysis?.sessionSummaryMarkdown;
                        
                        if (isNewFormat) {
                          return (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255, 42, 122, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 42, 122, 0.15)' }}>
                              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                                ✨ <strong>Sesión con resumen compartido detectada.</strong> Se importará la memoria completa del debate, calificaciones y metadatos deducidos del libro.
                              </p>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleImportSessionDraft}
                                style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                              >
                                <Sparkles size={14} /> Cargar Datos en Formulario
                              </button>
                            </div>
                          );
                        } else {
                          return (
                            <>
                              <div className="form-group">
                                <label className="form-label" style={{ fontSize: '0.8rem' }}>¿Quién eres tú en esta sesión? (Formato antiguo)</label>
                                <select
                                  className="form-select"
                                  value={selectedAttendeeName}
                                  onChange={(e) => setSelectedAttendeeName(e.target.value)}
                                  style={{ width: '100%', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                                >
                                  <option value="">-- Seleccionar participante --</option>
                                  {session && (session.speakers || session.attendees || []).map((a) => (
                                    <option key={a.name || a.id} value={a.name || a.id}>
                                      {a.name || a.id}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {selectedAttendeeName && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={handleImportSessionDraft}
                                  style={{ width: '100%', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                                >
                                  <Sparkles size={14} /> Cargar Datos en Formulario
                                </button>
                              )}
                            </>
                          );
                        }
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Título del libro *</label>
              <input
                type="text"
                className="form-input"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej. El Hobbit"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Autor *</label>
              <input
                type="text"
                className="form-input"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="ej. J.R.R. Tolkien"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Género *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="ej. Fantasía, Ciencia Ficción"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Calificación *</label>
                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        size={24}
                        fill={star <= rating ? 'var(--accent-gold)' : 'none'}
                        color={star <= rating ? 'var(--accent-gold)' : 'var(--text-muted)'}
                        className={star <= rating ? 'star-filled' : ''}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sesión del club (orden de lectura)</label>
                <input
                  type="text"
                  className="form-input"
                  value={sessionLabel}
                  onChange={(e) => setSessionLabel(e.target.value)}
                  placeholder="Ej. Sesión 3, Sesión especial Navidad..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Propuesto por</label>
                {/* Free text so a book can credit several miembros ("Almu y Zepe"),
                    with the registry offered as suggestions. */}
                <input
                  type="text"
                  className="form-input"
                  list="suggested-by-options"
                  value={suggestedBy}
                  onChange={(e) => setSuggestedBy(e.target.value)}
                  placeholder="Ej. Almu, Alejandro, Zepe..."
                />
                <datalist id="suggested-by-options">
                  {roster.map((m) => (
                    <option key={m.name} value={m.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Bibliographic data — all optional, shown in the details view
                and aggregated by the dashboards. */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Páginas</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="ej. 320"
                />
              </div>

              <div className="form-group">
                <label className="form-label">País de origen</label>
                <input
                  type="text"
                  className="form-input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="ej. Chile"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Año de publicación</label>
                <input
                  type="number"
                  min="0"
                  max="2100"
                  className="form-input"
                  value={publicationYear}
                  onChange={(e) => setPublicationYear(e.target.value)}
                  placeholder="ej. 1998"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Idioma original</label>
                <input
                  type="text"
                  className="form-input"
                  value={originalLanguage}
                  onChange={(e) => setOriginalLanguage(e.target.value)}
                  placeholder="ej. Español"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Estado de lectura</label>
                <select
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="completed">Leído</option>
                  <option value="reading">Leyendo</option>
                  <option value="to-read">Por leer</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fechas de lectura</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '50%', fontSize: '0.85rem' }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>a</span>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={status !== 'completed'}
                    style={{ width: '50%', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            {/* Book Cover Image Upload */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Imagen de portada del libro *</label>
              
              {!imagePreview ? (
                <div
                  className={`upload-zone ${dragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('cover-file-input').click()}
                >
                  <UploadCloud className="upload-icon" />
                  <p style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                    Arrastra y suelta la portada del libro aquí, o <span style={{ color: 'var(--primary)' }}>busca un archivo</span>
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    PNG, JPG, WebP (se recomienda proporción de 5:7)
                  </p>
                  <input
                    id="cover-file-input"
                    type="file"
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
                  <div className="upload-preview">
                    <img src={imagePreview} alt="Cover preview" />
                    <button
                      type="button"
                      className="remove-preview-btn"
                      onClick={removeImagePreview}
                      title="Eliminar imagen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {imageFile ? (
                      <p>Archivo seleccionado: {imageFile.name}</p>
                    ) : (
                      <p>Usando imagen de portada existente</p>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => document.getElementById('cover-file-input').click()}
                    >
                      Cambiar portada
                    </button>
                    <input
                      id="cover-file-input"
                      type="file"
                      style={{ display: 'none' }}
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}

              {uploadProgress >= 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    <span>Subiendo imagen de portada...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(42,26,46,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.1s' }} />
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Breve sinopsis *</label>
              <textarea
                className="form-input"
                style={{ minHeight: '60px' }}
                required
                maxLength={250}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Escribe una breve sinopsis de 2 o 3 frases..."
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Reseña completa (soporta Markdown)</label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  onClick={() => {
                    setFullscreenReviewText(review);
                    setIsFullscreenEditorOpen(true);
                  }}
                >
                  <Maximize2 size={12} /> Modo Enfoque
                </button>
              </div>
              <textarea
                className="form-textarea"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Comparte tu análisis detallado, opiniones y conclusiones..."
              />
            </div>

            <div className="form-group" style={{ 
              border: '1px dashed var(--primary)', 
              borderRadius: 'var(--radius-md)', 
              padding: '1.25rem', 
              marginTop: '1.5rem', 
              background: 'rgba(214, 130, 134, 0.03)' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ color: 'var(--primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
                  Resumen y Memoria de la Sesión <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>(Público para todos los miembros)</span>
                </label>
              </div>
              <textarea
                className="form-textarea"
                style={{ minHeight: '100px', borderColor: 'var(--border)' }}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                placeholder="Añade el resumen detallado de la sesión, acuerdos principales, opiniones individuales y consensos grupales de los miembros..."
              />
            </div>

            {/* Session Grades Section */}
            <div style={{ margin: '2.5rem 0 2rem 0', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <h3 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={18} className="star-filled" /> Calificaciones de los Miembros (1-10)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Registra las calificaciones individuales dadas por los miembros al inicio y al final de la sesión de debate.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem', fontWeight: 'bold', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                  <span>Miembro</span>
                  <span>Nota Inicial</span>
                  <span>Nota Final</span>
                </div>
                {roster.map(member => {
                  const mName = member.name;
                  return (
                    <div key={mName} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{mName}</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        placeholder="N/D"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={grades.start?.[mName] !== undefined ? grades.start[mName] : ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setGrades(prev => ({
                            ...prev,
                            start: { ...prev.start, [mName]: val }
                          }));
                        }}
                      />
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        placeholder="N/D"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={grades.end?.[mName] !== undefined ? grades.end[mName] : ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setGrades(prev => ({
                            ...prev,
                            end: { ...prev.end, [mName]: val }
                          }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Quotes Section */}
            <div style={{ margin: '2rem 0', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 className="serif-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Quote size={18} className="star-filled" /> Citas memorables
                </h3>
                <button
                  type="button"
                  onClick={addQuote}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  <Plus size={14} /> Añadir cita
                </button>
              </div>

              {quotes.map((quote, index) => (
                <div
                  key={index}
                  style={{
                    background: 'var(--bg-secondary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    marginBottom: '1rem',
                    position: 'relative'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => removeQuote(index)}
                    style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: 'var(--accent-coral)', cursor: 'pointer' }}
                    title="Eliminar cita"
                  >
                    <Trash2 size={16} />
                  </button>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Texto de la cita</label>
                    <textarea
                      className="form-input"
                      style={{ minHeight: '50px', fontSize: '0.9rem' }}
                      value={quote.text}
                      onChange={(e) => handleQuoteChange(index, 'text', e.target.value)}
                      placeholder="Escribe la cita..."
                    />
                  </div>

                  <div className="form-row" style={{ marginTop: '0.5rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Página / Ubicación</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '0.9rem', padding: '0.5rem' }}
                        value={quote.page}
                        onChange={(e) => handleQuoteChange(index, 'page', e.target.value)}
                        placeholder="ej. Página 123"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Contexto</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '0.9rem', padding: '0.5rem' }}
                        value={quote.context}
                        onChange={(e) => handleQuoteChange(index, 'context', e.target.value)}
                        placeholder="ej. Conversando sobre el coraje"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic References Section */}
            <div style={{ margin: '2rem 0 1rem 0', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 className="serif-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Link size={18} className="star-filled" /> Enlaces y referencias
                </h3>
                <button
                  type="button"
                  onClick={addReference}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  <Plus size={14} /> Añadir referencia
                </button>
              </div>

              {references.map((refItem, index) => (
                <div key={index} className="dynamic-row">
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.9rem', padding: '0.5rem', width: '40%' }}
                    value={refItem.title}
                    onChange={(e) => handleReferenceChange(index, 'title', e.target.value)}
                    placeholder="Título (ej. Entrevista al autor)"
                  />
                  <input
                    type="url"
                    className="form-input"
                    style={{ fontSize: '0.9rem', padding: '0.5rem', width: '50%' }}
                    value={refItem.url}
                    onChange={(e) => handleReferenceChange(index, 'url', e.target.value)}
                    placeholder="URL (https://...)"
                  />
                  <button
                    type="button"
                    onClick={() => removeReference(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-coral)', cursor: 'pointer', padding: '0.25rem' }}
                    title="Eliminar referencia"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </form>
        </div>

        <div className="admin-footer">
          {editBook && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={16} /> Borrar reseña
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="admin-book-form"
            className="btn btn-primary"
            disabled={saving}
            style={{ minWidth: '120px' }}
          >
            {saving ? (
              <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderTopColor: '#fff' }} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} /> Guardar reseña
              </span>
            )}
          </button>
        </div>
      </div>

      {isFullscreenEditorOpen && (
        <div className="fullscreen-editor-overlay">
          <div className="fullscreen-editor-container">
            <div className="fullscreen-editor-header">
              <h3 className="serif-title" style={{ fontSize: '1.25rem', margin: 0 }}>Modo Enfoque — Reseña de {title || 'Libro'}</h3>
              <button 
                type="button" 
                className="close-btn" 
                style={{ position: 'static' }} 
                onClick={() => setIsFullscreenEditorOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="fullscreen-editor-body">
              <div className="fullscreen-editor-pane">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>EDITOR (MARKDOWN)</span>
                </div>
                <textarea
                  className="fullscreen-editor-textarea"
                  value={fullscreenReviewText}
                  onChange={(e) => setFullscreenReviewText(e.target.value)}
                  placeholder="Escribe tu reseña en Markdown aquí..."
                  autoFocus
                />
              </div>
              <div className="fullscreen-editor-preview-pane">
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '0.5rem', position: 'sticky', top: 0, background: 'var(--bg-primary)', padding: '0.25rem 0' }}>
                  VISTA PREVIA RENDERIZADA
                </div>
                <div className="review-text" style={{ padding: '0.5rem 0' }}>
                  {renderMarkdown(fullscreenReviewText)}
                </div>
              </div>
            </div>
            <div className="fullscreen-editor-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsFullscreenEditorOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setReview(fullscreenReviewText);
                  setIsFullscreenEditorOpen(false);
                }}
              >
                Aplicar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
