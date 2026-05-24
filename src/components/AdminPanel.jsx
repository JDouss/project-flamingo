import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { X, Plus, Trash2, UploadCloud, BookOpen, Save, Link, Quote, Star, Sparkles, Maximize2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import VoiceAssistant from './VoiceAssistant';
import { renderMarkdown } from '../utils/markdown';

export default function AdminPanel({ isOpen, onClose, editBook, onSaveSuccess, isDemoMode, books, setBooks, onDeleteBook }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [rating, setRating] = useState(5);
  const [status, setStatus] = useState('completed');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [summary, setSummary] = useState('');
  const [review, setReview] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  
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
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);

  // Fullscreen editor state
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);
  const [fullscreenReviewText, setFullscreenReviewText] = useState('');

  const handleApplyVoiceNotes = (notesMarkdown) => {
    setPrivateNotes(notesMarkdown);
  };

  // Load existing book data for editing
  useEffect(() => {
    if (editBook) {
      setTitle(editBook.title || '');
      setAuthor(editBook.author || '');
      setGenre(editBook.genre || '');
      setRating(editBook.rating || 5);
      setStatus(editBook.status || 'completed');
      setStartDate(editBook.startDate || '');
      setEndDate(editBook.endDate || '');
      setSummary(editBook.summary || '');
      setReview(editBook.review || '');
      setPrivateNotes(editBook.privateNotes || '');
      setImageUrl(editBook.imageUrl || '');
      setImagePreview(editBook.imageUrl || '');
      setQuotes(editBook.quotes && editBook.quotes.length > 0 ? editBook.quotes : [{ text: '', page: '', context: '' }]);
      setReferences(editBook.references && editBook.references.length > 0 ? editBook.references : [{ title: '', url: '' }]);
    } else {
      // Reset form
      setTitle('');
      setAuthor('');
      setGenre('');
      setRating(5);
      setStatus('completed');
      setStartDate('');
      setEndDate('');
      setSummary('');
      setReview('');
      setPrivateNotes('');
      setImageFile(null);
      setImagePreview('');
      setImageUrl('');
      setUploadProgress(-1);
      setQuotes([{ text: '', page: '', context: '' }]);
      setReferences([{ title: '', url: '' }]);
    }
    setError('');
  }, [editBook, isOpen]);

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

  // Upload Cover to Storage
  const uploadImage = () => {
    return new Promise((resolve, reject) => {
      if (!imageFile) {
        resolve(imageUrl); // Return existing URL if no new file is chosen
        return;
      }

      if (isDemoMode) {
        resolve(imagePreview); // use local preview in demo mode
        return;
      }

      const storageRef = ref(storage, `covers/${Date.now()}_${imageFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, imageFile);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(progress);
        },
        (err) => {
          console.error(err);
          reject(new Error('Error al subir la imagen de portada. Verifica las reglas de seguridad de almacenamiento.'));
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadUrl);
          } catch (err) {
            reject(err);
          }
        }
      );
    });
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
        rating: Number(rating),
        status,
        startDate,
        endDate,
        summary: summary.trim(),
        review: review.trim(),
        privateNotes: privateNotes.trim(),
        imageUrl: finalImageUrl,
        quotes: cleanedQuotes,
        references: cleanedReferences,
        updatedAt: new Date().toISOString()
      };

      if (editBook) {
        // Edit Mode
        if (isDemoMode) {
          const updatedBooks = books.map(b => b.id === editBook.id ? { ...b, ...bookData, id: editBook.id } : b);
          setBooks(updatedBooks);
        } else {
          const docRef = doc(db, 'books', editBook.id);
          await updateDoc(docRef, bookData);
        }
      } else {
        // Add Mode
        if (isDemoMode) {
          const newBook = {
            ...bookData,
            id: 'mock-' + Date.now(),
            createdAt: new Date().toISOString()
          };
          setBooks([newBook, ...books]);
        } else {
          bookData.createdAt = new Date().toISOString();
          await addDoc(collection(db, 'books'), bookData);
        }
      }

      // Confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#ec4899', '#3b82f6', '#10b981']
      });

      onSaveSuccess();
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
        await onDeleteBook(editBook.id);
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
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              color: '#f87171',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} id="admin-book-form">
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
                        fill={star <= rating ? 'var(--primary)' : 'none'}
                        color={star <= rating ? 'var(--primary)' : 'var(--text-muted)'}
                        className={star <= rating ? 'star-filled' : ''}
                      />
                    </button>
                  ))}
                </div>
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
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
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
                  Notas preliminares privadas <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>(Solo para administrador — no público)</span>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                  onClick={() => setIsVoiceAssistantOpen(true)}
                >
                  <Sparkles size={12} /> Generar desde audio
                </button>
              </div>
              <textarea
                className="form-textarea"
                style={{ minHeight: '100px', borderColor: 'var(--border)' }}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                placeholder="Añade notas preliminares privadas, ideas para desarrollar más tarde o recordatorios personales sobre este libro..."
              />
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
                    background: 'rgba(0,0,0,0.15)',
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
                    style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
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
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.25rem' }}
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
              <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderTopColor: '#000' }} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} /> Guardar reseña
              </span>
            )}
          </button>
        </div>
      </div>

      <VoiceAssistant
        isOpen={isVoiceAssistantOpen}
        onClose={() => setIsVoiceAssistantOpen(false)}
        onApplyNotes={handleApplyVoiceNotes}
        isDemoMode={isDemoMode}
        bookId={editBook?.id || null}
        books={books}
      />

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
