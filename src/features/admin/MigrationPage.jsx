import { useState } from 'react';
import { DatabaseZap, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { runFlamingoMigration } from '../../data/mutations';

// TEMPORARY. Owner-only and linked from nowhere: the cutover needs the copy
// run once between two merges, and its counts checked before the frontend
// moves over. Deleted in the cleanup phase along with the callable.

function CountRow({ label, result }) {
  const matches = result && result.source === result.copied;
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{label}</td>
      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>{result?.source ?? '—'}</td>
      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>{result?.copied ?? '—'}</td>
      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: matches ? 'var(--sage)' : 'var(--danger)' }}>
        {matches ? <Check size={16} /> : <AlertTriangle size={16} />}
      </td>
    </tr>
  );
}

export default function MigrationPage() {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async () => {
    setState('running');
    setError('');
    try {
      setResult(await runFlamingoMigration());
      setState('done');
    } catch (err) {
      console.error('Migration failed:', err);
      setError(err?.message || 'La migración falló.');
      setState('error');
    }
  };

  const allMatch =
    result &&
    ['books', 'sessions', 'reads'].every((k) => result[k] && result[k].source === result[k].copied);

  return (
    <main className="container" style={{ paddingTop: '2.5rem', maxWidth: '46rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <DatabaseZap size={22} style={{ color: 'var(--primary)' }} />
        <h2 className="serif-title" style={{ fontSize: '1.6rem', margin: 0 }}>Migración a clubes</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
        Copia Flamingo Rock a la nueva estructura: <code>clubs/flamingo</code> con su
        catálogo y sus sesiones, y las lecturas personales a <code>users/{'{email}'}/reads</code>.
        Las colecciones actuales <strong>no se tocan</strong>: sólo se copian. Puedes
        ejecutarla las veces que haga falta; sobrescribe las copias y nunca borra el origen.
      </p>

      <button className="btn btn-primary" onClick={run} disabled={state === 'running'}>
        {state === 'running' ? <Loader2 size={15} className="voice-spinner" /> : <DatabaseZap size={15} />}
        {state === 'running' ? 'Migrando…' : 'Ejecutar migración'}
      </button>

      {state === 'error' && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            marginTop: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <h3 className="section-title">Recuento</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.6rem 0.5rem' }}>Colección</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Origen</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Copiados</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>OK</th>
              </tr>
            </thead>
            <tbody>
              <CountRow label="books → clubs/flamingo/books" result={result.books} />
              <CountRow label="transcriptions → clubs/flamingo/sessions" result={result.sessions} />
              <CountRow label="personal_reads → users/…/reads" result={result.reads} />
            </tbody>
          </table>

          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: allMatch ? 'var(--sage)' : 'var(--danger)' }}>
            {allMatch
              ? `Todo cuadra. Roster copiado: ${result.roster} persona(s).`
              : 'Hay diferencias entre origen y copia: revísalo antes de continuar.'}
          </p>

          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Siguiente paso manual: enlazar tu email a tu entrada del roster en
            <code> clubs/flamingo</code>, y abrir una sesión antigua, un libro con notas y
            una lectura con nota de voz para comprobar que todo se lee bien.
          </p>
        </div>
      )}
    </main>
  );
}
