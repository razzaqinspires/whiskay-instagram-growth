import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from '../src/config.mjs';

const roots = ['index.mjs', 'src', 'scripts', 'test'];
const ignored = new Set(['node_modules', '.git', 'session', 'auth_ig', 'data', '.venv-instagram']);
const extensions = new Set(['.mjs', '.js', '.cjs']);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(full);
  }
}

for (const root of roots) {
  const absolute = path.join(PROJECT_ROOT, root);
  try {
    const info = await stat(absolute);
    if (info.isDirectory()) await walk(absolute);
    else if (info.isFile() && extensions.has(path.extname(absolute))) files.push(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const uniqueFiles = [...new Set(files)].sort();
const failures = [];
for (const file of uniqueFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file, stderr: result.stderr || result.stdout || `exit ${result.status}` });
}

for (const failure of failures) {
  console.error(`[SYNTAX ERROR] ${path.relative(PROJECT_ROOT, failure.file)}\n${failure.stderr}`);
}
if (failures.length) process.exit(1);
console.log(`[CHECK] ${uniqueFiles.length} JavaScript files (.mjs/.js/.cjs) passed syntax validation.`);
