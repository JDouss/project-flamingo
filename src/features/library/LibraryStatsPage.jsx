import { NavLink, useOutletContext } from 'react-router-dom';
import { List } from 'lucide-react';
import PersonalStats from '../personal/PersonalStats';
import Loading from '../../ui/Loading';
import { LibraryHeading } from './LibraryPage';

// Personal stats as a page. P1 keeps them scoped to personal reads only;
// merging in club reads is P4's job, once the adapter produces one card shape
// for both sources.
export default function LibraryStatsPage() {
  const { reads, loading } = useOutletContext();

  return (
    <main className="container" style={{ paddingTop: '2.5rem' }}>
      <LibraryHeading>
        <NavLink to="/biblioteca" end className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <List size={15} /> Mis lecturas
        </NavLink>
      </LibraryHeading>

      {loading ? <Loading label="Contando tus lecturas…" /> : <PersonalStats reads={reads} />}
    </main>
  );
}
