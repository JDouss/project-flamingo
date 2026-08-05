import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LogIn, Check, AlertTriangle, Loader2 } from 'lucide-react';
import LoginModal from '../admin/LoginModal';
import Loading from '../../ui/Loading';
import { OpenBook } from '../../ui/ornaments';
import { useAuth } from '../../app/authContext';
import { joinClub } from '../../data/mutations';

// An invite link. Signed in, it joins and takes you to the club; signed out,
// it waits for you to sign in and then does the same, so the link works
// whichever state you open it in.
export default function JoinPage() {
  const { inviteCode } = useParams();
  const { user, refreshClubs, ready } = useAuth();
  const navigate = useNavigate();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | joining | error
  const [error, setError] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    // Once per visit: a second attempt would be a harmless no-op server-side,
    // but re-running on every render would not be.
    if (!ready || !user || attempted.current) return;
    attempted.current = true;

    (async () => {
      setState('joining');
      try {
        const result = await joinClub(inviteCode);
        // The membership exists now, but this token predates it: without the
        // refresh the club would be invisible until the next sign-in.
        await refreshClubs();
        navigate(`/club/${result.clubId}`, { replace: true });
      } catch (err) {
        console.error('Join failed:', err);
        setError(
          err?.code === 'functions/not-found'
            ? 'Ese código de invitación no existe o ha caducado.'
            : err?.message || 'No se pudo unir al club.'
        );
        setState('error');
      }
    })();
  }, [ready, user, inviteCode, refreshClubs, navigate]);

  if (!ready) return <Loading label="Comprobando la invitación…" />;

  return (
    <main className="container" style={{ paddingTop: '4rem', maxWidth: '34rem', textAlign: 'center' }}>
      <OpenBook size={72} style={{ color: 'var(--primary-ink)', marginBottom: '1.25rem', opacity: 0.55 }} />

      <h2 className="serif-title" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>
        Invitación a un club
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Código <strong style={{ letterSpacing: '0.08em' }}>{inviteCode}</strong>
      </p>

      {!user && (
        <>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginTop: '1.25rem' }}>
            Inicia sesión y te unimos al club automáticamente.
          </p>
          <button className="btn btn-primary" onClick={() => setIsLoginOpen(true)} style={{ marginTop: '1.25rem' }}>
            <LogIn size={15} /> Iniciar Sesión
          </button>
        </>
      )}

      {state === 'joining' && (
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
          <Loader2 size={15} className="voice-spinner" /> Uniéndote al club…
        </p>
      )}

      {state === 'error' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            justifyContent: 'center',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            marginTop: '1.5rem',
          }}
        >
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {state === 'error' && (
        <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
          <Check size={14} /> Volver al inicio
        </button>
      )}

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </main>
  );
}
