import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_NODE_TEST = process.env.NODE_TEST_CONTEXT === 'child-v8';
const TEST_STATE_ROOT = IN_NODE_TEST
  ? path.join(os.tmpdir(), `whiskay-test-state-${process.pid}`)
  : null;
if (IN_NODE_TEST) {
  // Every Node test worker gets its own disposable state root. Tests can never
  // touch the real WhatsApp/Instagram sessions, statistics or temporary test state.
  process.once('exit', () => {
    try { fs.rmSync(TEST_STATE_ROOT, { recursive: true, force: true }); } catch { /* best-effort test cleanup */ }
  });
}

const LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const PREFIX_RE = /^[^\p{L}\p{N}\s]{1,3}$/u;

function object(value, name, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${name} harus berupa object JSON.`);
    return {};
  }
  return value;
}

function int(value, name, fallback, min, max, errors) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${name} harus bilangan bulat ${min}–${max}.`);
    return fallback;
  }
  return value;
}

function bool(value, name, fallback, errors) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    errors.push(`${name} harus boolean true/false.`);
    return fallback;
  }
  return value;
}

function absPath(value, name, fallback, errors, { privateState = false } = {}) {
  const raw = value ?? fallback;
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) {
    errors.push(`${name} harus berupa path non-empty.`);
    return path.resolve(PROJECT_ROOT, fallback);
  }
  if (privateState && IN_NODE_TEST) {
    const relative = path.isAbsolute(raw) ? path.basename(raw) : raw;
    return path.resolve(TEST_STATE_ROOT, relative);
  }
  return path.resolve(PROJECT_ROOT, raw);
}

function phone(value, name, errors) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits) || raw.startsWith('+')) {
    errors.push(`${name} harus 8–15 digit internasional tanpa '+'.`);
  }
  return digits;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

