import { useState, useEffect } from 'react';
import {
  X,
  Star,
  Edit2,
  Trash2,
  Sparkles,
  ListChecks,
  Loader2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { noteStatus, isNoteWorking, isNoteStale } from '../../data/usePersonalReads';
import { deletePersonalRead, requestNoteAnalysis, fetchVoiceNoteUrl } from '../../data/mutations';
import { starsFromTen } from './readAdapter';

const STATUS_LABELS = {
  completed: 'Terminado',
  reading: 'Leyendo',
  abandoned: 'Abandonado',
};

const NOTE_WORKING_LABELS = {
  uploading: 'Subiendo la nota de voz',
  queued: 'Nota en cola',
  transcribing: 'Transcribiendo y extrayendo ideas',
};

function formatDate(dateStr) {
  if (!dateStr) return 'N/D';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function InsightList({ icon, title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon} {title}
      </h3>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{ lineHeight: 1.65 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Detail view for one personal read. Deliberately its own modal rather than a
// branch inside BookDetails: a club book is about grades, quotes and the
// session memory, while this is about one person's voice note.
export default function PersonalReadDetails({ read, onClose, onEdit }) {
  // Keyed by the path it was resolved for, so a URL from a previously opened
  // read is never rendered against the current one while the new one loads.
  const [audio, setAudio] = useState({ path: null, url: '' });
  const [showTranscript, setShowTranscript] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const audioPath = read?.voiceNote?.audioPath;
  const audioUrl = audio.path === audioPath ? audio.url : '';

  // Personal audio is private, so the playable URL is fetched on demand
  // instead of being stored on the doc.
  useEffect(() => {
    if (!audioPath) return undefined;

    let cancelled = false;
    fetchVoiceNoteUrl(audioPath)
      .then((url) => {
        if (!cancelled) setAudio({ path: audioPath, url });
      })
      .catch((err) => console.error('Voice note URL failed:', err));
    return () => { cancelled = true; };
  }, [audioPath]);

  if (!read) return null;

  const status = noteStatus(read);
  const working = isNoteWorking(read);
  const stale = isNoteStale(read);
  const insights = read.insights;
  const stars = starsFromTen(read.rating);

  const handleDelete = async () => {
    if (!window.confirm(`¿Borrar "${read.title}" de tu biblioteca? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeleting(true);
    try {
      await deletePersonalRead(read);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
      window.alert('No se pudo borrar la lectura.');
      setDeleting(false);
    }
  };

  return (
    <div className="details-overlay" onClick={onClose}>
      <div className="details-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} title="Cerrar">
          <X size={20} />
        </button>

        <div className="details-hero">
          <div className="book-object">
            {read.coverUrl ? (
              <img src={read.coverUrl} alt={read.title} className="details-cover" />
            ) : (
              <div className="details-cover book-cover-placeholder">
                <BookOpen size={40} />
                <span>{read.title}</span>
              </div>
            )}
          </div>

          <div className="details-header-info">
            <div className="details-tags">
              <span className="tag tag-session">Mi lectura</span>
              {read.genre && (
                <span
                  className="tag"
                  style={{ background: 'var(--primary-glow)', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                >
                  {read.genre}
                </span>
              )}
              <span className="tag">{STATUS_LABELS[read.status] || read.status}</span>
              {read.format && <span className="tag">{read.format}</span>}
            </div>

            <h1 className="details-title">{read.title}</h1>
            {read.author && <p className="details-author">por {read.author}</p>}

            {read.rating != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={20}
                      fill={star <= stars ? 'var(--accent-gold)' : 'none'}
                      color={star <= stars ? 'var(--accent-gold)' : 'rgba(42, 26, 46, 0.15)'}
                      className={star <= stars ? 'star-filled' : ''}
                    />
                  ))}
                </div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  ({Number(read.rating).toFixed(1)} / 10)
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => onEdit(read)}
                className="btn btn-secondary"
                style={{ width: 'fit-content', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                <Edit2 size={14} /> Editar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-secondary"
                style={{ width: 'fit-content', padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--danger)' }}
              >
                <Trash2 size={14} /> Borrar
              </button>
            </div>
          </div>
        </div>

        <div className="details-body">
          <div className="details-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Empecé</span>
              <span className="meta-value">{formatDate(read.startDate)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Terminé</span>
              <span className="meta-value">
                {read.status === 'completed' ? formatDate(read.finishedAt) : STATUS_LABELS[read.status]}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Formato</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>{read.format || 'N/D'}</span>
            </div>
            {read.genre && (
              <div className="meta-item">
                <span className="meta-label">Género</span>
                <span className="meta-value">{read.genre}</span>
              </div>
            )}
            {read.pages != null && read.pages !== '' && (
              <div className="meta-item">
                <span className="meta-label">Páginas</span>
                <span className="meta-value">{read.pages}</span>
              </div>
            )}
            {read.country && (
              <div className="meta-item">
                <span className="meta-label">País de origen</span>
                <span className="meta-value">{read.country}</span>
              </div>
            )}
            {read.publicationYear != null && read.publicationYear !== '' && (
              <div className="meta-item">
                <span className="meta-label">Publicado en</span>
                <span className="meta-value">{read.publicationYear}</span>
              </div>
            )}
            {read.originalLanguage && (
              <div className="meta-item">
                <span className="meta-label">Idioma original</span>
                <span className="meta-value">{read.originalLanguage}</span>
              </div>
            )}
          </div>

          {working && !stale && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--primary)',
                fontSize: '0.9rem',
                margin: '1.5rem 0',
              }}
            >
              <Loader2 size={16} className="voice-spinner" />
              {NOTE_WORKING_LABELS[status] || 'Procesando la nota'}…
            </div>
          )}

          {(status === 'error' || stale) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                fontSize: '0.85rem',
                margin: '1.5rem 0',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: '14rem' }}>
                {stale ? 'La nota lleva demasiado tiempo procesándose.' : read.error || 'La nota de voz falló.'}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                onClick={() => requestNoteAnalysis(read.id)}
              >
                <RefreshCw size={13} /> Reintentar
              </button>
            </div>
          )}

          {insights?.verdict && (
            <p
              className="serif-title"
              style={{
                fontSize: '1.2rem',
                fontStyle: 'italic',
                borderLeft: '3px solid var(--primary)',
                paddingLeft: '1rem',
                lineHeight: 1.6,
                margin: '1.5rem 0',
              }}
            >
              “{insights.verdict}”
            </p>
          )}

          {insights?.summary && (
            <div>
              <h3 className="section-title">En resumen</h3>
              <p style={{ lineHeight: 1.7 }}>{insights.summary}</p>
            </div>
          )}

          <InsightList icon={<Sparkles size={17} className="star-filled" />} title="Ideas clave" items={insights?.keyInsights} />
          <InsightList icon={<ListChecks size={17} className="star-filled" />} title="Lo que me llamó la atención" items={insights?.standouts} />

          {insights?.themes?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              {insights.themes.map((theme) => (
                <span key={theme} className="tag">{theme}</span>
              ))}
            </div>
          )}

          {read.notes && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 className="section-title">Mis notas</h3>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{read.notes}</p>
            </div>
          )}

          {audioUrl && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 className="section-title">La nota de voz</h3>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
            </div>
          )}

          {read.transcript && (
            <details
              style={{ marginTop: '1.5rem' }}
              onToggle={(e) => setShowTranscript(e.currentTarget.open)}
            >
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {showTranscript ? 'Ocultar transcripción' : 'Ver transcripción completa'}
              </summary>
              <p
                style={{
                  marginTop: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  color: 'var(--text-muted)',
                  borderLeft: '3px solid var(--border)',
                  paddingLeft: '1rem',
                }}
              >
                {read.transcript}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
