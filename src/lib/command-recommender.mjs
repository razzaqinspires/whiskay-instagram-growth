import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_ENTRIES = 600;

function safeName(value) {
  const name = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) ? name : null;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export class CommandUsageStore {
  #filePath;
  #state = { version: 1, commands: {}, recommendations: { shown: 0, lastShownAt: 0 } };
  #loaded = false;
  #writeQueue = Promise.resolve();

  constructor({ filePath = process.env.WHISKAY_COMMAND_USAGE_FILE || path.resolve('data/command-usage.json'), now = () => Date.now() } = {}) {
    this.#filePath = path.resolve(filePath);
    this.now = now;
  }

  async load() {
    if (this.#loaded) return this;
    this.#loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.#filePath, 'utf8'));
      if (parsed?.version === 1 && parsed.commands && typeof parsed.commands === 'object') {
        this.#state = {
          version: 1,
          commands: Object.fromEntries(Object.entries(parsed.commands).slice(0, MAX_ENTRIES).map(([name, entry]) => [name, {
            hits: Math.max(0, Math.floor(Number(entry?.hits) || 0)),
            recent: Array.isArray(entry?.recent) ? entry.recent.map(Number).filter(Number.isFinite).slice(-30) : [],
            lastHitAt: Math.max(0, Number(entry?.lastHitAt) || 0),
            exposures: Math.max(0, Math.floor(Number(entry?.exposures) || 0)),
            lastShownAt: Math.max(0, Number(entry?.lastShownAt) || 0)
          }])),
          recommendations: {
            shown: Math.max(0, Math.floor(Number(parsed.recommendations?.shown) || 0)),
            lastShownAt: Math.max(0, Number(parsed.recommendations?.lastShownAt) || 0)
          }
        };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Command usage store tidak valid: ${error.message}`);
    }
    return this;
  }

  async #persist() {
    const snapshot = JSON.stringify(this.#state, null, 2);
    this.#writeQueue = this.#writeQueue.then(async () => {
      await mkdir(path.dirname(this.#filePath), { recursive: true, mode: 0o700 });
      const temporary = `${this.#filePath}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await chmod(temporary, 0o600).catch(() => {});
      await rename(temporary, this.#filePath);
    });
    await this.#writeQueue;
  }

  async recordHit(commandName) {
    await this.load();
    const name = safeName(commandName);
    if (!name) return false;
    const now = this.now();
    const entry = this.#state.commands[name] || (this.#state.commands[name] = { hits: 0, recent: [], lastHitAt: 0, exposures: 0, lastShownAt: 0 });
    entry.hits += 1;
    entry.lastHitAt = now;
    entry.recent = [...entry.recent.filter(time => time > now - 30 * DAY), now].slice(-30);
    await this.#persist();
    return true;
  }

  async getStats(commandName) {
    await this.load();
    const entry = this.#state.commands[safeName(commandName)] || {};
    const now = this.now();
    const recent7d = (entry.recent || []).filter(time => time > now - 7 * DAY).length;
    return { totalHits: entry.hits || 0, recent7d, lastHitAt: entry.lastHitAt || 0, exposures: entry.exposures || 0, lastShownAt: entry.lastShownAt || 0 };
  }

  async rank(commands, { limit = 10 } = {}) {
    await this.load();
    const now = this.now();
    const entries = (Array.isArray(commands) ? commands : [])
      .filter(item => item && safeName(item.name))
      .map(item => {
        const name = safeName(item.name);
        const entry = this.#state.commands[name] || {};
        const hits = entry.hits || 0;
        const recent7d = (entry.recent || []).filter(time => time > now - 7 * DAY).length;
        const hoursSinceUse = entry.lastHitAt ? Math.max(0, (now - entry.lastHitAt) / HOUR) : 720;
        const hoursSinceShown = entry.lastShownAt ? Math.max(0, (now - entry.lastShownAt) / HOUR) : 720;
        // Weighted demand + exploration: high-volume commands remain visible,
        // while unused/rarely used commands receive an explicit discovery boost.
        const demand = Math.log1p(hits) * 0.52 + Math.log1p(recent7d) * 0.95;
        const exploration = 2.05 / Math.sqrt(1 + hits);
        const freshness = Math.min(0.75, hoursSinceUse / 96 * 0.75);
        const recentUsePenalty = 1.4 * Math.exp(-hoursSinceUse / 18);
        const exposurePenalty = 1.05 * Math.exp(-hoursSinceShown / 72) * Math.log1p(entry.exposures || 0);
        const category = String(item.category || 'General').slice(0, 48);
        const score = clamp(1.0 + demand + exploration + freshness - recentUsePenalty - exposurePenalty, 0.05, 12);
        return { ...item, name, category, totalHits: hits, recent7d, score };
      });
    const sorted = entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const selected = [];
    const categoryCount = new Map();
    const targetLimit = Math.max(1, Math.min(10, limit));
    const discoverySlots = targetLimit >= 5 ? 2 : targetLimit >= 2 ? 1 : 0;
    const pool = [...sorted];
    while (pool.length && selected.length < targetLimit - discoverySlots) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < pool.length; i += 1) {
        const count = categoryCount.get(pool[i].category) || 0;
        const diversityAdjusted = pool[i].score / (1 + count * 0.7);
        if (diversityAdjusted > bestScore) { bestScore = diversityAdjusted; bestIndex = i; }
      }
      const [picked] = pool.splice(bestIndex, 1);
      selected.push({ ...picked, recommendationScore: bestScore });
      categoryCount.set(picked.category, (categoryCount.get(picked.category) || 0) + 1);
    }
    if (discoverySlots && pool.length) {
      // Reserve deterministic discovery slots so long-tail commands are not
      // buried forever by high-volume commands. Lowest-hit commands rise first;
      // recent promotion exposure and category repetition lower their priority.
      const discovery = pool.sort((a, b) => {
        const aStats = this.#state.commands[a.name] || {};
        const bStats = this.#state.commands[b.name] || {};
        const aAge = aStats.lastHitAt ? Math.min(1, (now - aStats.lastHitAt) / (14 * DAY)) : 1;
        const bAge = bStats.lastHitAt ? Math.min(1, (now - bStats.lastHitAt) / (14 * DAY)) : 1;
        const aExposeAge = aStats.lastShownAt ? Math.min(1, (now - aStats.lastShownAt) / (7 * DAY)) : 1;
        const bExposeAge = bStats.lastShownAt ? Math.min(1, (now - bStats.lastShownAt) / (7 * DAY)) : 1;
        const aPriority = (1 / Math.sqrt(1 + a.totalHits)) * (0.55 + 0.45 * aAge) * (0.45 + 0.55 * aExposeAge) / Math.pow(1 + (aStats.exposures || 0), 0.35);
        const bPriority = (1 / Math.sqrt(1 + b.totalHits)) * (0.55 + 0.45 * bAge) * (0.45 + 0.55 * bExposeAge) / Math.pow(1 + (bStats.exposures || 0), 0.35);
        return bPriority - aPriority || a.name.localeCompare(b.name);
      });
      for (const candidate of discovery) {
        if (selected.length >= targetLimit) break;
        const alreadyInCategory = categoryCount.get(candidate.category) || 0;
        selected.push({ ...candidate, recommendationScore: candidate.score / (1 + alreadyInCategory * 0.7) });
        categoryCount.set(candidate.category, alreadyInCategory + 1);
      }
    }
    const total = selected.reduce((sum, entry) => sum + entry.recommendationScore, 0) || 1;
    return selected.map(entry => ({ ...entry, recommendationPercent: entry.recommendationScore / total * 100 }));
  }

  async recordExposure(commands) {
    await this.load();
    const now = this.now();
    for (const commandName of commands || []) {
      const name = safeName(commandName);
      if (!name) continue;
      const entry = this.#state.commands[name] || (this.#state.commands[name] = { hits: 0, recent: [], lastHitAt: 0, exposures: 0, lastShownAt: 0 });
      entry.exposures += 1;
      entry.lastShownAt = now;
    }
    this.#state.recommendations.shown += 1;
    this.#state.recommendations.lastShownAt = now;
    await this.#persist();
  }

  async status() {
    await this.load();
    return {
      trackedCommands: Object.keys(this.#state.commands).length,
      recommendationsShown: this.#state.recommendations.shown,
      lastRecommendationAt: this.#state.recommendations.lastShownAt,
      filePath: this.#filePath
    };
  }
}

export const commandUsageStore = new CommandUsageStore();
