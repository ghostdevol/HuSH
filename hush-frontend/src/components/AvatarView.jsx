import React, { useId } from 'react';
import { API_BASE } from '../config';

// Deterministic SVG renderer for built avatars. The same spec object
// always draws the same face — no randomness, no external assets.
// Spec: { style:'builder', kind, kindColor, skin, hairStyle, hairColor,
//         eyes, mouth, accessory, bgColor }
// `kind` is the menagerie dimension (2026-10-15 beauty pass): specs
// saved before it existed have no kind and render as human, untouched.
// Slot values are validated by the backend; kind/kindColor ride along
// as additive fields (kindColor is a free hex, like bgColor).

export const AVATAR_KINDS = [
  { id: 'human', label: 'Human', icon: '🧑' },
  { id: 'ghost', label: 'Ghost', icon: '👻' },
  { id: 'skull', label: 'Skull', icon: '💀' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
  { id: 'cat', label: 'Cat', icon: '🐱' },
  { id: 'wolf', label: 'Wolf', icon: '🐺' },
  { id: 'alien', label: 'Alien', icon: '👽' },
  { id: 'dragon', label: 'Dragon', icon: '🐉' },
  { id: 'pumpkin', label: 'Pumpkin', icon: '🎃' }
];
const KIND_IDS = AVATAR_KINDS.map((k) => k.id);

export const AVATAR_DEFAULT = {
  style: 'builder', kind: 'human', kindColor: '#e8edf2',
  skin: '#f1c27d', hairStyle: 'short', hairColor: '#3b2314',
  eyes: 'dots', mouth: 'smile', accessory: 'none', bgColor: '#312e81'
};

// ---------- color helpers (every gradient/shade derives from the spec) ----------
function rgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// shade(hex, f): f>0 mixes toward white, f<0 toward black.
function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  return toHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}
function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const INK = '#2a2530';

// ---------- shared expression primitives ----------
function GlossEye({ cx, cy, r = 3.3, ink = INK, slit = false }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={ink} />
      {slit ? (
        <rect x={cx - 0.55} y={cy - r * 0.55} width="1.1" height={r * 1.1} rx="0.55" fill="#fff" opacity="0.9" />
      ) : (
        <>
          <circle cx={cx - r * 0.34} cy={cy - r * 0.38} r={r * 0.34} fill="#fff" opacity="0.95" />
          <circle cx={cx + r * 0.3} cy={cy + r * 0.48} r={r * 0.16} fill="#fff" opacity="0.5" />
        </>
      )}
    </g>
  );
}
function HappyEye({ cx, cy, ink = INK }) {
  return <path d={`M${cx - 5} ${cy + 1} Q${cx} ${cy - 5} ${cx + 5} ${cy + 1}`} stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
}
function WinkEye({ cx, cy, ink = INK }) {
  return <path d={`M${cx - 5} ${cy} Q${cx} ${cy - 3.5} ${cx + 5} ${cy}`} stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
}
function SleepyEye({ cx, cy, ink = INK }) {
  return (
    <g stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round">
      <path d={`M${cx - 5} ${cy - 1} Q${cx} ${cy + 3.5} ${cx + 5} ${cy - 1}`} />
      <path d={`M${cx - 5} ${cy - 1} l-2 -2 M${cx + 5} ${cy - 1} l2 -2`} strokeWidth="1.8" />
    </g>
  );
}
function StarEye({ cx, cy, r = 5.4 }) {
  return (
    <g>
      <polygon points={starPoints(cx, cy, r, r * 0.48)} fill="#f5b942" stroke="#b97e14" strokeWidth="0.8" />
      <circle cx={cx - 1} cy={cy - 1.4} r="1" fill="#fff" opacity="0.85" />
    </g>
  );
}
// Expression eyes for organic kinds. positions: eyes at (50∓gap, cy).
function ExprEyes({ type, cy, gap = 10, ink = INK, slit = false }) {
  const L = 50 - gap;
  const R = 50 + gap;
  switch (type) {
    case 'happy':
      return <g><HappyEye cx={L} cy={cy} ink={ink} /><HappyEye cx={R} cy={cy} ink={ink} /></g>;
    case 'wink':
      return <g><GlossEye cx={L} cy={cy} ink={ink} slit={slit} /><WinkEye cx={R} cy={cy} ink={ink} /></g>;
    case 'sleepy':
      return <g><SleepyEye cx={L} cy={cy} ink={ink} /><SleepyEye cx={R} cy={cy} ink={ink} /></g>;
    case 'star':
      return <g><StarEye cx={L} cy={cy} /><StarEye cx={R} cy={cy} /></g>;
    case 'dots':
    default:
      return <g><GlossEye cx={L} cy={cy} ink={ink} slit={slit} /><GlossEye cx={R} cy={cy} ink={ink} slit={slit} /></g>;
  }
}
// Expression mouths for organic kinds, centered on (50, cy).
function ExprMouth({ type, cy, ink = INK }) {
  switch (type) {
    case 'grin':
      return (
        <g>
          <rect x="40.5" y={cy - 3} width="19" height="9.5" rx="3.5" fill="#fdfdf8" stroke={ink} strokeWidth="1.5" />
          <line x1="40.5" y1={cy + 1.7} x2="59.5" y2={cy + 1.7} stroke={ink} strokeWidth="0.9" opacity="0.6" />
          <line x1="47" y1={cy - 3} x2="47" y2={cy + 6.5} stroke={ink} strokeWidth="0.9" opacity="0.45" />
          <line x1="53" y1={cy - 3} x2="53" y2={cy + 6.5} stroke={ink} strokeWidth="0.9" opacity="0.45" />
        </g>
      );
    case 'flat':
      return <line x1="43" y1={cy + 1} x2="57" y2={cy + 1} stroke={ink} strokeWidth="2.4" strokeLinecap="round" />;
    case 'open':
      return (
        <g>
          <ellipse cx="50" cy={cy + 2} rx="5" ry="6" fill="#701d22" />
          <ellipse cx="50" cy={cy + 5.2} rx="3.2" ry="2.1" fill="#e0655f" />
        </g>
      );
    case 'smirk':
      return (
        <g>
          <path d={`M43 ${cy + 1} Q52 ${cy + 6} 58 ${cy - 2}`} stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="40.5" cy={cy - 1} r="1" fill={ink} opacity="0.55" />
        </g>
      );
    case 'smile':
    default:
      return <path d={`M41 ${cy} Q50 ${cy + 8} 59 ${cy}`} stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  }
}

