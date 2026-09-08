const isProd = import.meta.env.PROD;

export const API_URL = isProd
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:5000';

export const WS_URL = isProd
  ? import.meta.env.VITE_WS_URL
  : 'ws://localhost:5000';

