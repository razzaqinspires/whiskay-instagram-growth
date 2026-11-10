/**
 * WHISKAY Instagram Multi-Provider Fallback Engine.
 * Only WHISKAY-owned adapters are executable. Contributed scripts remain archived.
 */
import KolInstagramScraper from '../../media/kol-instagram-downloader.mjs';

const BLOCKED_PROVIDERS = Object.freeze([
  {
    id: 'snapgram-contributed',
    name: 'Snapgram.io',
    sourcePath: 'library/contributed/cjs/snapgram-scraper.cjs',
    state: 'quarantined',
    reason: 'Requires third-party CAPTCHA-solving service; execution disabled pending compliant access method and credential rotation.'
  },
  {
    id: 'igram-contributed',
    name: 'iGram.world',
    sourcePath: 'library/contributed/cjs/igram-world-scraper.cjs',
    state: 'quarantined',
    reason: 'Requires third-party CAPTCHA-solving and executes downloaded remote signer code in a VM; execution disabled pending security review and compliant access method.'
  }
]);

function publicError(error) {
  return String(error?.message || error || 'Provider gagal.')
    .replace(/(?:api[_-]?key|authorization|bearer|token)\s*[:=]\s*[^\s,;]+/ig, '[REDACTED]')
    .replace(/https?:\/\/\S+/g, '[URL]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
}

export function createInstagramFallbackEngine({
  providers,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000
} = {}) {
  const kol = new KolInstagramScraper({ fetchImpl, timeoutMs });
  const activeProviders = providers || [{
    id: 'kol-id',
    name: 'KOL.ID',
    enabled: true,
    async extract(url) {
      const result = await kol.fetchMediaInfo(url);
      const media = download ? await kol.downloadResult(result) : [];
      return { result, media };
    }
  }];

  const states = new Map(activeProviders.map(provider => [provider.id, {
    id: provider.id, name: provider.name || provider.id,
    enabled: provider.enabled !== false, successes: 0, failures: 0,
    consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null,
    cooldownUntil: 0, lastError: null
  }]));

  async function extract(url, { download = true } = {}) {
    const attempts = [];
    for (const provider of activeProviders) {
      const state = states.get(provider.id);
      if (!provider || !state || !state.enabled) continue;
      if (state.cooldownUntil > Date.now()) {
        attempts.push({ provider: provider.id, outcome: 'cooldown' });
        continue;
      }
      const started = Date.now();
      try {
        const value = await provider.extract(url, { download });
        if (!value?.result?.media?.length) throw new Error('Provider mengembalikan hasil media kosong.');
        state.successes += 1;
        state.consecutiveFailures = 0;
        state.lastSuccessAt = new Date().toISOString();
        state.lastError = null;
        state.cooldownUntil = 0;
        return {
          provider: provider.id,
          result: value.result,
          media: download ? (value.media || []) : [],
          attempts: [...attempts, { provider: provider.id, outcome: 'success', durationMs: Date.now() - started }]
        };
      } catch (error) {
        state.failures += 1;
        state.consecutiveFailures += 1;
        state.lastFailureAt = new Date().toISOString();
        state.lastError = publicError(error);
        if (state.consecutiveFailures >= 3) state.cooldownUntil = Date.now() + 60_000;
        attempts.push({ provider: provider.id, outcome: 'failed', error: state.lastError, durationMs: Date.now() - started });
      }
    }
    const error = new Error('Semua provider Instagram yang aktif gagal. Periksa status provider atau coba lagi nanti.');
    error.code = 'ALL_PROVIDERS_FAILED';
    error.attempts = attempts;
    throw error;
  }

  return {
    extract,
    getStatus() {
      return {
        active: [...states.values()].map(state => ({ ...state, coolingDown: state.cooldownUntil > Date.now() })),
        quarantined: BLOCKED_PROVIDERS.map(item => ({ ...item })),
        policy: 'Contributed sources are immutable archives and are not executed by the runtime.'
      };
    },
    async getInfo() { return kol.scrapePageInfo(); }
  };
}

export { BLOCKED_PROVIDERS };
export default createInstagramFallbackEngine;
