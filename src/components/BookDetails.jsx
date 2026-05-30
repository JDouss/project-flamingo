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
                    color={star <= rating ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)'}
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

          {/* Calificaciones de la Sesión */}
          {book.grades && Object.keys({ ...book.grades.start, ...book.grades.end }).length > 0 && (() => {
            const startGrades = book.grades.start || {};
            const endGrades = book.grades.end || {};
            const membersList = Object.keys({ ...startGrades, ...endGrades });
            
            // Filter out empty grades
            const validMembers = membersList.filter(m => startGrades[m] !== undefined || endGrades[m] !== undefined);
            if (validMembers.length === 0) return null;

            // Calculate averages
            const startValues = validMembers.map(m => startGrades[m]).filter(v => typeof v === 'number');
            const endValues = validMembers.map(m => endGrades[m]).filter(v => typeof v === 'number');
            const startAvg = startValues.length ? (startValues.reduce((a, b) => a + b, 0) / startValues.length).toFixed(1) : null;
            const endAvg = endValues.length ? (endValues.reduce((a, b) => a + b, 0) / endValues.length).toFixed(1) : null;
            const delta = (startAvg && endAvg) ? (endAvg - startAvg).toFixed(1) : null;

            return (
              <div style={{ margin: '2.5rem 0', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--primary)', borderRadius: 'var(--radius-lg)' }}>
                <h3 className="section-title" style={{ marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                  <Star size={20} className="star-filled" fill="var(--primary)" /> Calificaciones del Debate (1-10)
                </h3>

                {/* Summary Metrics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>MEDIA INICIAL</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-coral)' }}>{startAvg || 'N/D'}</p>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>MEDIA FINAL</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--sage)' }}>{endAvg || 'N/D'}</p>
                  </div>
                  {delta && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>EVOLUCIÓN</p>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: Number(delta) >= 0 ? 'var(--sage)' : 'var(--accent-coral)' }}>
                        {Number(delta) >= 0 ? `+${delta}` : delta}
                      </p>
                    </div>
                  )}
                </div>

                {/* SVG Visual Chart */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
                  <svg width="100%" height="220" viewBox="0 0 500 220" style={{ display: 'block', margin: '0 auto', minWidth: '450px' }}>
                    {/* Definitions for Gradients */}
                    <defs>
                      <linearGradient id="startGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                      <linearGradient id="endGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>

                    {/* Y-axis gridlines */}
                    {[2, 4, 6, 8, 10].map(val => {
                      const y = 170 - (val * 14);
                      return (
                        <g key={val}>
                          <line x1="45" y1={y} x2="480" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                          <text x="35" y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{val}</text>
                        </g>
                      );
                    })}

                    {/* Bars rendering */}
                    {validMembers.map((m, idx) => {
                      const xBase = 60 + idx * 80;
                      const sVal = startGrades[m];
                      const eVal = endGrades[m];

                      const sHeight = sVal ? sVal * 14 : 0;
                      const eHeight = eVal ? eVal * 14 : 0;

                      const sY = 170 - sHeight;
                      const eY = 170 - eHeight;

                      return (
                        <g key={m}>
                          {/* Starting bar */}
                          {sVal && (
                            <g>
                              <rect
                                x={xBase}
                                y={sY}
                                width="20"
                                height={sHeight}
                                fill="url(#startGrad)"
                                rx="3"
                              />
                              <text x={xBase + 10} y={sY - 4} fill="var(--text-primary)" fontSize="9" textAnchor="middle" fontWeight="bold">
                                {sVal}
                              </text>
                            </g>
                          )}

                          {/* Ending bar */}
                          {eVal && (
                            <g>
                              <rect
                                x={xBase + 24}
                                y={eY}
                                width="20"
                                height={eHeight}
                                fill="url(#endGrad)"
                                rx="3"
                              />
                              <text x={xBase + 34} y={eY - 4} fill="var(--text-primary)" fontSize="9" textAnchor="middle" fontWeight="bold">
                                {eVal}
                              </text>
                            </g>
                          )}

                          {/* Member name */}
                          <text x={xBase + 22} y="188" fill="var(--text-primary)" fontSize="10" fontWeight="bold" textAnchor="middle">
                            {m}
                          </text>
                        </g>
                      );
                    })}

                    {/* Baseline */}
                    <line x1="45" y1="170" x2="480" y2="170" stroke="var(--border)" strokeWidth="1" />
                    
                    {/* Legend */}
                    <g transform="translate(300, 198)">
                      <rect x="0" y="0" width="10" height="10" fill="url(#startGrad)" rx="2" />
                      <text x="15" y="9" fill="var(--text-muted)" fontSize="9">Nota Inicial</text>
                      <rect x="75" y="0" width="10" height="10" fill="url(#endGrad)" rx="2" />
                      <text x="90" y="9" fill="var(--text-muted)" fontSize="9">Nota Final</text>
                    </g>
                  </svg>
                </div>

                {/* Table Breakdown */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem' }}>Miembro</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Nota Inicial</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Nota Final</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validMembers.map(m => {
                        const sVal = startGrades[m];
                        const eVal = endGrades[m];
                        const diff = (sVal !== undefined && eVal !== undefined) ? (eVal - sVal) : null;
                        return (
                          <tr key={m} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{m}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#fb923c' }}>{sVal !== undefined ? sVal : '—'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#34d399' }}>{eVal !== undefined ? eVal : '—'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: diff > 0 ? '#34d399' : diff < 0 ? '#fb7185' : 'var(--text-muted)' }}>
                              {diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

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
