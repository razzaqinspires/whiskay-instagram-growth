import { getAntiSpamStats } from '../commands.mjs';

export default {
  name: 'core',
  commands: [
    {
      name: 'ping', aliases: ['p'], category: 'Core & Diagnostics', usage: '', description: 'Tes respons bot',
      async execute({ reply }) { await reply('pong'); }
    },
    {
      name: 'whoami', category: 'Core & Diagnostics', usage: '', description: 'Lihat JID mentah dan alternate addressing',
      async execute({ key, lidManager, reply }) {
        const pnCandidate = key.participantAlt || key.participantPn || key.senderPn || key.remoteJidAlt || key.remoteJidPn || '-';
        let resolvedPn = '-';
        const raw = key.participant || key.remoteJid;
        if (raw?.endsWith('@s.whatsapp.net')) resolvedPn = raw;
        else if (raw?.endsWith('@lid')) resolvedPn = await lidManager?.getPNForLID(raw) || '(mapping belum tersedia)';
        await reply([
          'WHISKAY JID DIAGNOSTICS',
          `remoteJid: ${key.remoteJid || '-'}`,
          `remoteJidAlt: ${key.remoteJidAlt || '-'}`,
          `remoteJidPn: ${key.remoteJidPn || '-'}`,
          `participant: ${key.participant || '-'}`,
          `participantAlt: ${key.participantAlt || '-'}`,
          `participantPn: ${key.participantPn || '-'}`,
          `senderPn: ${key.senderPn || '-'}`,
          `alternate candidate: ${pnCandidate}`,
          `resolved PN: ${resolvedPn}`,
          `fromMe: ${Boolean(key.fromMe)}`
        ].join('\n'));
      }
    },
    {
      name: 'jidstats', aliases: ['lidstats'], category: 'Core & Diagnostics', usage: '', description: 'Statistik cache mapping LID ↔ PN',
      async execute({ lidManager, reply }) {
        const stats = lidManager?.stats?.() || { lid2pn: 0, pn2lid: 0 };
        await reply(`LID → PN: ${stats.lid2pn}\nPN → LID: ${stats.pn2lid}`);
      }
    },
    {
      name: 'antispam', aliases: ['spamstatus'], category: 'Core & Diagnostics', usage: '', description: 'Status proteksi anti-spam',
      async execute({ reply }) {
        const stats = getAntiSpamStats();
        await reply([
          'WHISKAY ANTI-SPAM',
          `Tracked senders: ${stats.trackedSenders}`,
          `Duplicate IDs: ${stats.rememberedMessages}`,
          `Active commands: ${stats.activeCommands}`,
          'Mode: in-memory / single process'
        ].join('\n'));
      }
    },
    {
      name: 'plugins', category: 'Core & Diagnostics', usage: '', description: 'Daftar plugin dan command aktif',
      async execute({ pluginLoader, reply }) {
        const list = pluginLoader?.listCommands?.() || [];
        const groups = new Map();
        for (const item of list) {
          if (!groups.has(item.category)) groups.set(item.category, []);
          groups.get(item.category).push(item);
        }
        const lines = [];
        for (const [category, entries] of groups) {
          lines.push(`「 ${category} 」`);
          for (const item of entries) lines.push(`${item.name}${item.usage ? ` ${item.usage}` : ''}${item.aliases.length ? ` [${item.aliases.join(', ')}]` : ''} — ${item.plugin}`);
          lines.push('');
        }
        await reply(lines.join('\n').trim() || 'Tidak ada plugin aktif.');
      }
    }
  ]
};
