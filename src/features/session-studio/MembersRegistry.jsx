import { useState, useEffect } from 'react';
import { User, Save, Loader2 } from 'lucide-react';
import { useMembers } from '../../data/useMembers';

// Club member registry: names + persona hints. The Cloud Function feeds the
// personas to Gemini so it can map diarized voices to real names.
export default function MembersRegistry() {
  const { members, loading, saveMember } = useMembers({ seedIfEmpty: true });
  const [drafts, setDrafts] = useState([]);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    setDrafts(members);
  }, [members]);

  const updateDraft = (index, field, value) => {
    setDrafts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSave = async (index) => {
    const member = drafts[index];
    setSavingId(member.id);
    try {
      await saveMember(member);
    } catch (err) {
      console.error('Failed to save member:', err);
      alert('Error al guardar: ' + err.message);
    } finally {
      setSavingId(null);
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
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        La IA usa el nombre y el perfil literario de cada miembro como pistas para identificar
        quién dice qué en las grabaciones de las sesiones.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {drafts.map((member, idx) => {
          const isSaving = savingId === member.id;
          return (
            <div
              key={member.id}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                textAlign: 'left'
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'var(--primary-glow)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <User size={20} />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>Nombre del Participante</label>
                  <input
                    type="text"
                    className="form-input"
                    value={member.name || ''}
                    onChange={(e) => updateDraft(idx, 'name', e.target.value)}
                    style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>Perfil / Estilo Literario (pistas para la IA)</label>
                  <textarea
                    className="form-input"
                    value={member.persona || ''}
                    onChange={(e) => updateDraft(idx, 'persona', e.target.value)}
                    placeholder="Ej. Analiza aspectos de traducción, se enfoca en ritmo..."
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', minHeight: '60px', resize: 'vertical' }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSave(idx)}
                  disabled={isSaving}
                  style={{ alignSelf: 'flex-end', padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {isSaving ? <Loader2 className="voice-spinner" size={12} /> : <Save size={12} />}
                  Guardar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
