import { setTimeout as sleep } from 'node:timers/promises';

const MAX_BATCH_SIZE = 100;
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

function validateTargetUrl(targetUrl) {
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '') {
    throw new TypeError('targetUrl must be a non-empty absolute URL.');
  }

  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new TypeError('targetUrl must be a valid absolute URL.');
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(isLoopback && url.protocol === 'http:')) {
    throw new TypeError('targetUrl must use HTTPS (HTTP is allowed only for loopback development).');
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError('targetUrl must not contain embedded credentials or a fragment.');
  }

  return url;
}

/**
 * Raised when a batch stops after at least one item has been considered.
 * `completed` contains successful results only; it never includes payloads.
 */
export class BatchDispatchError extends Error {
  constructor(message, { failedIndex, completed, cause } = {}) {
    super(message, { cause });
    this.name = 'BatchDispatchError';
    this.failedIndex = failedIndex;
    this.completed = completed;
  }
}

/**
 * Abstract, transport-neutral base class for sequential batch dispatch.
 *
 * Concrete adapters MUST implement:
 *   - authorizeTarget(targetUrl, payloadArray, options): enforce a real host/path
 *     allowlist and verify the approval issued by the trusted owner workflow.
 *   - dispatchOne({ targetUrl, payload, index, total, signal, options }): perform
 *     one endpoint-specific operation.
 *
 * This base class deliberately does not import Axios or issue arbitrary HTTP
 * requests. That keeps destination policy and transport implementation inside
 * the concrete adapter rather than creating an unrestricted POST primitive.
 */
export class BaseBatchDispatcher {
  constructor() {
    if (new.target === BaseBatchDispatcher) {
      throw new TypeError('BaseBatchDispatcher is abstract; extend it with a concrete adapter.');
    }
  }

  /**
   * Sequentially dispatch a batch. Stops on the first failure or cancellation.
   *
   * @param {string} targetUrl Candidate destination. The concrete adapter must
   *   independently enforce its configured hostname and path allowlist.
   * @param {unknown[]} payloadArray Items to dispatch in order.
   * @param {object} options
   * @param {number} [options.delayMs=1000] Delay between completed operations.
   * @param {{ approved: true, approvalId: string, approvedBy: string }} options.approval
   *   Approval metadata from a trusted owner-approval workflow.
   * @param {AbortSignal} [options.signal]
   * @param {(progress: object) => void} [options.onProgress]
   * @returns {Promise<{ submitted: number, succeeded: number, results: object[] }>} 
   */
  async dispatchBatch(targetUrl, payloadArray, options = {}) {
    if (!Array.isArray(payloadArray)) {
      throw new TypeError('payloadArray must be an array.');
    }
    const maxBatchSize = this.getMaxBatchSize();
    if (!Number.isSafeInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 1_000) {
      throw new RangeError('Concrete dispatcher returned an invalid batch-size limit.');
    }
    if (payloadArray.length > maxBatchSize) {
      throw new RangeError(`payloadArray may contain at most ${maxBatchSize} items.`);
    }

    const {
      delayMs = MIN_DELAY_MS,
      signal,
      approval,
      onProgress = () => {},
    } = options;

    if (!Number.isInteger(delayMs) || delayMs < MIN_DELAY_MS || delayMs > MAX_DELAY_MS) {
      throw new RangeError(`delayMs must be an integer between ${MIN_DELAY_MS} and ${MAX_DELAY_MS}.`);
    }
    if (!approval || approval.approved !== true
      || typeof approval.approvalId !== 'string' || approval.approvalId.trim() === ''
      || typeof approval.approvedBy !== 'string' || approval.approvedBy.trim() === '') {
      throw new Error('Explicit owner approval metadata is required before dispatch.');
    }
    if (typeof onProgress !== 'function') {
      throw new TypeError('onProgress must be a function.');
    }
    if (signal && typeof signal.addEventListener !== 'function') {
      throw new TypeError('signal must be an AbortSignal.');
    }

    const target = validateTargetUrl(targetUrl);
    const normalizedTarget = target.toString();

    // Fail closed: a subclass must explicitly authorize the destination and
    // approval. Merely supplying a URL or `approved: true` is not sufficient.
    const authorized = await this.authorizeTarget(normalizedTarget, payloadArray, options);
    if (authorized !== true) {
      throw new Error('The concrete adapter did not authorize this destination and batch.');
    }

    const results = [];

    for (let index = 0; index < payloadArray.length; index += 1) {
      try {
        if (signal?.aborted) {
          throw signal.reason ?? new Error('Batch dispatch was aborted.');
        }
        if (index > 0) {
          await sleep(delayMs, undefined, { signal });
        }

        const result = await this.dispatchOne({
          targetUrl: normalizedTarget,
          payload: payloadArray[index],
          index,
          total: payloadArray.length,
          signal,
          options,
        });

        results.push({ index, status: 'succeeded', result });
        onProgress({
          index,
          total: payloadArray.length,
          succeeded: results.length,
          status: 'succeeded',
        });
      } catch (cause) {
        const error = new BatchDispatchError(
          `Batch dispatch stopped at item ${index + 1} of ${payloadArray.length}.`,
          { failedIndex: index, completed: results, cause },
        );
        onProgress({
          index,
          total: payloadArray.length,
          succeeded: results.length,
          status: 'failed',
        });
        throw error;
      }
    }

    return {
      submitted: payloadArray.length,
      succeeded: results.length,
      results,
    };
  }

  /** Override only when a concrete adapter has a narrower, explicit batch limit. */
  getMaxBatchSize() {
    return MAX_BATCH_SIZE;
  }

  /** Override with a strict host/path allowlist and approval verification. */
  async authorizeTarget() {
    throw new TypeError(`${this.constructor.name} must implement authorizeTarget().`);
  }

  /** Override with one endpoint-specific, policy-checked operation. */
  async dispatchOne() {
    throw new TypeError(`${this.constructor.name} must implement dispatchOne().`);
  }
}
