import { createServer } from 'node:http';
import { handleVerifiedReferralWebhook } from './trigger.mjs';
import { referralQueue } from './queue-processor.mjs';
import { config } from '../config.mjs';

const MAX_BODY_BYTES = 32 * 1024;

async function readRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export async function startReferralWebhookServer({
  host = config.referral.webhook.host,
  port = config.referral.webhook.port,
  path = config.referral.webhook.path,
  secret = config.referral.webhook.secret,
  autoProcess = config.referral.webhook.autoProcess,
  queue = referralQueue,
  logger = console,
} = {}) {
  if (typeof host !== 'string' || !host.trim()) throw new TypeError('referral.webhook.host is invalid');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new RangeError('referral.webhook.port must be 0-65535');
  if (typeof path !== 'string' || !/^\/[a-zA-Z0-9/_-]{1,100}$/.test(path) || path.includes('//')) {
    throw new TypeError('referral.webhook.path is invalid');
  }
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('REFERRAL_WEBHOOK_SECRET must contain at least 32 characters');
  }

  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== path) {
      sendJson(response, 404, { ok: false, error: 'not_found' });
      return;
    }
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { ok: false, error: 'content_type_must_be_json' });
      return;
    }

    try {
      const rawBody = await readRawBody(request);
      const result = await handleVerifiedReferralWebhook({
        rawBody,
        signature: request.headers['x-whiskay-signature'],
        timestamp: request.headers['x-whiskay-timestamp'],
        queue,
        secret,
        autoProcess,
        logger,
      });
      sendJson(response, result.duplicate ? 200 : 202, {
        ok: true,
        queued: result.queued,
        duplicate: result.duplicate,
        pending: result.pending,
      });
    } catch (error) {
      const status = error.statusCode || (/signature|timestamp|replay window/i.test(error.message) ? 401 : 400);
      logger.warn?.({ status, message: error.message }, '[REFERRAL] Webhook rejected');
      sendJson(response, status, { ok: false, error: status === 401 ? 'invalid_signature_or_timestamp' : 'invalid_webhook' });
    }
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 12_000;
  server.maxHeadersCount = 32;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  logger.info?.({ host, port: typeof address === 'object' && address ? address.port : port, path }, '[REFERRAL] Signed webhook endpoint listening');

  return {
    server,
    host,
    port: typeof address === 'object' && address ? address.port : port,
    close: () => new Promise((resolve, reject) => {
      if (!server.listening) return resolve();
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}
