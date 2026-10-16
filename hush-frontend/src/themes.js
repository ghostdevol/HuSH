// Profile themes — pure CSS + inline SVG, no image files.
// Each theme reskins the owner's profile page for every viewer:
// palette + a tiled background pattern + a frame drawn around the
// header card and post cards. All launch themes stay dark enough
// that the app's light body text keeps its contrast.

export const THEMES = {
  midnight: {
    id: 'midnight', name: 'Midnight', glyph: '🌙',
    bg: '#04060a', cardBg: 'rgba(255,255,255,0.05)', accent: '#a78bfa',
    cardGradient: 'linear-gradient(165deg, rgba(167,139,250,0.12), rgba(255,255,255,0.045) 45%, rgba(0,0,0,0.30))',
    text: '#f1f5f9', frameColor: 'rgba(255,255,255,0.08)',
    pattern: 'none', frame: 'plain'
  },
  ghosttech: {
    id: 'ghosttech', name: 'GhostTech', glyph: '💻',
    bg: '#020a04', cardBg: 'rgba(0,40,16,0.35)', accent: '#22ff88',
    cardGradient: 'linear-gradient(165deg, rgba(34,255,136,0.13), rgba(0,40,16,0.32) 45%, rgba(0,0,0,0.35))',
    text: '#d1fae5', frameColor: 'rgba(34,255,136,0.4)',
    pattern: 'grid', frame: 'terminal'
  },
  skulls: {
    id: 'skulls', name: 'Skulls', glyph: '💀',
    bg: '#0b0b0d', cardBg: 'rgba(255,255,255,0.04)', accent: '#d4d4d8',
    cardGradient: 'linear-gradient(165deg, rgba(212,212,216,0.10), rgba(255,255,255,0.035) 45%, rgba(0,0,0,0.32))',
    text: '#f4f4f5', frameColor: 'rgba(212,212,216,0.35)',
    pattern: 'skulls', frame: 'corners'
  },
  barbedwire: {
    id: 'barbedwire', name: 'Barbed Wire', glyph: '🪢',
    bg: '#101216', cardBg: 'rgba(148,163,184,0.07)', accent: '#94a3b8',
    cardGradient: 'linear-gradient(165deg, rgba(148,163,184,0.13), rgba(148,163,184,0.06) 45%, rgba(0,0,0,0.30))',
    text: '#e2e8f0', frameColor: 'rgba(148,163,184,0.5)',
    pattern: 'diagonal', frame: 'wire'
  },
  chrome: {
    id: 'chrome', name: 'Chrome Garage', glyph: '🔧',
    bg: '#0d0f12', cardBg: 'rgba(255,255,255,0.06)', accent: '#fb923c',
    cardGradient: 'linear-gradient(165deg, rgba(251,146,60,0.12), rgba(255,255,255,0.05) 45%, rgba(0,0,0,0.30))',
    text: '#f1f5f9', frameColor: 'rgba(251,146,60,0.45)',
    pattern: 'brushed', frame: 'stripe'
  },
  glitter: {
    id: 'glitter', name: 'Pink Glitter', glyph: '✨',
    bg: '#2a0f1e', cardBg: 'rgba(244,114,182,0.08)', accent: '#f472b6',
    cardGradient: 'linear-gradient(165deg, rgba(244,114,182,0.16), rgba(244,114,182,0.07) 45%, rgba(20,0,10,0.35))',
    text: '#fdf2f8', frameColor: 'rgba(244,114,182,0.45)',
    pattern: 'sparkles', frame: 'corners'
  },
  hearts: {
    id: 'hearts', name: 'Hearts & Roses', glyph: '🌹',
    bg: '#22060d', cardBg: 'rgba(244,63,94,0.07)', accent: '#fb7185',
    cardGradient: 'linear-gradient(165deg, rgba(251,113,133,0.15), rgba(244,63,94,0.06) 45%, rgba(15,0,4,0.35))',
    text: '#fff1f2', frameColor: 'rgba(251,113,133,0.45)',
    pattern: 'hearts', frame: 'corners'
  },
  butterfly: {
    id: 'butterfly', name: 'Butterfly Garden', glyph: '🦋',
    bg: '#140b26', cardBg: 'rgba(45,212,191,0.06)', accent: '#2dd4bf',
    cardGradient: 'linear-gradient(165deg, rgba(167,139,250,0.14), rgba(45,212,191,0.05) 45%, rgba(0,0,0,0.32))',
    text: '#f5f3ff', frameColor: 'rgba(167,139,250,0.45)',
    pattern: 'butterflies', frame: 'corners'
  }
};

export const THEME_LIST = Object.values(THEMES);

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES.midnight;
}
