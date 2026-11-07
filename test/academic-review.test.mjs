import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  API_BASE, INLINE_UPLOAD_LIMIT, MIN_WORDS, MAX_WORDS, apiKeyFromEnv,
  countWords, deleteCheck, downloadReport, formatCheck, getCheck,
  getReportInfo, listChecks, productsForMode, submitCheck, validateSignedUploadUrl
} from '../src/academic/client.mjs';
import academicPlugin from '../src/plugins/academic-review.mjs';

const KEY = 'acx_test_key_1234567890abcdef';
const longText = Array.from({ length: 140 }, (_, index) => `word${index}`).join(' ');

function response(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] ?? null; } },
    async text() { return typeof data === 'string' ? data : JSON.stringify(data); }
  };
}

function byteResponse(buffer, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get(name) { return headers[String(name).toLowerCase()] ?? null; } },
    async arrayBuffer() { return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); }
  };
}

function options(fetchImpl, extra = {}) {
  return { env: { ACADEMICX_KEY: KEY }, fetchImpl, ...extra };
}

test('counts words and maps only the three supported review modes', () => {
  assert.equal(countWords('satu dua tiga'), 3);
  assert.deepEqual(productsForMode('ai'), ['ai']);
  assert.deepEqual(productsForMode('similarity'), ['similarity']);
  assert.deepEqual(productsForMode('full'), ['ai', 'similarity']);
  assert.throws(() => productsForMode('balance'), /Mode harus ai/);
  assert.ok(MIN_WORDS === 125 && MAX_WORDS === 50_000);
});

test('API key is read only from the configured environment name and never from input', () => {
  assert.equal(apiKeyFromEnv({ ACADEMICX_KEY: KEY }), KEY);
  assert.equal(apiKeyFromEnv({ ACX_KEY: KEY }), KEY);
  assert.equal(apiKeyFromEnv({}), null);
});

test('submits text to the official API with Bearer auth, products and idempotency key', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), init };
    return response({ id: 'check_12345678', status: 'processing', words: 140 }, 202);
  };
  const result = await submitCheck(longText, ['ai'], options(fetchImpl, { idempotencyKey: 'qa-run-12345678' }));
  assert.equal(result.id, 'check_12345678');
  assert.equal(seen.url, `${API_BASE}/checks`);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(seen.init.headers['Idempotency-Key'], 'qa-run-12345678');
  assert.deepEqual(JSON.parse(seen.init.body).products, ['ai']);
  assert.equal(JSON.parse(seen.init.body).text, longText);
});

test('requires 125 words and rejects text over the configured local character limit before network', async () => {
  const never = async () => { throw new Error('network should not be called'); };
  await assert.rejects(() => submitCheck('too few words', ['ai'], options(never)), /minimal 125 kata/);
  await assert.rejects(() => submitCheck(longText, ['ai'], options(never, { maxTextChars: 50 })), /batas lokal/);
});

test('rejects unsupported products, duplicate products and invalid idempotency keys before network', async () => {
  const never = async () => { throw new Error('network should not be called'); };
  await assert.rejects(() => submitCheck(longText, ['ai', 'balance'], options(never)), /Produk pemeriksaan/);
  await assert.rejects(() => submitCheck(longText, ['ai', 'ai'], options(never)), /Produk pemeriksaan/);
  await assert.rejects(() => submitCheck(longText, ['ai'], options(never, { idempotencyKey: 'bad' })), /Idempotency key/);
});

test('requires API key before any network access', async () => {
  await assert.rejects(() => submitCheck(longText, ['ai'], { env: {}, fetchImpl: async () => { throw new Error('must not call'); } }), /ACADEMICX_KEY/);
});

test('rejects malformed check IDs before issuing a request', async () => {
  const never = async () => { throw new Error('network should not be called'); };
  await assert.rejects(() => getCheck('../balance', options(never)), /Check ID tidak valid/);
  await assert.rejects(() => getReportInfo('bad id', 'pdf', options(never)), /Check ID tidak valid/);
  await assert.rejects(() => deleteCheck('balance', options(never)), /Check ID tidak valid/);
});

