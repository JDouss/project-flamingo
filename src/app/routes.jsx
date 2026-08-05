import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import AuthProvider from './AuthProvider';
import AppLayout from './AppLayout';
import { useAuth } from './authContext';
import { DEFAULT_CLUB_ID } from './clubs';
import { useBooks } from '../data/useBooks';
import { usePersonalReads } from '../data/usePersonalReads';
import { useClubDoc, useClubMembership } from '../data/useClub';
import Loading from '../ui/Loading';
import LandingPage from '../features/landing/LandingPage';
import ClubShelfPage from '../features/club/ClubShelfPage';
import ClubStatsPage from '../features/club/ClubStatsPage';
import LibraryPage from '../features/library/LibraryPage';
import LibraryStatsPage from '../features/library/LibraryStatsPage';
import MigrationPage from '../features/admin/MigrationPage';

// Club context and the membership gate in one place. The club pages hang off
// this layout, so the catalog is subscribed once and shared by the shelf and
// the dashboard. A non-member never gets past here — and the rules would
// refuse them anyway, so this is the courteous version of a denial, not the
// enforcement.
function ClubLayout() {
  const { clubId } = useParams();
  const { ownerEmail, ready } = useAuth();
  const { role, isMember, isClubAdmin, loading: membershipLoading } = useClubMembership(
    clubId,
    ownerEmail
  );
  const { club, loading: clubLoading } = useClubDoc(isMember ? clubId : null);
  const { books, loading: booksLoading, error } = useBooks(isMember ? clubId : null);

  if (!ready || membershipLoading) return <Loading label="Comprobando tu acceso…" />;
  if (!isMember) return <Navigate to="/" replace />;

  return (
    <Outlet
      context={{
        clubId,
        club,
        role,
        isClubAdmin,
        books,
        loading: booksLoading || clubLoading,
        error,
      }}
    />
  );
}

// A reader's own library. Every signed-in account has one now: the reads live
// under their own email, so there is nothing to share and nothing to leak.
function LibraryLayout() {
  const { ownerEmail, ready } = useAuth();
  const { reads, loading, error } = usePersonalReads(ownerEmail);

  if (!ready) return <Loading label="Abriendo tu biblioteca…" />;
  if (!ownerEmail) return <Navigate to="/" replace />;

  return <Outlet context={{ ownerEmail, reads, loading, error }} />;
}

// Temporary: the migration page is for whoever administers the first club.
function RequireClubAdmin({ children }) {
  const { clubs, ready } = useAuth();
  if (!ready) return <Loading label="Comprobando permisos…" />;
  if (clubs[DEFAULT_CLUB_ID] !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<LandingPage />} />

            <Route path="club/:clubId" element={<ClubLayout />}>
              <Route index element={<ClubShelfPage />} />
              <Route path="estadisticas" element={<ClubStatsPage />} />
            </Route>

            <Route path="biblioteca" element={<LibraryLayout />}>
              <Route index element={<LibraryPage />} />
              <Route path="estadisticas" element={<LibraryStatsPage />} />
            </Route>

            <Route
              path="migracion"
              element={<RequireClubAdmin><MigrationPage /></RequireClubAdmin>}
            />

            {/* Anything unknown goes back to the front door. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
