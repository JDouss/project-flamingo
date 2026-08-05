import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LogIn, Lock, Library } from 'lucide-react';
import LoginModal from '../admin/LoginModal';
import ClubOnboarding from './ClubOnboarding';
import Loading from '../../ui/Loading';
import { OpenBook } from '../../ui/ornaments';
import { useAuth } from '../../app/authContext';
import { useMyClubs } from '../../data/useClub';

// The front door. It never shows book content — not a title, not a cover.
// A visitor either signs in and turns out to be in a club, or sees nothing
// but an invitation to sign in.
export default function LandingPage() {
  const { user, clubs, ready } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const clubIds = Object.keys(clubs);
  const myClubs = useMyClubs(clubIds);

  if (!ready) return <Loading label="Abriendo la biblioteca…" />;

  // In exactly one club: there is nothing to choose, so go straight there.
  if (user && clubIds.length === 1) {
    return <Navigate to={`/club/${clubIds[0]}`} replace />;
  }

  return (
    <main className="container" style={{ paddingTop: '4rem', maxWidth: '38rem', textAlign: 'center' }}>
      <OpenBook size={84} style={{ color: 'var(--primary-ink)', marginBottom: '1.5rem', opacity: 0.55 }} />

      <h2 className="serif-title" style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>
        Reseñas <em>Flamíngueras</em>
      </h2>

      {user && clubIds.length > 1 ? (
        <>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
            Estás en varios clubes. ¿A cuál entras?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1.5rem' }}>
            {myClubs.map((club) => (
              <Link
                key={club.id}
                to={`/club/${club.id}`}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
              >
                <Library size={15} /> {club.name}
                {clubs[club.id] === 'admin' && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>· admin</span>
                )}
              </Link>
            ))}
          </div>
          <ClubOnboarding />
        </>
      ) : user ? (
        <>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.8 }}>
            Has iniciado sesión como <strong>{user.email}</strong>, pero todavía no
            perteneces a ningún club. Únete con un código de invitación, o crea el tuyo.
          </p>
          <ClubOnboarding />
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
          <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            ¿Tienes un código de invitación? Inicia sesión y podrás usarlo — o abre
            directamente el enlace que te hayan pasado.
          </p>
        </>
      )}

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </main>
  );
}