// ---------- accessories (drawn in human coordinates, re-aimed per kind) ----------
function AccessoryArt({ type }) {
  switch (type) {
    case 'glasses':
      return (
        <g>
          <defs>
            <linearGradient id="glasslens" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.14" />
            </linearGradient>
          </defs>
          <g fill="url(#glasslens)" stroke="#14181f" strokeWidth="2.2">
            <rect x="30.5" y="48.5" width="17.5" height="14.5" rx="5" />
            <rect x="52" y="48.5" width="17.5" height="14.5" rx="5" />
          </g>
          <path d="M48 53 Q50 51.5 52 53" stroke="#14181f" strokeWidth="2.2" fill="none" />
          <path d="M30.5 52 L23 49.5 M69.5 52 L77 49.5" stroke="#14181f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M34 60 L44 50" stroke="#ffffff" strokeWidth="1.6" opacity="0.35" strokeLinecap="round" />
          <path d="M55.5 60 L65.5 50" stroke="#ffffff" strokeWidth="1.6" opacity="0.35" strokeLinecap="round" />
        </g>
      );
    case 'shades':
      return (
        <g>
          <defs>
            <linearGradient id="shadeLens" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#39424f" />
              <stop offset="0.55" stopColor="#12161d" />
              <stop offset="1" stopColor="#04060a" />
            </linearGradient>
          </defs>
          <path d="M29 48.5 h19 v6.5 a6 6 0 0 1 -6 6 h-7 a6 6 0 0 1 -6 -6 Z" fill="url(#shadeLens)" />
          <path d="M52 48.5 h19 v6.5 a6 6 0 0 1 -6 6 h-7 a6 6 0 0 1 -6 -6 Z" fill="url(#shadeLens)" />
          <rect x="47" y="51.5" width="6" height="3" fill="#04060a" />
          <polygon points="33,50 43,50 36,58 31,58" fill="#ffffff" opacity="0.30" />
          <polygon points="55,50 62,50 57,58 53.5,58" fill="#ffffff" opacity="0.22" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <defs>
            <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e0334a" />
              <stop offset="1" stopColor="#8f1220" />
            </linearGradient>
          </defs>
          <path d="M23.5 47.5 C23.5 27 76.5 27 76.5 47.5 Z" fill="url(#capGrad)" />
          <path d="M50 28.5 V46 M36 31 Q39 39 38.5 46.5 M64 31 Q61 39 61.5 46.5" stroke="#5f0b16" strokeWidth="1.1" opacity="0.5" fill="none" />
          <circle cx="50" cy="27.5" r="2.6" fill="#8f1220" />
          <rect x="16.5" y="45.5" width="67" height="5.5" rx="2.75" fill="#6d0d18" />
          <rect x="16.5" y="45.5" width="67" height="2.2" rx="1.1" fill="#ffffff" opacity="0.14" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <defs>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#39424f" />
              <stop offset="0.5" stopColor="#171c24" />
              <stop offset="1" stopColor="#39424f" />
            </linearGradient>
          </defs>
          <path d="M21.5 62 A29.5 29.5 0 0 1 78.5 62" stroke="url(#bandGrad)" strokeWidth="4.6" fill="none" strokeLinecap="round" />
          <rect x="14.5" y="53" width="11" height="20" rx="4.5" fill="#141920" />
          <rect x="74.5" y="53" width="11" height="20" rx="4.5" fill="#141920" />
          <rect x="17" y="56.5" width="6" height="13" rx="3" fill="#232b36" />
          <rect x="77" y="56.5" width="6" height="13" rx="3" fill="#232b36" />
          <rect x="15.5" y="55" width="9" height="16" rx="4" fill="none" stroke="#22ff88" strokeWidth="0.8" opacity="0.55" />
          <rect x="75.5" y="55" width="9" height="16" rx="4" fill="none" stroke="#22ff88" strokeWidth="0.8" opacity="0.55" />
        </g>
      );
    default:
      return null;
  }
}
function Accessory({ type, dy = 0, sc = 1 }) {
  if (!type || type === 'none') return null;
  return (
    <g transform={`translate(50 ${54 + dy}) scale(${sc}) translate(-50 -54)`}>
      <AccessoryArt type={type} />
    </g>
  );
}
// Note: accessory gradients use fixed ids — every instance paints the
// same colors, so cross-instance id resolution stays correct.

// ---------- HUMAN (the original, now fully shaded) ----------
function HumanFace({ s, uid }) {
  const skin = s.skin;
  const hair = s.hairColor;
  return (
    <g>
      <defs>
        <radialGradient id={`sk${uid}`} cx="0.5" cy="0.36" r="0.85">
          <stop offset="0" stopColor={shade(skin, 0.16)} />
          <stop offset="0.55" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -0.20)} />
        </radialGradient>
        <linearGradient id={`ha${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(hair, 0.14)} />
          <stop offset="1" stopColor={shade(hair, -0.30)} />
        </linearGradient>
        <linearGradient id={`sh${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3852" />
          <stop offset="1" stopColor="#0c1322" />
        </linearGradient>
        <clipPath id={`fc${uid}`}><circle cx="50" cy="54" r="27" /></clipPath>
      </defs>
      {/* shoulders / shirt */}
      <path d="M13 100 C13 81 33 74.5 50 74.5 C67 74.5 87 81 87 100 Z" fill={`url(#sh${uid})`} />
      <polygon points="42.5,77.5 50,86.5 57.5,77.5 57.5,83 50,91 42.5,83" fill="#070b14" opacity="0.85" />
      {/* ears */}
      <circle cx="23.5" cy="56" r="5" fill={`url(#sk${uid})`} />
      <circle cx="76.5" cy="56" r="5" fill={`url(#sk${uid})`} />
      <ellipse cx="23.5" cy="56" rx="2.2" ry="2.8" fill={shade(skin, -0.20)} opacity="0.45" />
      <ellipse cx="76.5" cy="56" rx="2.2" ry="2.8" fill={shade(skin, -0.20)} opacity="0.45" />
      {/* head */}
      <circle cx="50" cy="54" r="27" fill={`url(#sk${uid})`} />
      <g clipPath={`url(#fc${uid})`}>
        <ellipse cx="50" cy="37" rx="15" ry="8.5" fill="#ffffff" opacity="0.10" />
        <ellipse cx="34.5" cy="65" rx="6" ry="3.2" fill="#ff7d9c" opacity="0.16" />
        <ellipse cx="65.5" cy="65" rx="6" ry="3.2" fill="#ff7d9c" opacity="0.16" />
        <ellipse cx="50" cy="80" rx="16" ry="8" fill={shade(skin, -0.16)} opacity="0.30" />
      </g>
      {/* hair */}
      <HumanHair style={s.hairStyle} uid={uid} hair={hair} />
      <ExprEyes type={s.eyes} cy={56} gap={10} />
      <ExprMouth type={s.mouth} cy={67} />
      <Accessory type={s.accessory} dy={0} sc={1} />
    </g>
  );
}
function HumanHair({ style, uid, hair }) {
  const fill = `url(#ha${uid})`;
  const strand = { stroke: shade(hair, -0.38), strokeWidth: 1.1, fill: 'none', opacity: 0.5, strokeLinecap: 'round' };
  const capPath = 'M22.5 56 C20 17 80 17 77.5 56 C76 49 63 44 50 44 C37 44 24 49 22.5 56 Z';
  switch (style) {
    case 'bald':
      return <ellipse cx="41" cy="35" rx="11" ry="4.6" fill="#ffffff" opacity="0.13" transform="rotate(-16 41 35)" />;
    case 'spiky':
      return (
        <g>
          <polygon fill={fill} points="23,55 27,35 35,45 41,28 49,42 57,28 63,44 71,34 77,55 65,43 50,38.5 35,43" />
          <polygon fill={shade(hair, -0.16)} opacity="0.55" points="33,49 40,40 47,45 53,38 59,46 65,41 67,50 57,44 48,42.5 39,45" />
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path fill={fill} d="M43.5 57 L43.5 23 Q50 11 56.5 23 L56.5 57 Q50 46.5 43.5 57 Z" />
          <path d="M50 16 Q48.5 34 50 50" stroke={shade(hair, 0.28)} strokeWidth="1.3" fill="none" opacity="0.6" strokeLinecap="round" />
        </g>
      );
    case 'long':
      return (
        <g fill={fill}>
          <path d={capPath} />
          <path d="M19.5 46 h10.5 v29 q-5.25 6 -10.5 0 Z" />
          <path d="M70 46 h10.5 v29 q-5.25 6 -10.5 0 Z" />
          <path d="M24.5 50 v20 M75.5 50 v20" {...strand} />
        </g>
      );
    case 'bun':
      return (
        <g>
          <circle cx="50" cy="19.5" r="9.5" fill={fill} />
          <ellipse cx="50" cy="26.5" rx="7" ry="2.6" fill={shade(hair, -0.35)} />
          <path fill={fill} d={capPath} />
          <path d="M31 40 Q50 34.5 69 40" {...strand} />
        </g>
      );
    case 'short':
    default:
      return (
        <g>
          <path fill={fill} d={capPath} />
          <path d="M31 40 Q50 34.5 69 40" {...strand} />
          <path d="M28 45 Q38 37 52 35.5" {...strand} opacity="0.35" />
        </g>
      );
  }
}

