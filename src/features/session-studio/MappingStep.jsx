import { useState, useEffect } from 'react';
import { Sparkles, Volume2, AlertTriangle, FileAudio } from 'lucide-react';
import { useMembers } from '../../data/useMembers';
import { requestAnalysis } from '../../data/mutations';
import { fetchTranscript } from '../../data/useSessions';

const CONFIDENCE_META = {
  alta: { label: 'sugerencia fiable', color: 'var(--sage)' },
  media: { label: 'sugerencia dudosa', color: 'var(--accent-gold)' },
  baja: { label: 'sugerencia débil', color: 'var(--accent-coral)' },
};

// Human-in-the-loop voice mapping: the AI transcribed with anonymous
// [Speaker N] tags and *suggested* who each voice is; nothing enters the
// club stats until a human confirms the assignment here.
export default function MappingStep({ session, onConfirmed }) {
  const { members } = useMembers();
  const [mapping, setMapping] = useState({});
  const [transcript, setTranscript] = useState('');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const speakers = session.detectedSpeakers || [];
  const snippets = session.speakerSnippets || {};
  const suggestions = session.suggestedMapping || {};

  // Pre-fill from AI suggestions (editable, never final).
  useEffect(() => {
    const initial = {};
    speakers.forEach((sp) => {
      initial[sp] = suggestions[sp]?.memberName || '';
    });
    setMapping(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const allAssigned = speakers.length > 0 && speakers.every((sp) => mapping[sp]);

  const handleShowTranscript = async (e) => {
    if (!e.currentTarget.open || transcript || loadingTranscript) return;
    setLoadingTranscript(true);
    try {
      setTranscript(await fetchTranscript({ transcriptPath: session.transcriptPath }));
    } catch (err) {
      console.error('Transcript download failed:', err);
      setTranscript('No se pudo descargar la transcripción.');
    } finally {
      setLoadingTranscript(false);
    }
  };

  const handleConfirm = () => {
    setSubmitting(true);
    requestAnalysis(session.id, mapping);
    if (onConfirmed) onConfirmed();
    // The doc flips to "analyzing" via onSnapshot; no local state needed after this.
  };

  return (
    <div style={{ marginTop: '0.5rem', textAlign: 'left' }}>
      <h4 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary-ink)' }}>
        ¿Quién es cada voz?
      </h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Hemos detectado {speakers.length} {speakers.length === 1 ? 'voz' : 'voces'} en la grabación.
        Confirma quién es quién — las estadísticas del club (notas iniciales y finales) dependen de esta asignación.
        La IA ha sugerido asignaciones cuando ha encontrado pistas; verifícalas escuchando el audio.
      </p>

      {/* Audio player to identify voices by tone */}
      {session.audioUrl && (
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          marginBottom: '1rem'
        }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Volume2 size={14} /> ESCUCHA LA GRABACIÓN PARA IDENTIFICAR LAS VOCES
          </p>
          <audio src={session.audioUrl} controls style={{ width: '100%' }} />
        </div>
      )}

      {/* Full transcript, on demand */}
      <details
        onToggle={handleShowTranscript}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.6rem 1rem',
          marginBottom: '1.25rem'
        }}
      >
        <summary style={{ fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FileAudio size={14} style={{ color: 'var(--primary-ink)' }} /> Ver transcripción completa (con etiquetas de voz)
        </summary>
        <div style={{
          marginTop: '0.75rem', maxHeight: '260px', overflowY: 'auto', padding: '0.75rem',
          background: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          fontSize: '0.8rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-muted)'
        }}>
          {loadingTranscript ? 'Descargando transcripción...' : transcript}
        </div>
      </details>

      {/* One card per detected voice */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {speakers.map((sp) => {
          const suggestion = suggestions[sp];
          const confidence = suggestion ? CONFIDENCE_META[suggestion.confidence] : null;
          return (
            <div
              key={sp}
              style={{
                background: '#ffffff',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--primary-ink)' }}>{sp}</span>
                <select
                  className="form-select"
                  value={mapping[sp] || ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [sp]: e.target.value }))}
                  style={{ width: '210px', fontSize: '0.85rem' }}
                >
                  <option value="">-- Seleccionar miembro --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                  <option value="Invitado">Invitado</option>
                </select>
              </div>

              {suggestion && confidence && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
                  <Sparkles size={12} style={{ color: confidence.color, flexShrink: 0, marginTop: '0.15rem' }} />
                  <span>
                    La IA sugiere <strong style={{ color: 'var(--text-primary)' }}>{suggestion.memberName}</strong>{' '}
                    <span style={{ color: confidence.color, fontWeight: 600 }}>({confidence.label})</span>: {suggestion.reason}
                  </span>
                </div>
              )}

              <div style={{
                background: 'var(--bg-secondary)',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '3px solid var(--primary)',
                fontSize: '0.85rem',
                fontStyle: 'italic',
                color: 'var(--text-muted)'
              }}>
                “{snippets[sp] || 'Frase no disponible'}”
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleConfirm}
        disabled={!allAssigned || submitting}
        style={{ width: '100%', marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
      >
        <Sparkles size={16} /> Confirmar voces y generar análisis
      </button>
      {!allAssigned && (
        <p style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginTop: '0.5rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
          <AlertTriangle size={12} /> Asigna todas las voces antes de continuar (usa "Invitado" para voces ajenas al club).
        </p>
      )}
    </div>
  );
}
