import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Ticket, Loader2, AlertTriangle } from 'lucide-react';
import { createClub, joinClub } from '../../data/mutations';
import { useAuth } from '../../app/authContext';

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: '1.1rem 1.25rem',
  textAlign: 'left',
};

// The two ways into a club: someone invited you, or you start your own.
// Both go through a callable and both refresh the token afterwards, because
// club access rides on a claim that the current token predates.
export default function ClubOnboarding() {
  const { refreshClubs } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (what, action) => {
    setBusy(what);
    setError('');
    try {
      const result = await action();
      await refreshClubs();
      navigate(`/club/${result.clubId}`);
    } catch (err) {
      console.error(`${what} failed:`, err);
      setError(
        err?.code === 'functions/not-found'
          ? 'Ese código de invitación no existe.'
          : err?.message || 'No se pudo completar la operación.'
      );
      setBusy('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.7rem 1rem',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <form
        style={panelStyle}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) run('join', () => joinClub(code.trim()));
        }}
      >
        <p style={{ margin: '0 0 0.6rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Ticket size={15} style={{ color: 'var(--primary)' }} /> Tengo un código de invitación
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="ABCD1234"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ flex: '1 1 10rem', letterSpacing: '0.08em' }}
          />
          <button className="btn btn-secondary" type="submit" disabled={!code.trim() || !!busy}>
            {busy === 'join' ? <Loader2 size={14} className="voice-spinner" /> : <Ticket size={14} />}
            Unirme
          </button>
        </div>
      </form>

      <form
        style={panelStyle}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run('create', () => createClub(name.trim()));
        }}
      >
        <p style={{ margin: '0 0 0.6rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Plus size={15} style={{ color: 'var(--primary)' }} /> Quiero crear un club
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="Nombre del club"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: '1 1 10rem' }}
          />
          <button className="btn btn-primary" type="submit" disabled={!name.trim() || !!busy}>
            {busy === 'create' ? <Loader2 size={14} className="voice-spinner" /> : <Plus size={14} />}
            Crear
          </button>
        </div>
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Serás su administrador, y tendrás un código para invitar a quien quieras.
        </p>
      </form>
    </div>
  );
}
