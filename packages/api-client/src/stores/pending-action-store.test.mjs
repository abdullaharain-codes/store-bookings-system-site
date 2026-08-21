import { test } from "node:test";
import assert from "node:assert/strict";

function makeSessionStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    _map: map,
  };
}

async function loadStore(storage) {
  globalThis.sessionStorage = storage;
  return import(`./pending-action-store.ts?run=${Date.now()}-${Math.random()}`);
}

const SAMPLE = {
  targetRoute: "/account/bookings/new",
  method: "POST",
  url: "/api/v1/bookings",
  data: { service_id: 7, notes: "screen replacement" },
};

test("pending action survives a simulated reload via sessionStorage and is consumed+removed", async () => {
  const storage = makeSessionStorage();

  const first = await loadStore(storage);
  first.usePendingActionStore.getState().setPendingAction(SAMPLE);

  const storedRaw = storage._map.get("pending-action");
  assert.ok(storedRaw, "entry written to sessionStorage");
  const stored = JSON.parse(storedRaw);
  assert.equal(stored.action.targetRoute, SAMPLE.targetRoute);
  assert.equal(typeof stored.timestamp, "number");
  assert.ok(Date.now() - stored.timestamp < 1000);

  // simulated reload: brand-new module instance over the same session storage
  const second = await loadStore(storage);
  const state = second.usePendingActionStore.getState();
  assert.deepEqual(state.pendingAction, { ...SAMPLE, timestamp: stored.timestamp });
  assert.equal(state.hasPendingAction(), true);

  const resumed = state.getAndClearPendingAction();
  assert.equal(resumed.targetRoute, SAMPLE.targetRoute);
  assert.equal(storage._map.has("pending-action"), false, "removed from sessionStorage on consume");
  assert.equal(second.usePendingActionStore.getState().pendingAction, null);
});

test("expired entry (>5 min old) is discarded on store init and removed from sessionStorage", async () => {
  const storage = makeSessionStorage();
  const expired = {
    action: { ...SAMPLE },
    timestamp: Date.now() - 6 * 60 * 1000,
  };
  storage._map.set("pending-action", JSON.stringify(expired));

  const mod = await loadStore(storage);
  const state = mod.usePendingActionStore.getState();

  assert.equal(state.pendingAction, null, "not hydrated when expired");
  assert.equal(state.hasPendingAction(), false);
  assert.equal(state.getAndClearPendingAction(), null);
  assert.equal(storage._map.has("pending-action"), false, "expired entry discarded from sessionStorage");
});
