import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Error Boundary to catch React render errors and display them visually
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('React ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'sans-serif',
          color: '#333',
          maxWidth: '600px',
          margin: '4rem auto'
        }}>
          <h1 style={{ color: '#e74c3c' }}>Algo salió mal</h1>
          <p>La aplicación encontró un error inesperado.</p>
          <pre style={{
            background: '#f8f8f8',
            padding: '1rem',
            borderRadius: '8px',
            textAlign: 'left',
            overflow: 'auto',
            fontSize: '0.85rem',
            border: '1px solid #ddd'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              background: '#59b292',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (e) {
  // If even the initial render fails, show error in the DOM
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding:2rem;text-align:center;font-family:sans-serif;color:#333;max-width:600px;margin:4rem auto">
        <h1 style="color:#e74c3c">Error de Inicialización</h1>
        <p>No se pudo montar la aplicación React.</p>
        <pre style="background:#f8f8f8;padding:1rem;border-radius:8px;text-align:left;overflow:auto;font-size:0.85rem;border:1px solid #ddd">${e?.toString()}</pre>
      </div>
    `;
  }
  console.error('Fatal mount error:', e);
}
