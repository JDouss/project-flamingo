import { useMemo } from 'react';
import { BookOpen, Star, TrendingUp, Award, FileText, Globe } from 'lucide-react';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function StatTile({ icon, label, value, hint }) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--primary)', marginBottom: '0.35rem' }}>
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary-ink)' }}>{value}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </p>
      {hint && <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

// Simple horizontal bar — the club dashboard uses the same visual language,
// and a chart library would be the only dependency in the project.
function Bar({ label, value, max, caption }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
      <span style={{ width: '5.5rem', flexShrink: 0, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ flex: 1, height: '8px', background: 'rgba(42,26,46,0.07)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }} />
      </div>
      <span style={{ width: '3.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
        {caption ?? value}
      </span>
    </div>
  );
}

// Stats over the whole library: personal reads and club reads together.
// Rating aggregates use MY grade, never the club's average — these numbers are
// mine. A club book I never graded still counts as read, and still contributes
// its pages and its country; it just has no rating to average.
export default function PersonalStats({ items }) {
  const reads = items;
  const stats = useMemo(() => {
    const finished = reads.filter((r) => r.status === 'completed');
    const rated = finished.filter((r) => r.myRating != null);

    const avg = rated.length
      ? rated.reduce((sum, r) => sum + r.myRating, 0) / rated.length
      : null;

    const thisYear = new Date().getFullYear();
    const yearOf = (r) => {
      const d = r.finishedAt || r.startDate || r.createdAt;
      return d ? new Date(d).getFullYear() : null;
    };
    const finishedThisYear = finished.filter((r) => yearOf(r) === thisYear).length;
    const finishedLastYear = finished.filter((r) => yearOf(r) === thisYear - 1).length;

    // Reads per month for the current year.
    const perMonth = Array(12).fill(0);
    finished.forEach((r) => {
      if (yearOf(r) !== thisYear) return;
      const d = new Date(r.finishedAt || r.startDate || r.createdAt);
      if (!isNaN(d)) perMonth[d.getMonth()] += 1;
    });

    const genres = {};
    finished.forEach((r) => {
      const key = (r.genre || '').trim() || 'Sin género';
      if (!genres[key]) genres[key] = { count: 0, sum: 0, rated: 0 };
      genres[key].count += 1;
      if (r.myRating != null) {
        genres[key].sum += r.myRating;
        genres[key].rated += 1;
      }
    });
    const genreRows = Object.entries(genres)
      .map(([name, g]) => ({ name, count: g.count, avg: g.rated ? g.sum / g.rated : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Bibliographic aggregates — the reason the optional fields are worth
    // filling in. Books missing a value simply do not contribute.
    const totalPages = finished.reduce(
      (sum, r) => sum + (Number(r.pages) > 0 ? Number(r.pages) : 0),
      0
    );
    const countries = new Set(
      finished.map((r) => (r.country || '').trim()).filter(Boolean)
    );

    // Where my reading comes from: my own log, and each club I read with.
    const sources = {};
    finished.forEach((r) => {
      const key = r.clubName || 'Mis lecturas';
      if (!sources[key]) sources[key] = { count: 0, sum: 0, rated: 0 };
      sources[key].count += 1;
      if (r.myRating != null) {
        sources[key].sum += r.myRating;
        sources[key].rated += 1;
      }
    });
    const sourceRows = Object.entries(sources)
      .map(([name, g]) => ({ name, count: g.count, avg: g.rated ? g.sum / g.rated : null }))
      .sort((a, b) => b.count - a.count);

    const best = [...rated].sort((a, b) => b.myRating - a.myRating)[0] || null;
    const withNotes = reads.filter((r) => r.insights).length;

    return {
      total: reads.length,
      finished: finished.length,
      reading: reads.filter((r) => r.status === 'reading').length,
      abandoned: reads.filter((r) => r.status === 'abandoned').length,
      avg,
      finishedThisYear,
      finishedLastYear,
      perMonth,
      genreRows,
      sourceRows,
      best,
      withNotes,
      totalPages,
      countries: countries.size,
    };
  }, [reads]);

  if (reads.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
        <p className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>
          Todavía no hay nada que medir
        </p>
        <p style={{ fontSize: '0.9rem' }}>Registra tu primera lectura y las estadísticas aparecerán aquí.</p>
      </div>
    );
  }

  const maxMonth = Math.max(...stats.perMonth, 1);
  const maxGenre = Math.max(...stats.genreRows.map((g) => g.count), 1);
  const maxSource = Math.max(...stats.sourceRows.map((r) => r.count), 1);
  const yearDelta = stats.finishedThisYear - stats.finishedLastYear;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
        <StatTile
          icon={<BookOpen size={18} />}
          label="LIBROS TERMINADOS"
          value={stats.finished}
          hint={stats.reading > 0 ? `${stats.reading} en curso` : null}
        />
        <StatTile
          icon={<Star size={18} />}
          label="NOTA MEDIA"
          value={stats.avg != null ? stats.avg.toFixed(1) : '—'}
          hint={stats.avg != null ? 'sobre 10' : 'sin notas aún'}
        />
        <StatTile
          icon={<TrendingUp size={18} />}
          label={`EN ${new Date().getFullYear()}`}
          value={stats.finishedThisYear}
          hint={
            stats.finishedLastYear > 0
              ? `${yearDelta >= 0 ? '+' : ''}${yearDelta} vs. el año pasado`
              : null
          }
        />
        <StatTile
          icon={<Award size={18} />}
          label="CON NOTA DE VOZ"
          value={stats.withNotes}
          hint={`de ${stats.total} lecturas`}
        />
        {stats.totalPages > 0 && (
          <StatTile
            icon={<FileText size={18} />}
            label="PÁGINAS LEÍDAS"
            value={stats.totalPages.toLocaleString('es-ES')}
            hint="en libros terminados"
          />
        )}
        {stats.countries > 0 && (
          <StatTile
            icon={<Globe size={18} />}
            label="PAÍSES"
            value={stats.countries}
            hint="de origen"
          />
        )}
      </div>

      {stats.best && (
        <div
          style={{
            padding: '1.25rem',
            border: '1px dashed var(--primary)',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(214, 130, 134, 0.03)',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            TU MEJOR LECTURA
          </p>
          <p className="serif-title" style={{ margin: '0.35rem 0 0', fontSize: '1.25rem' }}>
            {stats.best.title}
            {stats.best.author ? ` · ${stats.best.author}` : ''}
          </p>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--primary)', fontWeight: 700 }}>
            {stats.best.myRating.toFixed(1)} / 10
          </p>
        </div>
      )}

      <div>
        <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.85rem' }}>
          Lecturas por mes ({new Date().getFullYear()})
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {stats.perMonth.map((count, i) => (
            <Bar key={MONTHS[i]} label={MONTHS[i]} value={count} max={maxMonth} />
          ))}
        </div>
      </div>

      <div>
        <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.85rem' }}>
          Por género
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {stats.genreRows.map((g) => (
            <Bar
              key={g.name}
              label={g.name}
              value={g.count}
              max={maxGenre}
              caption={g.avg != null ? `${g.count} · ${g.avg.toFixed(1)}` : `${g.count}`}
            />
          ))}
        </div>
      </div>

      {stats.sourceRows.length > 1 && (
        <div>
          <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.85rem' }}>
            Por origen
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {stats.sourceRows.map((row) => (
              <Bar
                key={row.name}
                label={row.name}
                value={row.count}
                max={maxSource}
                caption={row.avg != null ? `${row.count} · ${row.avg.toFixed(1)}` : `${row.count}`}
              />
            ))}
          </div>
          <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            La media es siempre <strong>tu</strong> nota, no la del club.
          </p>
        </div>
      )}
    </div>
  );
}
