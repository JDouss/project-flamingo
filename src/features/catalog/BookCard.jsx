
import { Star, Edit2, Calendar, User, BookOpen } from 'lucide-react';
import { PERSONAL_SOURCE } from '../personal/readAdapter';

export default function BookCard({ book, onClick, onEdit, isAdmin }) {
  const { title, author, genre, rating, status, summary, imageUrl, endDate, sessionLabel, suggestedBy, source } = book;

  const isPersonal = source === PERSONAL_SOURCE;

  // Format status for display
  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'reading': return 'status-reading';
      case 'to-read': return 'status-to-read';
      // Personal reads can also be given up on.
      case 'abandoned': return 'status-abandoned';
      default: return 'status-to-read';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Leído';
      case 'reading': return 'Leyendo';
      case 'to-read': return 'Por leer';
      case 'abandoned': return 'Abandonado';
      default: return 'Por leer';
    }
  };

  // Format date (e.g., "may. 2026")
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="glass-card book-card" onClick={onClick}>
      <div className="book-cover-container">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="book-cover-img" loading="lazy" />
        ) : (
          // A personal read can be logged in seconds without hunting for a
          // cover; the shelf still needs something with the right shape.
          <div className="book-cover-placeholder">
            <BookOpen size={30} />
            <span>{title}</span>
          </div>
        )}
        <span className={`book-badge ${getStatusClass(status)}`}>
          {getStatusLabel(status)}
        </span>

        {(sessionLabel || isPersonal) && (
          <span className="session-badge">{sessionLabel || 'Mi lectura'}</span>
        )}
        
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation(); // prevent opening details
              onEdit(book);
            }}
            className="btn btn-secondary btn-icon"
            style={{
              position: 'absolute',
              top: '0.75rem',
              left: '0.75rem',
              width: '2.2rem',
              height: '2.2rem',
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              color: 'var(--primary-ink)',
              borderColor: 'var(--border)'
            }}
            title="Editar reseña"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>

      <div className="book-card-info">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <h3 className="book-card-title">{title}</h3>
        </div>
        <p className="book-card-author">por {author}</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.25rem 0' }}>
          <span className="tag" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>{genre}</span>
          
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={14}
                fill={star <= rating ? 'var(--accent-gold)' : 'none'}
                color={star <= rating ? 'var(--accent-gold)' : 'rgba(42, 26, 46, 0.15)'}
                className={star <= rating ? 'star-filled' : ''}
              />
            ))}
          </div>
        </div>

        <p className="book-card-summary">{summary}</p>

        <div className="book-card-meta">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={12} />
            {status === 'completed' && endDate ? `Leído en ${formatDate(endDate)}` : 'En progreso'}
          </span>

          {suggestedBy && (
            <span
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}
              title={`Propuesto por ${suggestedBy}`}
            >
              <User size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Propuesto por {suggestedBy}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
