import { create } from 'zustand';

const useAppStore = create(set => ({
  realm: 'platonic-friend-circles',
  connectionStatus: 'disconnected',
  liveCamStatus: 'idle',
  windows: {},
  setRealm: realm => set({ realm }),
  setConnectionStatus: status => set({ connectionStatus: status }),
  setLiveCamStatus: status => set({ liveCamStatus: status }),
  setWindowState: (id, state) =>
    set(s => ({ windows: { ...s.windows, [id]: state } })),
}));

export default useAppStore;

