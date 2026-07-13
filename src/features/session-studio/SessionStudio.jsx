import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import UploadStep from './UploadStep';
import MappingStep from './MappingStep';
import ReviewStep from './ReviewStep';
import SessionHistory from './SessionHistory';
import MembersRegistry from './MembersRegistry';
import { useSession, sessionStatus } from '../../data/useSessions';

// Session Studio: the club-session pipeline UI. Upload a recording and walk
// away — the Cloud Function transcribes and analyzes it; the doc subscription
// brings the draft back for review whenever it's ready.
export default function SessionStudio({ isOpen, onClose, books }) {
  const [activeTab, setActiveTab] = useState('new'); // new | history | members
  const [activeSessionId, setActiveSessionId] = useState(null);
  const { session } = useSession(activeSessionId);

  if (!isOpen) return null;

  const openSessionReview = (sessionId) => {
    setActiveSessionId(sessionId);
    setActiveTab('new');
  };

  const resetPipeline = () => setActiveSessionId(null);

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>Sesiones del Club de Lectura</h3>
          </div>
          <button className="voice-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="voice-tabs">
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            Nueva sesión
          </button>
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historial de sesiones
          </button>
          <button
            type="button"
            className={`voice-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Miembros del Club
          </button>
        </div>

        {/* Body */}
        <div className="voice-assistant-body">
          {activeTab === 'new' ? (
            session && sessionStatus(session) === 'draft' ? (
              <ReviewStep
                session={session}
                books={books}
                onPublished={() => {
                  resetPipeline();
                  onClose();
                }}
                onDiscard={resetPipeline}
              />
            ) : session && sessionStatus(session) === 'needs_mapping' ? (
              <MappingStep session={session} />
            ) : (
              <UploadStep
                session={session}
                onSessionStarted={setActiveSessionId}
                onReset={resetPipeline}
              />
            )
          ) : activeTab === 'history' ? (
            <SessionHistory books={books} onOpenSession={openSessionReview} />
          ) : (
            <MembersRegistry />
          )}
        </div>

        {/* Footer */}
        <div className="voice-assistant-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
