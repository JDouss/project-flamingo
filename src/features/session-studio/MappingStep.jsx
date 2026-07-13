import { useState, useEffect, useRef } from 'react';
import { Sparkles, Volume2, AlertTriangle, FileAudio, Play, RotateCcw, Info } from 'lucide-react';
import { useMembers } from '../../data/useMembers';
import { requestAnalysis, requestTranscription } from '../../data/mutations';
import { fetchTranscript } from '../../data/useSessions';

const CONFIDENCE_META = {
  alta: { label: 'sugerencia fiable', color: 'var(--sage)' },
  media: { label: 'sugerencia dudosa', color: 'var(--accent-gold)' },
  baja: { label: 'sugerencia débil', color: 'var(--accent-coral)' },
};

function fmtTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// Human-in-the-loop voice mapping. The AI transcribed with anonymous voice
// tags and *suggested* who each voice is; nothing enters the club stats
// until a human confirms it here. Each voice comes with participation stats
// and several long excerpts whose ▶ buttons seek the session audio to that
// exact moment — identification is by listening, not by reading one line.
export default function MappingStep({ session }) {
  const { members } = useMembers();
  const [mapping, setMapping] = useState({});
  const [transcript, setTranscript] = useState('');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef(null);

  const speakers = session.detectedSpeakers || [];
  const snippets = session.speakerSnippets || {};
  const excerpts = session.speakerExcerpts || {};
  const stats = session.speakerStats || {};
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

  const playAt = (t) => {
    const audio = audioRef.current;
    if (!audio || t === null || t === undefined) return;
    audio.currentTime = Math.max(0, t - 2); // 2s of lead-in
    audio.play().catch(() => {});
  };

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
    // The doc flips to "analyzing" via onSnapshot; the studio re-routes itself.
  };

  const handleRetranscribe = () => {
    if (!window.confirm('¿Volver a transcribir el audio desde cero? Se descartará esta detección de voces.')) return;
    requestTranscription(session.id);
  };

  const evidenceFor = (sp) => {
    const list = excerpts[sp];
    if (list && list.length > 0) return list;
    // Legacy sessions (pre-redesign) only have a single text snippet.
    return snippets[sp] ? [{ t: null, text: snippets[sp] }] : [];
  };

  return (
    <div style={{ marginTop: '0.5rem', textAlign: 'left' }}>
      <h4 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary-ink)' }}>
        ¿Quién es cada voz?
      </h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Hemos detectado {speakers.length} {speakers.length === 1 ? 'voz' : 'voces'}. Pulsa ▶ en cualquier
        fragmento para escuchar esa voz en ese momento exacto de la grabación y confirma quién es.
        Las estadísticas del club dependen de esta asignación.
      </p>

      {/* Merge hint: over-detection is expected and harmless */}
      <div style={{
        display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.85rem', marginBottom: '1rem',
        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '0.1rem', color: 'var(--primary-ink)' }} />
        <span>
          Si la misma persona aparece dividida en dos voces, simplemente asigna las dos al mismo
          miembro: se fusionarán automáticamente y las notas no se duplicarán.
        </span>
      </div>

      {/* Audio player — the reference for all ▶ buttons below */}
      {session.audioUrl && (
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          marginBottom: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 5
        }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Volume2 size={14} /> GRABACIÓN DE LA SESIÓN
          </p>
          <audio ref={audioRef} src={session.audioUrl} controls style={{ width: '100%' }} />
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
          const spStats = stats[sp];
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--primary-ink)' }}>{sp}</span>
                  {spStats && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {spStats.turns} intervenciones · {spStats.wordShare}% del tiempo de palabra
                    </span>
                  )}
                </div>
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

              {/* Playable evidence: long excerpts from different moments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {evidenceFor(sp).map((ex, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-secondary)',
                      padding: '0.55rem 0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: '3px solid var(--primary)',
                      fontSize: '0.83rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      gap: '0.6rem',
                      alignItems: 'flex-start'
                    }}
                  >
                    {ex.t !== null && ex.t !== undefined && session.audioUrl ? (
                      <button
                        type="button"
                        onClick={() => playAt(ex.t)}
                        title={`Escuchar en ${fmtTime(ex.t)}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          background: '#ffffff', border: '1px solid var(--border)',
                          borderRadius: '14px', padding: '0.15rem 0.55rem',
                          fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-ink)',
                          cursor: 'pointer', flexShrink: 0, marginTop: '0.1rem'
                        }}
                      >
                        <Play size={10} fill="var(--primary-ink)" /> {fmtTime(ex.t)}
                      </button>
                    ) : null}
                    <span style={{ fontStyle: 'italic' }}>“{ex.text}”</span>
                  </div>
                ))}
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

      <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={handleRetranscribe}
          disabled={submitting}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <RotateCcw size={11} /> La detección de voces salió mal: volver a transcribir desde cero
        </button>
      </div>
    </div>
  );
}
