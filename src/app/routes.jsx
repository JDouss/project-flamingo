import { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import AuthProvider from './AuthProvider';
import AppLayout from './AppLayout';
import { useAuth } from './authContext';
import { DEFAULT_CLUB_ID } from './clubs';
import { useBooks } from '../data/useBooks';
import { usePersonalReads } from '../data/usePersonalReads';
import { useClubDoc, useClubMembership, useMyClubLibraries } from '../data/useClub';
import { myLibrary } from '../features/personal/readAdapter';
import Loading from '../ui/Loading';
import LandingPage from '../features/landing/LandingPage';
import JoinPage from '../features/landing/JoinPage';
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

// A reader's own library: their personal log plus the finished books of every
// club that links their email in its roster. The union is computed here and
// never stored — a club book belongs to the club, and only appears here
// because the reader was part of reading it.
function LibraryLayout() {
  const { ownerEmail, clubs, ready } = useAuth();
  const { reads, loading, error } = usePersonalReads(ownerEmail);
  const clubIds = useMemo(() => Object.keys(clubs), [clubs]);
  const { libraries, loading: clubsLoading } = useMyClubLibraries(clubIds, ownerEmail);

  const items = useMemo(
    () => myLibrary(reads, libraries, ownerEmail),
    [reads, libraries, ownerEmail]
  );

  if (!ready) return <Loading label="Abriendo tu biblioteca…" />;
  if (!ownerEmail) return <Navigate to="/" replace />;

  return (
    <Outlet
      context={{ ownerEmail, reads, items, loading: loading || clubsLoading, error }}
    />
  );
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
            <Route path="join/:inviteCode" element={<JoinPage />} />

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
