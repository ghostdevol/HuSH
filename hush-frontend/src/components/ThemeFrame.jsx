import React from 'react';

// Visual half of the theme system (palettes live in src/themes.js):
// PatternLayer tiles a subtle SVG pattern over the profile page bg;
// Frame draws the theme's border treatment around a card without
// changing the card's own layout — safe on small screens.

const GLYPH_PATTERNS = {
  skulls: { glyph: '💀', size: 92, opacity: 0.05, fontSize: 26 },
  sparkles: { glyph: '✦', size: 54, opacity: 0.16, fontSize: 13, color: '#f9a8d4' },
  hearts: { glyph: '♥', size: 76, opacity: 0.07, fontSize: 20, color: '#fb7185' },
  butterflies: { glyph: '🦋', size: 104, opacity: 0.06, fontSize: 24 }
};

export function PatternLayer({ theme }) {
  if (!theme || theme.pattern === 'none') return null;

  if (theme.pattern === 'grid') {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,255,136,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,255,136,0.05) 1px, transparent 1px)',
          backgroundSize: '26px 26px'
        }}
      />
    );
  }
  if (theme.pattern === 'brushed') {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 5px)',
          backgroundSize: 'auto'
        }}
      />
    );
  }
  if (theme.pattern === 'diagonal') {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(148,163,184,0.04) 0 2px, transparent 2px 14px)'
        }}
      />
    );
  }
  const p = GLYPH_PATTERNS[theme.pattern];
  if (!p) return null;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${p.size}' height='${p.size}'><text x='10' y='${p.fontSize + 8}' font-size='${p.fontSize}' ${p.color ? `fill='${p.color}'` : ''} opacity='${p.opacity}'>${p.glyph}</text></svg>`;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundRepeat: 'repeat' }}
    />
  );
}

// Barbed-wire strand: two twisted lines + barb ticks, drawn once as an
// SVG and repeated along the top and bottom edge of a framed card.
function WireStrand({ flip }) {
  const barbs = Array.from({ length: 13 }, (_, i) => 14 + i * 24);
  return (
    <svg
      className="block h-[10px] w-full"
      preserveAspectRatio="none"
      viewBox="0 0 300 10"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
      aria-hidden="true"
    >
      <path d="M0 3 Q 25 0, 50 3 T 100 3 T 150 3 T 200 3 T 250 3 T 300 3" stroke="#9aa7b8" strokeWidth="1.4" fill="none" />
      <path d="M0 7 Q 25 10, 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7" stroke="#6b7686" strokeWidth="1.4" fill="none" />
      {barbs.map((x) => (
        <g key={x} stroke="#c3cedd" strokeWidth="1.3">
          <line x1={x - 3} y1={1} x2={x + 3} y2={9} />
          <line x1={x - 3} y1={9} x2={x + 3} y2={1} />
        </g>
      ))}
    </svg>
  );
}

const CORNER_GLYPHS = {
  skulls: '💀',
  glitter: '✨',
  hearts: '🌹',
  butterfly: '🦋'
};

// Frame: wraps a card with the theme's edge treatment. The card keeps
// its own sizing; the frame is absolutely-positioned decoration plus
// a themed border color, so layout never shifts.
export default function Frame({ theme, children, className = '' }) {
  if (!theme) return <div className={className}>{children}</div>;
  const borderStyle = { borderColor: theme.frameColor };

  if (theme.frame === 'wire') {
    return (
      <div className={`relative ${className}`}>
        <WireStrand />
        <div className="border-x" style={borderStyle}>{children}</div>
        <WireStrand flip />
      </div>
    );
  }
  if (theme.frame === 'corners') {
    const glyph = CORNER_GLYPHS[theme.id] || '✦';
    const corner = 'pointer-events-none absolute z-10 text-sm leading-none [filter:drop-shadow(0_2px_6px_rgba(0,0,0,0.75))]';
    return (
      <div className={`relative rounded-2xl border shadow-xl shadow-black/30`} style={borderStyle}>
        <span className={`${corner} -left-1.5 -top-1.5`}>{glyph}</span>
        <span className={`${corner} -right-1.5 -top-1.5`}>{glyph}</span>
        <span className={`${corner} -bottom-1.5 -left-1.5`}>{glyph}</span>
        <span className={`${corner} -bottom-1.5 -right-1.5`}>{glyph}</span>
        <div className={className}>{children}</div>
      </div>
    );
  }
  if (theme.frame === 'terminal') {
    return (
      <div className="relative rounded-md border" style={borderStyle}>
        <span className="pointer-events-none absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2" style={borderStyle} />
        <span className="pointer-events-none absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2" style={borderStyle} />
        <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2" style={borderStyle} />
        <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2" style={borderStyle} />
        <div className={className}>{children}</div>
      </div>
    );
  }
  if (theme.frame === 'stripe') {
    return (
      <div className="relative overflow-hidden rounded-2xl border shadow-xl shadow-black/30" style={borderStyle}>
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }} />
        <div className={className}>{children}</div>
      </div>
    );
  }
  // plain
  return (
    <div className="rounded-2xl border shadow-xl shadow-black/30" style={borderStyle}>
      <div className={className}>{children}</div>
    </div>
  );
}
