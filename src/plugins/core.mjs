import { getAntiSpamStats } from '../commands.mjs';
import { commandActionId } from '../lib/native-flow.mjs';

export default {
  name: 'core',
  commands: [
    {
      name: 'safety', aliases: ['trafficguard'], category: 'Core & Diagnostics',
      usage: '[status|cooldown|spam|transport|queue|rate|bans|ban|unban]',
      description: 'Kontrol owner-only untuk cooldown, anti-spam, temporary ban, antrean dan transport',
      async execute({ args = [], reply, trafficSafety, sock }) {
        const [sectionRaw = 'status', actionRaw, valueRaw, extraRaw] = args;
        const section = String(sectionRaw).toLowerCase();
        const action = String(actionRaw || '').toLowerCase();
        const value = String(valueRaw || '').toLowerCase();
        const toggle = value => {
          if (!['on', 'off'].includes(value)) throw new Error('Gunakan on atau off.');
          return value === 'on';
        };
        const settings = await trafficSafety.getSettings();
        if (section === 'status' || section === 'settings') {
          const stats = await trafficSafety.stats();
          const queue = await sock?.whiskayOutboundQueue?.stats?.().catch?.(() => null);
          const s = stats.settings;
          return reply([
            '━━ WHISKAY TRAFFIC SAFETY ━━',
            `Cooldown: ${s.cooldown.enabled ? 'ON' : 'OFF'} · ${s.cooldown.perCommandMs} ms · notifikasi sekali: ${s.cooldown.notifyOnce ? 'YA' : 'TIDAK'}`,
            `Anti-spam: ${s.antiSpam.enabled ? 'ON' : 'OFF'} · burst ${s.antiSpam.burstLimit}/${s.antiSpam.windowMs} ms · warning ${s.antiSpam.warningThreshold} · ban ${s.antiSpam.banThreshold}`,
            `Transport pacing: ${s.transport.enabled ? 'ON' : 'OFF'} · jeda minimum ${s.transport.minIntervalMs} ms`,
            `Outbound queue: ${s.queue.enabled ? 'ON' : 'OFF'} · maksimum ${s.transport.maxQueueSize}`,
            `Temporary bans aktif: ${stats.activeBans}`,
            `Rekaman ingress tersimpan: ${stats.ingressRecorded}`,
            queue ? `Antrean outbound: ${queue.pending} pending · ${queue.sent} sent · ${queue.failed} failed · ${queue.unknown} unknown` : 'Antrean outbound: belum terpasang',
            '',
            'Perintah: .safety cooldown|spam|transport|queue on|off',
            '.safety rate <ms> · .safety spam limits <burst> <warning> <ban> <detik>',
            '.safety ban-duration <menit> · .safety bans',
            '.safety ban <nomor> [menit] · .safety unban <nomor>'
          ].join('\\n'));
        }
        if (['cooldown', 'spam', 'transport', 'queue'].includes(section)) {
          if (!['on', 'off'].includes(action)) return reply(`Format: .safety ${section} on|off`);
          const key = section === 'spam' ? 'antiSpam' : section;
          const updated = await trafficSafety.updateSettings(key, { enabled: toggle(action) });
          return reply(`${section} ${updated.enabled ? 'AKTIF' : 'NONAKTIF'}. Pengaturan tersimpan ke JSON.`);
        }
        if (section === 'rate') {
          const ms = Number(actionRaw);
          const updated = await trafficSafety.updateSettings('transport', { minIntervalMs: ms });
          return reply(`Jeda minimum pengiriman diatur ke ${updated.minIntervalMs} ms dan disimpan.`);
        }
        if (section === 'spam' && action === 'limits') {
          const [burstLimit, warningThreshold, banThreshold, windowSeconds] = args.slice(2).map(Number);
          const updated = await trafficSafety.updateSettings('antiSpam', {
            burstLimit, warningThreshold, banThreshold, windowMs: windowSeconds * 1000
          });
          return reply(`Batas anti-spam tersimpan: burst ${updated.burstLimit} pesan/${updated.windowMs / 1000} detik, warning ${updated.warningThreshold}, ban ${updated.banThreshold}.`);
        }
        if (section === 'ban-duration') {
          const minutes = Number(actionRaw);
          const updated = await trafficSafety.updateSettings('antiSpam', { banDurationMs: minutes * 60000 });
          return reply(`Durasi temporary ban otomatis: ${updated.banDurationMs / 60000} menit.`);
        }
        if (section === 'cooldown-ms') {
          const ms = Number(actionRaw);
          const updated = await trafficSafety.updateSettings('cooldown', { perCommandMs: ms });
          return reply(`Cooldown per command diatur ke ${updated.perCommandMs} ms.`);
        }
        if (section === 'bans') {
          const bans = await trafficSafety.listBans();
          return reply(bans.length
            ? ['━━ ACTIVE TEMPORARY BANS ━━', ...bans.map(item => `${item.sender} · sampai ${new Date(item.bannedUntil).toISOString()} · ${item.reason}`)].join('\\n')
            : 'Tidak ada temporary ban aktif.');
        }
        if (section === 'ban' || section === 'unban') {
          const targetRaw = String(actionRaw || '');
          const digits = targetRaw.replace(/\D/g, '');
          if (!/^\d{8,15}$/.test(digits)) return reply(`Format: .safety ${section} <nomor-internasional> [menit]`);
          const jid = `${digits}@s.whatsapp.net`;
          if (section === 'unban') {
            await trafficSafety.unbanUser(jid);
            return reply(`Temporary ban untuk ${jid} telah dicabut.`);
          }
          const minutes = Number(valueRaw || 15);
          if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) return reply('Durasi ban harus 1–10080 menit.');
          const result = await trafficSafety.banUser(jid, Math.floor(minutes * 60000), 'owner_manual');
          return reply(`Temporary ban diterapkan ke ${result.sender} sampai ${new Date(result.bannedUntil).toISOString()}.`);
        }
        return reply([
          'Format WHISKAY SAFETY:',
          '.safety status',
          '.safety cooldown on|off',
          '.safety cooldown-ms <0-60000>',
          '.safety spam on|off',
          '.safety transport on|off',
          '.safety queue on|off',
          '.safety rate <500-60000>',
          '.safety spam limits <burst> <warning> <ban> <detik>',
          '.safety ban-duration <menit>',
          '.safety bans',
          '.safety ban <nomor> [menit]',
          '.safety unban <nomor>'
        ].join('\\n'));
      }
    },
    {
      name: 'unknownnotice', aliases: ['unknowncmd', 'unknowncommandnotice'], category: 'Core & Diagnostics',
      usage: '[status|on|off]', description: 'Aktifkan atau nonaktifkan notifikasi command tidak dikenal (owner-only)',
      async execute({ args = [], reply, unknownNoticeStore }) {
        const action = String(args[0] || 'status').toLowerCase();
        if (action === 'status') {
          const state = await unknownNoticeStore.get();
          return reply([
            '━━ UNKNOWN COMMAND NOTIFICATION ━━',
            `Status: ${state.enabled ? 'ON' : 'OFF'}`,
            'OFF: command tidak dikenal diabaikan tanpa balasan.',
            'ON: bot membalas dengan informasi command tidak dikenal.',
            '',
            'Perintah:',
            '.unknownnotice on',
            '.unknownnotice off',
            '.unknownnotice status'
          ].join('\\n'));
        }
        if (!['on', 'off'].includes(action) || args.length > 1) {
          return reply('Format: .unknownnotice [status|on|off]');
        }
        const state = await unknownNoticeStore.setEnabled(action === 'on');
        return reply(`Notifikasi command tidak dikenal: ${state.enabled ? 'AKTIF' : 'NONAKTIF'}.`);
      }
    },
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
