import { cp, mkdir, mkdtemp, readdir, lstat, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from '../src/config.mjs';
import packageJson from '../package.json' with { type: 'json' };

const packageName = String(packageJson.name || '').trim();
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(packageName)) {
  throw new Error(`package.json name tidak aman untuk nama arsip: ${packageName || '(kosong)'}`);
}
const archiveRootName = `${packageName}-v${packageJson.version}`;
const output = path.resolve(process.argv[2] || path.join(path.dirname(PROJECT_ROOT), `${archiveRootName}.zip`));
if (path.extname(output).toLowerCase() !== '.zip') {
  throw new Error('Output release harus menggunakan ekstensi .zip.');
}
const projectPrefix = `${PROJECT_ROOT}${path.sep}`;
if (output === PROJECT_ROOT || output.startsWith(projectPrefix)) {
  throw new Error('Arsip release wajib disimpan di luar direktori proyek agar source tree tetap bersih.');
}
const zipCheck = spawnSync('zip', ['-v'], { encoding: 'utf8', stdio: 'ignore' });
if (zipCheck.error || zipCheck.status !== 0) {
  throw new Error('Perintah zip tidak tersedia. Pasang paket zip pada sistem sebelum membuat release.');
}
const stageRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-release-'));
const stage = path.join(stageRoot, archiveRootName);
const include = [
  '.gitignore', '.npmrc', '.env.example', 'README.md',
  'index.mjs', 'package.json', 'requirements-instagram.txt',
  'config/app.example.json', 'assets', 'docs', 'python', 'scripts', 'src', 'test', 'vendor',
];
const deniedNames = new Set([
  '.git', '.npm', 'node_modules', '.venv-instagram', '__pycache__',
  'session', 'auth_ig', 'data', 'backups', 'coverage',
]);
const deniedExtensions = new Set(['.zip', '.tar', '.gz', '.tgz', '.sqlite', '.log', '.pyc']);

async function copySafe(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: 0o755 });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (deniedNames.has(entry.name) || entry.name.startsWith('.backup-')) continue;
      await copySafe(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }
  if (!info.isFile()) return;
  const basename = path.basename(source);
  if (basename === '.env' || basename === 'app.json' || deniedExtensions.has(path.extname(basename).toLowerCase())) return;
  if (/\.backup(?:[-.]|$)/i.test(basename) || /(?:^|[-_.])backup(?:[-_.]|$)/i.test(basename)) return;
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
  await cp(source, destination, { preserveTimestamps: true });
}

try {
  await mkdir(stage, { recursive: true });
  for (const relative of include) {
    const source = path.join(PROJECT_ROOT, relative);
    try {
      await copySafe(source, path.join(stage, relative));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const directory of ['auth_ig', 'session/self', 'data', 'data/academic-inputs', 'data/remini']) {
    await mkdir(path.join(stage, directory), { recursive: true, mode: 0o700 });
    await writeFile(path.join(stage, directory, '.gitkeep'), '', { mode: 0o644 });
  }
  await mkdir(path.dirname(output), { recursive: true });
  try {
    const existing = await lstat(output);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error(`Output sudah ada tetapi bukan regular file: ${output}`);
    }
    await rm(output, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = spawnSync('zip', ['-qr', output, archiveRootName], { cwd: stageRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`zip gagal: ${result.stderr || result.stdout || result.status}`);
  console.log(`[RELEASE] ${output}`);
  console.log(`[RELEASE] Package: ${packageJson.name}@${packageJson.version}`);
  console.log('[RELEASE] Included: README.md, docs/, config template, maintained scripts/source/tests, and vendor reference files.');
  console.log('[RELEASE] Excluded: .env, config/app.json, sessions, auth_ig credentials, runtime data, databases, archives, node_modules, Python venv, and Git metadata.');
} finally {
  await rm(stageRoot, { recursive: true, force: true });
}
