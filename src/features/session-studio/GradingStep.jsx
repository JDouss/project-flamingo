import { useState, useEffect, useRef } from 'react';
import { Sparkles, Volume2, AlertTriangle, FileAudio, Play, RotateCcw, Plus, X, Info } from 'lucide-react';
import { useMembers } from '../../data/useMembers';
import { requestAnalysis, requestTranscription } from '../../data/mutations';
import { fetchTranscript } from '../../data/useSessions';

function fmtTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

const ROUND_META = {
  start: { title: 'Ronda inicial', hint: 'las notas antes de empezar el debate' },
  end: { title: 'Ronda final', hint: 'las notas tras el debate' },
};

// Human grade assignment — the ground truth of the club stats. The AI only
// LOCATES the moments where marks are spoken (timestamp + quote + detected
// value); the human listens to each one (▶ seeks the audio) and says who
// said it. No diarization involved: identification is per-moment, by ear.
export default function GradingStep({ session }) {
  const { members } = useMembers();
  const [rows, setRows] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef(null);

  // Seed editable rows from the detected grade moments (or the previously
  // confirmed list when reopening a draft).
  useEffect(() => {
    const confirmed = session.confirmedGrades;
    if (Array.isArray(confirmed) && confirmed.length > 0) {
      setRows(confirmed.map((g, i) => ({
        id: `c${i}`,
        round: g.round === 'end' ? 'end' : 'start',
        t: g.t ?? null,
        quote: g.quote || '',
        value: g.value ?? '',
        member: g.member || '',
      })));
      return;
    }
    const events = session.gradeEvents || [];
    setRows(events.map((e, i) => ({
      id: `e${i}`,
      round: e.round === 'end' ? 'end' : 'start',
      t: e.t ?? null,
      quote: e.quote || '',
      value: e.value ?? '',
      member: e.suggestedMember || '',
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const playAt = (t) => {
    const audio = audioRef.current;
    if (!audio || t === null || t === undefined) return;
    audio.currentTime = Math.max(0, t - 3); // 3s of lead-in
    audio.play().catch(() => {});
  };

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = (round) => {
    setRows((prev) => [
      ...prev,
      { id: `m${Date.now()}`, round, t: null, quote: '', value: '', member: '', manual: true },
    ]);
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

  const complete = rows.every((r) => r.member && r.value !== '' && Number(r.value) >= 1 && Number(r.value) <= 10);

  const handleConfirm = () => {
    setSubmitting(true);
    requestAnalysis(
      session.id,
      rows.map((r) => ({
        member: r.member,
        round: r.round,
        value: Number(r.value),
        t: r.t ?? null,
        quote: r.quote || null,
      }))
    );
    // The doc flips to "analyzing" via onSnapshot; the studio re-routes itself.
  };

  const handleRetranscribe = () => {
    if (!window.confirm('¿Volver a transcribir el audio desde cero? Se descartarán los momentos de nota detectados.')) return;
    requestTranscription(session.id);
  };

  // Legacy session from the diarization era: no grade moments to work with.
  if (!session.gradeEvents && !session.confirmedGrades) {
    return (
      <div style={{ marginTop: '1rem' }}>
        <div className="voice-alert-danger">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>Esta sesión se transcribió con la versión anterior del sistema y no tiene los momentos de nota detectados. Vuelve a transcribirla para continuar.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleRetranscribe} style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RotateCcw size={14} /> Volver a transcribir
        </button>
      </div>
    );
  }

  const renderRound = (round) => {
    const roundRows = rows.filter((r) => r.round === round);
    const meta = ROUND_META[round];
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
          <h5 className="serif-title" style={{ fontSize: '1.05rem', margin: 0, color: 'var(--text-primary)' }}>
            {meta.title} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>— {meta.hint}</span>
          </h5>
          <button
            type="button"
            onClick={() => addRow(round)}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Plus size={11} /> Añadir nota
          </button>
        </div>

        {roundRows.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '0.25rem 0 0' }}>
            No se detectó ninguna nota en esta ronda. Añádela a mano si la hubo.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {roundRows.map((r) => (
              <div
                key={r.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-sm)',
                  padding: '0.7rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                {(r.quote || r.t !== null) && (
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                    {r.t !== null && session.audioUrl && (
                      <button
                        type="button"
                        onClick={() => playAt(r.t)}
                        title={`Escuchar en ${fmtTime(r.t)}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          background: 'var(--primary-light)', border: '1px solid rgba(255,26,117,0.25)',
                          borderRadius: '14px', padding: '0.15rem 0.55rem',
                          fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-ink)',
                          cursor: 'pointer', flexShrink: 0, marginTop: '0.1rem'
                        }}
                      >
                        <Play size={10} fill="var(--primary-ink)" /> {fmtTime(r.t)}
                      </button>
                    )}
                    {r.quote && (
                      <span style={{ fontStyle: 'italic', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        “{r.quote}”
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="form-select"
                    value={r.member}
                    onChange={(e) => updateRow(r.id, 'member', e.target.value)}
                    style={{ flex: '1 1 150px', fontSize: '0.85rem' }}
                  >
                    <option value="">-- ¿Quién lo dice? --</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                    <option value="Invitado">Invitado (no puntúa)</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    placeholder="Nota"
                    className="form-input"
                    value={r.value}
                    onChange={(e) => updateRow(r.id, 'value', e.target.value)}
                    style={{ width: '80px', fontSize: '0.85rem', textAlign: 'center' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    title="Descartar este momento (falso positivo)"
                    style={{ background: 'none', border: 'none', color: 'var(--accent-coral)', cursor: 'pointer', padding: '0.25rem' }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: '0.5rem', textAlign: 'left' }}>
      <h4 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary-ink)' }}>
        ¿Quién dijo cada nota?
      </h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Hemos localizado los momentos en que se dicen las notas del libro. Pulsa ▶ para escuchar cada
        momento y asigna quién lo dice. Estas notas confirmadas son las que alimentan las estadísticas del club.
      </p>

      <div style={{
        display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.85rem', marginBottom: '1rem',
        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '0.1rem', color: 'var(--primary-ink)' }} />
        <span>
          Corrige la nota si la IA la entendió mal, descarta con ✕ los falsos positivos y usa
          "Añadir nota" si falta alguna (puedes localizarla con el reproductor y la transcripción).
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
          <FileAudio size={14} style={{ color: 'var(--primary-ink)' }} /> Ver transcripción completa (con marcas de tiempo)
        </summary>
        <div style={{
          marginTop: '0.75rem', maxHeight: '260px', overflowY: 'auto', padding: '0.75rem',
          background: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          fontSize: '0.8rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-muted)'
        }}>
          {loadingTranscript ? 'Descargando transcripción...' : transcript}
        </div>
      </details>

      {renderRound('start')}
      {renderRound('end')}

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleConfirm}
        disabled={!complete || submitting}
        style={{ width: '100%', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
      >
        <Sparkles size={16} /> Confirmar notas y generar análisis
      </button>
      {!complete && (
        <p style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginTop: '0.5rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
          <AlertTriangle size={12} /> Cada momento debe tener miembro y nota (1-10), o descártalo con ✕.
        </p>
      )}

      <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={handleRetranscribe}
          disabled={submitting}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <RotateCcw size={11} /> Algo salió mal con la transcripción: volver a transcribir desde cero
        </button>
      </div>
    </div>
  );
}
