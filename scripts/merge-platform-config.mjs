import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(root, 'config');
const target = path.join(configDir, 'app.json');
const defaultsFile = path.join(configDir, 'app.example.json');
const backupDir = path.join(path.dirname(root), `${path.basename(root)}-private-config-backups`);

function assertRegularFile(file, label) {
  const info = fs.lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} harus berupa regular file dan tidak boleh symlink: ${file}`);
  }
}

function mergeMissing(current, defaults) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) return current ?? defaults;
  const out = { ...current };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in out)) out[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeMissing(out[key], value);
    }
  }
  return out;
}

fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
assertRegularFile(defaultsFile, 'Template konfigurasi');
const defaults = JSON.parse(fs.readFileSync(defaultsFile, 'utf8'));

if (!fs.existsSync(target)) {
  fs.copyFileSync(defaultsFile, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o600);
  process.stdout.write('config/app.json dibuat dari config/app.example.json. Isi pairingNumber dan ownerNumber sebelum start.\n');
} else {
  assertRegularFile(target, 'config/app.json');
  const current = JSON.parse(fs.readFileSync(target, 'utf8'));
  const merged = mergeMissing(current, defaults);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDir, 0o700);
  const backup = path.join(backupDir, `app-${timestamp}-${randomUUID()}.json`);
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, 0o600);

  const temporary = path.join(configDir, `.app.json.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* retain original config */ }
    throw error;
  }

  process.stdout.write(`Konfigurasi digabung tanpa menimpa nilai lama. Backup privat di luar proyek: ${backup}\n`);
}
