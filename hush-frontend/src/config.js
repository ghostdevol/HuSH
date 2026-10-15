// Single source of truth for the HuSH backend base.
// Set VITE_HUSH_API at build time to point elsewhere; otherwise the
// production Render backend is used (absolute URL so the Capacitor
// APK build talks to the same live backend as the web app).
const DEFAULT_API = 'https://hush-5i33.onrender.com';

export const API_BASE = (import.meta.env.VITE_HUSH_API || DEFAULT_API).replace(/\/$/, '');

// VITE_WS_URL still wins if explicitly set (legacy Vercel setup);
// otherwise derive the socket URL from the API base.
export const WS_BASE =
  import.meta.env.VITE_WS_URL || API_BASE.replace(/^http/, 'ws') + '/ws';
