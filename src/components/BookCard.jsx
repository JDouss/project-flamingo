import React from 'react';
import { Star, Edit2, Calendar } from 'lucide-react';

export default function BookCard({ book, onClick, onEdit, isAdmin }) {
  const { title, author, genre, rating, status, summary, imageUrl, endDate } = book;

  // Format status for display
  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'reading': return 'status-reading';
      case 'to-read': return 'status-to-read';
      default: return 'status-to-read';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Leído';
      case 'reading': return 'Leyendo';
      case 'to-read': return 'Por leer';
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
        <img src={imageUrl} alt={title} className="book-cover-img" loading="lazy" />
        <span className={`book-badge ${getStatusClass(status)}`}>
          {getStatusLabel(status)}
        </span>
        
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation(); // prevent opening details
              onEdit(book);
            }}
            className="btn btn-secondary btn-icon"
            style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              width: '2.2rem',
              height: '2.2rem',
              background: 'rgba(7, 10, 19, 0.85)',
              backdropFilter: 'blur(4px)',
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
                fill={star <= rating ? 'var(--primary)' : 'none'}
                color={star <= rating ? 'var(--primary)' : 'var(--text-muted)'}
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
        </div>
      </div>
    </div>
  );
}
