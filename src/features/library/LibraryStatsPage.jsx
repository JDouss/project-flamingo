import { NavLink, useOutletContext } from 'react-router-dom';
import { List } from 'lucide-react';
import PersonalStats from '../personal/PersonalStats';
import Loading from '../../ui/Loading';
import { LibraryHeading } from './LibraryPage';

// Stats over the whole library — my own reads and the club books I was part
// of reading, counted together.
export default function LibraryStatsPage() {
  const { items, loading } = useOutletContext();

  return (
    <main className="container" style={{ paddingTop: '2.5rem' }}>
      <LibraryHeading>
        <NavLink to="/biblioteca" end className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <List size={15} /> Mis lecturas
        </NavLink>
      </LibraryHeading>

      {loading ? <Loading label="Contando tus lecturas…" /> : <PersonalStats items={items} />}
    </main>
  );
}
