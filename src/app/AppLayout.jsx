import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { LogIn, LogOut, BookMarked, TrendingUp, Library } from 'lucide-react';
import FlamingoIcon from '../ui/FlamingoIcon';
import { Bookshelf } from '../ui/ornaments';
import LoginModal from '../features/admin/LoginModal';
import { useAuth } from './authContext';
import { DEFAULT_CLUB_ID } from './clubs';

// Icon + label sit on one line, the way the header buttons always have.
const navStyle = { display: 'flex', alignItems: 'center', gap: '0.4rem' };

// The shell every page renders inside: identity, the links between sections,
// and the auth controls. Section-specific actions (adding a review, opening
// Session Studio, logging a read) belong to the page that owns that data, not
// up here.
export default function AppLayout() {
  const { user, ownerEmail, isAdmin, logout } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div>
      <header className="header-wrapper">
        <div className="header-content">
          <Link
            to={`/club/${DEFAULT_CLUB_ID}`}
            className="logo"
            style={{ transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <FlamingoIcon size={32} />
            <span className="logo-lockup">
              <span className="logo-eyebrow">Club de lectura · Flamingo Rock</span>
              <span className="logo-title">Reseñas <em>Flamíngueras</em></span>
            </span>
          </Link>

          <div
            className="header-actions"
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <NavLink end to={`/club/${DEFAULT_CLUB_ID}`} className="btn btn-secondary" style={navStyle}>
              <Library size={15} /> Estantería
            </NavLink>
            <NavLink to={`/club/${DEFAULT_CLUB_ID}/estadisticas`} className="btn btn-secondary" style={navStyle}>
              <TrendingUp size={15} style={{ color: 'var(--primary)' }} /> Estadísticas
            </NavLink>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Signing in is now open to any Google account, so the pill
                    says which of the two you are: a club admin, or simply
                    someone who is signed in and waiting for an invite. */}
                <span
                  className="admin-pill"
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(42, 26, 46, 0.04)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isAdmin ? 'var(--sage)' : 'var(--text-muted)', display: 'inline-block', boxShadow: isAdmin ? '0 0 8px var(--sage)' : 'none' }}></span>
                  {isAdmin ? 'Admin Activo' : ownerEmail}
                </span>
                {isAdmin && (
                  <NavLink to="/biblioteca" className="btn btn-secondary" style={navStyle}>
                    <BookMarked size={15} /> Mi Biblioteca
                  </NavLink>
                )}
                <button className="btn btn-secondary btn-icon" onClick={logout} title="Cerrar Sesión">
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setIsLoginOpen(true)}>
                <LogIn size={15} /> Iniciar Sesión
              </button>
            )}
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="site-footer">
        <Bookshelf style={{ color: 'var(--text-muted)' }} />
        <p>© 2026 Reseñas Flamíngueras · Club de lectura Flamingo Rock</p>
      </footer>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}
