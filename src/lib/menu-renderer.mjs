/**
 * Render commands grouped by category and sorted A-Z.
 * The invoked prefix is used for every example. Arguments are appended only
 * when a command declares a non-empty usage string.
 */
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

  const groups = new Map();
  for (const command of valid) {
    if (!groups.has(command.category)) groups.set(command.category, []);
    groups.get(command.category).push(command);
  }

  const lines = [
    '╭━━ WHISKAY COMMAND MENU ━━╮',
    `Prefix aktif: ${prefixes.join(' ')}`,
    'Format: prefix + command + (args ? " " + args : "")',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━╯'
  ];

  for (const [category, entries] of groups) {
    lines.push('', `「 ${category} 」`);
    for (const command of entries) {
      const invocation = `${prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}`;
      lines.push(`${invocation}${command.description ? ` — ${command.description}` : ''}`);
    }
  }

  lines.push('', `Gunakan ${prefix}plugins untuk melihat plugin aktif.`);
  return lines.join('\n');
}
