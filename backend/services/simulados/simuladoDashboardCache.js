'use strict';

class SimuladoDashboardCache {
  constructor({ ttlMs = 30000, maxEntries = 120 } = {}) {
    this.ttlMs = Math.max(1000, Number(ttlMs) || 30000);
    this.maxEntries = Math.max(10, Number(maxEntries) || 120);
    this.cache = new Map();
    this.inflight = new Map();
  }

  prune(now = Date.now()) {
    for (const [key, item] of this.cache.entries()) {
      if (!item || item.expiresAt <= now) this.cache.delete(key);
    }
    if (this.cache.size <= this.maxEntries) return;
    const ordered = [...this.cache.entries()].sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    while (this.cache.size > this.maxEntries && ordered.length) {
      const [key] = ordered.shift();
      this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
  }

  invalidatePrefix(prefix) {
    const value = String(prefix || '');
    if (!value) return;
    for (const key of this.cache.keys()) {
      if (String(key).startsWith(value)) this.cache.delete(key);
    }
  }

  async getOrCreate(key, producer, { force = false } = {}) {
    const cacheKey = String(key || '');
    if (!cacheKey) throw new Error('Chave de cache do dashboard inválida.');
    if (typeof producer !== 'function') throw new Error('Produtor do dashboard inválido.');

    const now = Date.now();
    this.prune(now);

    if (!force) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return { value: cached.value, source: 'hit' };
      }
    }

    // Mesmo quando force=true, uma segunda chamada concorrente compartilha o processamento
    // já em andamento. Isso evita duas agregações pesadas simultâneas para o mesmo painel.
    if (this.inflight.has(cacheKey)) {
      return { value: await this.inflight.get(cacheKey), source: 'shared' };
    }

    const promise = Promise.resolve()
      .then(() => producer())
      .then((value) => {
        const createdAt = Date.now();
        this.cache.set(cacheKey, {
          value,
          createdAt,
          expiresAt: createdAt + this.ttlMs,
        });
        this.prune(createdAt);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(cacheKey) === promise) this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, promise);
    return { value: await promise, source: 'miss' };
  }
}

module.exports = { SimuladoDashboardCache };
