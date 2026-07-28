import { useState } from 'react';
import { X, BookMarked, Lock } from 'lucide-react';
import ReadForm from './ReadForm';
import ReadList from './ReadList';
import PersonalStats from './PersonalStats';
import { usePersonalReads } from '../../data/usePersonalReads';
import { savePersonalRead } from '../../data/mutations';

// Diario de lectura personal: private to the signed-in owner. Everything here
// reads and writes `personal_reads`, which the Firestore rules scope to the
// owner's email — the public catalog never sees these books.
export default function PersonalLibrary({ isOpen, onClose, ownerEmail }) {
  const [activeTab, setActiveTab] = useState('new'); // new | list | stats
  const [editingRead, setEditingRead] = useState(null);
  const { reads, loading, error } = usePersonalReads(isOpen ? ownerEmail : null);

  if (!isOpen) return null;

  const handleSaved = () => {
    setEditingRead(null);
    setActiveTab('list');
  };

  const startEdit = (read) => {
    setEditingRead(read);
    setActiveTab('new');
  };

  // The voice note may name a grade out loud; applying it is always an
  // explicit choice, never an automatic overwrite.
  const applySuggestedRating = async (read, rating) => {
    try {
      await savePersonalRead(read.id, { rating, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Could not apply suggested rating:', err);
    }
  };

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookMarked size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>
              Mi diario de lectura
            </h3>
            <span
              title="Sólo tú puedes ver esto"
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

        <div className="voice-tabs">
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            {editingRead ? 'Editando lectura' : 'Nueva lectura'}
          </button>
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => {
              setEditingRead(null);
              setActiveTab('list');
            }}
          >
            Mis lecturas {reads.length > 0 && `(${reads.length})`}
          </button>
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => {
              setEditingRead(null);
              setActiveTab('stats');
            }}
          >
            Estadísticas
          </button>
        </div>

        <div className="voice-assistant-body">
          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              No se pudieron cargar tus lecturas. {error.message}
            </div>
          )}

          {activeTab === 'new' ? (
            <ReadForm
              key={editingRead ? editingRead.id : 'new'}
              ownerEmail={ownerEmail}
              editRead={editingRead}
              onSaved={handleSaved}
              onCancel={() => {
                setEditingRead(null);
                setActiveTab('list');
              }}
            />
          ) : activeTab === 'list' ? (
            <ReadList
              reads={reads}
              loading={loading}
              onEdit={startEdit}
              onApplySuggestedRating={applySuggestedRating}
            />
          ) : (
            <PersonalStats reads={reads} />
          )}
        </div>

        <div className="voice-assistant-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
