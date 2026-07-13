import { useState, useEffect } from 'react';
import { UploadCloud, FileAudio, AlertTriangle, Sparkles, Loader2, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { startSessionUpload, retrySession } from '../../data/mutations';
import { sessionStatus, isSessionStale } from '../../data/useSessions';

const FUNNY_MESSAGES = [
  'Evaluando pedantería intelectual...',
  'Buscando citas pretenciosas...',
  'Midiendo nivel de esnobismo...',
  "Contando las veces que se dijo 'narrativa'...",
  'Analizando posturas existencialistas...',
  'Detectando digresiones existenciales...',
  'Traduciendo silencios incómodos...',
  'Cuantificando referencias a autores rusos...',
  'Filtrando debates sobre el olor a papel físico...',
  'Descartando teorías conspirativas sobre el final...',
  'Estimando nivel de desacuerdo educado...',
  'Desinfectando spoilers no solicitados...',
  'Calculando porcentaje de pedantería por minuto...',
  "Traduciendo 'metaliteratura' a cristiano...",
  'Analizando deltas de entusiasmo literario...',
  'Comprobando si alguien realmente leyó la última página...',
  'Sincronizando egos de los participantes...',
];

const WORKING_LABELS = {
  queued: 'Sesión en cola para transcribir',
  transcribing: 'Transcribiendo y separando voces',
  analyzing: 'Generando el análisis de la sesión',
};

const VALID_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg'];

function isValidAudioFile(file) {
  const nameLower = file.name.toLowerCase();
  if (nameLower.endsWith('.m4a')) return false;
  return (
    VALID_EXTENSIONS.some((ext) => nameLower.endsWith(ext)) ||
    (file.type && file.type.startsWith('audio/') && !file.type.includes('m4a'))
  );
}

// Upload a session recording and follow the pipeline live. Once the upload
// finishes the browser is no longer needed: the callable function keeps
// running server-side and the doc subscription reflects every stage here
// (or in the history tab) whenever the user comes back.
export default function UploadStep({ session, onSessionStarted, onReset }) {
  const [audioFile, setAudioFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState(-1);
  const [funnyMsg, setFunnyMsg] = useState('');
  const [retrying, setRetrying] = useState(false);

  const status = session ? sessionStatus(session) : null;
  const stale = session ? isSessionStale(session) : false;
  const isWorking = status === 'queued' || status === 'transcribing' || status === 'analyzing';

  useEffect(() => {
    if (status !== 'transcribing' && status !== 'analyzing') {
      setFunnyMsg('');
      return;
    }
    const pick = () => FUNNY_MESSAGES[Math.floor(Math.random() * FUNNY_MESSAGES.length)];
    setFunnyMsg(pick());
    const intervalId = setInterval(() => setFunnyMsg(pick()), 4000);
    return () => clearInterval(intervalId);
  }, [status]);

  const validateAndSetFile = (file) => {
    setErrorMsg('');
    if (!isValidAudioFile(file)) {
      setErrorMsg('Por favor, sube un archivo de audio válido (.mp3, .wav, .flac o .ogg). El formato .m4a no está soportado.');
      return;
    }
    setAudioFile(file);
  };

  const handleStart = async () => {
    if (!audioFile) return;
    setErrorMsg('');
    setUploadProgress(0);
    try {
      const sessionId = await startSessionUpload(audioFile, setUploadProgress);
      onSessionStarted(sessionId);
    } catch (err) {
      console.error('Session upload failed:', err);
      setErrorMsg(err.message || 'Error al subir la grabación.');
    } finally {
      setUploadProgress(-1);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retrySession(session);
    } catch (err) {
      console.error('Retry failed:', err);
      setErrorMsg(err.message || 'No se pudo reintentar.');
    } finally {
      setRetrying(false);
    }
  };

  const handleStartOver = () => {
    setAudioFile(null);
    setErrorMsg('');
    onReset();
  };

  // ---- Live pipeline states ----

  if (status === 'error' || (isWorking && stale)) {
    const isError = status === 'error';
    return (
      <div style={{ marginTop: '1rem' }}>
        <div className="voice-alert-danger">
          {isError ? <AlertTriangle size={16} style={{ flexShrink: 0 }} /> : <Clock size={16} style={{ flexShrink: 0 }} />}
          <span>
            {isError
              ? `El procesado falló${session.errorStage ? ` (etapa: ${session.errorStage})` : ''}: ${session.error || 'error desconocido'}`
              : 'Esta sesión lleva demasiado tiempo en proceso. Es probable que el servidor no la haya recibido (¿funciones sin desplegar?) o que el proceso muriera a mitad.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={handleRetry} disabled={retrying} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {retrying ? <Loader2 className="voice-spinner" size={14} /> : <RotateCcw size={14} />} Reintentar procesado
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleStartOver}>
            Procesar otra grabación
          </button>
        </div>
      </div>
    );
  }

  if (isWorking || uploadProgress >= 0) {
    const isUploading = uploadProgress >= 0;
    return (
      <div className="voice-processing-box">
        <Loader2 className="voice-spinner" size={32} />
        <p style={{ fontWeight: '600', fontSize: '1rem', marginTop: '1rem' }}>
          {isUploading ? `Subiendo audio... ${uploadProgress}%` : WORKING_LABELS[status]}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '380px', marginTop: '0.25rem' }}>
          {isUploading
            ? 'No cierres esta pestaña hasta que termine la subida.'
            : status === 'transcribing'
              ? 'La IA está transcribiendo en el servidor. Puedes cerrar esta ventana: cuando termine te pedirá confirmar quién es cada voz (Historial de sesiones).'
              : 'El análisis corre en el servidor. Puedes cerrar esta ventana: el borrador aparecerá en el Historial de sesiones.'}
        </p>
        {funnyMsg && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--primary-ink)',
            fontStyle: 'italic',
            marginTop: '0.75rem',
            fontWeight: '600',
            background: 'var(--primary-light)',
            padding: '0.4rem 0.85rem',
            borderRadius: '12px',
            border: '1px dashed var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            <Sparkles size={13} style={{ flexShrink: 0 }} /> {funnyMsg}
          </div>
        )}
      </div>
    );
  }

  if (status === 'published') {
    return (
      <div className="voice-processing-box">
        <CheckCircle2 size={32} style={{ color: 'var(--sage)' }} />
        <p style={{ fontWeight: '600', fontSize: '1rem', marginTop: '1rem' }}>Sesión publicada</p>
        <button type="button" className="btn btn-secondary" onClick={handleStartOver} style={{ marginTop: '1rem' }}>
          Procesar otra grabación
        </button>
      </div>
    );
  }

  // ---- Idle: pick a file ----

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {errorMsg && (
        <div className="voice-alert-danger">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      <label className="form-label" style={{ marginTop: '1rem' }}>Subir audio del club de lectura</label>
      <div
        className={`voice-upload-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
        }}
        onClick={() => document.getElementById('session-audio-input').click()}
      >
        <UploadCloud className="voice-upload-icon" />
        {audioFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <FileAudio size={18} style={{ color: 'var(--primary-ink)' }} />
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{audioFile.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)
            </span>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>
              Arrastra y suelta la grabación de la reunión aquí, o <span style={{ color: 'var(--primary-ink)' }}>busca un archivo</span>
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Formatos soportados: MP3, WAV, FLAC, OGG
            </p>
          </>
        )}
      </div>
      <input
        id="session-audio-input"
        type="file"
        accept=".mp3,.wav,.flac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/flac"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      <div className="voice-notice-box">
        <AlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--accent-sunset)', marginTop: '0.1rem' }} />
        <div>
          <p style={{ fontWeight: '600', color: 'var(--accent-sunset)', fontSize: '0.8rem', marginBottom: '0.2rem' }}>Recomendación de tamaño de archivo</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Para reuniones de 1 a 2 horas, exporta el audio como MP3 mono de 32 kbps (una hora ≈ 14 MB).
            Tras la subida, el análisis corre en el servidor: no hace falta mantener la pestaña abierta.
          </p>
        </div>
      </div>

      {audioFile && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleStart}
          disabled={uploadProgress >= 0}
          style={{ width: '100%', marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
        >
          <Sparkles size={16} /> Subir y analizar con IA
        </button>
      )}
    </div>
  );
}
