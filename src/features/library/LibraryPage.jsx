import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { BookMarked, Lock, Plus, TrendingUp } from 'lucide-react';
import ReadList from '../personal/ReadList';
import PersonalReadDetails from '../personal/PersonalReadDetails';
import BookDetails from '../book-details/BookDetails';
import LogReadFlow from './LogReadFlow';
import { PERSONAL_SOURCE } from '../personal/readAdapter';

export function LibraryHeading({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <BookMarked size={22} style={{ color: 'var(--primary)' }} />
        <h2 className="serif-title" style={{ fontSize: '1.6rem', margin: 0 }}>Mi Biblioteca</h2>
        <span
          title="Sólo tú puedes ver estas lecturas"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '0.15rem 0.5rem',
          }}
        >
          <Lock size={11} /> Privado
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

// Mi Biblioteca as a page: your reads, and the flows that manage them. The
// detail modal is the same one the club shelf opens, so there is a single
// detail view rather than two that drift apart.
export default function LibraryPage() {
  const { ownerEmail, reads, items, loading, error } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();

  // The club shelf can hand a read over for editing. It travels as an id, so
  // the form opens against live data once the subscription arrives.
  const handedOverId = location.state?.editReadId ?? null;
  const [editor, setEditor] = useState(() =>
    handedOverId ? { open: true, readId: handedOverId } : { open: false, readId: null }
  );
  // Opening travels as { source, id }: a club book and a personal read can
  // share an id, and they open different detail views.
  const [detail, setDetail] = useState(null);

  // Consume the hand-off once: a reload or a back-navigation should land on
  // the list, not reopen an editor the reader already closed.
  useEffect(() => {
    if (handedOverId) navigate(location.pathname, { replace: true, state: null });
  }, [handedOverId, location.pathname, navigate]);

  // Both views follow the live list, so an open modal reflects edits and
  // pipeline progress instead of the snapshot it was opened with.
  const editingRead = editor.readId ? reads.find((r) => r.id === editor.readId) || null : null;
  const detailItem = detail
    ? items.find((i) => i.source === detail.source && i.id === detail.id) || null
    : null;

  const startEdit = (item) => {
    setDetail(null);
    setEditor({ open: true, readId: item.id });
  };

  const closeEditor = () => setEditor({ open: false, readId: null });

  return (
    <main className="container" style={{ paddingTop: '2.5rem' }}>
      <LibraryHeading>
        <NavLink to="/biblioteca/estadisticas" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <TrendingUp size={15} /> Estadísticas
        </NavLink>
        <button className="btn btn-primary" onClick={() => setEditor({ open: true, readId: null })}>
          <Plus size={15} /> Nueva lectura
        </button>
      </LibraryHeading>

      {error && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          No se pudieron cargar tus lecturas. {error.message}
        </div>
      )}

      <ReadList
        items={items}
        loading={loading}
        onOpen={(item) => setDetail({ source: item.source, id: item.id })}
        onEdit={startEdit}
      />

      {/* An edit hand-off waits for its read rather than opening a blank form. */}
      {editor.open && (!editor.readId || editingRead) && (
        <LogReadFlow ownerEmail={ownerEmail} editRead={editingRead} onClose={closeEditor} />
      )}

      {detailItem && detailItem.source === PERSONAL_SOURCE && (
        <PersonalReadDetails
          read={detailItem.read}
          ownerEmail={ownerEmail}
          onClose={() => setDetail(null)}
          onEdit={() => startEdit(detailItem)}
        />
      )}

      {/* A club book opens the club's own detail view, read-only: editing it
          belongs to the club page and its admins. */}
      {detailItem && detailItem.source !== PERSONAL_SOURCE && (
        <BookDetails
          book={detailItem.book}
          clubId={detailItem.clubId}
          isAdmin={false}
          onClose={() => setDetail(null)}
          onEdit={() => {}}
        />
      )}
    </main>
  );
}
