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

const STORAGE_KEY = "pending-action";

function readStoredEntry(): { action: PendingAction; timestamp: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { action: PendingAction; timestamp: number };
    if (Date.now() - entry.timestamp > EXPIRY_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function persistEntry(action: PendingAction): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ action, timestamp: action.timestamp }));
  } catch {
    // storage unavailable (quota/private mode): keep memory-only behavior
  }
}

function removeStoredEntry(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const usePendingActionStore = create<PendingActionState>((set, get) => ({
  pendingAction: readStoredEntry()?.action ?? null,

  setPendingAction: (action) => {
    const next = { ...action, timestamp: Date.now() };
    persistEntry(next);
    set({ pendingAction: next });
  },

  getAndClearPendingAction: () => {
    const { pendingAction } = get();
    if (!pendingAction) return null;
    if (Date.now() - pendingAction.timestamp > EXPIRY_MS) {
      set({ pendingAction: null });
      removeStoredEntry();
      return null;
    }
    const action = pendingAction;
    set({ pendingAction: null });
    removeStoredEntry();
    return action;
  },

  clearPendingAction: () => {
    set({ pendingAction: null });
    removeStoredEntry();
  },

  hasPendingAction: () => {
    const { pendingAction } = get();
    if (!pendingAction) return false;
    if (Date.now() - pendingAction.timestamp > EXPIRY_MS) {
      set({ pendingAction: null });
      removeStoredEntry();
      return false;
    }
    return true;
  },
}));
