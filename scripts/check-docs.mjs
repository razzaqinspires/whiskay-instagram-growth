import { readdir, readFile, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const README = path.join(ROOT, 'README.md');
const PACKAGE = path.join(ROOT, 'package.json');
const SCRIPT_REFERENCE = path.join(DOCS, 'guides', 'SCRIPTS-REFERENCE.md');
const errors = [];
const markdownFiles = [];
const scriptFiles = [];
const ignoredDirectories = new Set([
  '.git', 'node_modules', '.venv-instagram', 'session', 'auth_ig', 'data', 'coverage',
]);
const archiveExtensions = new Set([
  '.zip', '.tar', '.tgz', '.gz', '.7z', '.rar', '.bak', '.old', '.orig', '.log',
]);

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function isArchiveOrBackup(name) {
  const lower = name.toLowerCase();
  const extension = path.extname(lower);
  return archiveExtensions.has(extension)
    || /\.backup(?:[-.]|$)/i.test(name)
    || /(?:^|[-_.])backup(?:[-_.]|$)/i.test(name);
}

async function walk(directory, onFile, { skipRuntime = false } = {}) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (skipRuntime && ignoredDirectories.has(entry.name)) continue;
      await walk(full, onFile, { skipRuntime });
    } else if (entry.isFile()) {
      await onFile(full);
    }
  }
}

function parseLocalLinks(markdown) {
  const links = [];
  const pattern = /\]\((<[^>]+>|[^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    let href = match[1].trim();
    if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
    href = href.split(/\s+/, 1)[0];
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) continue;
    links.push(href);
  }
  return links;
}

// Rule 1: only README.md may live at the repository root.
for (const entry of await readdir(ROOT, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name !== 'README.md') {
    errors.push(`Markdown di root selain README.md harus dipindahkan ke docs/: ${entry.name}`);
  }
}

// Rule 2: collect all Markdown under docs/ and all maintained script files.
try {
  const docsInfo = await stat(DOCS);
  if (!docsInfo.isDirectory()) throw new Error('docs/ bukan direktori.');
  await walk(DOCS, file => {
    if (file.toLowerCase().endsWith('.md')) markdownFiles.push(file);
  });
} catch (error) {
  errors.push(error.message);
}

await walk(path.join(ROOT, 'scripts'), file => {
  if (/\.(?:mjs|sh)$/i.test(file)) scriptFiles.push(file);
});

let readmeText = '';
let packageJson = {};
let scriptReferenceText = '';
try { readmeText = await readFile(README, 'utf8'); }
catch (error) { errors.push(`README.md tidak dapat dibaca: ${error.message}`); }
try { packageJson = JSON.parse(await readFile(PACKAGE, 'utf8')); }
catch (error) { errors.push(`package.json tidak valid: ${error.message}`); }
try { scriptReferenceText = await readFile(SCRIPT_REFERENCE, 'utf8'); }
catch (error) { errors.push(`Referensi script tidak tersedia: ${error.message}`); }

// Rule 3: README must use the same version as package.json and link every docs/*.md file.
if (packageJson.version && !readmeText.includes(`v${packageJson.version}`)) {
  errors.push(`README.md belum menyebut versi package.json v${packageJson.version}.`);
}
const readmeLinks = new Set(parseLocalLinks(readmeText).map(href => {
  const withoutAnchor = decodeURIComponent(href.split('#', 1)[0].split('?', 1)[0]);
  return path.resolve(ROOT, withoutAnchor);
}));
for (const file of markdownFiles) {
  if (!readmeLinks.has(path.resolve(file))) {
    errors.push(`README.md belum memiliki tautan Markdown langsung ke ${relative(file)}.`);
  }
}

// Rule 4: every local Markdown link must resolve to an existing file.
for (const sourceFile of [README, ...markdownFiles]) {
  let source;
  try { source = await readFile(sourceFile, 'utf8'); }
  catch (error) { errors.push(`Tidak dapat membaca ${relative(sourceFile)}: ${error.message}`); continue; }
  for (const href of parseLocalLinks(source)) {
    const clean = decodeURIComponent(href.split('#', 1)[0].split('?', 1)[0]);
    if (!clean) continue;
    const target = path.resolve(path.dirname(sourceFile), clean);
    try { await stat(target); }
    catch { errors.push(`Link lokal rusak: ${relative(sourceFile)} -> ${href}`); }
  }
}

// Rule 5: each npm script that invokes a project script must point to a real file.
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (typeof command !== 'string') continue;
  const pattern = /(?:^|\s)(?:node|bash)\s+(?:--env-file=[^\s]+\s+)?(scripts\/[^\s;&|]+)/g;
  for (const match of command.matchAll(pattern)) {
    const target = path.resolve(ROOT, match[1]);
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || !info.isFile()) errors.push(`npm script '${name}' target bukan regular file: ${match[1]}`);
    } catch {
      errors.push(`npm script '${name}' menunjuk file yang tidak ada: ${match[1]}`);
    }
  }
}

// Rule 6: all maintained .mjs/.sh utilities must be documented in the script inventory.
for (const file of scriptFiles) {
  const scriptPath = relative(file);
  if (!scriptReferenceText.includes(scriptPath)) {
    errors.push(`Script belum tercatat di docs/guides/SCRIPTS-REFERENCE.md: ${scriptPath}`);
  }
}

// Rule 7: the active release must have release, upgrade, and QA records.
if (packageJson.version) {
  const requiredDocs = [
    `docs/releases/RELEASE-NOTES-v${packageJson.version}.md`,
    `docs/upgrades/UPGRADE-v${packageJson.version}.md`,
    `docs/qa/QA-REPORT-v${packageJson.version}.md`,
  ];
  for (const document of requiredDocs) {
    try { await stat(path.join(ROOT, document)); }
    catch { errors.push(`Dokumen versi aktif belum tersedia: ${document}`); }
    if (!readmeLinks.has(path.resolve(ROOT, document))) {
      errors.push(`README.md belum mengindeks dokumen versi aktif: ${document}`);
    }
  }
}

// Rule 8: archives and backup remnants do not belong in a source tree.
await walk(ROOT, file => {
  if (isArchiveOrBackup(path.basename(file))) {
    errors.push(`Arsip/backup/log tidak boleh berada di source tree: ${relative(file)}`);
  }
}, { skipRuntime: true });

if (errors.length) {
  for (const error of errors) console.error(`[PROJECT CHECK ERROR] ${error}`);
  process.exit(1);
}

console.log(`[DOCS] ${markdownFiles.length} dokumen docs/ terindeks langsung di README.md; tautan, version docs, script targets, inventaris ${scriptFiles.length} script, dan kebersihan source tree valid.`);
