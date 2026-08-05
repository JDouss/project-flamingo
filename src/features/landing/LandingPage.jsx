import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogIn, Lock, Mail } from 'lucide-react';
import LoginModal from '../admin/LoginModal';
import Loading from '../../ui/Loading';
import { OpenBook } from '../../ui/ornaments';
import { useAuth } from '../../app/authContext';

// The front door. It never shows book content — not a title, not a cover.
// A visitor either signs in and turns out to be in a club, or sees nothing
// but an invitation to sign in.
export default function LandingPage() {
  const { user, clubs, ready } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  if (!ready) return <Loading label="Abriendo la biblioteca…" />;

  // Signed in and in a club: go straight there. A switcher for people in more
  // than one club comes with the multi-club UX.
  const clubIds = Object.keys(clubs);
  if (user && clubIds.length > 0) {
    return <Navigate to={`/club/${clubIds[0]}`} replace />;
  }

  return (
    <main className="container" style={{ paddingTop: '4rem', maxWidth: '38rem', textAlign: 'center' }}>
      <OpenBook size={84} style={{ color: 'var(--primary-ink)', marginBottom: '1.5rem', opacity: 0.55 }} />

      <h2 className="serif-title" style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>
        Reseñas <em>Flamíngueras</em>
      </h2>

      {user ? (
        <>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
            Has iniciado sesión como <strong>{user.email}</strong>, pero todavía no
            perteneces a ningún club. Pide a un administrador que te añada y volverás
            aquí con tu estantería.
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '0.35rem 0.85rem',
            }}
          >
            <Mail size={13} /> Esperando invitación
          </div>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
            Un club de lectura privado. Las reseñas, las sesiones y las lecturas de
            cada miembro sólo se ven desde dentro.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setIsLoginOpen(true)}
            style={{ marginTop: '1.75rem' }}
          >
            <LogIn size={15} /> Iniciar Sesión
          </button>
          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              marginTop: '1.5rem',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
          >
            <Lock size={12} /> Contenido visible sólo para miembros
          </p>
        </>
      )}

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </main>
  );
}
