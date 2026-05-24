import React, { useState } from 'react';
import { X, Star, Calendar, ChevronLeft, ChevronRight, Quote, Link, Edit2 } from 'lucide-react';
import { renderMarkdown } from '../utils/markdown';

export default function BookDetails({ book, onClose, onEdit, isAdmin }) {
  const [activeQuoteIdx, setActiveQuoteIdx] = useState(0);

  if (!book) return null;

  const { title, author, genre, rating, status, startDate, endDate, summary, review, imageUrl, quotes, references, privateNotes } = book;

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/D';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Carousel handlers
  const handlePrevQuote = () => {
    setActiveQuoteIdx((prev) => (prev === 0 ? quotes.length - 1 : prev - 1));
  };

  const handleNextQuote = () => {
    setActiveQuoteIdx((prev) => (prev === quotes.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} title="Cerrar">
          <X size={20} />
        </button>

        {/* Hero Section */}
        <div className="details-hero">
          <img src={imageUrl} alt={title} className="details-cover" />
          <div className="details-header-info">
            <div className="details-tags">
              <span className="tag" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                {genre}
              </span>
              <span className="tag">
                {status === 'completed' ? 'Leído' : status === 'reading' ? 'Leyendo' : 'Por leer'}
              </span>
            </div>
            
            <h1 className="details-title">{title}</h1>
            <p className="details-author">por {author}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={20}
                    fill={star <= rating ? 'var(--primary)' : 'none'}
                    color={star <= rating ? 'var(--primary)' : 'var(--text-muted)'}
                    className={star <= rating ? 'star-filled' : ''}
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>({rating} / 5)</span>
            </div>

            {isAdmin && (
              <button
                onClick={() => onEdit(book)}
                className="btn btn-secondary"
                style={{ width: 'fit-content', padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '0.5rem' }}
              >
                <Edit2 size={14} /> Editar Reseña
              </button>
            )}
          </div>
        </div>

        {/* Details Body */}
        <div className="details-body">
          {/* Metadata Grid */}
          <div className="details-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Comenzó a leer</span>
              <span className="meta-value">{formatDate(startDate)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Terminó de leer</span>
              <span className="meta-value">{status === 'completed' ? formatDate(endDate) : 'En progreso'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Formato</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>Libro</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Género</span>
              <span className="meta-value">{genre}</span>
            </div>
          </div>

          {/* Quick Summary */}
          {summary && (
            <div>
              <h3 className="section-title">Sinopsis</h3>
              <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '1.05rem', borderLeft: '3px solid rgba(255,255,255,0.1)', paddingLeft: '1rem', lineHeight: '1.7' }}>
                "{summary}"
              </p>
            </div>
          )}

          {/* Full Review */}
          {review && (
            <div>
              <h3 className="section-title">Mi reseña</h3>
              <div className="review-text">{renderMarkdown(review)}</div>
            </div>
          )}

          {/* Quotes Section */}
          {quotes && quotes.length > 0 && (
            <div>
              <h3 className="section-title">
                <Quote size={20} className="star-filled" style={{ transform: 'rotate(180deg)' }} /> Citas memorables
              </h3>
              
              <div className="quotes-carousel">
                <div className="quote-text">
                  “{quotes[activeQuoteIdx].text}”
                </div>
                <div className="quote-author">
                  — {author}
                  {quotes[activeQuoteIdx].page && `, pág. ${quotes[activeQuoteIdx].page}`}
                  {quotes[activeQuoteIdx].context && ` (${quotes[activeQuoteIdx].context})`}
                </div>

                {quotes.length > 1 && (
                  <div className="carousel-nav">
                    <button className="carousel-btn" onClick={handlePrevQuote} title="Cita anterior">
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center', margin: '0 0.5rem' }}>
                      {activeQuoteIdx + 1} de {quotes.length}
                    </span>
                    <button className="carousel-btn" onClick={handleNextQuote} title="Cita siguiente">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* References & Links */}
          {references && references.length > 0 && (
            <div>
              <h3 className="section-title">Referencias y enlaces</h3>
              <div className="references-list">
                {references.map((refItem, idx) => (
                  <div key={idx} className="reference-item">
                    <div style={{ flexGrow: 1 }}>
                      <p style={{ fontWeight: '500', fontSize: '0.95rem' }}>{refItem.title}</p>
                    </div>
                    <a
                      href={refItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reference-link"
                    >
                      Ver enlace <Link size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Private Notes (Admin Only) */}
          {isAdmin && (
            <div style={{
              marginTop: '2.5rem',
              background: 'rgba(214, 130, 134, 0.02)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--primary)'
            }}>
              <h3 className="section-title" style={{ 
                color: 'var(--primary)', 
                marginTop: 0, 
                marginBottom: '0.75rem',
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🔒 Notas preliminares privadas
              </h3>
              {privateNotes ? (
                <div style={{ 
                  color: 'var(--text-primary)', 
                  fontSize: '0.95rem',
                  lineHeight: '1.6' 
                }}>
                  {renderMarkdown(privateNotes)}
                </div>
              ) : (
                <p style={{ 
                  color: 'var(--text-muted)', 
                  fontStyle: 'italic', 
                  fontSize: '0.9rem' 
                }}>
                  Aún no se han añadido notas preliminares privadas para este libro. Haz clic en 'Editar reseña' para añadirlas.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
