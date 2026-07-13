// utils/ttlCache.js
const store = new Map();

function get(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.val;
}

function set(key, val, ttlMs = 60_000) {
  store.set(key, { val, exp: Date.now() + ttlMs });
}

async function wrap(key, ttlMs, fn) {
  const cached = get(key);
  if (cached !== null) return cached;
  const val = await fn();
  set(key, val, ttlMs);
  return val;
}

module.exports = { get, set, wrap };
