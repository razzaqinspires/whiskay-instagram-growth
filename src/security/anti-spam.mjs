/**
 * In-memory anti-spam guard for a single-process self-bot.
 * It is intentionally conservative: duplicate suppression, sender window,
 * per-command cooldown, per-minute cap and bounded concurrency.
 * It is not a distributed limiter; run only one bot process per session.
 */
export class AntiSpamGuard {
  #options;
  #senders = new Map();
  #seenMessages = new Map();
  #active = 0;
  #lastWarning = new Map();

  constructor(options = {}) {
    this.#options = {
      enabled: options.enabled ?? true,
      windowMs: options.windowMs ?? 10_000,
      maxHits: options.maxHits ?? 5,
      cooldownMs: options.cooldownMs ?? 1_500,
      perMinute: options.perMinute ?? 20,
      duplicateTtlMs: options.duplicateTtlMs ?? 60_000,
      warningCooldownMs: options.warningCooldownMs ?? 30_000,
      maxConcurrent: options.maxConcurrent ?? 2,
      ...options
    };
    for (const [key, value] of Object.entries(this.#options)) {
      if (key === 'enabled') continue;
      if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`AntiSpamGuard option ${key} tidak valid.`);
    }
    if (this.#options.maxHits < 1 || this.#options.perMinute < 1 || this.#options.maxConcurrent < 1) {
      throw new RangeError('maxHits, perMinute, dan maxConcurrent harus >= 1.');
    }
  }

  check({ sender, command, messageId, now = Date.now() }) {
    if (!this.#options.enabled) return { allowed: true, release: () => {} };
    const identity = String(sender || 'unknown').slice(0, 160);
    const cmd = String(command || '').toLowerCase().slice(0, 64);

    this.#prune(now);
    if (messageId) {
      const id = String(messageId).slice(0, 160);
      const previous = this.#seenMessages.get(id);
      if (previous && now - previous < this.#options.duplicateTtlMs) {
        return this.#deny('DUPLICATE_MESSAGE', 0, identity, now);
      }
      this.#seenMessages.set(id, now);
      if (this.#seenMessages.size > 2000) this.#seenMessages.delete(this.#seenMessages.keys().next().value);
    }

    const state = this.#senders.get(identity) || { hits: [], minuteHits: [], commands: new Map() };
    state.hits = state.hits.filter(time => now - time < this.#options.windowMs);
    state.minuteHits = state.minuteHits.filter(time => now - time < 60_000);

    const lastCommand = state.commands.get(cmd);
    if (this.#options.cooldownMs && lastCommand !== undefined && now - lastCommand < this.#options.cooldownMs) {
      this.#senders.set(identity, state);
      return this.#deny('COMMAND_COOLDOWN', this.#options.cooldownMs - (now - lastCommand), identity, now);
    }
    if (state.hits.length >= this.#options.maxHits) {
      this.#senders.set(identity, state);
      return this.#deny('BURST_LIMIT', this.#options.windowMs - (now - state.hits[0]), identity, now);
    }
    if (state.minuteHits.length >= this.#options.perMinute) {
      this.#senders.set(identity, state);
      return this.#deny('MINUTE_LIMIT', 60_000 - (now - state.minuteHits[0]), identity, now);
    }
    if (this.#active >= this.#options.maxConcurrent) {
      this.#senders.set(identity, state);
      return this.#deny('CONCURRENCY_LIMIT', 1000, identity, now);
    }

    state.hits.push(now);
    state.minuteHits.push(now);
    state.commands.set(cmd, now);
    if (state.commands.size > 128) state.commands.delete(state.commands.keys().next().value);
    this.#senders.set(identity, state);
    this.#active++;
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        this.#active = Math.max(0, this.#active - 1);
      }
    };
  }

  #deny(reason, retryAfterMs, identity, now) {
    const last = this.#lastWarning.get(identity) || 0;
    const warn = now - last >= this.#options.warningCooldownMs;
    if (warn) this.#lastWarning.set(identity, now);
    return { allowed: false, reason, retryAfterMs: Math.max(0, retryAfterMs), warn };
  }

  #prune(now) {
    for (const [id, time] of this.#seenMessages) {
      if (now - time >= this.#options.duplicateTtlMs) this.#seenMessages.delete(id);
    }
    for (const [id, time] of this.#lastWarning) {
      if (now - time >= this.#options.warningCooldownMs * 4) this.#lastWarning.delete(id);
    }
    for (const [sender, state] of this.#senders) {
      state.hits = state.hits.filter(time => now - time < this.#options.windowMs);
      state.minuteHits = state.minuteHits.filter(time => now - time < 60_000);
      for (const [cmd, time] of state.commands) {
        if (now - time > Math.max(60_000, this.#options.cooldownMs * 4)) state.commands.delete(cmd);
      }
      if (!state.hits.length && !state.minuteHits.length && !state.commands.size) this.#senders.delete(sender);
    }
  }

  stats() {
    return { trackedSenders: this.#senders.size, rememberedMessages: this.#seenMessages.size, activeCommands: this.#active };
  }
}