export function validateConfig(raw = {}, secrets = process.env, { requireWhatsApp = true } = {}) {
  const errors = [];
  const root = object(raw, 'root', errors);
  const app = object(root.app ?? {}, 'app', errors);
  const wa = object(root.whatsapp ?? {}, 'whatsapp', errors);
  const commands = object(root.commands ?? {}, 'commands', errors);
  const plugins = object(root.plugins ?? {}, 'plugins', errors);
  const anti = object(root.antiSpam ?? {}, 'antiSpam', errors);
  const ig = object(root.instagram ?? {}, 'instagram', errors);
  const growth = object(root.growth ?? {}, 'growth', errors);
  const identity = object(root.identity ?? {}, 'identity', errors);
  const referralRaw = object(root.referral ?? {}, 'referral', errors);

  const pairingNumber = requireWhatsApp || wa.pairingNumber
    ? phone(wa.pairingNumber, 'whatsapp.pairingNumber', errors) : '';
  const ownerNumber = requireWhatsApp || wa.ownerNumber
    ? phone(wa.ownerNumber, 'whatsapp.ownerNumber', errors) : '';
  if (pairingNumber && ownerNumber && pairingNumber !== ownerNumber) {
    errors.push('whatsapp.pairingNumber dan whatsapp.ownerNumber harus sama untuk self-bot.');
  }

  const syncFullHistory = bool(wa.syncFullHistory, 'whatsapp.syncFullHistory', false, errors);
  const allowGroups = bool(commands.allowGroups, 'commands.allowGroups', false, errors);
  const commandMode = String(commands.mode ?? 'self').toLowerCase();
  if (!['self', 'public'].includes(commandMode)) errors.push('commands.mode harus self atau public.');
  const runtimeModeFile = absPath(commands.runtimeModeFile, 'commands.runtimeModeFile', './data/runtime-mode.json', errors, { privateState: true });
  const hotReload = bool(plugins.hotReload, 'plugins.hotReload', true, errors);
  const logLevel = String(app.logLevel ?? 'info').toLowerCase();
  if (!LOG_LEVELS.has(logLevel)) errors.push(`app.logLevel tidak valid: ${logLevel}.`);

  const rawPrefixes = commands.prefixes ?? ['!', '.'];
  if (!Array.isArray(rawPrefixes) || rawPrefixes.length < 1 || rawPrefixes.length > 5
    || rawPrefixes.some(x => typeof x !== 'string' || !PREFIX_RE.test(x))
    || new Set(rawPrefixes).size !== rawPrefixes.length) {
    errors.push('commands.prefixes harus berisi 1–5 simbol unik, masing-masing 1–3 karakter.');
  }
  const prefixes = Array.isArray(rawPrefixes) ? rawPrefixes : ['!', '.'];

  if (Object.hasOwn(ig, 'authMode')) errors.push('instagram.authMode sudah tidak digunakan; hapus properti tersebut dari config/app.json.');
  const username = String(ig.username ?? '').trim();
  if (username && !/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
    errors.push('instagram.username hanya boleh huruf, angka, titik, underscore; maksimal 30 karakter.');
  }
  // Secrets remain in .env. Username and paths are ordinary app.json settings.
  const pythonBinRaw = ig.pythonBin ?? './.venv-instagram/bin/python';
  if (typeof pythonBinRaw !== 'string' || !pythonBinRaw.trim() || pythonBinRaw.includes('\0')) {
    errors.push('instagram.pythonBin harus berupa path executable Python.');
  }

  // Official Instagram Platform API configuration. This is separate from the
  // existing instagrapi session adapter and is read-only in this release.
  const apiRaw = object(ig.platformApi ?? {}, 'instagram.platformApi', errors);
  const loginMethod = String(apiRaw.loginMethod ?? 'instagram_login').toLowerCase();
  if (!['instagram_login', 'facebook_login'].includes(loginMethod)) {
    errors.push('instagram.platformApi.loginMethod harus instagram_login atau facebook_login.');
  }
  const expectedBase = loginMethod === 'facebook_login' ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
  const apiBaseUrl = String(apiRaw.baseUrl ?? expectedBase).replace(/\/+$/, '');
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.origin !== expectedBase || parsed.protocol !== 'https:' || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) throw new Error();
  } catch { errors.push(`instagram.platformApi.baseUrl harus ${expectedBase} sesuai loginMethod.`); }
  const apiEnabled = bool(apiRaw.enabled, 'instagram.platformApi.enabled', false, errors);
  const apiVersion = String(apiRaw.apiVersion ?? '').trim();
  if (apiEnabled && !/^v\d+\.\d+$/.test(apiVersion)) errors.push('instagram.platformApi.apiVersion wajib berformat vN.N saat API diaktifkan.');
  const tokenEnv = String(apiRaw.tokenEnv ?? 'INSTAGRAM_GRAPH_ACCESS_TOKEN');
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(tokenEnv)) errors.push('instagram.platformApi.tokenEnv bukan nama environment variable valid.');
  const graphToken = String(secrets[tokenEnv] ?? '');
  const apiTimeoutMs = int(apiRaw.timeoutMs, 'instagram.platformApi.timeoutMs', 15000, 1000, 120000, errors);
  const endpointsRaw = object(apiRaw.endpoints ?? {}, 'instagram.platformApi.endpoints', errors);
  const apiEndpoints = {};
  for (const [key, fallback] of Object.entries({ me: '/me', media: '/me/media', insights: '/me/insights' })) {
    const value = String(endpointsRaw[key] ?? fallback);
    if (!/^\/[a-zA-Z0-9_./{}-]{1,120}$/.test(value) || value.includes('..') || value.includes('//')) errors.push(`instagram.platformApi.endpoints.${key} tidak valid.`);
    apiEndpoints[key] = value;
  }
  if (apiEnabled && !graphToken) errors.push(`instagram.platformApi.enabled membutuhkan ${tokenEnv} di environment.`);

  // Targeting is a shortlist/recommendation workflow, not automated engagement.
  const targetingRaw = object(ig.targeting ?? {}, 'instagram.targeting', errors);
  const targetingMode = String(targetingRaw.mode ?? 'manual').toLowerCase();
  if (!['manual', 'automatic'].includes(targetingMode)) errors.push('instagram.targeting.mode harus manual atau automatic.');
  const manualRaw = targetingRaw.manualUsernames ?? [];
  if (!Array.isArray(manualRaw) || manualRaw.length > 100) errors.push('instagram.targeting.manualUsernames harus array maksimal 100 username.');
  const manualUsernames = Array.isArray(manualRaw) ? manualRaw.map((item, i) => {
    const usernameValue = String(item ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(usernameValue)) errors.push(`instagram.targeting.manualUsernames[${i}] tidak valid.`);
    return usernameValue;
  }) : [];
  if (new Set(manualUsernames).size !== manualUsernames.length) errors.push('instagram.targeting.manualUsernames tidak boleh duplikat.');
  const candidateDirectory = absPath(targetingRaw.candidateDirectory, 'instagram.targeting.candidateDirectory', './data/instagram-approved-creators.json', errors, { privateState: true });
  const automaticRaw = object(targetingRaw.automatic ?? {}, 'instagram.targeting.automatic', errors);
  const automaticEnabled = bool(automaticRaw.enabled, 'instagram.targeting.automatic.enabled', false, errors);
  if (targetingMode === 'automatic' && !automaticEnabled) errors.push('Mode automatic memerlukan automatic.enabled=true.');
  const maxCandidates = int(automaticRaw.maxCandidates, 'instagram.targeting.automatic.maxCandidates', 25, 1, 100, errors);
  const minFollowers = int(automaticRaw.minFollowers, 'instagram.targeting.automatic.minFollowers', 100, 0, 100000000, errors);
  const maxFollowers = int(automaticRaw.maxFollowers, 'instagram.targeting.automatic.maxFollowers', 100000, 0, 100000000, errors);
  if (minFollowers > maxFollowers) errors.push('minFollowers tidak boleh melebihi maxFollowers.');
  const minEngagementRatePct = Number(automaticRaw.minEngagementRatePct ?? 0);
  if (!Number.isFinite(minEngagementRatePct) || minEngagementRatePct < 0 || minEngagementRatePct > 100) errors.push('minEngagementRatePct harus 0–100.');
  const normalizeList = (value, name, fallback = []) => {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.length > 30 || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 60)) {
      errors.push(`${name} harus array string maksimal 30 item.`); return fallback;
    }
    return [...new Set(value.map(x => x.trim()))];
  };
  const niches = normalizeList(automaticRaw.niches, 'instagram.targeting.automatic.niches');
  const locations = normalizeList(automaticRaw.locations, 'instagram.targeting.automatic.locations', ['Indonesia']);
  const requireOwnerApproval = bool(targetingRaw.requireOwnerApproval, 'instagram.targeting.requireOwnerApproval', true, errors);
  if (!requireOwnerApproval) errors.push('instagram.targeting.requireOwnerApproval wajib true.');
  const allowedActionsRaw = targetingRaw.allowedActions ?? ['review', 'campaign_link', 'collaboration_invite'];
  const allowedActions = ['review', 'campaign_link', 'collaboration_invite'];
  if (!Array.isArray(allowedActionsRaw) || allowedActionsRaw.some(x => !allowedActions.includes(x))) errors.push('instagram.targeting.allowedActions hanya boleh review, campaign_link, collaboration_invite.');
  const safeAllowedActions = Array.isArray(allowedActionsRaw) ? allowedActionsRaw.filter(x => allowedActions.includes(x)) : ['review', 'campaign_link', 'collaboration_invite'];

  // Referral claims target the operator's own backend, never Instagram's API.
  const referralEnabled = bool(referralRaw.enabled, 'referral.enabled', false, errors);
  const claimRaw = object(referralRaw.claim ?? {}, 'referral.claim', errors);
  const claimEndpoint = String(claimRaw.endpoint ?? '').trim();
  const allowedHostsRaw = claimRaw.allowedHosts ?? [];
  if (!Array.isArray(allowedHostsRaw) || allowedHostsRaw.length > 10 || (referralEnabled && !allowedHostsRaw.length) || allowedHostsRaw.some(x => typeof x !== 'string' || !/^[a-z0-9.-]+$/i.test(x))) errors.push('referral.claim.allowedHosts harus berisi 1–10 hostname saat referral aktif.');
  const allowedHosts = Array.isArray(allowedHostsRaw) ? [...new Set(allowedHostsRaw.map(x => String(x).toLowerCase()))] : [];
  if (claimEndpoint) {
    try { const u = new URL(claimEndpoint); if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/v1/referrals/claims' || u.search || u.hash || !allowedHosts.includes(u.hostname.toLowerCase())) throw new Error(); }
    catch { errors.push('referral.claim.endpoint harus HTTPS /v1/referrals/claims pada hostname allowlist.'); }
  } else if (referralEnabled) errors.push('referral.claim.endpoint wajib diisi saat referral aktif.');
  const serviceTokenEnv = String(claimRaw.serviceTokenEnv ?? 'REFERRAL_SERVICE_TOKEN');
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(serviceTokenEnv)) errors.push('referral.claim.serviceTokenEnv tidak valid.');
  const serviceToken = String(secrets[serviceTokenEnv] ?? '');
  const claimTimeoutMs = int(claimRaw.timeoutMs, 'referral.claim.timeoutMs', 15000, 1000, 120000, errors);
  const claimDelayMs = int(claimRaw.delayMs, 'referral.claim.delayMs', 1000, 1000, 60000, errors);
  const claimMaxAttempts = int(claimRaw.maxAttempts, 'referral.claim.maxAttempts', 1, 1, 5, errors);
  if (referralEnabled && !serviceToken) errors.push(`${serviceTokenEnv} wajib diisi saat referral aktif.`);
  const webhookRaw = object(referralRaw.webhook ?? {}, 'referral.webhook', errors);
  const webhookEnabled = bool(webhookRaw.enabled, 'referral.webhook.enabled', false, errors);
  const webhookHost = String(webhookRaw.host ?? '127.0.0.1');
  const webhookPort = int(webhookRaw.port, 'referral.webhook.port', 8787, 1, 65535, errors);
  const webhookPath = String(webhookRaw.path ?? '/webhooks/referral/verified');
  if (!/^\/[a-zA-Z0-9/_-]{1,100}$/.test(webhookPath) || webhookPath.includes('//')) errors.push('referral.webhook.path tidak valid.');
  const secretEnv = String(webhookRaw.secretEnv ?? 'REFERRAL_WEBHOOK_SECRET');
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(secretEnv)) errors.push('referral.webhook.secretEnv tidak valid.');
  const webhookSecret = String(secrets[secretEnv] ?? '');
  const autoProcess = bool(webhookRaw.autoProcess, 'referral.webhook.autoProcess', false, errors);
  if (webhookEnabled && (!referralEnabled || webhookSecret.length < 32)) errors.push('Webhook aktif memerlukan referral.enabled dan HMAC secret minimal 32 karakter.');

  const antiSpam = {
    enabled: bool(anti.enabled, 'antiSpam.enabled', true, errors),
    windowMs: int(anti.windowMs, 'antiSpam.windowMs', 10000, 1000, 300000, errors),
    maxHits: int(anti.maxHits, 'antiSpam.maxHits', 5, 1, 100, errors),
    cooldownMs: int(anti.cooldownMs, 'antiSpam.cooldownMs', 1500, 0, 60000, errors),
    commandsPerMinute: int(anti.commandsPerMinute, 'antiSpam.commandsPerMinute', 20, 1, 300, errors),
    duplicateTtlMs: int(anti.duplicateTtlMs, 'antiSpam.duplicateTtlMs', 60000, 1000, 600000, errors),
    warningCooldownMs: int(anti.warningCooldownMs, 'antiSpam.warningCooldownMs', 30000, 1000, 600000, errors),
    maxConcurrent: int(anti.maxConcurrent, 'antiSpam.maxConcurrent', 2, 1, 20, errors)
  };

  const paths = {
    waSessionDir: absPath(wa.sessionDir, 'whatsapp.sessionDir', './session/self', errors, { privateState: true }),
    pluginDir: absPath(plugins.directory, 'plugins.directory', './src/plugins', errors),
    lidMapFile: absPath(identity.lidMapFile, 'identity.lidMapFile', './data/lid-map.json', errors, { privateState: true }),
    igSessionFile: absPath(ig.sessionFile, 'instagram.sessionFile', './auth_ig/instagrapi-session.json', errors, { privateState: true }),
    igPythonBin: absPath(pythonBinRaw, 'instagram.pythonBin', './.venv-instagram/bin/python', errors),
    igStatsFile: absPath(ig.statsFile, 'instagram.statsFile', './data/instagram-stats.json', errors, { privateState: true }),
    igGuardFile: absPath(ig.guardFile, 'instagram.guardFile', './data/instagram-safety.json', errors, { privateState: true }),
    growthDb: absPath(growth.databaseFile, 'growth.databaseFile', './data/instagram-growth.json', errors, { privateState: true })
  };

  const uniqueFiles = [paths.lidMapFile, paths.igSessionFile, paths.igStatsFile, paths.igGuardFile, paths.growthDb, runtimeModeFile];
  if (new Set(uniqueFiles).size !== uniqueFiles.length) errors.push('File data/session harus menggunakan path yang berbeda.');
  if (paths.waSessionDir === path.parse(paths.waSessionDir).root || paths.waSessionDir === (IN_NODE_TEST ? TEST_STATE_ROOT : PROJECT_ROOT)) {
    errors.push('whatsapp.sessionDir tidak boleh menunjuk root filesystem atau direktori proyek.');
  }
  if (paths.igSessionFile === paths.waSessionDir || paths.igSessionFile.startsWith(paths.waSessionDir + path.sep)
    || paths.waSessionDir.startsWith(paths.igSessionFile + path.sep)) {
    errors.push('Path session WhatsApp dan Instagram tidak boleh bertumpang tindih.');
  }

  const maxPluginBytes = int(plugins.maxFileBytes, 'plugins.maxFileBytes', 262144, 1024, 1048576, errors);
  const maxCommandsPerPlugin = int(plugins.maxCommandsPerPlugin, 'plugins.maxCommandsPerPlugin', 100, 1, 500, errors);
  const maxMessageChars = int(commands.maxMessageChars, 'commands.maxMessageChars', 3000, 100, 10000, errors);
  const maxCommandArgs = int(commands.maxCommandArgs, 'commands.maxCommandArgs', 24, 1, 64, errors);

  if (errors.length) {
    const error = new Error(`Konfigurasi tidak valid:\n- ${errors.join('\n- ')}`);
    error.code = 'CONFIG_VALIDATION_FAILED';
    error.validationErrors = errors;
    throw error;
  }

  return freezeDeep({
    app: { logLevel },
    whatsapp: { pairingNumber, ownerNumber, sessionDir: paths.waSessionDir, syncFullHistory },
    commands: { prefixes: [...prefixes].sort((a, b) => b.length - a.length), mode: commandMode, allowGroups, runtimeModeFile, maxMessageChars, maxCommandArgs },
    plugins: { directory: paths.pluginDir, hotReload, maxFileBytes: maxPluginBytes, maxCommandsPerPlugin },
    antiSpam,
    instagram: {
      username, pythonBin: paths.igPythonBin, sessionFile: paths.igSessionFile,
      statsFile: paths.igStatsFile, guardFile: paths.igGuardFile,
      platformApi: { enabled: apiEnabled, loginMethod, baseUrl: apiBaseUrl, apiVersion, tokenEnv, accessToken: graphToken, timeoutMs: apiTimeoutMs, endpoints: apiEndpoints },
      targeting: { mode: targetingMode, manualUsernames, candidateDirectory,
        automatic: { enabled: automaticEnabled, maxCandidates, niches, locations, minFollowers, maxFollowers, minEngagementRatePct },
        requireOwnerApproval, allowedActions: [...safeAllowedActions] }
    },
    growth: { databaseFile: paths.growthDb },
    identity: { lidMapFile: paths.lidMapFile },
    referral: { enabled: referralEnabled,
      claim: { endpoint: claimEndpoint, allowedHosts, serviceTokenEnv, serviceToken, timeoutMs: claimTimeoutMs, delayMs: claimDelayMs, maxAttempts: claimMaxAttempts },
      webhook: { enabled: webhookEnabled, host: webhookHost, port: webhookPort, path: webhookPath, secretEnv, secret: webhookSecret, autoProcess } }
  });
}

