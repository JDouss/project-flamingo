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
  const { ownerEmail, ready } = useAuth();
  const { reads, loading, error } = usePersonalReads(ownerEmail);

  if (!ready) return <Loading label="Abriendo tu biblioteca…" />;
  if (!ownerEmail) return <Navigate to={`/club/${DEFAULT_CLUB_ID}`} replace />;

  return <Outlet context={{ ownerEmail, reads, loading, error }} />;
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

            {/* Anything unknown goes back to the club shelf. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