// ---------- GHOST ----------
const GHOST_BODY = 'M27 93 C24 60 28 35 50 35 C72 35 76 60 73 93 C70 85 65 85 62 93 C59 85 54 85 51 93 C48 85 43 85 40 93 C37 86 30 85 27 93 Z';
function GhostFace({ s, uid }) {
  const kc = s.kindColor;
  const ink = '#33294d';
  return (
    <g>
      <defs>
        <radialGradient id={`gh${uid}`} cx="0.5" cy="0.3" r="0.9">
          <stop offset="0" stopColor={shade(kc, 0.14)} />
          <stop offset="0.6" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.16)} />
        </radialGradient>
        <clipPath id={`gc${uid}`}><path d={GHOST_BODY} /></clipPath>
      </defs>
      <GhostTop style={s.hairStyle} kc={kc} />
      <path d={GHOST_BODY} fill={`url(#gh${uid})`} />
      <g clipPath={`url(#gc${uid})`}>
        <ellipse cx="39" cy="53" rx="7" ry="15" fill="#ffffff" opacity="0.20" transform="rotate(-9 39 53)" />
        <ellipse cx="50" cy="90" rx="19" ry="8" fill={shade(kc, -0.22)} opacity="0.35" />
      </g>
      <ellipse cx="33" cy="60" rx="5" ry="2.6" fill="#f78fb0" opacity="0.40" />
      <ellipse cx="67" cy="60" rx="5" ry="2.6" fill="#f78fb0" opacity="0.40" />
      <circle cx="40" cy="51" r="5.5" fill={s.hairColor} opacity="0.16" />
      <circle cx="60" cy="51" r="5.5" fill={s.hairColor} opacity="0.16" />
      <ExprEyes type={s.eyes} cy={51} gap={10} ink={ink} />
      {s.mouth === 'open' ? (
        <g>
          <ellipse cx="50" cy="65" rx="4.6" ry="5.8" fill="#2c2145" />
          <ellipse cx="50" cy="67.5" rx="2.8" ry="2.6" fill="#4b3a75" opacity="0.85" />
        </g>
      ) : (
        <ExprMouth type={s.mouth} cy={62} ink={ink} />
      )}
      <Accessory type={s.accessory} dy={-5} sc={0.96} />
    </g>
  );
}
function GhostTop({ style, kc }) {
  const wisp = { stroke: shade(kc, -0.06), strokeWidth: 3, fill: 'none', strokeLinecap: 'round' };
  switch (style) {
    case 'bald':
      return <path d="M46 34 Q50 26 56 30" {...wisp} />;
    case 'spiky':
      return (
        <g fill={shade(kc, -0.02)}>
          <path d="M34 39 Q36 27 41 33 Q44 27 45 38 Z" />
          <path d="M45 36 Q50 23 55 36 Q58 29 60 38 Z" />
          <path d="M57 38 Q62 28 67 39 Z" />
        </g>
      );
    case 'mohawk':
      return <path d="M45 37 Q45 17 52 13 Q51 23 55 26 Q59 19 57.5 37 Z" fill={shade(kc, -0.02)} />;
    case 'long':
      return (
        <g fill={shade(kc, -0.09)}>
          <path d="M27.5 52 C25 68 25.5 82 29 92 L34.5 92 C31.5 76 31.5 63 32.5 50 Z" />
          <path d="M72.5 52 C75 68 74.5 82 71 92 L65.5 92 C68.5 76 68.5 63 67.5 50 Z" />
        </g>
      );
    case 'bun':
      return <g><circle cx="50" cy="29" r="5.5" fill={kc} /><circle cx="50" cy="29" r="5.5" fill="none" stroke={shade(kc, -0.22)} strokeWidth="1" /></g>;
    case 'short':
    default:
      return <path d="M42 35 Q45 27 50 31 M52 31 Q57 27 59.5 34" {...wisp} />;
  }
}

