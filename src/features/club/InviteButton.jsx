import { useState } from 'react';
import { Ticket, Copy, Check } from 'lucide-react';

// An invite is only useful if its admin can find it. Shows the club's code and
// the link that carries it, so joining is either "type these eight characters"
// or "open this".
export default function InviteButton({ club }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');

  if (!club?.inviteCode) return null;

  const joinUrl = `${window.location.origin}/join/${club.inviteCode}`;

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch (err) {
      // Clipboard access can be denied; the text is on screen to select.
      console.warn('Copy failed:', err);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-secondary"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Ticket size={15} /> Invitar
      </button>

      {open && (
        <div
          className="glass-card"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 0.5rem)',
            zIndex: 20,
            width: 'min(22rem, 80vw)',
            padding: '1rem',
            textAlign: 'left',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Código de invitación de <strong>{club.name}</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <code style={{ flex: 1, fontSize: '1.05rem', letterSpacing: '0.12em', fontWeight: 700 }}>
              {club.inviteCode}
            </code>
            <button
              className="btn btn-secondary btn-icon"
              title="Copiar código"
              onClick={() => copy('code', club.inviteCode)}
            >
              {copied === 'code' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            O comparte el enlace directo:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span
              style={{
                flex: 1,
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {joinUrl}
            </span>
            <button className="btn btn-secondary btn-icon" title="Copiar enlace" onClick={() => copy('url', joinUrl)}>
              {copied === 'url' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Quien lo use entra como miembro: puede leerlo todo, pero no editar el club.
          </p>
        </div>
      )}
    </div>
  );
}
