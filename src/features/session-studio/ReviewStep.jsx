import { useState } from 'react';
import { Sparkles, Volume2, Check, AlertTriangle } from 'lucide-react';
import { renderMarkdown } from '../../utils/markdown';
import { publishSessionAsNewBook, publishSessionToBook, updateSessionDraft, reopenGrading } from '../../data/mutations';

// Human-in-the-loop review of a pipeline draft: the admin corrects what the
// AI produced (metadata, grades, session memory) and blesses it into a book
// review — either a new one or an existing one.
export default function ReviewStep({ clubId, session, books, onPublished, onDiscard }) {
  const initial = session.analysis || {};
  const [bookTitle, setBookTitle] = useState(initial.bookTitle || '');
  const [bookAuthor, setBookAuthor] = useState(initial.bookAuthor || '');
  const [genre, setGenre] = useState(initial.genre || 'Debate');
  const [sessionLabel, setSessionLabel] = useState(
    initial.sessionLabel || `Sesión ${books.length + 1}`
  );
  const [generalSummary, setGeneralSummary] = useState(initial.generalSummary || '');
  const [sessionSummaryMarkdown, setSessionSummaryMarkdown] = useState(initial.sessionSummaryMarkdown || '');
  const [grades, setGrades] = useState(initial.grades || { start: {}, end: {} });
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [targetBookId, setTargetBookId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const memberNames = [...new Set([
    ...Object.keys(grades.start || {}),
    ...Object.keys(grades.end || {}),
  ])];

  const editedAnalysis = () => ({
    ...initial,
    bookTitle,
    bookAuthor,
    genre,
    sessionLabel,
    generalSummary,
    sessionSummaryMarkdown,
    grades,
  });

  const handleGradeChange = (phase, member, value) => {
    const val = value === '' ? '' : Number(value);
    setGrades((prev) => ({
      ...prev,
      [phase]: { ...prev[phase], [member]: val },
    }));
  };

  const handlePublish = async (mode) => {
    setErrorMsg('');
    setPublishing(true);
    try {
      const analysis = editedAnalysis();
      // Persist the reviewed analysis on the session first, then publish.
      await updateSessionDraft(clubId, session.id, analysis);
      if (mode === 'new') {
        await publishSessionAsNewBook(clubId, session, analysis);
      } else {
        const book = books.find((b) => b.id === targetBookId);
        if (!book) throw new Error('Selecciona una reseña de destino.');
        await publishSessionToBook(clubId, session, analysis, book);
      }
      onPublished();
    } catch (err) {
      console.error('Publish failed:', err);
      setErrorMsg(err.message || 'Error al publicar la sesión.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={{ marginTop: '0.5rem', textAlign: 'left' }}>
      <h4 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary)' }}>
        Revisar borrador de la sesión
      </h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        La IA ha transcrito y analizado la grabación. Revisa y corrige lo que necesites antes de publicar.
      </p>

      {errorMsg && (
        <div className="voice-alert-danger">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Audio player */}
      {session.audioUrl && (
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          marginBottom: '1.25rem'
        }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Volume2 size={14} /> GRABACIÓN DE LA SESIÓN — {session.audioName}
          </p>
          <audio src={session.audioUrl} controls style={{ width: '100%' }} />
        </div>
      )}

      {/* Deduced book metadata */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Título del libro (deducido)</label>
          <input type="text" className="form-input" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="ej. La sombra del viento" />
        </div>
        <div className="form-group">
          <label className="form-label">Autor</label>
          <input type="text" className="form-input" value={bookAuthor} onChange={(e) => setBookAuthor(e.target.value)} placeholder="ej. Carlos Ruiz Zafón" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Género</label>
          <input type="text" className="form-input" value={genre} onChange={(e) => setGenre(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Sesión del club</label>
          <input
            type="text"
            className="form-input"
            value={sessionLabel}
            onChange={(e) => setSessionLabel(e.target.value)}
            placeholder="Ej. Sesión 3, Sesión especial..."
          />
        </div>
      </div>

      {/* General summary */}
      <div className="form-group">
        <label className="form-label">Resumen general de la sesión</label>
        <textarea
          className="form-input"
          style={{ minHeight: '90px' }}
          value={generalSummary}
          onChange={(e) => setGeneralSummary(e.target.value)}
        />
      </div>

      {/* Grades table */}
      {memberNames.length > 0 && (
        <div style={{ margin: '1.5rem 0' }}>
          <label className="form-label">Calificaciones detectadas (1-10)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '0.75rem', fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Miembro</span>
              <span>Nota Inicial</span>
              <span>Nota Final</span>
            </div>
            {memberNames.map((name) => (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{name}</span>
                <input
                  type="number" min="1" max="10" step="0.5" placeholder="N/D"
                  className="form-input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                  value={grades.start?.[name] ?? ''}
                  onChange={(e) => handleGradeChange('start', name, e.target.value)}
                />
                <input
                  type="number" min="1" max="10" step="0.5" placeholder="N/D"
                  className="form-input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                  value={grades.end?.[name] ?? ''}
                  onChange={(e) => handleGradeChange('end', name, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session memory markdown */}
      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Memoria del debate (Markdown, se publica en la reseña)</label>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
            onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
          >
            {showMarkdownPreview ? 'Editar' : 'Vista previa'}
          </button>
        </div>
        {showMarkdownPreview ? (
          <div className="review-text" style={{
            maxHeight: '320px', overflowY: 'auto', padding: '1rem',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.875rem', lineHeight: '1.6'
          }}>
            {renderMarkdown(sessionSummaryMarkdown)}
          </div>
        ) : (
          <textarea
            className="form-textarea"
            style={{ minHeight: '220px', fontFamily: 'monospace', fontSize: '0.8rem' }}
            value={sessionSummaryMarkdown}
            onChange={(e) => setSessionSummaryMarkdown(e.target.value)}
          />
        )}
      </div>

      {/* Transcript excerpt */}
      {session.transcriptExcerpt && (
        <details style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', marginBottom: '1.5rem'
        }}>
          <summary style={{ fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}>
            Ver inicio de la transcripción
          </summary>
          <div style={{
            marginTop: '0.75rem', maxHeight: '200px', overflowY: 'auto', padding: '0.75rem',
            background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            fontSize: '0.8rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-muted)'
          }}>
            {session.transcriptExcerpt}
            {'\n\n'}(La transcripción completa estará disponible en los detalles del libro tras publicar.)
          </div>
        </details>
      )}

      {/* Publish actions */}
      <div style={{
        border: '1px dashed var(--primary)', borderRadius: 'var(--radius-md)',
        padding: '1.25rem', background: 'var(--primary-glow)', display: 'flex', flexDirection: 'column', gap: '0.75rem'
      }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={publishing || !bookTitle.trim()}
          onClick={() => handlePublish('new')}
          style={{ width: '100%', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
        >
          <Sparkles size={16} /> Publicar como nueva reseña
        </button>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            className="form-select"
            value={targetBookId}
            onChange={(e) => setTargetBookId(e.target.value)}
            style={{ flex: 1, fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          >
            <option value="">-- O aplicar a una reseña existente --</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.title} - {b.author}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={publishing || !targetBookId}
            onClick={() => handlePublish('existing')}
            style={{ padding: '0.5rem 1.25rem', height: 'auto', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Check size={14} /> Aplicar
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
          <button
            type="button"
            onClick={onDiscard}
            disabled={publishing}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Dejar como borrador y volver
          </button>
          {(session.gradeEvents?.length > 0 || session.confirmedGrades?.length > 0) && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('¿Volver al paso de asignación de notas? El análisis se regenerará con las notas corregidas.')) return;
                await reopenGrading(clubId, session.id);
              }}
              disabled={publishing}
              style={{ background: 'none', border: 'none', color: 'var(--primary-ink)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Corregir asignación de notas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
