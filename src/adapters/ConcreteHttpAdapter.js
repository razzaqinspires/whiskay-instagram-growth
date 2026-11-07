import { randomUUID } from 'node:crypto';
import { BaseBatchDispatcher } from './BaseBatchDispatcher.js';

const DEFAULT_MAX_BATCH_SIZE = 100;
const DEVELOPMENT_MAX_BATCH_LIMIT = 1_000;
const QA_ENDPOINT_PATH = '/__whiskay_qa__/batch';
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;

function validateLocalQaTarget(targetUrl) {
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '') {
    throw new TypeError('targetUrl must be a non-empty local QA URL.');
  }

  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new TypeError('targetUrl must be a valid absolute URL.');
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'http:' || !isLoopback) {
    throw new Error('ConcreteHttpAdapter only permits HTTP loopback destinations for local QA.');
  }
  if (url.pathname !== QA_ENDPOINT_PATH || url.search || url.hash || url.username || url.password) {
    throw new Error(`Local QA destination must use the exact ${QA_ENDPOINT_PATH} route without query, fragment, or credentials.`);
  }

  return url;
}

function readDevelopmentMaxBatchSize() {
  if (process.env.NODE_ENV !== 'development') {
    return DEFAULT_MAX_BATCH_SIZE;
  }

  const configured = process.env.MAX_BATCH_SIZE;
  if (configured === undefined || configured === '') {
    return DEFAULT_MAX_BATCH_SIZE;
  }
  if (!/^\d+$/.test(configured)) {
    throw new TypeError('MAX_BATCH_SIZE must be an integer between 1 and 1000 in development.');
  }

  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1 || value > DEVELOPMENT_MAX_BATCH_LIMIT) {
    throw new RangeError('MAX_BATCH_SIZE must be between 1 and 1000 in development.');
  }
  return value;
}

/**
 * HTTP adapter for the local WHISKAY QA receiver only.
 *
 * Safety boundaries:
 * - accepts only localhost / 127.0.0.1 / ::1;
 * - accepts only the fixed /__whiskay_qa__/batch route;
 * - disables redirects and environment proxies;
 * - simulates approval only in NODE_ENV=development and only for that local route;
 * - production continues to require trusted owner approval metadata;
 * - MAX_BATCH_SIZE can raise the cap to 1000 only in development.
 *
 * The local QA approval is a test attestation, not an owner approval and must
 * never be treated as authorization for a production or third-party endpoint.
 */
export class ConcreteHttpAdapter extends BaseBatchDispatcher {
  constructor({ axiosClient, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();

    if (timeoutMs !== undefined
      && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS)) {
      throw new RangeError(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`);
    }

    this.axiosClient = axiosClient;
    this.timeoutMs = timeoutMs;
  }

  getMaxBatchSize() {
    return readDevelopmentMaxBatchSize();
  }

  /**
   * In development, a local QA receiver gets a synthetic test attestation so
   * automated tests do not need an interactive owner prompt. This cannot be
   * used with an external host or any route other than the fixed QA route.
   */
  async dispatchBatch(targetUrl, payloadArray, options = {}) {
    const localTarget = validateLocalQaTarget(targetUrl);
    let effectiveOptions = options;

    if (process.env.NODE_ENV === 'development' && !options.approval) {
      effectiveOptions = {
        ...options,
        approval: {
          approved: true,
          approvalId: `local-qa-${randomUUID()}`,
          approvedBy: 'local-qa-runner',
        },
      };
    }

    return super.dispatchBatch(localTarget.toString(), payloadArray, effectiveOptions);
  }

  async authorizeTarget(targetUrl) {
    validateLocalQaTarget(targetUrl);
    return true;
  }

  async dispatchOne({ targetUrl, payload, signal }) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Batch dispatch was aborted.');
    }

    const axiosClient = this.axiosClient ?? (await import('axios')).default;
    if (!axiosClient || typeof axiosClient.post !== 'function') {
      throw new TypeError('Axios client must expose a post(url, data, config) method.');
    }

    const response = await axiosClient.post(targetUrl, payload, {
      timeout: this.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      signal,
      maxRedirects: 0,
      proxy: false,
      maxBodyLength: MAX_BODY_BYTES,
      maxContentLength: MAX_BODY_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    return {
      status: response.status,
      data: response.data,
    };
  }
}

export default ConcreteHttpAdapter;
