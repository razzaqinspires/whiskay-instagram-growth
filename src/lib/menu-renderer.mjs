/**
 * Render command categories. Core/non-Instagram tools come first, all
 * Instagram commands are grouped into one block, then a strong separator
 * precedes optional non-Instagram add-ons such as Academi.cx.
 */
const isInstagramCommand = item =>
  /^ig[a-z0-9_-]*$/i.test(item.name) ||
  /^(instagram|growth|organic growth|follower growth|content intelligence)/i.test(item.category);

const isPostInstagramCommand = item =>
  /^(academi\.cx|document review|external tools)/i.test(item.category) || item.menuSection === 'after-instagram';

function groupCommands(commands) {
  const groups = new Map();
  for (const command of commands) {
    if (!groups.has(command.category)) groups.set(command.category, []);
    groups.get(command.category).push(command);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function appendGroups(lines, groups, prefix) {
  for (const [category, entries] of groups) {
    lines.push('', `「 ${category} 」`);
    for (const command of entries) {
      const invocation = `${prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}`;
      lines.push(`${invocation}${command.description ? ` — ${command.description}` : ''}`);
    }
  }
}

export function renderCommandMenu(commands = [], { prefix = '.', prefixes = ['!', '.'] } = {}) {
  const valid = (Array.isArray(commands) ? commands : [])
    .filter(item => item && typeof item.name === 'string')
    .map(item => ({
      ...item,
      category: String(item.category || 'General').trim() || 'General',
      usage: String(item.usage || '').trim(),
      description: String(item.description || '').trim()
    }))
    .sort((a, b) =>
      a.category.localeCompare(b.category, 'en', { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    );

  if (!valid.length) {
    return `WHISKAY COMMAND MENU\nPrefix: ${prefixes.join(' ')}\n\nBelum ada plugin command.`;
  }

  const core = valid.filter(item => !isInstagramCommand(item) && !isPostInstagramCommand(item));
  const instagram = valid.filter(isInstagramCommand);
  const postInstagram = valid.filter(item => !isInstagramCommand(item) && isPostInstagramCommand(item));

  const lines = [
    '╭━━ WHISKAY COMMAND MENU ━━╮',
    `Prefix aktif: ${prefixes.join(' ')}`,
    'Format: prefix + command + (args ? " " + args : "")',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━╯'
  ];

  appendGroups(lines, groupCommands(core), prefix);
  appendGroups(lines, groupCommands(instagram), prefix);
  if (instagram.length && postInstagram.length) lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  appendGroups(lines, groupCommands(postInstagram), prefix);

  lines.push('', `Gunakan ${prefix}plugins untuk melihat plugin aktif.`);
  return lines.join('\n');
}

/** Render the complete live command catalogue for the main menu.
 * Aliases, usage and descriptions are included without mixing recommendation
 * ranking into the canonical command directory.
 */
export function renderCommandCatalog(commands = [], { prefix = '.' } = {}) {
  const valid = (Array.isArray(commands) ? commands : [])
    .filter(item => item && typeof item.name === 'string')
    .map(item => ({
      ...item,
      category: String(item.category || 'General').trim() || 'General',
      aliases: Array.isArray(item.aliases) ? item.aliases.map(value => String(value || '').trim()).filter(Boolean) : [],
      usage: String(item.usage || '').trim(),
      description: String(item.description || '').trim()
    }))
    .sort((a, b) =>
      a.category.localeCompare(b.category, 'en', { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    );

  if (!valid.length) return 'WHISKAY COMMAND CATALOG · 0 command\nBelum ada command aktif.';

  const groups = groupCommands(valid);
  const lines = [`WHISKAY COMMAND CATALOG · ${valid.length} command aktif`];
  for (const [category, entries] of groups) {
    lines.push('', `「 ${category} 」`);
    for (const item of entries) {
      const invocation = `${prefix}${item.name}${item.usage ? ` ${item.usage}` : ''}`;
      const aliases = item.aliases.length ? ` [alias: ${item.aliases.map(alias => `${prefix}${alias}`).join(', ')}]` : '';
      lines.push(`${invocation}${aliases}${item.description ? ` — ${item.description}` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Split a long text catalogue on line boundaries for regular WhatsApp messages. */
export function chunkCommandCatalog(text, maxChars = 3500) {
  const limit = Math.max(256, Math.min(3800, Math.floor(Number(maxChars) || 3500)));
  const chunks = [];
  let current = '';
  for (const rawLine of String(text || '').split('\n')) {
    let line = rawLine;
    while (line.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      chunks.push(line.slice(0, limit));
      line = line.slice(limit);
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
