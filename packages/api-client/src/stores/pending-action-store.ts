import { create } from "zustand";

interface PendingAction {
  targetRoute: string;
  method: string;
  url: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface PendingActionState {
  pendingAction: PendingAction | null;
  setPendingAction: (action: Omit<PendingAction, "timestamp">) => void;
  getAndClearPendingAction: () => PendingAction | null;
  clearPendingAction: () => void;
  hasPendingAction: () => boolean;
}

const EXPIRY_MS = 5 * 60 * 1000;

export const usePendingActionStore = create<PendingActionState>((set, get) => ({
  pendingAction: null,

  setPendingAction: (action) => {
    set({ pendingAction: { ...action, timestamp: Date.now() } });
  },

  getAndClearPendingAction: () => {
    const { pendingAction } = get();
    if (!pendingAction) return null;
    if (Date.now() - pendingAction.timestamp > EXPIRY_MS) {
      set({ pendingAction: null });
      return null;
    }
    const action = pendingAction;
    set({ pendingAction: null });
    return action;
  },

  clearPendingAction: () => {
    set({ pendingAction: null });
  },

  hasPendingAction: () => {
    const { pendingAction } = get();
    if (!pendingAction) return false;
    if (Date.now() - pendingAction.timestamp > EXPIRY_MS) {
      set({ pendingAction: null });
      return false;
    }
    return true;
  },
}));
