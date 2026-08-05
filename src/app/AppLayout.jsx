import { useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, BookMarked, TrendingUp, Library } from 'lucide-react';
import FlamingoIcon from '../ui/FlamingoIcon';
import { Bookshelf } from '../ui/ornaments';
import LoginModal from '../features/admin/LoginModal';
import { useAuth } from './authContext';
import { useMyClubs } from '../data/useClub';

// Icon + label sit on one line, the way the header buttons always have.
const navStyle = { display: 'flex', alignItems: 'center', gap: '0.4rem' };

// The shell every page renders inside: identity, the links between sections,
// and the auth controls. Section-specific actions (adding a review, opening
// Session Studio, logging a read) belong to the page that owns that data.
export default function AppLayout() {
  const { user, ownerEmail, clubs, logout } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const navigate = useNavigate();
  const clubIds = Object.keys(clubs);
  const myClubs = useMyClubs(clubIds);

  // Follow the club you are actually looking at, falling back to your first
  // one elsewhere in the app. The club links only mean anything to a member,
  // so a visitor never sees them — nor a club's name in the chrome.
  // Both matches run every render: `||` between two hook calls would skip one.
  const exactMatch = useMatch('/club/:clubId');
  const nestedMatch = useMatch('/club/:clubId/*');
  const clubId = (exactMatch || nestedMatch)?.params?.clubId || clubIds[0] || null;
  const activeClubName = myClubs.find((c) => c.id === clubId)?.name;

  return (
    <div>
      <header className="header-wrapper">
        <div className="header-content">
          <Link
            to="/"
            className="logo"
            style={{ transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <FlamingoIcon size={32} />
            <span className="logo-lockup">
              {/* Whose club you are in, once there can be more than one. */}
              <span className="logo-eyebrow">
                {activeClubName ? `Club de lectura · ${activeClubName}` : 'Club de lectura'}
              </span>
              <span className="logo-title">Reseñas <em>Flamíngueras</em></span>
            </span>
          </Link>

          <div
            className="header-actions"
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            {clubIds.length > 1 && (
              // A switcher only earns its place once there is something to
              // switch between.
              <select
                className="form-select"
                style={{ fontSize: '0.85rem' }}
                value={clubId || ''}
                onChange={(e) => navigate(`/club/${e.target.value}`)}
                aria-label="Cambiar de club"
              >
                {myClubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            )}

            {clubId && (
              <>
                <NavLink end to={`/club/${clubId}`} className="btn btn-secondary" style={navStyle}>
                  <Library size={15} /> Estantería
                </NavLink>
                <NavLink to={`/club/${clubId}/estadisticas`} className="btn btn-secondary" style={navStyle}>
                  <TrendingUp size={15} style={{ color: 'var(--primary)' }} /> Estadísticas
                </NavLink>
              </>
            )}

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span
                  className="admin-pill"
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(42, 26, 46, 0.04)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: clubId ? 'var(--sage)' : 'var(--text-muted)', display: 'inline-block', boxShadow: clubId ? '0 0 8px var(--sage)' : 'none' }}></span>
                  {ownerEmail}
                </span>
                <NavLink to="/biblioteca" className="btn btn-secondary" style={navStyle}>
                  <BookMarked size={15} /> Mi Biblioteca
                </NavLink>
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