// ---------- SKULL ----------
function SkullFace({ s, uid }) {
  const kc = s.kindColor;
  const glow = s.hairColor;
  return (
    <g>
      <defs>
        <radialGradient id={`bo${uid}`} cx="0.5" cy="0.34" r="0.88">
          <stop offset="0" stopColor={shade(kc, 0.12)} />
          <stop offset="0.6" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.22)} />
        </radialGradient>
        <linearGradient id={`ha${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(s.hairColor, 0.14)} />
          <stop offset="1" stopColor={shade(s.hairColor, -0.30)} />
        </linearGradient>
      </defs>
      {/* jaw behind cranium */}
      <rect x="36.5" y="56" width="27" height="20" rx="7" fill={shade(kc, -0.10)} />
      <circle cx="50" cy="47" r="23.5" fill={`url(#bo${uid})`} />
      <ellipse cx="31" cy="52" rx="3.4" ry="6" fill={shade(kc, -0.18)} opacity="0.35" />
      <ellipse cx="69" cy="52" rx="3.4" ry="6" fill={shade(kc, -0.18)} opacity="0.35" />
      {/* sockets + glow by eye style */}
      <SkullSocket cx={40} type={s.eyes} glow={glow} side="l" />
      <SkullSocket cx={60} type={s.eyes} glow={glow} side="r" />
      {/* nose cavity */}
      <path d="M50 56.5 L45.8 65.5 Q50 63.4 54.2 65.5 Z" fill="#16110b" />
      <SkullTeeth type={s.mouth} kc={kc} />
      {/* hair + cracks sit ON the bone, so they paint after the cranium */}
      <SkullTop style={s.hairStyle} uid={uid} kc={kc} />
      <Accessory type={s.accessory} dy={-6} sc={0.98} />
    </g>
  );
}
function SkullSocket({ cx, type, glow, side }) {
  return (
    <g>
      <ellipse cx={cx} cy="49" rx="7" ry="8" fill="#16110b" />
      <ellipse cx={cx} cy="49" rx="7" ry="8" fill="none" stroke="#000" strokeWidth="0.8" opacity="0.35" />
      {type === 'dots' && (
        <g><circle cx={cx} cy="49" r="5" fill={glow} opacity="0.30" /><circle cx={cx} cy="49" r="2.8" fill={glow} /></g>
      )}
      {type === 'happy' && (
        <path d={`M${cx - 4} 51 Q${cx} 45.5 ${cx + 4} 51`} stroke={glow} strokeWidth="2.3" fill="none" strokeLinecap="round" />
      )}
      {type === 'wink' && (side === 'l' ? (
        <g><circle cx={cx} cy="49" r="5" fill={glow} opacity="0.30" /><circle cx={cx} cy="49" r="2.8" fill={glow} /></g>
      ) : (
        <rect x={cx - 4} y="47.8" width="8" height="2.4" rx="1.2" fill={glow} opacity="0.55" />
      ))}
      {type === 'sleepy' && (
        <g><circle cx={cx} cy="50.5" r="2.2" fill={glow} opacity="0.5" /><path d={`M${cx - 6} 45.5 Q${cx} 48.5 ${cx + 6} 45.5`} stroke="#16110b" strokeWidth="2" fill="none" opacity="0.7" /></g>
      )}
      {type === 'star' && (
        <polygon points={starPoints(cx, 49, 4.4, 2)} fill={glow} />
      )}
    </g>
  );
}
function SkullTeeth({ type, kc }) {
  const seam = { stroke: '#4c4230', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' };
  const tick = { stroke: '#4c4230', strokeWidth: 1.1, opacity: 0.6 };
  switch (type) {
    case 'grin':
      return (
        <g>
          <rect x="37.5" y="66" width="25" height="11" rx="2.5" fill="#f7f1de" stroke={shade(kc, -0.42)} strokeWidth="1.2" />
          <line x1="43.7" y1="66" x2="43.7" y2="77" {...tick} />
          <line x1="49.9" y1="66" x2="49.9" y2="77" {...tick} />
          <line x1="56.1" y1="66" x2="56.1" y2="77" {...tick} />
          <line x1="37.5" y1="71.5" x2="62.5" y2="71.5" {...tick} />
        </g>
      );
    case 'flat':
      return (
        <g>
          <line x1="39" y1="70.5" x2="61" y2="70.5" {...seam} />
          <line x1="45" y1="67.5" x2="45" y2="73.5" {...tick} />
          <line x1="50" y1="67.5" x2="50" y2="73.5" {...tick} />
          <line x1="55" y1="67.5" x2="55" y2="73.5" {...tick} />
        </g>
      );
    case 'open':
      return (
        <g>
          <rect x="41" y="66" width="18" height="11" rx="3" fill="#16110b" />
          <line x1="43" y1="75" x2="57" y2="75" stroke="#f7f1de" strokeWidth="1.6" opacity="0.8" />
        </g>
      );
    case 'smirk':
      return (
        <g>
          <path d="M40 71.5 Q52 74 60 67.5" {...seam} />
          <line x1="52" y1="69.5" x2="52" y2="74.5" {...tick} />
          <line x1="57" y1="67.8" x2="57" y2="72" {...tick} />
        </g>
      );
    case 'smile':
    default:
      return (
        <g>
          <path d="M40 68.5 Q50 74.5 60 68.5" {...seam} />
          <line x1="45" y1="70.2" x2="45" y2="74" {...tick} />
          <line x1="50" y1="71.5" x2="50" y2="75.2" {...tick} />
          <line x1="55" y1="70.2" x2="55" y2="74" {...tick} />
        </g>
      );
  }
}
function SkullTop({ style, uid, kc }) {
  const crack = { stroke: '#2e2822', strokeWidth: 1.2, fill: 'none', opacity: 0.55, strokeLinecap: 'round' };
  switch (style) {
    case 'short':
      return <path d="M63 27 l-4 6 4 3 -3 6" {...crack} />;
    case 'spiky':
      return (
        <g>
          <path d="M63 27 l-4 6 4 3 -3 6" {...crack} />
          <path d="M37 26 l3 5 -3 4" {...crack} />
          <path d="M52 23.5 l-2 5 3 4" {...crack} />
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path fill={`url(#ha${uid})`} d="M43.5 48 L43.5 21 Q50 10 56.5 21 L56.5 48 Q50 39 43.5 48 Z" />
        </g>
      );
    case 'long':
      return (
        <g fill={`url(#ha${uid})`}>
          <path d="M27.5 42 C25 32 33 25.5 39 29 C32 33 30 39 31 47 L31.5 64 C28 58 26.5 50 27.5 42 Z" />
          <path d="M72.5 42 C75 32 67 25.5 61 29 C68 33 70 39 69 47 L68.5 64 C72 58 73.5 50 72.5 42 Z" />
        </g>
      );
    case 'bun':
      return (
        <g>
          <circle cx="50" cy="19" r="7.5" fill={`url(#ha${uid})`} />
          <path fill={`url(#ha${uid})`} d="M29.5 43 C29.5 29 70.5 29 70.5 43 C70.5 34.5 62 30.5 50 30.5 C38 30.5 29.5 34.5 29.5 43 Z" opacity="0.95" />
        </g>
      );
    case 'bald':
    default:
      return <ellipse cx="41" cy="31" rx="9" ry="4" fill="#ffffff" opacity="0.10" transform="rotate(-14 41 31)" />;
  }
}

// ---------- ROBOT ----------
function RobotFace({ s, uid }) {
  const kc = s.kindColor;
  const accent = s.hairColor;
  return (
    <g>
      <defs>
        <linearGradient id={`rb${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(kc, 0.28)} />
          <stop offset="0.55" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.28)} />
        </linearGradient>
        <linearGradient id={`vs${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#131a22" />
          <stop offset="1" stopColor="#070a0f" />
        </linearGradient>
      </defs>
      <RobotAntenna style={s.hairStyle} kc={kc} accent={accent} />
      {/* shoulders + neck */}
      <path d="M17 100 C19 86 33 81.5 50 81.5 C67 81.5 81 86 83 100 Z" fill={shade(kc, -0.20)} />
      <circle cx="50" cy="92" r="2.1" fill={accent} opacity="0.85" />
      <rect x="43.5" y="74" width="13" height="6" fill={shade(kc, -0.38)} />
      {/* ear dials */}
      <circle cx="21.5" cy="53" r="5.5" fill={shade(kc, -0.28)} />
      <circle cx="78.5" cy="53" r="5.5" fill={shade(kc, -0.28)} />
      <circle cx="21.5" cy="53" r="2.2" fill={accent} />
      <circle cx="78.5" cy="53" r="2.2" fill={accent} />
      {/* head */}
      <rect x="25" y="29" width="50" height="47" rx="11" fill={`url(#rb${uid})`} stroke={shade(kc, -0.42)} strokeWidth="1" />
      <line x1="33" y1="37.5" x2="67" y2="37.5" stroke={shade(kc, -0.32)} strokeWidth="1" opacity="0.6" />
      <line x1="30" y1="66" x2="30" y2="71" stroke={shade(kc, -0.32)} strokeWidth="1.4" opacity="0.6" />
      <line x1="70" y1="66" x2="70" y2="71" stroke={shade(kc, -0.32)} strokeWidth="1.4" opacity="0.6" />
      {/* visor + optics */}
      <rect x="32" y="43" width="36" height="14" rx="7" fill={`url(#vs${uid})`} />
      <rect x="34.5" y="45" width="31" height="5" rx="2.5" fill="#ffffff" opacity="0.06" />
      <RobotOptics type={s.eyes} accent={accent} />
      <RobotGrille type={s.mouth} />
      <Accessory type={s.accessory} dy={-6} sc={1.02} />
    </g>
  );
}
function RobotOptics({ type, accent }) {
  const cy = 50;
  switch (type) {
    case 'happy':
      return <path d="M38.5 52 Q50 43.5 61.5 52" stroke={accent} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    case 'wink':
      return (
        <g>
          <circle cx="42.5" cy={cy} r="5" fill={accent} opacity="0.25" />
          <circle cx="42.5" cy={cy} r="2.7" fill={accent} />
          <line x1="54" y1={cy} x2="61.5" y2={cy} stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'sleepy':
      return (
        <g opacity="0.75">
          <line x1="38" y1="51" x2="62" y2="51" stroke={accent} strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
          <circle cx="44" cy="54.5" r="1.1" fill={accent} opacity="0.5" />
          <circle cx="56" cy="54.5" r="1.1" fill={accent} opacity="0.5" />
        </g>
      );
    case 'star':
      return (
        <g fill={accent}>
          <polygon points={starPoints(42.5, cy, 3.8, 1.7)} />
          <polygon points={starPoints(57.5, cy, 3.8, 1.7)} />
        </g>
      );
    case 'dots':
    default:
      return (
        <g fill={accent}>
          <circle cx="42.5" cy={cy} r="5.2" opacity="0.25" />
          <circle cx="57.5" cy={cy} r="5.2" opacity="0.25" />
          <circle cx="42.5" cy={cy} r="2.7" />
          <circle cx="57.5" cy={cy} r="2.7" />
        </g>
      );
  }
}
function RobotGrille({ type }) {
  const led = '#d7e3ee';
  switch (type) {
    case 'grin':
      return (
        <g fill={led} opacity="0.92">
          <rect x="39.5" y="62.5" width="3.2" height="7" rx="1.6" />
          <rect x="45.2" y="62.5" width="3.2" height="7" rx="1.6" />
          <rect x="50.9" y="62.5" width="3.2" height="7" rx="1.6" />
          <rect x="56.6" y="62.5" width="3.2" height="7" rx="1.6" />
        </g>
      );
    case 'flat':
      return <line x1="41" y1="66" x2="59" y2="66" stroke={led} strokeWidth="2.2" strokeLinecap="round" />;
    case 'open':
      return (
        <g>
          <circle cx="50" cy="66" r="4.2" fill="none" stroke={led} strokeWidth="2" />
          <circle cx="50" cy="66" r="1.3" fill={led} />
        </g>
      );
    case 'smirk':
      return <path d="M42 67.5 Q52 69.5 58 63.5" stroke={led} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case 'smile':
    default:
      return <path d="M41 64 Q50 70.5 59 64" stroke={led} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
}
function RobotAntenna({ style, kc, accent }) {
  const stem = { stroke: shade(kc, -0.35), strokeWidth: 2.4, strokeLinecap: 'round' };
  switch (style) {
    case 'short':
      return (
        <g>
          <line x1="50" y1="29" x2="50" y2="20" {...stem} />
          <circle cx="50" cy="16.5" r="6" fill={accent} opacity="0.28" />
          <circle cx="50" cy="16.5" r="3.4" fill={accent} />
        </g>
      );
    case 'spiky':
      return (
        <g>
          <line x1="38" y1="29" x2="38" y2="21" {...stem} />
          <line x1="50" y1="29" x2="50" y2="18" {...stem} />
          <line x1="62" y1="29" x2="62" y2="21" {...stem} />
          <circle cx="38" cy="18.5" r="2.6" fill={accent} />
          <circle cx="50" cy="15" r="3.2" fill={accent} />
          <circle cx="62" cy="18.5" r="2.6" fill={accent} />
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path d="M37 29.5 Q50 12.5 63 29.5 Z" fill={shade(kc, -0.12)} />
          <path d="M37 29.5 Q50 12.5 63 29.5" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.55" />
        </g>
      );
    case 'long':
      return (
        <g fill="none">
          <path d="M32 30.5 Q24 15 17.5 13.5" {...stem} />
          <path d="M68 30.5 Q76 15 82.5 13.5" {...stem} />
          <circle cx="17" cy="13" r="2.5" fill={accent} stroke="none" />
          <circle cx="83" cy="13" r="2.5" fill={accent} stroke="none" />
        </g>
      );
    case 'bun':
      return (
        <g>
          <path d="M37.5 25 A13.5 13.5 0 0 1 62.5 25" fill={shade(kc, -0.10)} stroke={shade(kc, -0.35)} strokeWidth="2" />
          <line x1="50" y1="24" x2="50" y2="29.5" {...stem} />
          <circle cx="50" cy="21.5" r="2" fill={accent} />
        </g>
      );
    case 'bald':
    default:
      return null;
  }
}

// ---------- CAT & WOLF ----------
function BeastFace({ s, uid, wolf }) {
  const fur = s.kindColor;
  const cy = wolf ? 54 : 55;
  return (
    <g>
      <defs>
        <radialGradient id={`fu${uid}`} cx="0.5" cy="0.36" r="0.85">
          <stop offset="0" stopColor={shade(fur, 0.15)} />
          <stop offset="0.6" stopColor={fur} />
          <stop offset="1" stopColor={shade(fur, -0.20)} />
        </radialGradient>
      </defs>
      <BeastEars style={s.hairStyle} uid={uid} fur={fur} accent={s.hairColor} wolf={wolf} />
      {/* cheek fluff */}
      <polygon fill={`url(#fu${uid})`} points={wolf ? '25,56 15,61 24,66 16,73 27,75' : '26.5,57 19,61.5 26.5,65.5 20.5,71.5 28.5,73.5'} />
      <polygon fill={`url(#fu${uid})`} points={wolf ? '75,56 85,61 76,66 84,73 73,75' : '73.5,57 81,61.5 73.5,65.5 79.5,71.5 71.5,73.5'} />
      <circle cx="50" cy={cy} r={wolf ? 25.5 : 25} fill={`url(#fu${uid})`} />
      {/* forehead marks */}
      <g stroke={shade(fur, -0.20)} strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
        <path d="M42 36.5 q1.5 4 0 7.5" fill="none" />
        <path d="M50 34.5 v8.5" fill="none" />
        <path d="M58 36.5 q-1.5 4 0 7.5" fill="none" />
      </g>
      {wolf && s.hairStyle === 'mohawk' && (
        <polygon fill={shade(fur, -0.08)} points="41,33 46.5,19 50,28.5 54,17 59,33 50,28" />
      )}
      {wolf ? <WolfFace s={s} /> : <CatFace s={s} />}
      <Accessory type={s.accessory} dy={wolf ? -6 : -4} sc={0.97} />
    </g>
  );
}
function BeastEars({ style, uid, fur, accent, wolf }) {
  const fill = `url(#fu${uid})`;
  const inner = { fill: accent, opacity: 0.8 };
  const tall = wolf ? 4 : 0;
  const up = (flip) => {
    const pts = flip ? '71,40 75,17 53,29' : '29,40 25,17 47,29';
    const inPts = flip ? '69,35 71,24 59,29' : '31,35 29,24 41,29';
    return (
      <g>
        <polygon fill={fill} points={pts} />
        <polygon {...inner} points={inPts} />
      </g>
    );
  };
  switch (style) {
    case 'bald': // folded
      return (
        <g>
          <polygon fill={fill} points="28,37 18.5,29.5 34,25.5" />
          <polygon fill={fill} points="72,37 81.5,29.5 66,25.5" />
        </g>
      );
    case 'spiky': // tall
      return (
        <g>
          <polygon fill={fill} points={`28,42 23,${10 - tall} 48,27`} />
          <polygon fill={fill} points={`72,42 77,${10 - tall} 52,27`} />
          <polygon {...inner} points="31,36 28.5,19 42,28" />
          <polygon {...inner} points="69,36 71.5,19 58,28" />
          <path d="M28.5 14 l-2.5 -3.5 M71.5 14 l2.5 -3.5" stroke={fur} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'mohawk': // one up, one folded
      return (
        <g>
          {up(false)}
          <polygon fill={fill} points="72,37 81.5,29.5 66,25.5" />
        </g>
      );
    case 'long': // droopy
      return (
        <g fill={fill}>
          <path d="M28 33 C18 39 15.5 53 19.5 64 L30 58 C27 48 27 39.5 29.5 35.5 Z" />
          <path d="M72 33 C82 39 84.5 53 80.5 64 L70 58 C73 48 73 39.5 70.5 35.5 Z" />
        </g>
      );
    case 'bun': // round
      return (
        <g>
          <circle cx="29.5" cy="29.5" r="8.5" fill={fill} />
          <circle cx="70.5" cy="29.5" r="8.5" fill={fill} />
          <circle cx="29.5" cy="29.5" r="4.4" {...inner} />
          <circle cx="70.5" cy="29.5" r="4.4" {...inner} />
        </g>
      );
    case 'short':
    default:
      return <g>{up(false)}{up(true)}</g>;
  }
}
function CatFace({ s }) {
  const fur = s.kindColor;
  return (
    <g>
      <ExprEyes type={s.eyes} cy={51} gap={10.5} slit />
      {/* muzzle */}
      <ellipse cx="50" cy="67" rx="11" ry="7" fill={shade(fur, 0.38)} opacity="0.95" />
      <path d="M46 60.5 Q50 58.4 54 60.5 Q53.2 64.6 50 64.6 Q46.8 64.6 46 60.5 Z" fill="#c93a5e" />
      <circle cx="48" cy="60" r="0.95" fill="#fff" opacity="0.8" />
      <CatMouth type={s.mouth} />
      {/* whiskers */}
      <g stroke="#ffffff" strokeWidth="0.9" opacity="0.30" strokeLinecap="round">
        <path d="M31 63 L16.5 60.5 M31 66.5 L15.5 67 M32 69.5 L18.5 73.5" fill="none" />
        <path d="M69 63 L83.5 60.5 M69 66.5 L84.5 67 M68 69.5 L81.5 73.5" fill="none" />
      </g>
    </g>
  );
}
function CatMouth({ type }) {
  const ink = INK;
  switch (type) {
    case 'grin':
      return (
        <g>
          <path d="M42 66 Q50 74.5 58 66 Q50 70 42 66 Z" fill="#7c2d3e" />
          <polygon points="44,67 46.6,67.2 45.3,71.2" fill="#fdfdf8" />
          <polygon points="53.4,67.2 56,67 54.7,71.2" fill="#fdfdf8" />
        </g>
      );
    case 'flat':
      return <line x1="45.5" y1="67.5" x2="54.5" y2="67.5" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />;
    case 'open':
      return (
        <g>
          <ellipse cx="50" cy="69.5" rx="3.6" ry="4.2" fill="#7c2d3e" />
          <ellipse cx="50" cy="71.6" rx="2.2" ry="1.6" fill="#e0655f" />
        </g>
      );
    case 'smirk':
      return <path d="M50 64.8 Q55.5 69.5 59 66" stroke={ink} strokeWidth="1.9" fill="none" strokeLinecap="round" />;
    case 'smile':
    default:
      return (
        <g stroke={ink} strokeWidth="1.9" fill="none" strokeLinecap="round">
          <path d="M50 64.8 Q45.5 69.5 41.5 66.8" />
          <path d="M50 64.8 Q54.5 69.5 58.5 66.8" />
        </g>
      );
  }
}
function WolfFace({ s }) {
  const fur = s.kindColor;
  return (
    <g>
      {/* brow ridges — the wolf means it */}
      <g stroke={shade(fur, -0.42)} strokeWidth="2.1" opacity="0.85" strokeLinecap="round">
        <path d="M32.5 41.5 L46 44" fill="none" />
        <path d="M67.5 41.5 L54 44" fill="none" />
      </g>
      <ExprEyes type={s.eyes} cy={49} gap={10.5} />
      {/* snout */}
      <path d="M36 62 C36 55.5 42 52.5 50 52.5 C58 52.5 64 55.5 64 62 C64 71 58 77.5 50 77.5 C42 77.5 36 71 36 62 Z" fill={shade(fur, 0.30)} />
      <rect x="43.5" y="57" width="13" height="7.5" rx="3.6" fill="#22262e" />
      <ellipse cx="47.2" cy="59.6" rx="2.4" ry="1.15" fill="#ffffff" opacity="0.35" />
      <WolfMouth type={s.mouth} />
    </g>
  );
}
function WolfMouth({ type }) {
  const ink = INK;
  switch (type) {
    case 'grin':
      return (
        <g>
          <path d="M40.5 67.5 Q50 76 59.5 67.5 Q50 71.5 40.5 67.5 Z" fill="#5e2430" />
          <polygon points="42.8,68.6 45.6,68.9 44.2,73.4" fill="#fdfdf8" />
          <polygon points="54.4,68.9 57.2,68.6 55.8,73.4" fill="#fdfdf8" />
        </g>
      );
    case 'flat':
      return <line x1="43" y1="69.5" x2="57" y2="69.5" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />;
    case 'open':
      return (
        <g>
          <ellipse cx="50" cy="71" rx="4.1" ry="4.6" fill="#5e2430" />
          <ellipse cx="50" cy="73.4" rx="2.5" ry="1.8" fill="#e0655f" />
        </g>
      );
    case 'smirk':
      return <path d="M42 69.5 Q52 74 58.5 67.5" stroke={ink} strokeWidth="2.1" fill="none" strokeLinecap="round" />;
    case 'smile':
    default:
      return <path d="M42 68.5 Q50 74.5 58 68.5" stroke={ink} strokeWidth="2.1" fill="none" strokeLinecap="round" />;
  }
}

// ---------- ALIEN ----------
function AlienFace({ s, uid }) {
  const kc = s.kindColor;
  return (
    <g>
      <defs>
        <radialGradient id={`al${uid}`} cx="0.5" cy="0.3" r="0.9">
          <stop offset="0" stopColor={shade(kc, 0.18)} />
          <stop offset="0.6" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.20)} />
        </radialGradient>
      </defs>
      <AlienTop style={s.hairStyle} kc={kc} accent={s.hairColor} />
      <path d="M50 20 C67 20 75 34 73.5 49 C72 63 61.5 79.5 50 79.5 C38.5 79.5 28 63 26.5 49 C25 34 33 20 50 20 Z" fill={`url(#al${uid})`} />
      <ellipse cx="37.5" cy="35" rx="8.5" ry="13" fill="#ffffff" opacity="0.14" transform="rotate(-11 37.5 35)" />
      <ellipse cx="50" cy="74.5" rx="8" ry="3.4" fill={shade(kc, -0.25)} opacity="0.30" />
      <AlienEyes type={s.eyes} kc={kc} />
      <g transform="translate(50 69.5) scale(0.62) translate(-50 -69.5)">
        <ExprMouth type={s.mouth} cy={69.5} />
      </g>
      <Accessory type={s.accessory} dy={-6} sc={0.94} />
    </g>
  );
}
function AlienEyes({ type, kc }) {
  const almond = (flip) => {
    const d = flip
      ? 'M52.5 49.5 Q61 39.5 70.5 50 Q61 57.5 52.5 49.5 Z'
      : 'M29.5 50 Q39 39.5 47.5 49.5 Q39 57.5 29.5 50 Z';
    const hx = flip ? 63.5 : 36;
    return (
      <g>
        <path d={d} fill="#0d141c" />
        <ellipse cx={hx} cy="46.3" rx="2.9" ry="1.7" fill="#ffffff" opacity="0.75" transform={`rotate(-16 ${hx} 46.3)`} />
      </g>
    );
  };
  switch (type) {
    case 'happy':
      return (
        <g>
          <path d="M30 52 Q38.5 43 47 51.5" stroke="#0d141c" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M53 51.5 Q61.5 43 70 52" stroke="#0d141c" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'wink':
      return (
        <g>
          {almond(false)}
          <path d="M53.5 50 Q61.5 46.8 69.5 50" stroke="#0d141c" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'sleepy':
      return (
        <g>
          {almond(false)}
          {almond(true)}
          <path d="M28.5 45.5 Q38 40.5 48.5 44.5 L48.5 40.5 Q38 36.5 28.5 41 Z" fill={shade(kc, 0.04)} />
          <path d="M51.5 44.5 Q62 40.5 71.5 45.5 L71.5 41 Q62 36.5 51.5 40.5 Z" fill={shade(kc, 0.04)} />
        </g>
      );
    case 'star':
      return (
        <g>
          {almond(false)}
          {almond(true)}
          <polygon points={starPoints(38.5, 49, 3.1, 1.4)} fill="#f5b942" />
          <polygon points={starPoints(61.5, 49, 3.1, 1.4)} fill="#f5b942" />
        </g>
      );
    case 'dots':
    default:
      return <g>{almond(false)}{almond(true)}</g>;
  }
}
function AlienTop({ style, kc, accent }) {
  const stem = { stroke: shade(kc, -0.32), strokeWidth: 2, fill: 'none', strokeLinecap: 'round' };
  switch (style) {
    case 'short':
      return (
        <g>
          <path d="M50 20.5 Q49 13.5 44.5 10.5" {...stem} />
          <circle cx="43.5" cy="9.5" r="5.5" fill={accent} opacity="0.28" />
          <circle cx="43.5" cy="9.5" r="3" fill={accent} />
        </g>
      );
    case 'spiky':
      return (
        <g fill={kc}>
          <circle cx="35.5" cy="25.5" r="3.1" />
          <circle cx="50" cy="20.5" r="3.5" />
          <circle cx="64.5" cy="25.5" r="3.1" />
        </g>
      );
    case 'mohawk':
      return <path d="M46.8 21.5 Q50 9.5 53.2 21.5 Q50 18.8 46.8 21.5 Z" fill={shade(kc, -0.06)} stroke={shade(kc, -0.28)} strokeWidth="0.8" />;
    case 'long':
      return (
        <g>
          <path d="M38 23.5 Q28 11.5 21.5 11.5" {...stem} />
          <path d="M62 23.5 Q72 11.5 78.5 11.5" {...stem} />
          <circle cx="20.5" cy="11.5" r="2.9" fill={accent} />
          <circle cx="79.5" cy="11.5" r="2.9" fill={accent} />
        </g>
      );
    case 'bun':
      return (
        <g>
          <path d="M50 20.5 L50 13" {...stem} />
          <circle cx="50" cy="10" r="2.8" fill={accent} />
          <circle cx="50" cy="10" r="5.4" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.7" />
        </g>
      );
    case 'bald':
    default:
      return null;
  }
}

// ---------- DRAGON ----------
function DragonFace({ s, uid }) {
  const kc = s.kindColor;
  const fin = s.hairColor;
  const ivory = '#e6dcc0';
  return (
    <g>
      <defs>
        <radialGradient id={`dr${uid}`} cx="0.5" cy="0.34" r="0.88">
          <stop offset="0" stopColor={shade(kc, 0.15)} />
          <stop offset="0.6" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.22)} />
        </radialGradient>
        <linearGradient id={`fl${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#facc15" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <DragonHorns style={s.hairStyle} fin={fin} ivory={ivory} behind />
      {/* side frills */}
      <path d="M27.5 43 L14 37 L19.5 49.5 L13 53.5 L21 59.5 L26 66 C22.5 58 22 50 27.5 43 Z" fill={fin} opacity="0.92" />
      <path d="M72.5 43 L86 37 L80.5 49.5 L87 53.5 L79 59.5 L74 66 C77.5 58 78 50 72.5 43 Z" fill={fin} opacity="0.92" />
      <circle cx="50" cy="52" r="24.5" fill={`url(#dr${uid})`} />
      <g stroke={shade(kc, -0.20)} strokeWidth="1.3" opacity="0.5" strokeLinecap="round" fill="none">
        <path d="M38 36.5 q4 3.6 8.5 2.8" />
        <path d="M48.5 33.5 q4 3.6 8.5 2.8" />
        <path d="M43.5 41.5 q3.6 3 7.5 2.4" />
      </g>
      <DragonHorns style={s.hairStyle} fin={fin} ivory={ivory} />
      {/* brow ridges */}
      <g stroke={shade(kc, -0.42)} strokeWidth="2.2" opacity="0.85" strokeLinecap="round">
        <path d="M31 40.5 L45.5 43" fill="none" />
        <path d="M69 40.5 L54.5 43" fill="none" />
      </g>
      <ExprEyes type={s.eyes} cy={47.5} gap={10.5} />
      {/* snout */}
      <ellipse cx="50" cy="65" rx="13.5" ry="9.5" fill={shade(kc, 0.32)} />
      <ellipse cx="50" cy="58.8" rx="7" ry="2.6" fill="#ffffff" opacity="0.16" />
      <ellipse cx="44.5" cy="61.5" rx="1.7" ry="1.2" fill={shade(kc, -0.48)} />
      <ellipse cx="55.5" cy="61.5" rx="1.7" ry="1.2" fill={shade(kc, -0.48)} />
      <DragonMouth type={s.mouth} uid={uid} />
      <Accessory type={s.accessory} dy={-8} sc={0.95} />
    </g>
  );
}
function DragonHorns({ style, fin, ivory, behind = false }) {
  if (behind) {
    if (style === 'short') {
      return (
        <g fill={ivory}>
          <path d="M34.5 32 Q23.5 26.5 21.5 13.5 Q32 15.5 38.5 25.5 Z" />
          <path d="M65.5 32 Q76.5 26.5 78.5 13.5 Q68 15.5 61.5 25.5 Z" />
        </g>
      );
    }
    if (style === 'long') {
      return (
        <g fill={ivory}>
          <path d="M34 31 Q13 27 6.5 11 Q23 9.5 39 20.5 Z" />
          <path d="M66 31 Q87 27 93.5 11 Q77 9.5 61 20.5 Z" />
        </g>
      );
    }
    if (style === 'bald') {
      return (
        <g fill={ivory}>
          <polygon points="35.5,33.5 32.5,24 41,28.5" />
          <polygon points="64.5,33.5 67.5,24 59,28.5" />
        </g>
      );
    }
    return null;
  }
  switch (style) {
    case 'spiky':
      return (
        <g fill={ivory}>
          <polygon points="35,31 33,20 39.5,27.5" />
          <polygon points="46,28.5 50,15.5 54,28.5" />
          <polygon points="65,31 67,20 60.5,27.5" />
        </g>
      );
    case 'mohawk':
      return <polygon fill={fin} opacity="0.95" points="40.5,30.5 45,15.5 48.8,28 52,13.5 55.8,28 60,16.5 62,31 50,26.5" />;
    case 'bun':
      return (
        <path d="M50 27 a6.5 6.5 0 1 1 6.5 -6.5 a4.2 4.2 0 1 0 -4.2 4.2" fill="none" stroke={ivory} strokeWidth="3" strokeLinecap="round" transform="translate(-3.5 -4)" />
      );
    default:
      return null;
  }
}
function DragonMouth({ type, uid }) {
  const ink = INK;
  const fang = { fill: '#fdfdf8' };
  switch (type) {
    case 'grin':
      return (
        <g>
          <path d="M38.5 67.5 Q50 75.5 61.5 67.5 Q50 71.8 38.5 67.5 Z" fill="#5e2430" />
          <polygon points="41.8,68.4 44.6,68.7 43.2,73.2" {...fang} />
          <polygon points="55.4,68.7 58.2,68.4 56.8,73.2" {...fang} />
        </g>
      );
    case 'flat':
      return <line x1="42" y1="69.5" x2="58" y2="69.5" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />;
    case 'open':
      return (
        <g>
          <ellipse cx="50" cy="70.5" rx="4.4" ry="4.1" fill="#6d1f1f" />
          <path d="M50 93 C43 85.5 45 79.5 50 74.5 C55 79.5 57 85.5 50 93 Z" fill={`url(#fl${uid})`} />
          <path d="M50 89.5 C46.8 85.8 47.8 82 50 79 C52.2 82 53.2 85.8 50 89.5 Z" fill="#fde047" />
        </g>
      );
    case 'smirk':
      return (
        <g>
          <path d="M41 69 Q51 73.5 59 66.5" stroke={ink} strokeWidth="2.1" fill="none" strokeLinecap="round" />
          <polygon points="55.5,68.3 58,68 56.9,71.8" {...fang} />
        </g>
      );
    case 'smile':
    default:
      return (
        <g>
          <path d="M41 68 Q50 74.5 59 68" stroke={ink} strokeWidth="2.1" fill="none" strokeLinecap="round" />
          <polygon points="43,69.3 45.4,69.5 44.2,73.4" {...fang} />
        </g>
      );
  }
}

// ---------- PUMPKIN ----------
function PumpkinFace({ s, uid }) {
  const kc = s.kindColor;
  const glow = s.hairColor;
  return (
    <g>
      <defs>
        <radialGradient id={`pu${uid}`} cx="0.5" cy="0.34" r="0.9">
          <stop offset="0" stopColor={shade(kc, 0.16)} />
          <stop offset="0.6" stopColor={kc} />
          <stop offset="1" stopColor={shade(kc, -0.20)} />
        </radialGradient>
      </defs>
      <PumpkinTop style={s.hairStyle} />
      <ellipse cx="33.5" cy="57" rx="13" ry="21" fill={`url(#pu${uid})`} />
      <ellipse cx="66.5" cy="57" rx="13" ry="21" fill={`url(#pu${uid})`} />
      <ellipse cx="50" cy="57" rx="23" ry="23.5" fill={`url(#pu${uid})`} />
      <g stroke={shade(kc, -0.24)} strokeWidth="1.4" opacity="0.45" fill="none">
        <path d="M41.5 35.5 C36.5 49 36.5 65 41.5 78.5" />
        <path d="M58.5 35.5 C63.5 49 63.5 65 58.5 78.5" />
      </g>
      <ellipse cx="50" cy="36.5" rx="13" ry="4.6" fill={shade(kc, -0.16)} opacity="0.30" />
      <PumpkinEyes type={s.eyes} glow={glow} />
      <PumpkinMouth type={s.mouth} glow={glow} />
      <Accessory type={s.accessory} dy={-6} sc={0.97} />
    </g>
  );
}
function PumpkinEyes({ type, glow }) {
  const dark = '#2e1503';
  const tri = (flip) => (flip ? '53,54.5 60,42 67,54.5' : '33,54.5 40,42 47,54.5');
  const triIn = (flip) => (flip ? '56.6,52.4 60,45.6 63.4,52.4' : '36.6,52.4 40,45.6 43.4,52.4');
  const eye = (flip) => (
    <g>
      <ellipse cx={flip ? 60 : 40} cy="49" rx="8.5" ry="7.5" fill={glow} opacity="0.16" />
      <polygon points={tri(flip)} fill={dark} />
      <polygon points={triIn(flip)} fill={glow} opacity="0.92" />
    </g>
  );
  switch (type) {
    case 'happy':
      return (
        <g fill={dark}>
          <path d="M32.5 52.5 Q40 42.5 47.5 52.5 Q40 48.3 32.5 52.5 Z" />
          <path d="M52.5 52.5 Q60 42.5 67.5 52.5 Q60 48.3 52.5 52.5 Z" />
          <path d="M35 51.8 Q40 45.8 45 51.8 Q40 49.3 35 51.8 Z" fill={glow} opacity="0.9" />
          <path d="M55 51.8 Q60 45.8 65 51.8 Q60 49.3 55 51.8 Z" fill={glow} opacity="0.9" />
        </g>
      );
    case 'wink':
      return (
        <g>
          {eye(false)}
          <polygon points="53.5,49.5 66.5,49.5 66.5,53 53.5,53" fill={dark} />
          <rect x="56" y="50.4" width="8" height="1.7" fill={glow} opacity="0.9" />
        </g>
      );
    case 'sleepy':
      return (
        <g fill={dark}>
          <polygon points="33,51 40,44.5 47,51" />
          <polygon points="53,51 60,44.5 67,51" />
          <polygon points="36.8,50 40,47.2 43.2,50" fill={glow} opacity="0.85" />
          <polygon points="56.8,50 60,47.2 63.2,50" fill={glow} opacity="0.85" />
        </g>
      );
    case 'star':
      return (
        <g>
          <polygon points={starPoints(40, 49, 6.6, 2.9)} fill={dark} />
          <polygon points={starPoints(60, 49, 6.6, 2.9)} fill={dark} />
          <polygon points={starPoints(40, 49, 3.6, 1.6)} fill={glow} opacity="0.92" />
          <polygon points={starPoints(60, 49, 3.6, 1.6)} fill={glow} opacity="0.92" />
        </g>
      );
    case 'dots':
    default:
      return <g>{eye(false)}{eye(true)}</g>;
  }
}
function PumpkinMouth({ type, glow }) {
  const dark = '#2e1503';
  switch (type) {
    case 'grin':
      return (
        <g>
          <path d="M30 62.5 L36 69.5 L41 63 L46 70.5 L51 63 L56 70 L61 63 L66 69.5 L70 62.5 L70 68.5 Q50 77 30 68.5 Z" fill={dark} />
          <path d="M34.5 64.8 L38.5 69.2 L42.5 65.2 L46.5 69.6 L50.5 65.2 L54.5 69.4 L58.5 65.2 L62.5 69.2 L65.8 64.8 L65.8 67.8 Q50 73.5 34.5 67.8 Z" fill={glow} opacity="0.9" />
        </g>
      );
    case 'flat':
      return (
        <g>
          <rect x="36" y="64.5" width="28" height="4.6" rx="2.2" fill={dark} />
          <rect x="39" y="66" width="22" height="1.6" fill={glow} opacity="0.85" />
        </g>
      );
    case 'open':
      return (
        <g>
          <ellipse cx="50" cy="67.5" rx="7" ry="8" fill={dark} />
          <ellipse cx="50" cy="67.5" rx="4" ry="5" fill={glow} opacity="0.9" />
        </g>
      );
    case 'smirk':
      return (
        <g>
          <path d="M38 64.5 L44 69.5 L49 64.8 L54 69.5 L60.5 63.5 L60.5 68 Q49.5 73 38 68 Z" fill={dark} />
          <path d="M41.5 66.3 L45.5 69.3 L49.5 66.5 L53.5 69.3 L57.5 65.8 L57.5 67.6 Q49.5 71 41.5 67.6 Z" fill={glow} opacity="0.88" />
        </g>
      );
    case 'smile':
    default:
      return (
        <g>
          <path d="M34 63.5 Q50 76 66 63.5 Q50 69.5 34 63.5 Z" fill={dark} />
          <path d="M38.5 65.2 Q50 72 61.5 65.2 Q50 68.6 38.5 65.2 Z" fill={glow} opacity="0.88" />
        </g>
      );
  }
}
function PumpkinTop({ style }) {
  const stem = '#66823a';
  const stemD = '#4a6428';
  const leaf = '#4d7c2a';
  const stub = <path d="M46 33.5 L47 24.5 Q50 22.4 53 24.5 L54 33.5 Q50 35.4 46 33.5 Z" fill={stem} stroke={stemD} strokeWidth="0.8" />;
  switch (style) {
    case 'short':
      return (
        <g>
          {stub}
          <path d="M53 26 Q60.5 20.5 57 14.5" stroke={stem} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'spiky':
      return (
        <g>
          {stub}
          <path d="M50 28.5 Q38.5 19.5 33.5 25.5 Q41.5 32.5 50 30.5 Z" fill={leaf} />
          <path d="M50 28.5 Q59.5 17 66 21.5 Q60.5 30.5 50 30.5 Z" fill={leaf} />
        </g>
      );
    case 'mohawk':
      return <path d="M45.8 34 L46 15.5 Q50 12.8 54 15.5 L54.2 34 Q50 36 45.8 34 Z" fill={stem} stroke={stemD} strokeWidth="0.8" />;
    case 'long':
      return (
        <g>
          {stub}
          <path d="M54 25.5 Q66.5 30.5 64.5 44 Q63.5 52 58 56.5" stroke={stem} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M58 56.5 Q52.5 51 55.5 45.5 Q60.5 49.5 58 56.5 Z" fill={leaf} />
        </g>
      );
    case 'bun':
      return (
        <g>
          {stub}
          <path d="M50 24.5 Q42 12.5 50 8 Q58 12.5 50 24.5 Z" fill={leaf} />
        </g>
      );
    case 'bald':
    default:
      return stub;
  }
}

// ---------- renderer dispatch ----------
export function BuilderSvg({ spec }) {
  const s = { ...AVATAR_DEFAULT, ...(spec || {}) };
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const kind = KIND_IDS.includes(s.kind) ? s.kind : 'human';
  const bg = s.bgColor;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="Built avatar">
      <defs>
        <radialGradient id={`bg${uid}`} cx="0.38" cy="0.3" r="0.95">
          <stop offset="0" stopColor={shade(bg, 0.22)} />
          <stop offset="0.55" stopColor={bg} />
          <stop offset="1" stopColor={shade(bg, -0.35)} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#bg${uid})`} />
      <ellipse cx="34" cy="16" rx="30" ry="15" fill="#ffffff" opacity="0.07" />
      {kind === 'human' && <HumanFace s={s} uid={uid} />}
      {kind === 'ghost' && <GhostFace s={s} uid={uid} />}
      {kind === 'skull' && <SkullFace s={s} uid={uid} />}
      {kind === 'robot' && <RobotFace s={s} uid={uid} />}
      {kind === 'cat' && <BeastFace s={s} uid={uid} wolf={false} />}
      {kind === 'wolf' && <BeastFace s={s} uid={uid} wolf />}
      {kind === 'alien' && <AlienFace s={s} uid={uid} />}
      {kind === 'dragon' && <DragonFace s={s} uid={uid} />}
      {kind === 'pumpkin' && <PumpkinFace s={s} uid={uid} />}
    </svg>
  );
}

// The one avatar component used everywhere: feed, comments, people,
// DMs, chat, profile. Honors the user's avatarMode:
//   photo   -> bucket photo (falls through if the photo is gone)
//   builder -> deterministic SVG from their spec
//   emoji   -> their picked emoji (default)
export default function AvatarView({ user, size = 36 }) {
  const style = { width: size, height: size };
  if (!user) {
    return (
      <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-slate-700 to-slate-900 shadow-md shadow-black/40 ring-1 ring-white/15">
        <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>🤫</span>
      </span>
    );
  }
  if (user.avatarMode === 'photo' && user.avatarPhotoUrl) {
    const src = user.avatarPhotoUrl.startsWith('http') ? user.avatarPhotoUrl : API_BASE + user.avatarPhotoUrl;
    return (
      <img
        src={src}
        alt={user.displayName || user.handle || 'avatar'}
        style={style}
        className="shrink-0 rounded-full object-cover shadow-md shadow-black/40 ring-1 ring-white/25"
      />
    );
  }
  if (user.avatarMode === 'builder') {
    return (
      <span style={style} className="block shrink-0 overflow-hidden rounded-full shadow-md shadow-black/40 ring-1 ring-white/20">
        <BuilderSvg spec={user.avatar} />
      </span>
    );
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-slate-700 to-slate-900 shadow-md shadow-black/40 ring-1 ring-white/15">
      <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>{user.avatarEmoji || '🤫'}</span>
    </span>
  );
}
