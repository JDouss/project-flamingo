import { useOutletContext } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import ClubDashboard from '../dashboard/ClubDashboard';
import Loading from '../../ui/Loading';

// The club dashboard as a page. Same numbers as the modal it replaces — the
// dashboard itself was untouched apart from losing its modal shell.
export default function ClubStatsPage() {
  const { books, loading } = useOutletContext();

  return (
    <main className="container" style={{ paddingTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Sparkles size={22} style={{ color: 'var(--primary)' }} />
        <h2 className="serif-title" style={{ fontSize: '1.6rem', margin: 0 }}>
          Panel de Estadísticas Flamingo
        </h2>
      </div>

      {loading ? <Loading label="Calculando estadísticas…" /> : <ClubDashboard books={books} />}
    </main>
  );
}