test('lists a page with limit and safe starting_after cursor; rejects limits outside 1–100', async () => {
  let requested;
  const fetchImpl = async url => { requested = String(url); return response({ data: [], has_more: false }); };
  await listChecks(50, options(fetchImpl, { startingAfter: 'check_12345678' }));
  assert.equal(requested, `${API_BASE}/checks?limit=50&starting_after=check_12345678`);
  await assert.rejects(() => listChecks(101, options(async () => { throw new Error('must not call'); })), /1–100/);
});

test('retrieves summary-only check detail by default', async () => {
  let requested;
  const fetchImpl = async url => { requested = String(url); return response({ id: 'check_12345678', status: 'complete' }); };
  const check = await getCheck('check_12345678', options(fetchImpl));
  assert.equal(check.status, 'complete');
  assert.equal(requested, `${API_BASE}/checks/check_12345678?detail=summary`);
});

test('validates signed upload URLs as public HTTPS without credentials or private hosts', () => {
  assert.throws(() => validateSignedUploadUrl('http://storage.example/file'), /HTTPS publik/);
  assert.throws(() => validateSignedUploadUrl('https://127.0.0.1/upload'), /HTTPS publik/);
  assert.throws(() => validateSignedUploadUrl('https://[::1]/upload'), /HTTPS publik/);
  assert.throws(() => validateSignedUploadUrl('https://localhost/upload'), /HTTPS publik/);
  assert.throws(() => validateSignedUploadUrl('https://user:pass@storage.example/upload'), /HTTPS publik/);
  assert.equal(validateSignedUploadUrl('https://storage.example/upload').hostname, 'storage.example');
});

test('uploads a small local document using the official multipart checks endpoint', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academix-small-'));
  try {
    await fs.writeFile(path.join(root, 'draft.txt'), Buffer.from('A'.repeat(512)));
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url: String(url), init };
      return response({ id: 'check_file_1234', status: 'processing', words: 140 }, 202);
    };
    const result = await submitCheck('draft.txt', ['similarity'], options(fetchImpl, { inputRoot: root }));
    assert.equal(result.id, 'check_file_1234');
    assert.equal(seen.url, `${API_BASE}/checks`);
    assert.ok(seen.init.body instanceof FormData);
    assert.equal(seen.init.body.get('products'), 'similarity');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rejects paths outside the inbox and symbolic-link inputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academix-path-'));
  const outside = path.join(os.tmpdir(), `academix-outside-${process.pid}.txt`);
  try {
    await fs.writeFile(outside, 'private');
    await fs.symlink(outside, path.join(root, 'linked.txt'));
    const never = async () => { throw new Error('network should not be called'); };
    await assert.rejects(() => submitCheck('../README.md', ['ai'], options(never, { inputRoot: root })), /di luar|hanya boleh/i);
    await assert.rejects(() => submitCheck('linked.txt', ['ai'], options(never, { inputRoot: root })), /symbolic link/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  }
});

