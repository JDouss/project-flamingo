import React, { useState, useMemo } from 'react';
import { X, TrendingUp, Users, BookOpen, Star, Sparkles, Award } from 'lucide-react';

export default function ClubDashboard({ isOpen, onClose, books = [] }) {
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter completed books with grades
  const gradedBooks = useMemo(() => {
    return books
      .filter(b => b.status === 'completed' && b.grades && Object.keys({ ...b.grades.start, ...b.grades.end }).length > 0)
      .sort((a, b) => new Date(a.endDate || a.createdAt) - new Date(b.endDate || b.createdAt));
  }, [books]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (gradedBooks.length === 0) return null;

    let totalStartSum = 0;
    let totalStartCount = 0;
    let totalEndSum = 0;
    let totalEndCount = 0;

    const memberStats = {}; // { Jaime: { startSum: 0, startCount: 0, endSum: 0, endCount: 0 } }

    gradedBooks.forEach(b => {
      const start = b.grades.start || {};
      const end = b.grades.end || {};
      
      Object.keys({ ...start, ...end }).forEach(m => {
        if (!memberStats[m]) {
          memberStats[m] = { startSum: 0, startCount: 0, endSum: 0, endCount: 0 };
        }

        const startVal = start[m];
        if (typeof startVal === 'number') {
          totalStartSum += startVal;
          totalStartCount++;
          memberStats[m].startSum += startVal;
          memberStats[m].startCount++;
        }

        const endVal = end[m];
        if (typeof endVal === 'number') {
          totalEndSum += endVal;
          totalEndCount++;
          memberStats[m].endSum += endVal;
          memberStats[m].endCount++;
        }
      });
    });

    const overallStartAvg = totalStartCount ? (totalStartSum / totalStartCount) : 0;
    const overallEndAvg = totalEndCount ? (totalEndSum / totalEndCount) : 0;

    // Calculate member averages
    const memberAverages = Object.keys(memberStats).map(name => {
      const s = memberStats[name];
      const startAvg = s.startCount ? (s.startSum / s.startCount) : 0;
      const endAvg = s.endCount ? (s.endSum / s.endCount) : 0;
      return {
        name,
        startAvg,
        endAvg,
        delta: endAvg - startAvg,
        count: s.endCount || s.startCount
      };
    });

    // Find special members
    let enthusiast = null;
    let critic = null;
    let developer = null; // member with highest delta

    if (memberAverages.length > 0) {
      enthusiast = [...memberAverages].sort((a, b) => b.endAvg - a.endAvg)[0];
      critic = [...memberAverages].sort((a, b) => a.endAvg - b.endAvg)[0];
      developer = [...memberAverages].sort((a, b) => b.delta - a.delta)[0];
    }

    // Find best book
    const bestBook = [...gradedBooks].map(b => {
      const vals = Object.values(b.grades.end || {}).filter(v => typeof v === 'number');
      const avg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
      return { book: b, avg };
    }).sort((a, b) => b.avg - a.avg)[0];

    return {
      overallStartAvg,
      overallEndAvg,
      memberAverages,
      enthusiast,
      critic,
      developer,
      bestBook
    };
  }, [gradedBooks]);

  // Sort books for table representation
  const sortedTableBooks = useMemo(() => {
    if (!stats) return [];
    
    const mapped = gradedBooks.map(b => {
      const startVals = Object.values(b.grades.start || {}).filter(v => typeof v === 'number');
      const endVals = Object.values(b.grades.end || {}).filter(v => typeof v === 'number');
      const startAvg = startVals.length ? (startVals.reduce((a, b) => a + b, 0) / startVals.length) : 0;
      const endAvg = endVals.length ? (endVals.reduce((a, b) => a + b, 0) / endVals.length) : 0;
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        date: b.endDate || b.createdAt,
        startAvg,
        endAvg,
        delta: endAvg - startAvg
      };
    });

    return mapped.sort((a, b) => {
      let fA = a[sortField];
      let fB = b[sortField];
      if (typeof fA === 'string') {
        return sortAsc ? fA.localeCompare(fB) : fB.localeCompare(fA);
      }
      return sortAsc ? fA - fB : fB - fA;
    });
  }, [gradedBooks, sortField, sortAsc, stats]);

  if (!isOpen) return null;

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" style={{ maxWidth: '800px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>Panel de Estadísticas Flamingo</h3>
          </div>
          <button className="voice-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="voice-assistant-body" style={{ textAlign: 'left' }}>
          
          {gradedBooks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1.5rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
              <BookOpen size={44} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '1rem' }} />
              <h4 className="serif-title" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>Aún no hay estadísticas disponibles</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
                Necesitamos que al menos un libro en tu estantería esté marcado como **Leído** y tenga calificaciones individuales de la reunión guardadas.
              </p>
            </div>
          ) : stats ? (
            <>
              {/* Highlight Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                
                {/* Average club score card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PROMEDIO DEL CLUB</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--sage)' }}>{stats.overallEndAvg.toFixed(1)}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Inicial: {stats.overallStartAvg.toFixed(1)} (Evolución: +{(stats.overallEndAvg - stats.overallStartAvg).toFixed(1)})
                  </span>
                </div>

                {/* Best book card */}
                {stats.bestBook && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Award size={12} style={{ color: '#fbbf24' }} /> LIBRO FAVORITO
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stats.bestBook.book.title}>
                      {stats.bestBook.book.title}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Nota media del debate: <strong style={{ color: 'var(--primary)' }}>{stats.bestBook.avg.toFixed(1)}</strong>
                    </span>
                  </div>
                )}

                {/* Enthusiast card */}
                {stats.enthusiast && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MÁS ENTUSIASTA</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{stats.enthusiast.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Promedio final: <strong style={{ color: 'var(--sage)' }}>{stats.enthusiast.endAvg.toFixed(1)}</strong>
                    </span>
                  </div>
                )}

                {/* Critic card */}
                {stats.critic && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MÁS EXIGENTE</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{stats.critic.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Promedio final: <strong style={{ color: 'var(--accent-coral)' }}>{stats.critic.endAvg.toFixed(1)}</strong>
                    </span>
                  </div>
                )}

              </div>

              {/* Timeline Evolution (Area Chart SVG) */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
                <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={16} /> Evolución del Club en el Tiempo
                </h4>
                
                <div style={{ overflowX: 'auto' }}>
                  <svg width="100%" height="220" viewBox="0 0 650 220" style={{ display: 'block', margin: '0 auto', minWidth: '550px' }}>
                    <defs>
                      <linearGradient id="areaStartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="areaEndGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gridlines */}
                    {[2, 4, 6, 8, 10].map(val => {
                      const y = 180 - (val * 15);
                      return (
                        <g key={val}>
                          <line x1="45" y1={y} x2="620" y2={y} stroke="rgba(255,255,255,0.05)" />
                          <text x="35" y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{val}</text>
                        </g>
                      );
                    })}

                    {/* Construct paths for lines */}
                    {(() => {
                      const points = gradedBooks.map((b, idx) => {
                        const x = 60 + idx * (gradedBooks.length > 1 ? (540 / (gradedBooks.length - 1)) : 540);
                        
                        const startVals = Object.values(b.grades.start || {}).filter(v => typeof v === 'number');
                        const endVals = Object.values(b.grades.end || {}).filter(v => typeof v === 'number');
                        const startAvg = startVals.length ? startVals.reduce((x, y) => x + y, 0) / startVals.length : 0;
                        const endAvg = endVals.length ? endVals.reduce((x, y) => x + y, 0) / endVals.length : 0;
                        
                        return {
                          x,
                          startY: 180 - (startAvg * 15),
                          endY: 180 - (endAvg * 15),
                          title: b.title,
                          startAvg,
                          endAvg
                        };
                      });

                      if (points.length === 0) return null;

                      // Build line d strings
                      let startLineD = `M ${points[0].x} ${points[0].startY}`;
                      let endLineD = `M ${points[0].x} ${points[0].endY}`;
                      for (let i = 1; i < points.length; i++) {
                        startLineD += ` L ${points[i].x} ${points[i].startY}`;
                        endLineD += ` L ${points[i].x} ${points[i].endY}`;
                      }

                      // Build area d strings (close the path to the baseline y=180)
                      const startAreaD = `${startLineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;
                      const endAreaD = `${endLineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

                      return (
                        <g>
                          {/* Areas */}
                          <path d={startAreaD} fill="url(#areaStartGrad)" />
                          <path d={endAreaD} fill="url(#areaEndGrad)" />

                          {/* Lines */}
                          <path d={startLineD} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d={endLineD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                          {/* Circles & Labels */}
                          {points.map((p, idx) => (
                            <g key={idx}>
                              {/* vertical indicator */}
                              <line x1={p.x} y1="180" x2={p.x} y2={Math.min(p.startY, p.endY) - 5} stroke="rgba(255,255,255,0.03)" />
                              
                              {/* Start point circle */}
                              <circle cx={p.x} cy={p.startY} r="3.5" fill="#f59e0b" stroke="var(--bg-card)" strokeWidth="1" />
                              
                              {/* End point circle */}
                              <circle cx={p.x} cy={p.endY} r="4.5" fill="#10b981" stroke="var(--bg-card)" strokeWidth="1" />
                              
                              {/* Text label underneath */}
                              <text x={p.x} y="196" fill="var(--text-primary)" fontSize="8.5" fontWeight="bold" textAnchor="middle" transform={`rotate(-15, ${p.x}, 196)`} style={{ maxWidth: '75px', overflow: 'hidden' }}>
                                {p.title.length > 9 ? p.title.substring(0, 8) + '..' : p.title}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })()}

                    {/* Baseline */}
                    <line x1="45" y1="180" x2="620" y2="180" stroke="var(--border)" strokeWidth="1" />
                    
                    {/* Legend */}
                    <g transform="translate(480, 10)">
                      <line x1="0" y1="5" x2="15" y2="5" stroke="#f59e0b" strokeWidth="2" />
                      <circle cx="7.5" cy="5" r="2.5" fill="#f59e0b" />
                      <text x="20" y="8" fill="var(--text-muted)" fontSize="9">Nota Inicial</text>
                      
                      <line x1="0" y1="18" x2="15" y2="18" stroke="#10b981" strokeWidth="2" />
                      <circle cx="7.5" cy="18" r="3" fill="#10b981" />
                      <text x="20" y="21" fill="var(--text-muted)" fontSize="9">Nota Final</text>
                    </g>
                  </svg>
                </div>
              </div>

              {/* Members Scoring Profile Chart (SVG Grouped Bars) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
                  <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={16} /> Perfil Calificador de Miembros
                  </h4>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <svg width="100%" height="220" viewBox="0 0 350 220" style={{ display: 'block', margin: '0 auto', minWidth: '300px' }}>
                      {/* Gridlines */}
                      {[2, 4, 6, 8, 10].map(val => {
                        const y = 170 - (val * 14);
                        return (
                          <g key={val}>
                            <line x1="40" y1={y} x2="330" y2={y} stroke="rgba(255,255,255,0.05)" />
                            <text x="30" y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{val}</text>
                          </g>
                        );
                      })}

                      {/* Bar groups */}
                      {stats.memberAverages.map((m, idx) => {
                        const xBase = 50 + idx * 56;
                        const sHeight = m.startAvg * 14;
                        const eHeight = m.endAvg * 14;
                        const sY = 170 - sHeight;
                        const eY = 170 - eHeight;

                        return (
                          <g key={m.name}>
                            {/* Start bar */}
                            <rect x={xBase} y={sY} width="12" height={sHeight} fill="#f59e0b" rx="2" />
                            <text x={xBase + 6} y={sY - 4} fill="var(--text-primary)" fontSize="8.5" fontWeight="bold" textAnchor="middle">
                              {m.startAvg.toFixed(1)}
                            </text>

                            {/* End bar */}
                            <rect x={xBase + 14} y={eY} width="12" height={eHeight} fill="#10b981" rx="2" />
                            <text x={xBase + 20} y={eY - 4} fill="var(--text-primary)" fontSize="8.5" fontWeight="bold" textAnchor="middle">
                              {m.endAvg.toFixed(1)}
                            </text>

                            {/* Label */}
                            <text x={xBase + 13} y="186" fill="var(--text-primary)" fontSize="9.5" fontWeight="bold" textAnchor="middle">
                              {m.name}
                            </text>
                          </g>
                        );
                      })}

                      <line x1="40" y1="170" x2="330" y2="170" stroke="var(--border)" strokeWidth="1" />
                      
                      <g transform="translate(180, 198)">
                        <rect x="0" y="0" width="8" height="8" fill="#f59e0b" rx="2" />
                        <text x="12" y="8" fill="var(--text-muted)" fontSize="8.5">Nota Inicial</text>
                        <rect x="70" y="0" width="8" height="8" fill="#10b981" rx="2" />
                        <text x="82" y="8" fill="var(--text-muted)" fontSize="8.5">Nota Final</text>
                      </g>
                    </svg>
                  </div>
                </div>

                {/* Evolution Ranking */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
                  <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <TrendingUp size={16} /> Impacto del Debate en los Miembros
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', lineHeight: '1.4' }}>
                    Muestra el incremento promedio en la calificación de cada miembro tras participar en el debate de las sesiones.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, justifyContent: 'center' }}>
                    {stats.memberAverages
                      .sort((a, b) => b.delta - a.delta)
                      .map(m => {
                        const isPositive = m.delta >= 0;
                        return (
                          <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{m.name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Participó en {m.count} debates</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isPositive ? 'var(--sage)' : 'var(--accent-coral)' }}>
                                {isPositive ? `+${m.delta.toFixed(1)}` : m.delta.toFixed(1)} pts
                              </span>
                              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>de cambio medio</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

              </div>

              {/* Table of graded books */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
                <h4 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '1rem', color: 'var(--primary)' }}>
                  Detalle de Sesiones por Libro
                </h4>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' }}>
                        <th style={{ padding: '0.75rem 0.5rem' }} onClick={() => toggleSort('title')}>Libro {sortField === 'title' ? (sortAsc ? '▲' : '▼') : ''}</th>
                        <th style={{ padding: '0.75rem 0.5rem' }} onClick={() => toggleSort('author')}>Autor {sortField === 'author' ? (sortAsc ? '▲' : '▼') : ''}</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} onClick={() => toggleSort('date')}>Fecha {sortField === 'date' ? (sortAsc ? '▲' : '▼') : ''}</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} onClick={() => toggleSort('startAvg')}>Media Inicial {sortField === 'startAvg' ? (sortAsc ? '▲' : '▼') : ''}</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} onClick={() => toggleSort('endAvg')}>Media Final {sortField === 'endAvg' ? (sortAsc ? '▲' : '▼') : ''}</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }} onClick={() => toggleSort('delta')}>Evolución {sortField === 'delta' ? (sortAsc ? '▲' : '▼') : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTableBooks.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>{b.title}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{b.author}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {new Date(b.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#fb923c', fontWeight: 'bold' }}>{b.startAvg.toFixed(1)}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#34d399', fontWeight: 'bold' }}>{b.endAvg.toFixed(1)}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 'bold', color: b.delta >= 0 ? '#34d399' : '#fb7185' }}>
                            {b.delta >= 0 ? `+${b.delta.toFixed(1)}` : b.delta.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="voice-assistant-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar Dashboard
          </button>
        </div>
      </div>
    </>
  );
}
