import fs from 'node:fs';
import path from 'node:path';
import { config, assertRuntimeConfig } from '../src/config.mjs';
import { inspectInstagramSetup } from '../src/instagram.mjs';

const checks = [];
const add = (name, state, detail) => checks.push({ name, state, detail });
const [major, minor] = process.versions.node.split('.').map(Number);
add('Node.js 22.5–22.x', major === 22 && minor >= 5 ? 'PASS' : 'FAIL', process.version);
let runtimeReady = true;
try { assertRuntimeConfig(config); } catch { runtimeReady = false; }
add('WhatsApp owner/pairing configured', runtimeReady ? 'PASS' : 'SETUP', 'Nomor owner dan pairing harus sama di config/app.json');
add('Instagram username', /^[a-zA-Z0-9._]{1,30}$/.test(config.instagram.username) ? 'PASS' : 'SETUP', config.instagram.username || 'belum dikonfigurasi');
add('Growth storage', config.growth.databaseFile.endsWith('.json') ? 'PASS' : 'FAIL', 'single local JSON store for organic campaigns and content analytics');
const waPrivate = !fs.existsSync(config.whatsapp.sessionDir) || ((fs.statSync(config.whatsapp.sessionDir).mode & 0o077) === 0);
add('WhatsApp session directory private', waPrivate ? 'PASS' : 'FAIL', config.whatsapp.sessionDir);
const igSeparate = config.instagram.sessionFile !== config.whatsapp.sessionDir
  && !config.instagram.sessionFile.startsWith(config.whatsapp.sessionDir + path.sep)
  && !config.whatsapp.sessionDir.startsWith(config.instagram.sessionFile + path.sep);
add('Instagram session path separate', igSeparate ? 'PASS' : 'FAIL', config.instagram.sessionFile);

try {
  const ig = await inspectInstagramSetup();
  add('Instagram adapter', ig.pythonAvailable ? 'PASS' : 'SETUP', ig.pythonAvailable ? `Python ${ig.pythonVersion}; instagrapi ${ig.adapterVersion || 'missing'}` : (ig.error || 'tidak tersedia'));
  add('Instagram session', ig.ready ? 'PASS' : 'SETUP', `${ig.status}: ${ig.sessionFile}`);
} catch (error) {
  add('Instagram adapter/session', 'SETUP', error.message);
}

for (const row of checks) console.log(`${row.state} ${row.name}: ${row.detail}`);
const failed = checks.filter(row => row.state === 'FAIL').length;
const setup = checks.filter(row => row.state === 'SETUP').length;
console.log(`\nDoctor: ${checks.length - failed - setup}/${checks.length} checks passed; ${setup} setup item(s); ${failed} failed`);
if (failed) process.exitCode = 1;
