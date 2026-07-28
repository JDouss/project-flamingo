import { useState } from 'react';
import {
  Star,
  Trash2,
  PenLine,
  Sparkles,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  Headphones,
  ListChecks,
  Clock,
} from 'lucide-react';
import { noteStatus, isNoteWorking, isNoteStale } from '../../data/usePersonalReads';
import { deletePersonalRead, requestNoteAnalysis, fetchVoiceNoteUrl } from '../../data/mutations';

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
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function InsightList({ icon, title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: '1rem' }}>
      <h5
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
          marginBottom: '0.5rem',
        }}
      >
        {icon} {title}
      </h5>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadCard({ read, onEdit, onApplySuggestedRating }) {
  const [expanded, setExpanded] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const status = noteStatus(read);
  const working = isNoteWorking(read);
  const stale = isNoteStale(read);
  const insights = read.insights;

  const handleDelete = async () => {
    if (!window.confirm(`¿Borrar "${read.title}" de tu diario? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeleting(true);
    try {
      await deletePersonalRead(read);
    } catch (err) {
      console.error('Delete failed:', err);
      window.alert('No se pudo borrar la lectura.');
      setDeleting(false);
    }
  };

  // The audio itself is private, so its URL is fetched on demand rather than
  // stored on the doc.
  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && read.voiceNote?.audioPath && !audioUrl) {
      try {
        setAudioUrl(await fetchVoiceNoteUrl(read.voiceNote.audioPath));
      } catch (err) {
        console.error('Voice note URL failed:', err);
      }
    }
  };

  return (
    <div
      className="glass-card"
      style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h4 className="serif-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            {read.title}
          </h4>
          {read.author && (
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              por {read.author}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {read.rating != null && (
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
              {Number(read.rating).toFixed(1)}
            </span>
          )}
          <Star size={14} fill="var(--accent-gold)" color="var(--accent-gold)" />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <span className="tag" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
          {STATUS_LABELS[read.status] || read.status}
        </span>
        {read.genre && (
          <span className="tag" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
            {read.genre}
          </span>
        )}
        {read.format && <span>{read.format}</span>}
        {read.finishedAt && <span>· {formatDate(read.finishedAt)}</span>}
      </div>

      {/* Voice-note pipeline state */}
      {working && !stale && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--primary)',
          }}
        >
          <Loader2 size={14} className="voice-spinner" />
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
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
          }}
        >
          {stale ? <Clock size={14} /> : <AlertTriangle size={14} />}
          <span style={{ flex: 1, minWidth: '12rem' }}>
            {stale
              ? 'La nota lleva demasiado tiempo procesándose.'
              : read.error || 'La nota de voz falló.'}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            onClick={() => requestNoteAnalysis(read.id)}
          >
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )}

      {insights?.summary && !expanded && (
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
          {insights.summary}
        </p>
      )}

      {expanded && (
        <div style={{ marginTop: '0.25rem' }}>
          {insights?.verdict && (
            <p
              className="serif-title"
              style={{ fontSize: '1rem', fontStyle: 'italic', margin: '0 0 0.5rem', color: 'var(--primary-ink)' }}
            >
              “{insights.verdict}”
            </p>
          )}
          {insights?.summary && (
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>{insights.summary}</p>
          )}

          <InsightList
            icon={<Sparkles size={13} />}
            title="Ideas clave"
            items={insights?.keyInsights}
          />
          <InsightList
            icon={<ListChecks size={13} />}
            title="Lo que me llamó la atención"
            items={insights?.standouts}
          />

          {insights?.themes?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {insights.themes.map((theme) => (
                <span key={theme} className="tag" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                  {theme}
                </span>
              ))}
            </div>
          )}

          {insights?.suggestedRating != null && read.rating !== insights.suggestedRating && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '1rem', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
              onClick={() => onApplySuggestedRating(read, insights.suggestedRating)}
            >
              En la nota dijiste {insights.suggestedRating} — usar como nota
            </button>
          )}

          {read.notes && (
            <div style={{ marginTop: '1rem' }}>
              <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Mis notas
              </h5>
              <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', margin: 0 }}>{read.notes}</p>
            </div>
          )}

          {audioUrl && (
            <div style={{ marginTop: '1rem' }}>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
            </div>
          )}

          {read.transcript && (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => setShowTranscript((prev) => !prev)}
              >
                {showTranscript ? 'Ocultar transcripción' : 'Ver transcripción'}
              </button>
              {showTranscript && (
                <p
                  style={{
                    marginTop: '0.6rem',
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    color: 'var(--text-muted)',
                    whiteSpace: 'pre-wrap',
                    borderLeft: '3px solid var(--border)',
                    paddingLeft: '0.75rem',
                  }}
                >
                  {read.transcript}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
          onClick={handleExpand}
        >
          {expanded ? 'Cerrar' : read.voiceNote ? <><Headphones size={13} /> Ver nota</> : 'Ver detalle'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
          onClick={() => onEdit(read)}
        >
          <PenLine size={13} /> Editar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', color: 'var(--danger)' }}
          onClick={handleDelete}
          disabled={deleting}
        >
          <Trash2 size={13} /> Borrar
        </button>
      </div>
    </div>
  );
}

export default function ReadList({ reads, loading, onEdit, onApplySuggestedRating }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = reads.filter((read) => {
    if (statusFilter && read.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (read.title || '').toLowerCase().includes(q) ||
      (read.author || '').toLowerCase().includes(q) ||
      (read.genre || '').toLowerCase().includes(q) ||
      (read.insights?.summary || '').toLowerCase().includes(q) ||
      (read.transcript || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <Loader2 className="voice-spinner" size={24} />
      </div>
    );
  }

  if (reads.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
        <p className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>
          Tu diario está vacío
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          Añade el primer libro que hayas leído por tu cuenta desde la pestaña «Nueva lectura».
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-wrapper" style={{ flex: 1, minWidth: '12rem' }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Buscar en tus lecturas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ fontSize: '0.85rem' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="completed">Terminados</option>
          <option value="reading">Leyendo</option>
          <option value="abandoned">Abandonados</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
          Ninguna lectura coincide con la búsqueda.
        </p>
      ) : (
        filtered.map((read) => (
          <ReadCard
            key={read.id}
            read={read}
            onEdit={onEdit}
            onApplySuggestedRating={onApplySuggestedRating}
          />
        ))
      )}
    </div>
  );
}
