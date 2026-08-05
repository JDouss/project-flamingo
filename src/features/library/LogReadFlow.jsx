import { X, BookMarked, Lock } from 'lucide-react';
import ReadForm from '../personal/ReadForm';

// Logging (or editing) a read: the form, the cover picker and the voice-note
// recorder. A modal *within* /biblioteca — the library page owns the data, so
// this only ever edits what that page already has.
export default function LogReadFlow({ ownerEmail, editRead, onClose }) {
  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookMarked size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>
              {editRead ? 'Editando lectura' : 'Nueva lectura'}
            </h3>
            <span
              title="Sólo tú puedes ver estas lecturas"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: '20px',
                padding: '0.15rem 0.5rem',
              }}
            >
              <Lock size={11} /> Privado
            </span>
          </div>
          <button className="voice-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="voice-assistant-body">
          <ReadForm
            key={editRead ? editRead.id : 'new'}
            ownerEmail={ownerEmail}
            editRead={editRead}
            onSaved={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </>
  );
}
