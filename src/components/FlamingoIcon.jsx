import React from 'react';

export default function FlamingoIcon({ size = 32, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...props.style }}
      {...props}
    >
      {/* Graceful S-Neck and Head */}
      <path 
        d="M33 16 C37 16, 40 18, 39 22 C38 25, 34 26, 33 30 C32 34, 36 38, 38 42" 
        strokeWidth="3.5" 
      />
      
      {/* Beak / Bill */}
      <path 
        d="M39 21.5 L43 22 C45 22.5, 45 24, 43 24.5 L38 25" 
        fill="currentColor" 
        stroke="none" 
      />
      
      {/* Oval Flamingo Body */}
      <path 
        d="M20 42 C20 35, 38 35, 38 42 C38 49, 20 49, 20 42 Z" 
        fill="var(--primary-light)" 
        strokeWidth="3"
      />
      
      {/* Decorative Wing Feather curve */}
      <path 
        d="M24 42 C26 40, 31 40, 33 43" 
        strokeWidth="2" 
        opacity="0.85" 
      />
      
      {/* Standing Leg */}
      <line x1="26" y1="48" x2="26" y2="57" strokeWidth="3" />
      
      {/* Bent Leg (Forming a number 4 shape) */}
      <path 
        d="M31 48 L31 52.5 L26 52.5" 
        strokeWidth="2.5" 
      />
    </svg>
  );
}
