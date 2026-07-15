import { X, Volume2, Loader2, PenLine, AlertTriangle, Users, Clock } from 'lucide-react';
import { useSessionList, sessionStatus, isSessionStale } from '../../data/useSessions';
import { deleteSession } from '../../data/mutations';

const STATUS_META = {
  uploading: { label: 'Subiendo', color: 'var(--accent-gold)', working: true },
  queued: { label: 'En cola', color: 'var(--accent-gold)', working: true },
  transcribing: { label: 'Transcribiendo', color: 'var(--accent-rock)', working: true },
  needs_grading: { label: 'Esperando asignación de notas', color: 'var(--accent-gold)' },
  analyzing: { label: 'Analizando', color: 'var(--accent-rock)', working: true },
  draft: { label: 'Borrador — pendiente de revisión', color: 'var(--accent-gold)' },
  published: { label: 'Publicada', color: 'var(--sage)' },
  error: { label: 'Error', color: 'var(--accent-coral)' },
};

export default function SessionHistory({ books, onOpenSession }) {
  const { sessions, loading, refresh } = useSessionList(true);

  const handleDelete = async (session) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta sesión del historial?')) return;
    try {
      await deleteSession(session.id);
      refresh();
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert('Error al eliminar la sesión: ' + err.message);
    }
  };

  const bookTitleFor = (session) => {
    if (!session.bookId || session.bookId === 'new_book') return null;
    return books.find((b) => b.id === session.bookId)?.title || null;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
        <Loader2 className="voice-spinner" size={24} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Cargando historial...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <Volume2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '0.75rem' }} />
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No hay sesiones grabadas en el historial.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <h4 className="serif-title" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
        Historial de Sesiones
      </h4>
      <div className="voice-history-list">
        {sessions.map((session) => {
          const status = sessionStatus(session);
          const stale = isSessionStale(session);
          const meta = stale
            ? { label: 'Atascada — necesita reintento', color: 'var(--accent-coral)' }
            : (STATUS_META[status] || STATUS_META.published);
          const linkedBook = bookTitleFor(session);
          const needsAttention = stale || status === 'error' || status === 'needs_grading' || status === 'draft';

          return (
            <div key={session.id} className="voice-history-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>
                    {session.audioName}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    {new Date(session.createdAt).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                    {linkedBook && <> · Libro: <strong>{linkedBook}</strong></>}
                  </p>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.4rem',
                    fontSize: '0.7rem', fontWeight: 'bold', color: meta.color,
                    border: `1px solid ${meta.color}`, borderRadius: '10px', padding: '0.1rem 0.5rem'
                  }}>
                    {stale ? <Clock size={10} /> : meta.working ? <Loader2 className="voice-spinner" size={10} /> : null}
                    {status === 'error' && !stale && <AlertTriangle size={10} />}
                    {status === 'needs_grading' && !stale && <Users size={10} />}
                    {meta.label}
                  </span>
                  {status === 'error' && session.error && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--accent-coral)', margin: '0.3rem 0 0 0' }}>{session.error}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(session)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-coral)', cursor: 'pointer', padding: '0.25rem' }}
                  title="Borrar del historial"
                >
                  <X size={14} />
                </button>
              </div>

              {session.audioUrl && (
                <div style={{ marginTop: '0.5rem' }}>
                  <audio src={session.audioUrl} controls style={{ width: '100%' }} />
                </div>
              )}

              {needsAttention && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => onOpenSession(session.id)}
                  >
                    {status === 'draft' ? (
                      <><PenLine size={13} /> Revisar y publicar</>
                    ) : status === 'needs_grading' ? (
                      <><Users size={13} /> Asignar notas</>
                    ) : (
                      <><AlertTriangle size={13} /> Ver problema</>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
