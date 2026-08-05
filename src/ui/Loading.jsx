import { OpenBook } from './ornaments';

export default function Loading({ label = 'Abriendo la biblioteca…' }) {
  return (
    <div className="loading-container">
      <OpenBook size={72} className="loading-book" />
      <p
        className="serif-title"
        style={{ fontSize: '1.05rem', color: 'var(--text-muted)', fontStyle: 'italic' }}
      >
        {label}
      </p>
    </div>
  );
}
