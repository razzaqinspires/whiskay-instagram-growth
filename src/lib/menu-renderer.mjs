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
