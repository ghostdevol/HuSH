import React from 'react';
import { API_BASE } from '../config';

// Deterministic SVG renderer for built avatars. The same spec object
// always draws the same face — no randomness, no external assets.
// Spec: { style:'builder', skin, hairStyle, hairColor, eyes, mouth,
//         accessory, bgColor } — slot values validated by the backend.

export const AVATAR_DEFAULT = {
  style: 'builder', skin: '#f1c27d', hairStyle: 'short', hairColor: '#3b2314',
  eyes: 'dots', mouth: 'smile', accessory: 'none', bgColor: '#312e81'
};

function Hair({ style, color }) {
  switch (style) {
    case 'bald':
      return <ellipse cx="38" cy="38" rx="7" ry="4" fill="#ffffff" opacity="0.18" />;
    case 'spiky':
      return <polygon fill={color} points="24,54 28,36 36,46 42,29 50,43 58,29 64,46 72,36 76,54 64,43 50,39 36,43" />;
    case 'mohawk':
      return <path fill={color} d="M44 56 L44 24 Q50 13 56 24 L56 56 Q50 47 44 56 Z" />;
    case 'long':
      return (
        <g fill={color}>
          <path d="M23 52 C23 31 77 31 77 52 C77 41 66 35 50 35 C34 35 23 41 23 52 Z" />
          <rect x="19" y="46" width="10" height="36" rx="5" />
          <rect x="71" y="46" width="10" height="36" rx="5" />
        </g>
      );
    case 'bun':
      return (
        <g fill={color}>
          <circle cx="50" cy="21" r="9" />
          <path d="M23 52 C23 31 77 31 77 52 C77 41 66 35 50 35 C34 35 23 41 23 52 Z" />
        </g>
      );
    case 'short':
    default:
      return <path fill={color} d="M23 52 C23 31 77 31 77 52 C77 41 66 35 50 35 C34 35 23 41 23 52 Z" />;
  }
}

function Eyes({ type }) {
  const dark = '#1f2937';
  switch (type) {
    case 'happy':
      return (
        <g stroke={dark} strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M35 57 Q40 51 45 57" />
          <path d="M55 57 Q60 51 65 57" />
        </g>
      );
    case 'wink':
      return (
        <g>
          <circle cx="40" cy="56" r="3.2" fill={dark} />
          <line x1="55" y1="56" x2="65" y2="56" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'sleepy':
      return (
        <g stroke={dark} strokeWidth="2.4" strokeLinecap="round">
          <line x1="35" y1="57" x2="45" y2="57" />
          <line x1="55" y1="57" x2="65" y2="57" />
        </g>
      );
    case 'star':
      return (
        <g fill="#f59e0b" fontSize="12" fontWeight="bold" textAnchor="middle">
          <text x="40" y="60">★</text>
          <text x="60" y="60">★</text>
        </g>
      );
    case 'dots':
    default:
      return (
        <g fill={dark}>
          <circle cx="40" cy="56" r="3.2" />
          <circle cx="60" cy="56" r="3.2" />
        </g>
      );
  }
}

function Mouth({ type }) {
  const dark = '#1f2937';
  switch (type) {
    case 'grin':
      return (
        <g>
          <rect x="41" y="64" width="18" height="9" rx="3" fill="#ffffff" stroke={dark} strokeWidth="1.6" />
          <line x1="41" y1="68.5" x2="59" y2="68.5" stroke={dark} strokeWidth="1" />
        </g>
      );
    case 'flat':
      return <line x1="43" y1="69" x2="57" y2="69" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />;
    case 'open':
      return <ellipse cx="50" cy="70" rx="5" ry="6" fill="#7f1d1d" />;
    case 'smirk':
      return <path d="M43 69 Q52 74 58 66" stroke={dark} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    case 'smile':
    default:
      return <path d="M41 67 Q50 75 59 67" stroke={dark} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  }
}

function Accessory({ type }) {
  switch (type) {
    case 'glasses':
      return (
        <g stroke="#111827" strokeWidth="2" fill="#ffffff" fillOpacity="0.08">
          <circle cx="40" cy="56" r="8.5" />
          <circle cx="60" cy="56" r="8.5" />
          <line x1="48.5" y1="56" x2="51.5" y2="56" />
          <line x1="31.5" y1="54" x2="24" y2="52" />
          <line x1="68.5" y1="54" x2="76" y2="52" />
        </g>
      );
    case 'shades':
      return (
        <g fill="#111827">
          <rect x="30" y="49" width="19" height="12" rx="3" />
          <rect x="51" y="49" width="19" height="12" rx="3" />
          <rect x="47" y="53" width="6" height="3" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M23 48 C23 27 77 27 77 48 Z" fill="#b91c1c" />
          <rect x="17" y="46" width="66" height="5" rx="2.5" fill="#7f1d1d" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M22 60 A28 28 0 0 1 78 60" stroke="#111827" strokeWidth="4" fill="none" />
          <rect x="15" y="54" width="10" height="19" rx="4" fill="#111827" />
          <rect x="75" y="54" width="10" height="19" rx="4" fill="#111827" />
        </g>
      );
    default:
      return null;
  }
}

export function BuilderSvg({ spec }) {
  const s = { ...AVATAR_DEFAULT, ...(spec || {}) };
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="Built avatar">
      <rect width="100" height="100" fill={s.bgColor} />
      <path d="M14 100 C14 82 34 75 50 75 C66 75 86 82 86 100 Z" fill="#0f172a" opacity="0.55" />
      <circle cx="23" cy="56" r="5" fill={s.skin} />
      <circle cx="77" cy="56" r="5" fill={s.skin} />
      <circle cx="50" cy="54" r="27" fill={s.skin} />
      <Hair style={s.hairStyle} color={s.hairColor} />
      <Eyes type={s.eyes} />
      <Mouth type={s.mouth} />
      <Accessory type={s.accessory} />
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
      <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg">
        🤫
      </span>
    );
  }
  if (user.avatarMode === 'photo' && user.avatarPhotoUrl) {
    const src = user.avatarPhotoUrl.startsWith('http') ? user.avatarPhotoUrl : API_BASE + user.avatarPhotoUrl;
    return <img src={src} alt={user.displayName || user.handle || 'avatar'} style={style} className="shrink-0 rounded-full object-cover" />;
  }
  if (user.avatarMode === 'builder') {
    return (
      <span style={style} className="block shrink-0 overflow-hidden rounded-full">
        <BuilderSvg spec={user.avatar} />
      </span>
    );
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-slate-800" >
      <span style={{ fontSize: size * 0.52, lineHeight: 1 }}>{user.avatarEmoji || '🤫'}</span>
    </span>
  );
}
