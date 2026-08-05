import { useState, useEffect } from 'react';
import { User, Save, Loader2, Plus, Trash2, Link2 } from 'lucide-react';
import { useRoster } from '../../data/useClub';

// The club roster: the humans who appear in the grade tables, plus the persona
// hints the AI uses when attributing opinions. Stored as an array on the club
// document — it is small, read as a unit by the pipeline, and edited as a unit
// here.
//
// Grades are keyed by roster NAME, permanently. Renaming an entry relabels who
// shows up in future tables; it does not rewrite the grades already recorded
// under the old name, and nothing here ever touches them.
export default function MembersRegistry({ clubId }) {
  const { roster, loading, saveRoster } = useRoster(clubId);
  const [drafts, setDrafts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDrafts(roster);
  }, [roster]);

  const updateDraft = (index, field, value) => {
    setDrafts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addEntry = () => setDrafts((prev) => [...prev, { name: '', personaHint: '', email: null }]);

  const removeEntry = (index) => setDrafts((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    const cleaned = drafts
      .map((d) => ({
        name: (d.name || '').trim(),
        personaHint: (d.personaHint || '').trim(),
        email: d.email ? d.email.trim().toLowerCase() : null,
      }))
      .filter((d) => d.name);

    // Names are the key the grades are stored under, so two entries sharing
    // one would make "my grades" ambiguous for ever.
    const names = cleaned.map((d) => d.name);
    const duplicate = names.find((n, i) => names.indexOf(n) !== i);
    if (duplicate) {
      setError(`Hay dos entradas con el nombre "${duplicate}". Los nombres deben ser únicos.`);
      return;
    }

    // Likewise for emails: an account linked to two roster entries would make
    // "my grade" ambiguous in that reader's own library.
    const emails = cleaned.map((d) => d.email).filter(Boolean);
    const duplicateEmail = emails.find((e, i) => emails.indexOf(e) !== i);
    if (duplicateEmail) {
      setError(`El email ${duplicateEmail} está enlazado a dos personas del roster.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveRoster(cleaned);
    } catch (err) {
      console.error('Failed to save roster:', err);
      setError('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0' }}>
        <Loader2 className="voice-spinner" size={24} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Cargando miembros...</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <h4 className="serif-title" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
        Registro de Miembros del Club
      </h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Los nombres son la clave con la que se guardan las notas de cada sesión: cámbialos
        sólo si sabes lo que haces. El rasgo ayuda a la IA a atribuir opiniones. Y el email
        enlaza a esa persona con su cuenta: a partir de ahí, los libros del club aparecen en
        <strong> su biblioteca</strong> con la nota que puso en la sesión.
      </p>

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
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {drafts.map((entry, index) => (
          <div
            key={index}
            className="glass-card"
            style={{ display: 'flex', gap: '0.5rem', padding: '0.7rem 0.85rem', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <User size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              className="form-input"
              placeholder="Nombre"
              value={entry.name || ''}
              onChange={(e) => updateDraft(index, 'name', e.target.value)}
              style={{ flex: '1 1 8rem', fontSize: '0.85rem' }}
            />
            <input
              className="form-input"
              placeholder="Rasgo lector (opcional)"
              value={entry.personaHint || ''}
              onChange={(e) => updateDraft(index, 'personaHint', e.target.value)}
              style={{ flex: '2 1 12rem', fontSize: '0.85rem' }}
            />
            <span
              title="Email de su cuenta — enlaza sus notas con su biblioteca"
              style={{ display: 'inline-flex', alignItems: 'center', flex: '1 1 12rem', gap: '0.35rem' }}
            >
              <Link2 size={13} style={{ color: entry.email ? 'var(--sage)' : 'var(--text-muted)', flexShrink: 0 }} />
              <input
                className="form-input"
                type="email"
                placeholder="email (opcional)"
                value={entry.email || ''}
                onChange={(e) => updateDraft(index, 'email', e.target.value)}
                style={{ width: '100%', fontSize: '0.85rem' }}
              />
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => removeEntry(index)}
              title="Quitar del roster"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={addEntry}>
          <Plus size={14} /> Añadir persona
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="voice-spinner" size={14} /> : <Save size={14} />}
          Guardar roster
        </button>
      </div>
    </div>
  );
}