test('rejects unsupported file extension before network', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academix-ext-'));
  try {
    await fs.writeFile(path.join(root, 'secret.zip'), Buffer.from('no'));
    await assert.rejects(() => submitCheck('secret.zip', ['ai'], options(async () => { throw new Error('must not call'); }, { inputRoot: root })), /Format file/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('uses signed-upload flow for documents larger than 4 MB without sending API key to storage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academix-large-'));
  try {
    await fs.writeFile(path.join(root, 'large.pdf'), Buffer.alloc(INLINE_UPLOAD_LIMIT + 10, 65));
    const calls = [];
    const fetchImpl = async (url, init) => {
      const target = String(url);
      calls.push({ target, init });
      if (target === `${API_BASE}/uploads`) {
        return response({ upload_id: 'upload_12345678', upload_url: 'https://storage.example/signed-put', content_type: 'application/pdf' }, 201);
      }
      if (target === 'https://storage.example/signed-put') return { ok: true, status: 200 };
      if (target === `${API_BASE}/checks`) return response({ id: 'check_large_1234', status: 'processing' }, 202);
      throw new Error(`unexpected URL ${target}`);
    };
    const result = await submitCheck('large.pdf', ['ai', 'similarity'], options(fetchImpl, { inputRoot: root }));
    assert.equal(result.id, 'check_large_1234');
    assert.equal(calls.length, 3);
    assert.equal(calls[1].init.method, 'PUT');
    assert.equal(calls[1].init.headers.Authorization, undefined);
    assert.equal(calls[2].init.headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(JSON.parse(calls[2].init.body).products, ['ai', 'similarity']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('gets and downloads a signed PDF report with a strict byte cap', async () => {
  const reportBytes = Buffer.from('%PDF-1.4 test report');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === `${API_BASE}/checks/check_12345678/report?kind=similarity`) {
      return response({ filename: 'Similarity Report.pdf', url: 'https://storage.example/report.pdf', expires_in: 600 });
    }
    if (String(url) === 'https://storage.example/report.pdf') return byteResponse(reportBytes, { 'content-type': 'application/pdf' });
    throw new Error('unexpected URL');
  };
  const report = await downloadReport('check_12345678', 'similarity', options(fetchImpl));
  assert.equal(report.filename, 'Similarity Report.pdf');
  assert.equal(report.bytes, reportBytes.length);
  assert.deepEqual(report.buffer, reportBytes);
  assert.equal(calls[1].init.redirect, 'error');
});

test('rejects over-limit reports from Content-Length without buffering them', async () => {
  const fetchImpl = async url => {
    if (String(url).includes('/report?kind=pdf')) return response({ url: 'https://storage.example/huge.pdf' });
    return byteResponse(Buffer.from('should not be read'), { 'content-length': '500' });
  };
  await assert.rejects(() => downloadReport('check_12345678', 'pdf', options(fetchImpl, { maxBytes: 100 })), /melebihi batas/);
});

test('deletes a check only through the documented check endpoint', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), init };
    return response({ id: 'check_12345678', object: 'check', deleted: true });
  };
  const result = await deleteCheck('check_12345678', options(fetchImpl));
  assert.equal(result.deleted, true);
  assert.equal(seen.url, `${API_BASE}/checks/check_12345678`);
  assert.equal(seen.init.method, 'DELETE');
});

test('formats AI and similarity scores without asserting authorship', () => {
  const output = formatCheck({ id: 'check_12345678', status: 'complete', words: 140, ai: { score: 18, status: 'complete' }, similarity: { score: 4, sources: [] } });
  assert.match(output, /AI-WRITING INDICATOR/);
  assert.match(output, /TURNITIN SIMILARITY/);
  assert.match(output, /bukan bukti pasti kepengarangan/);
});

test('plugin help includes supported commands and explicitly excludes finance commands', async () => {
  const replies = [];
  await academicPlugin.commands[0].execute({ rawArgs: 'help', args: ['help'], reply: async value => replies.push(value) });
  assert.match(replies[0], /\.acad similarity CONFIRM/);
  assert.match(replies[0], /\.acad report/);
  assert.doesNotMatch(replies[0], /\.acad balance|\.acad wallet|\.acad payment|\.acad usage/i);
});

test('plugin refuses a submission that omits the explicit CONFIRM token', async () => {
  const replies = [];
  await academicPlugin.commands[0].execute({ rawArgs: `ai ${longText}`, args: ['ai', 'text'], reply: async value => replies.push(value) });
  assert.match(replies[0], /gunakan .* CONFIRM/si);
});

test('plugin info can be opened without an API key and does not expose any balance command', async () => {
  const replies = [];
  await academicPlugin.commands[0].execute({ rawArgs: 'info', args: ['info'], reply: async value => replies.push(value) });
  assert.match(replies[0], /WHISKAY tidak mengelola saldo atau pembayaran/);
  assert.match(replies[0], /API key: (configured|missing)/);
});

test('redacts configured API key and never echoes raw provider error messages', async () => {
  const fetchImpl = async () => response({ error: { code: 'invalid_api_key', message: `invalid token ${KEY}` } }, 401);
  await assert.rejects(
    () => submitCheck(longText, ['ai'], options(fetchImpl)),
    error => error.message.includes('API key Academi.cx tidak valid') && !error.message.includes(KEY)
  );
});
