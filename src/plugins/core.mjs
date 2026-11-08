import { getAntiSpamStats } from '../commands.mjs';
import { commandActionId } from '../lib/native-flow.mjs';

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
      name: 'hotreload', aliases: ['watchstatus'], category: 'Core & Diagnostics', usage: '[status|reload]', description: 'Status pemantauan plugin dan library ESM; reload dependency graph',
      async execute({ args = [], pluginLoader, reply }) {
        const action = String(args[0] || 'status').toLowerCase();
        if (!['status', 'reload'].includes(action)) return reply('Format: .hotreload status | .hotreload reload');
        if (action === 'reload') {
          const ok = await pluginLoader?.reload?.();
          return reply(ok
            ? 'Snapshot source dan seluruh dependency graph plugin berhasil dimuat ulang. Periksa log runtime untuk detail.'
            : 'Reload tidak berhasil. Registry sebelumnya dipertahankan; periksa log dependency/import.');
        }
        const status = pluginLoader?.status?.();
        if (!status) return reply('Hot reload belum tersedia pada runtime ini.');
        return reply([
          '━━ WHISKAY HOT RELOAD ━━',
          `Mode: ${status.mode}`,
          `Source root: ${status.sourceRoot || 'plugin folder only'}`,
          `Folder diawasi: ${status.watchedDirectories}`,
          `Plugin aktif: ${status.plugins}`,
          `Command aktif: ${status.commands}`,
          `Snapshot: ${status.generation || '-'}`,
          `Perubahan terakhir: ${status.lastSourceChange?.path || '-'}`,
          `Reload terakhir: ${status.lastReloadAt || '-'}`,
          `Hasil: ${status.lastReloadResult}`,
          'File library di bawah src/ ikut diawasi. Jika dependency hilang saat startup lalu ditambahkan, plugin akan dicoba ulang otomatis.'
        ].join('\n'));
      }
    },
    {
      name: 'plugins', category: 'Core & Diagnostics', usage: '[text|page <n>]', description: 'Daftar semua plugin dan command aktif dalam tombol Single Select atau teks',
      async execute({ pluginLoader, reply, sendInteractive, args = [], prefix = '.' }) {
        const list = pluginLoader?.listCommands?.() || [];
        if (!list.length) return reply('Tidak ada plugin aktif.');
        if (String(args[0] || '').toLowerCase() === 'text') {
          const groups = new Map();
          for (const item of list) {
            if (!groups.has(item.category)) groups.set(item.category, []);
            groups.get(item.category).push(item);
          }
          const lines = [`WHISKAY PLUGIN DIRECTORY · ${list.length} command`];
          for (const [category, entries] of groups) {
            lines.push('', `「 ${category} 」`);
            for (const item of entries) lines.push(`${prefix}${item.name}${item.usage ? ` ${item.usage}` : ''}${item.aliases.length ? ` [${item.aliases.join(', ')}]` : ''} — ${item.description || item.plugin}`);
          }
          return reply(lines.join('\n').slice(0, 4000));
        }
        const perPage = 200;
        const totalPages = Math.max(1, Math.ceil(list.length / perPage));
        let page = 1;
        if (String(args[0] || '').toLowerCase() === 'page') page = Number(args[1]) || 1;
        if (!Number.isInteger(page) || page < 1 || page > totalPages) return reply(`Halaman tidak valid. Gunakan .plugins page 1–${totalPages} atau .plugins text.`);
        const pageItems = list.slice((page - 1) * perPage, page * perPage);
        // Keep the Native Flow shape bounded: at most 10 sections × 20 rows.
        // Category remains visible in row descriptions, so categories do not
        // consume sections and accidentally make commands disappear.
        const sections = [];
        for (let offset = 0; offset < pageItems.length; offset += 20) {
          sections.push({
            title: `Active commands ${offset + 1}–${Math.min(offset + 20, pageItems.length)}`,
            rows: pageItems.slice(offset, offset + 20).map(item => ({
              title: `${prefix}${item.name}`.slice(0, 80),
              description: `${item.category} · ${item.description || item.plugin}${item.usage ? ` · ${item.usage}` : ''}`.slice(0, 120),
              id: commandActionId(`${prefix}${item.name}`)
            }))
          });
        }
        if (!sections.length || sections.length > 10) return reply(`Jumlah command pada halaman tidak dapat ditampilkan. Gunakan .plugins text atau .plugins page ${page + 1}.`);
        const sent = await sendInteractive({
          title: 'WHISKAY · PLUGIN DIRECTORY',
          body: `Halaman ${page}/${totalPages} · ${pageItems.length} command pada halaman · ${list.length} total command aktif. Pilih command untuk menjalankannya melalui autentikasi normal.`,
          footer: 'Single Select · Live plugin registry',
          buttons: [{ type: 'single_select', title: 'Browse active commands', sections }]
        });
        if (totalPages > 1) await reply(`Halaman ${page}/${totalPages}. Gunakan .plugins page ${page === totalPages ? 1 : page + 1} untuk lanjut, atau .plugins text untuk versi teks.`);
        return sent;
      }
    }
  ]
};
