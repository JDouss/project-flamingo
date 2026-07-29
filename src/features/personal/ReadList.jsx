import { useState } from 'react';
import {
  Star,
  PenLine,
  Loader2,
  AlertTriangle,
  Search,
  Headphones,
  BookOpen,
  Clock,
} from 'lucide-react';
import { noteStatus, isNoteWorking, isNoteStale } from '../../data/usePersonalReads';
import { starsFromTen } from './readAdapter';

const STATUS_LABELS = {
  completed: 'Terminado',
  reading: 'Leyendo',
  abandoned: 'Abandonado',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Compact management row. The full read — insights, transcript, audio — lives
// in PersonalReadDetails, the same modal the shelf opens, so there is one
// detail view rather than two that drift apart.
function ReadRow({ read, onOpen, onEdit }) {
  const status = noteStatus(read);
  const working = isNoteWorking(read);
  const stale = isNoteStale(read);
  const stars = starsFromTen(read.rating);

  return (
    <div
      className="glass-card"
      style={{ display: 'flex', gap: '1rem', padding: '0.9rem 1rem', alignItems: 'center', cursor: 'pointer' }}
      onClick={() => onOpen(read)}
    >
      <div style={{ width: '48px', height: '68px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden' }}>
        {read.coverUrl ? (
          <img
            src={read.coverUrl}
            alt={read.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <BookOpen size={18} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 className="serif-title" style={{ fontSize: '1.02rem', margin: 0 }}>{read.title}</h4>
        {read.author && (
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            por {read.author}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginTop: '0.3rem',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>{STATUS_LABELS[read.status] || read.status}</span>
          {read.genre && <span>· {read.genre}</span>}
          {read.finishedAt && <span>· {formatDate(read.finishedAt)}</span>}
          {read.voiceNote && !working && status !== 'error' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
              · <Headphones size={11} /> nota
            </span>
          )}
          {working && !stale && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}>
              · <Loader2 size={11} className="voice-spinner" /> procesando
            </span>
          )}
          {(status === 'error' || stale) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--danger)' }}>
              · {stale ? <Clock size={11} /> : <AlertTriangle size={11} />} nota fallida
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {read.rating != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <strong style={{ color: 'var(--primary)' }}>{Number(read.rating).toFixed(1)}</strong>
            <Star size={13} fill="var(--accent-gold)" color="var(--accent-gold)" />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({stars}/5)</span>
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          style={{ width: '2rem', height: '2rem' }}
          title="Editar"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(read);
          }}
        >
          <PenLine size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ReadList({ reads, loading, onOpen, onEdit }) {
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
          Tu biblioteca está vacía
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          Añade el primer libro que hayas leído por tu cuenta desde la pestaña «Nueva lectura».
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
          <ReadRow key={read.id} read={read} onOpen={onOpen} onEdit={onEdit} />
        ))
      )}
    </div>
  );
}
