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
      <defs>
        <linearGradient id="flamingoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff1a75" />
          <stop offset="100%" stopColor="#ff6b35" />
        </linearGradient>
      </defs>

      {/* Graceful S-Neck and Head */}
      <path 
        d="M33 16 C37 16, 40 18, 39 22 C38 25, 34 26, 33 30 C32 34, 36 38, 38 42" 
        stroke="url(#flamingoGradient)"
        strokeWidth="3.5" 
      />
      
      {/* Beak / Bill */}
      <path 
        d="M39 21.5 L43 22 C45 22.5, 45 24, 43 24.5 L38 25" 
        fill="#ff6b35" 
        stroke="none" 
      />
      
      {/* Oval Flamingo Body */}
      <path 
        d="M20 42 C20 35, 38 35, 38 42 C38 49, 20 49, 20 42 Z" 
        fill="url(#flamingoGradient)" 
        stroke="url(#flamingoGradient)"
        strokeWidth="1.5"
        fillOpacity="0.8"
      />
      
      {/* Decorative Wing Feather curve */}
      <path 
        d="M24 42 C26 40, 31 40, 33 43" 
        stroke="#ffffff"
        strokeWidth="2" 
        opacity="0.85" 
      />
      
      {/* Standing Leg */}
      <line x1="26" y1="48" x2="26" y2="57" stroke="#00f0ff" strokeWidth="3" />
      
      {/* Bent Leg (Forming a number 4 shape) */}
      <path 
        d="M31 48 L31 52.5 L26 52.5" 
        stroke="#00f0ff"
        strokeWidth="2.5" 
      />
    </svg>
  );
}
