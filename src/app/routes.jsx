import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import AuthProvider from './AuthProvider';
import AppLayout from './AppLayout';
import { useAuth } from './authContext';
import { DEFAULT_CLUB_ID, isKnownClub } from './clubs';
import { useBooks } from '../data/useBooks';
import { usePersonalReads } from '../data/usePersonalReads';
import Loading from '../ui/Loading';
import ClubShelfPage from '../features/club/ClubShelfPage';
import ClubStatsPage from '../features/club/ClubStatsPage';
import LibraryPage from '../features/library/LibraryPage';
import LibraryStatsPage from '../features/library/LibraryStatsPage';
import MigrationPage from '../features/admin/MigrationPage';

// Club context. The club pages hang off this layout, so the catalog is
// subscribed once and shared by the shelf and the dashboard instead of once
// per page. P1 still reads the root `books` collection; only the URL is
// club-scoped so far.
function ClubLayout() {
  const { clubId } = useParams();
  const { books, loading, error } = useBooks();

  if (!isKnownClub(clubId)) return <Navigate to={`/club/${DEFAULT_CLUB_ID}`} replace />;

  return <Outlet context={{ clubId, books, loading, error }} />;
}

// Library context, and the auth gate for it in one place: a personal read is
// only ever fetched for its owner, so a visitor's session never issues the
// query at all.
function LibraryLayout() {
  const { ownerEmail, isAdmin, ready } = useAuth();
  // Sign-in is open to any Google account now, but the reading log is still
  // the legacy `personal_reads` collection — the allowlisted owner's. It opens
  // up when reads move under `users/{email}/reads`.
  const libraryEmail = isAdmin ? ownerEmail : null;
  const { reads, loading, error } = usePersonalReads(libraryEmail);

  if (!ready) return <Loading label="Abriendo tu biblioteca…" />;
  if (!libraryEmail) return <Navigate to={`/club/${DEFAULT_CLUB_ID}`} replace />;

  return <Outlet context={{ ownerEmail: libraryEmail, reads, loading, error }} />;
}

// Owner-only, deliberately unlinked: the one-off migration into the new tree
// and the counts that verify it. Goes away with the callable it drives.
function RequireOwner({ children }) {
  const { isAdmin, ready } = useAuth();
  if (!ready) return <Loading label="Comprobando permisos…" />;
  if (!isAdmin) return <Navigate to={`/club/${DEFAULT_CLUB_ID}`} replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to={`/club/${DEFAULT_CLUB_ID}`} replace />} />

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
              element={<RequireOwner><MigrationPage /></RequireOwner>}
            />

            {/* Anything unknown goes back to the club shelf. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