export function loadConfig({ configFile = './config/app.json', secrets = process.env } = {}) {
  const absolute = path.isAbsolute(configFile) ? configFile : path.resolve(PROJECT_ROOT, configFile);
  let raw;
  let source = absolute;
  try {
    raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' || absolute !== path.resolve(PROJECT_ROOT, './config/app.json')) {
      throw new Error(`Gagal membaca ${absolute}: ${error.message}`);
    }
    source = path.resolve(PROJECT_ROOT, './config/app.example.json');
    try { raw = JSON.parse(fs.readFileSync(source, 'utf8')); }
    catch (fallbackError) {
      throw new Error(`Config tidak ditemukan. Salin config/app.example.json menjadi config/app.json. Detail: ${fallbackError.message}`);
    }
  }
  const loaded = validateConfig(raw, secrets, { requireWhatsApp: false });
  return Object.freeze({ ...loaded, configSource: source });
}

export function assertRuntimeConfig(value) {
  const missing = [];
  if (!/^\d{8,15}$/.test(value.whatsapp.pairingNumber)) missing.push('whatsapp.pairingNumber');
  if (!/^\d{8,15}$/.test(value.whatsapp.ownerNumber)) missing.push('whatsapp.ownerNumber');
  if (value.whatsapp.pairingNumber !== value.whatsapp.ownerNumber) {
    missing.push('whatsapp.pairingNumber harus sama dengan whatsapp.ownerNumber');
  }
  if (missing.length) throw new Error(`Konfigurasi runtime belum lengkap di config/app.json: ${missing.join(', ')}`);
  return value;
}

export const config = loadConfig();
