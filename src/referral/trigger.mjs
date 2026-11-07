import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Verify a backend webhook and enqueue a referral claim only after the backend
 * signs an event of type `referral.signup.verified`.
 *
 * Signature format: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * Timestamp header: Unix seconds.
 */
export async function handleVerifiedReferralWebhook({
  rawBody,
  signature,
  timestamp,
  queue,
  secret = process.env.REFERRAL_WEBHOOK_SECRET,
  autoProcess = false,
  logger = console,
  now = Date.now(),
} = {}) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('REFERRAL_WEBHOOK_SECRET must be configured with at least 32 characters');
  }
  if (!queue || typeof queue.enqueueVerifiedClaim !== 'function') {
    throw new TypeError('A ReferralQueueProcessor instance is required');
  }
  if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody))) {
    throw new TypeError('rawBody must be the exact raw HTTP request body');
  }
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  if (bodyBuffer.length === 0 || bodyBuffer.length > MAX_BODY_BYTES) {
    throw new RangeError('Webhook body must be between 1 byte and 32 KiB');
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)) throw new TypeError('Webhook timestamp is invalid');
  if (Math.abs(now - timestampSeconds * 1000) > MAX_CLOCK_SKEW_MS) {
    throw new Error('Webhook timestamp is outside the allowed replay window');
  }

  const suppliedHex = typeof signature === 'string' ? signature.replace(/^sha256=/i, '') : '';
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) throw new TypeError('Webhook signature format is invalid');
  const expected = createHmac('sha256', secret)
    .update(String(timestampSeconds))
    .update('.')
    .update(bodyBuffer)
    .digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Webhook signature verification failed');
  }

  let event;
  try {
    event = JSON.parse(bodyBuffer.toString('utf8'));
  } catch {
    throw new TypeError('Webhook body must contain valid JSON');
  }
  if (event?.type !== 'referral.signup.verified') {
    throw new Error('Only referral.signup.verified events are accepted');
  }
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Webhook data is missing');
  }
  if (typeof data.verifiedAt !== 'string' || !Number.isFinite(Date.parse(data.verifiedAt))) {
    throw new TypeError('Backend verifiedAt timestamp is required');
  }

  const result = await queue.enqueueVerifiedClaim({
    eventId: data.eventId,
    claimToken: data.claimToken,
    verifiedAt: data.verifiedAt,
  });
  if (result.queued && autoProcess) {
    // Process asynchronously after durable queue persistence; webhook response
    // does not wait for the referral claim API request.
    void queue.processPending({ limit: 1 }).catch(error => {
      logger.error?.({ message: error?.message || 'Referral processor failed' }, '[REFERRAL] Auto-process failed');
    });
  }
  return result;
}
