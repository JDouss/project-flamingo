import React, { useState } from 'react';
import { auth, googleProvider, adminEmail, authorizedEmails } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { X, LogIn, Mail, Lock, ShieldAlert } from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useEmailAuth, setUseEmailAuth] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      if (!auth || !googleProvider) {
        throw new Error('La autenticación de Firebase no está configurada o falló al inicializarse.');
      }
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // If VITE_ADMIN_EMAIL is set, enforce authorization checks on the client side
      const emailLower = user.email ? user.email.toLowerCase() : '';
      if (!authorizedEmails.includes(emailLower)) {
        // Sign out automatically if not authorized
        await auth.signOut();
        throw new Error(`No autorizado. Tu correo no está en la lista de miembros autorizados del club.`);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al autenticar con Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!auth) {
        throw new Error('La autenticación de Firebase no está configurada o falló al inicializarse.');
      }
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      const emailLower = user.email ? user.email.toLowerCase() : '';
      if (!authorizedEmails.includes(emailLower)) {
        await auth.signOut();
        throw new Error(`No autorizado. Tu correo no está en la lista de miembros autorizados del club.`);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Correo o contraseña inválidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="details-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="serif-title" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogIn size={20} className="star-filled" /> Acceso Administrador
          </h2>
          <button className="close-btn" style={{ position: 'static' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {!useEmailAuth ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
              Inicia sesión con tu cuenta de Google configurada para añadir o editar reseñas de libros.
            </p>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loading ? (
                <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderTopColor: '#000' }} />
              ) : (
                'Iniciar sesión con Google'
              )}
            </button>
            <button
              onClick={() => setUseEmailAuth(true)}
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
            >
              Usar correo / contraseña en su lugar
            </button>
          </div>
        ) : (
          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Dirección de correo</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                  placeholder="admin@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loading ? (
                <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderTopColor: '#000' }} />
              ) : (
                'Iniciar sesión'
              )}
            </button>

            <button
              type="button"
              onClick={() => setUseEmailAuth(false)}
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
            >
              Volver a inicio con Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
