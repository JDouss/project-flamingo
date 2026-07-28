import { useState } from 'react';
import { Save, Star, Loader2, AlertTriangle } from 'lucide-react';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { savePersonalRead, attachVoiceNote } from '../../data/mutations';

const EMPTY = {
  title: '',
  author: '',
  genre: '',
  format: 'papel',
  status: 'completed',
  rating: 7,
  startDate: '',
  finishedAt: '',
  notes: '',
};

// The club rates 1-10 and displays 1-5 stars; keep the same relationship here
// so a personal grade means the same thing as a club grade.
function starsFor(rating) {
  return Math.round(Number(rating) / 2);
}

function initialForm(editRead) {
  if (!editRead) return EMPTY;
  return {
    title: editRead.title || '',
    author: editRead.author || '',
    genre: editRead.genre || '',
    format: editRead.format || 'papel',
    status: editRead.status || 'completed',
    rating: editRead.rating ?? 7,
    startDate: editRead.startDate || '',
    finishedAt: editRead.finishedAt || '',
    notes: editRead.notes || '',
  };
}

// The parent remounts this form (via a `key`) when switching between adding
// and editing, so the initial state below is always the right one — no
// prop-syncing effect needed.
export default function ReadForm({ ownerEmail, editRead, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialForm(editRead));
  const [noteFile, setNoteFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(-1);
  const [error, setError] = useState('');

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('El título es obligatorio.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        ownerEmail,
        title: form.title.trim(),
        author: form.author.trim(),
        genre: form.genre.trim(),
        format: form.format,
        status: form.status,
        rating: form.rating === '' ? null : Number(form.rating),
        startDate: form.startDate,
        finishedAt: form.status === 'completed' ? form.finishedAt : '',
        notes: form.notes.trim(),
        updatedAt: now,
      };

      if (!editRead) {
        payload.createdAt = now;
        payload.noteStatus = 'idle';
        payload.transcript = '';
        payload.insights = null;
        payload.voiceNote = null;
      }

      const readId = await savePersonalRead(editRead ? editRead.id : null, payload);

      if (noteFile) {
        setUploadProgress(0);
        await attachVoiceNote(readId, noteFile, setUploadProgress, editRead?.voiceNote?.audioPath);
      }

      onSaved(readId);
    } catch (err) {
      console.error('Saving personal read failed:', err);
      setError(err.message || 'No se pudo guardar la lectura.');
    } finally {
      setSaving(false);
      setUploadProgress(-1);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Título *</label>
        <input
          type="text"
          className="form-input"
          required
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="ej. Los detectives salvajes"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Autor</label>
          <input
            type="text"
            className="form-input"
            value={form.author}
            onChange={(e) => update('author', e.target.value)}
            placeholder="ej. Roberto Bolaño"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Género</label>
          <input
            type="text"
            className="form-input"
            value={form.genre}
            onChange={(e) => update('genre', e.target.value)}
            placeholder="ej. Novela"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Estado</label>
          <select
            className="form-select"
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="completed">Terminado</option>
            <option value="reading">Leyendo</option>
            <option value="abandoned">Abandonado</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Formato</label>
          <select
            className="form-select"
            value={form.format}
            onChange={(e) => update('format', e.target.value)}
          >
            <option value="papel">Papel</option>
            <option value="ebook">Ebook</option>
            <option value="audiolibro">Audiolibro</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Nota personal: <strong style={{ color: 'var(--primary)' }}>{Number(form.rating).toFixed(1)}</strong> / 10
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={form.rating}
            onChange={(e) => update('rating', e.target.value)}
            style={{ flex: 1, accentColor: 'var(--primary)' }}
          />
          <div className="rating-stars" style={{ flexShrink: 0 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={16}
                fill={star <= starsFor(form.rating) ? 'var(--accent-gold)' : 'none'}
                color={star <= starsFor(form.rating) ? 'var(--accent-gold)' : 'rgba(42, 26, 46, 0.15)'}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Empecé</label>
          <input
            type="date"
            className="form-input"
            value={form.startDate}
            onChange={(e) => update('startDate', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Terminé</label>
          <input
            type="date"
            className="form-input"
            value={form.finishedAt}
            onChange={(e) => update('finishedAt', e.target.value)}
            disabled={form.status !== 'completed'}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notas escritas</label>
        <textarea
          className="form-input"
          style={{ minHeight: '80px' }}
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Lo que quieras dejar por escrito (opcional)"
        />
      </div>

      <VoiceNoteRecorder
        file={noteFile}
        onFileReady={setNoteFile}
        onClear={() => setNoteFile(null)}
        disabled={saving}
      />

      {uploadProgress >= 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '0.25rem',
            }}
          >
            <span>Subiendo nota de voz…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '4px',
              background: 'rgba(42,26,46,0.08)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'var(--primary)',
                transition: 'width 0.1s',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        {editRead && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: '150px' }}>
          {saving ? (
            <Loader2 size={16} className="voice-spinner" />
          ) : (
            <>
              <Save size={16} /> {editRead ? 'Guardar cambios' : 'Guardar lectura'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
