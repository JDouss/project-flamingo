import { useState } from 'react';
import { X, BookMarked, Lock } from 'lucide-react';
import ReadForm from './ReadForm';
import ReadList from './ReadList';
import PersonalStats from './PersonalStats';
import PersonalReadDetails from './PersonalReadDetails';
import { usePersonalReads } from '../../data/usePersonalReads';

// Mi Biblioteca: where personal reads are added and managed. Browsing them
// happens on the main shelf (they merge in with the club catalog when the
// toggle is on); this modal owns the editing side of that.
export default function PersonalLibrary({ isOpen, onClose, ownerEmail, initialEditRead }) {
  const [activeTab, setActiveTab] = useState(initialEditRead ? 'new' : 'list');
  const [editingRead, setEditingRead] = useState(initialEditRead || null);
  const [detailRead, setDetailRead] = useState(null);
  const { reads, loading, error } = usePersonalReads(isOpen ? ownerEmail : null);

  if (!isOpen) return null;

  // The list is live, so the open detail modal follows edits and pipeline
  // progress instead of showing the snapshot it was opened with.
  const liveDetailRead = detailRead ? reads.find((r) => r.id === detailRead.id) || null : null;

  const startEdit = (read) => {
    setDetailRead(null);
    setEditingRead(read);
    setActiveTab('new');
  };

  const leaveForm = () => {
    setEditingRead(null);
    setActiveTab('list');
  };

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookMarked size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>Mi Biblioteca</h3>
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
            onClick={leaveForm}
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
              onSaved={leaveForm}
              onCancel={leaveForm}
            />
          ) : activeTab === 'list' ? (
            <ReadList
              reads={reads}
              loading={loading}
              onOpen={setDetailRead}
              onEdit={startEdit}
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

      {liveDetailRead && (
        <PersonalReadDetails
          read={liveDetailRead}
          onClose={() => setDetailRead(null)}
          onEdit={startEdit}
        />
      )}
    </>
  );
}
