import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { submitReferralConversionBatch, validateReferralClaimEndpoint } from './referral-conversion-batch.mjs';
import { config } from '../config.mjs';

const MAX_QUEUE_SIZE = 1_000;
const MAX_PROCESS_LIMIT = 25;

function validateClaim(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    throw new TypeError('verified claim must be an object');
  }
  if (typeof claim.eventId !== 'string' || !/^[a-zA-Z0-9._:-]{8,128}$/.test(claim.eventId)) {
    throw new TypeError('eventId format is invalid');
  }
  if (typeof claim.claimToken !== 'string' || claim.claimToken.trim().length < 16 || claim.claimToken.length > 8192) {
    throw new TypeError('claimToken must be a backend-issued opaque token');
  }
  const verifiedMs = Date.parse(claim.verifiedAt);
  if (!Number.isFinite(verifiedMs) || verifiedMs > Date.now() + 5 * 60_000) {
    throw new TypeError('verifiedAt must be a valid backend verification timestamp');
  }
  return {
    eventId: claim.eventId,
    claimToken: claim.claimToken,
    verifiedAt: new Date(verifiedMs).toISOString(),
    queuedAt: new Date().toISOString(),
  };
}

export class ReferralQueueProcessor {
  #filePath;
  #env;
  #logger;
  #submit;
  #mutex = Promise.resolve();

  constructor({
    filePath = path.resolve('data/referral-claims/pending.json'),
    env = process.env,
    logger = console,
    submitBatch = submitReferralConversionBatch,
  } = {}) {
    this.#filePath = path.resolve(filePath);
    this.#env = env;
    this.#logger = logger;
    this.#submit = submitBatch;
  }

  #exclusive(task) {
    const run = this.#mutex.then(task, task);
    this.#mutex = run.catch(() => {});
    return run;
  }

  async #readState() {
    try {
      const info = await lstat(this.#filePath);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error('Referral queue path must be a regular file, not a symlink');
      }
      const parsed = JSON.parse(await readFile(this.#filePath, 'utf8'));
      if (parsed?.version !== 1 || !Array.isArray(parsed.claims) || !Array.isArray(parsed.completedEventIds)) {
        throw new Error('Referral queue file has an unsupported or corrupt schema');
      }
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, claims: [], completedEventIds: [] };
      throw error;
    }
  }

  async #writeState(state) {
    const directory = path.dirname(this.#filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const tempPath = `${this.#filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(tempPath, this.#filePath);
      await chmod(this.#filePath, 0o600);
      await chmod(directory, 0o700);
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }

  /** Only the signed-webhook adapter should call this method. */
  async enqueueVerifiedClaim(input) {
    const claim = validateClaim(input);
    return this.#exclusive(async () => {
      const state = await this.#readState();
      if (state.claims.some(item => item.eventId === claim.eventId) || state.completedEventIds.includes(claim.eventId)) {
        return { queued: false, duplicate: true, pending: state.claims.length };
      }
      if (state.claims.length >= MAX_QUEUE_SIZE) {
        throw new RangeError(`Referral queue is full (${MAX_QUEUE_SIZE}); drain it before accepting more events`);
      }
      state.claims.push(claim);
      await this.#writeState(state);
      return { queued: true, duplicate: false, pending: state.claims.length };
    });
  }

  async status() {
    return this.#exclusive(async () => {
      const state = await this.#readState();
      return {
        pending: state.claims.length,
        completed: state.completedEventIds.length,
        oldestQueuedAt: state.claims[0]?.queuedAt ?? null,
      };
    });
  }

  async processPending({ limit = 10, signal, onProgress } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PROCESS_LIMIT) {
      throw new RangeError(`limit must be between 1 and ${MAX_PROCESS_LIMIT}`);
    }

    return this.#exclusive(async () => {
      const state = await this.#readState();
      const batch = state.claims.slice(0, limit);
      if (batch.length === 0) {
        return { submitted: 0, succeeded: 0, alreadyClaimed: 0, failed: 0, pending: 0, aborted: false };
      }

      // The service receives only backend-issued one-time claim tokens for
      // completed signups. The API route is pinned by the batch module.
      // Non-secret referral routing lives in config/app.json. Secret tokens
      // remain in .env and are exposed to this processor only at dispatch time.
      const endpoint = validateReferralClaimEndpoint(
        this.#env.REFERRAL_CLAIM_ENDPOINT || config.referral.claim.endpoint,
        this.#env.REFERRAL_CLAIM_ALLOWED_HOSTS || config.referral.claim.allowedHosts.join(','),
      );
      const report = await this.#submit(batch.map(({ eventId, claimToken }) => ({ eventId, claimToken })), {
        endpoint,
        allowedHosts: this.#env.REFERRAL_CLAIM_ALLOWED_HOSTS || config.referral.claim.allowedHosts.join(','),
        serviceToken: this.#env.REFERRAL_SERVICE_TOKEN || config.referral.claim.serviceToken,
        delayMs: 1_000,
        timeoutMs: 15_000,
        maxAttempts: 1,
        signal,
        onProgress,
      });

      const completed = new Set(
        report.results
          .filter(item => item.status === 'succeeded' || item.status === 'already_claimed')
          .map(item => item.eventId),
      );
      const completedHistory = [...state.completedEventIds];
      for (const eventId of completed) {
        if (!completedHistory.includes(eventId)) completedHistory.push(eventId);
      }
      const remaining = state.claims.filter(item => !completed.has(item.eventId));
      await this.#writeState({
        version: 1,
        claims: remaining,
        completedEventIds: completedHistory.slice(-10_000),
      });

      this.#logger.info?.({
        submitted: report.submitted,
        succeeded: report.succeeded,
        alreadyClaimed: report.alreadyClaimed,
        failed: report.failed,
        pending: remaining.length,
      }, '[REFERRAL] Verified claim batch processed');

      return {
        ...report,
        pending: remaining.length,
      };
    });
  }
}

export const referralQueue = new ReferralQueueProcessor();
