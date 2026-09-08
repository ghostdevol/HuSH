import { WS_URL } from '../config/env';

let socket;

export const createSocket = () => {
  socket = new WebSocket(WS_URL);
  return socket;
};

export const getSocket = () => socket;

