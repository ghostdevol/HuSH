// Profile themes — pure CSS + inline SVG, no image files.
// Each theme reskins the owner's profile page for every viewer:
// palette + a tiled background pattern + a frame drawn around the
// header card and post cards. All launch themes stay dark enough
// that the app's light body text keeps its contrast.

export const THEMES = {
  midnight: {
    id: 'midnight', name: 'Midnight', glyph: '🌙',
    bg: '#04060a', cardBg: 'rgba(255,255,255,0.05)', accent: '#a78bfa',
    text: '#f1f5f9', frameColor: 'rgba(255,255,255,0.08)',
    pattern: 'none', frame: 'plain'
  },
  ghosttech: {
    id: 'ghosttech', name: 'GhostTech', glyph: '💻',
    bg: '#020a04', cardBg: 'rgba(0,40,16,0.35)', accent: '#22ff88',
    text: '#d1fae5', frameColor: 'rgba(34,255,136,0.4)',
    pattern: 'grid', frame: 'terminal'
  },
  skulls: {
    id: 'skulls', name: 'Skulls', glyph: '💀',
    bg: '#0b0b0d', cardBg: 'rgba(255,255,255,0.04)', accent: '#d4d4d8',
    text: '#f4f4f5', frameColor: 'rgba(212,212,216,0.35)',
    pattern: 'skulls', frame: 'corners'
  },
  barbedwire: {
    id: 'barbedwire', name: 'Barbed Wire', glyph: '🪢',
    bg: '#101216', cardBg: 'rgba(148,163,184,0.07)', accent: '#94a3b8',
    text: '#e2e8f0', frameColor: 'rgba(148,163,184,0.5)',
    pattern: 'diagonal', frame: 'wire'
  },
  chrome: {
    id: 'chrome', name: 'Chrome Garage', glyph: '🔧',
    bg: '#0d0f12', cardBg: 'rgba(255,255,255,0.06)', accent: '#fb923c',
    text: '#f1f5f9', frameColor: 'rgba(251,146,60,0.45)',
    pattern: 'brushed', frame: 'stripe'
  },
  glitter: {
    id: 'glitter', name: 'Pink Glitter', glyph: '✨',
    bg: '#2a0f1e', cardBg: 'rgba(244,114,182,0.08)', accent: '#f472b6',
    text: '#fdf2f8', frameColor: 'rgba(244,114,182,0.45)',
    pattern: 'sparkles', frame: 'corners'
  },
  hearts: {
    id: 'hearts', name: 'Hearts & Roses', glyph: '🌹',
    bg: '#22060d', cardBg: 'rgba(244,63,94,0.07)', accent: '#fb7185',
    text: '#fff1f2', frameColor: 'rgba(251,113,133,0.45)',
    pattern: 'hearts', frame: 'corners'
  },
  butterfly: {
    id: 'butterfly', name: 'Butterfly Garden', glyph: '🦋',
    bg: '#140b26', cardBg: 'rgba(45,212,191,0.06)', accent: '#2dd4bf',
    text: '#f5f3ff', frameColor: 'rgba(167,139,250,0.45)',
    pattern: 'butterflies', frame: 'corners'
  }
};

export const THEME_LIST = Object.values(THEMES);

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES.midnight;
}
