import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, UploadCloud, AlertTriangle } from 'lucide-react';

// Chrome only records WebM/Opus, Safari only MP4/AAC, Firefox does Ogg. We
// don't fight it: the Cloud Function transcodes whatever arrives to WAV
// before handing it to Gemini, so any of these is fine here.
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const EXT_BY_TYPE = [
  { match: 'webm', ext: 'webm' },
  { match: 'ogg', ext: 'ogg' },
  { match: 'mp4', ext: 'm4a' },
  { match: 'mpeg', ext: 'mp3' },
  { match: 'wav', ext: 'wav' },
];

// Long enough for any "quick thoughts" note, short enough to stay well inside
// the 25 MB Storage cap and the function's 9-minute ceiling.
const MAX_SECONDS = 15 * 60;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function extensionFor(mimeType) {
  const found = EXT_BY_TYPE.find((e) => (mimeType || '').includes(e.match));
  return found ? found.ext : 'webm';
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Records a voice note in the browser, with a file-upload fallback for when
// the microphone is unavailable (denied permission, insecure context, an
// older browser). Hands the finished audio up as a File; the parent owns
// uploading it.
export default function VoiceNoteRecorder({ file, onFileReady, onClear, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const capTimeoutRef = useRef(null);

  const canRecord =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (capTimeoutRef.current) {
      clearTimeout(capTimeoutRef.current);
      capTimeoutRef.current = null;
    }
  };

  // Release the mic and the object URL if the panel closes mid-recording.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleStop = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleStart = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        stopTracks();

        if (blob.size === 0) {
          setError('La grabación llegó vacía. Prueba otra vez o sube un archivo.');
          return;
        }

        const recorded = new File(
          [blob],
          `nota-de-voz-${Date.now()}.${extensionFor(type)}`,
          { type }
        );
        setPreviewUrl(URL.createObjectURL(blob));
        onFileReady(recorded);
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => setSeconds((prev) => prev + 1), 1000);
      // Hard cap, scheduled once — cheaper and more predictable than checking
      // the elapsed count on every tick.
      capTimeoutRef.current = setTimeout(handleStop, MAX_SECONDS * 1000);
    } catch (err) {
      console.error('Microphone unavailable:', err);
      stopTracks();
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador o sube un archivo de audio.');
    }
  };

  const handleFilePicked = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError('');
    if (!picked.type.startsWith('audio/')) {
      setError('Ese archivo no es de audio.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(picked));
    onFileReady(picked);
  };

  const handleClear = () => {
    setPreviewUrl('');
    setSeconds(0);
    setError('');
    onClear();
  };

  return (
    <div
      style={{
        border: '1px dashed var(--primary)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        background: 'rgba(214, 130, 134, 0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Mic size={16} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Nota de voz</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(opcional)</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Cuenta en voz alta qué te ha parecido el libro. Se transcribe y se convierte en ideas
        clave, lo que te llamó la atención y un veredicto.
      </p>

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
            padding: '0.6rem 0.75rem',
            fontSize: '0.8rem',
            marginBottom: '0.75rem',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {recording ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--danger)',
              boxShadow: '0 0 10px var(--danger)',
              animation: 'recPulse 1.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            {formatDuration(seconds)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Grabando… (máx. {MAX_SECONDS / 60} min)
          </span>
          <button type="button" className="btn btn-secondary" onClick={handleStop}>
            <Square size={14} /> Detener
          </button>
        </div>
      ) : file ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {previewUrl && (
            <audio controls src={previewUrl} style={{ width: '100%' }}>
              Tu navegador no puede reproducir el audio.
            </audio>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClear}
              disabled={disabled}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
            >
              <Trash2 size={14} /> Quitar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {canRecord && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStart}
              disabled={disabled}
            >
              <Mic size={15} /> Grabar nota
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => document.getElementById('voice-note-file-input').click()}
            disabled={disabled}
          >
            <UploadCloud size={15} /> Subir audio
          </button>
          <input
            id="voice-note-file-input"
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />
        </div>
      )}
    </div>
  );
}
