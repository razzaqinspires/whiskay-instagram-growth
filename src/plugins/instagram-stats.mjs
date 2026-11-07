import { getInstagramHistory } from '../instagram.mjs';

const formatDelta = value => `${value > 0 ? '+' : ''}${value}`;
const formatPercent = (delta, base) => base > 0 ? `${delta > 0 ? '+' : ''}${((delta / base) * 100).toFixed(2)}%` : 'tidak dapat dihitung (baseline 0)';
function formatElapsed(ms) {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return days ? `${days} hari ${remainingHours} jam` : `${hours} jam`;
}

function compareSnapshots(history, days) {
  if (!history.length) return null;
  const current = history.at(-1);
  const sameSource = history.filter(row => (row.source || 'manual') === (current.source || 'manual'));
  if (sameSource.length < 2) return null;
  const currentTime = Date.parse(current.date);
  const threshold = currentTime - (days * 86_400_000);
  const prior = sameSource.filter(row => Date.parse(row.date) <= threshold).at(-1) || sameSource[0];
  if (!prior || prior === current || Date.parse(prior.date) >= currentTime) return null;
  const elapsed = currentTime - Date.parse(prior.date);
  const followers = current.followers - prior.followers;
  return {
    prior,
    current,
    elapsed,
    followers,
    following: current.following - prior.following,
    posts: current.posts - prior.posts,
    dailyAverage: elapsed > 0 ? followers / (elapsed / 86_400_000) : null
  };
}

export default {
  name: 'instagram-analytics',
  commands: [
    {
      name: 'iggrowth', category: 'Instagram Analytics', usage: '[7|30|90]', description: 'Laporan pertumbuhan followers dari snapshot historis (bukan alias igstats)',
      async execute({ args, reply }) {
        const days = args[0] === undefined ? 7 : Number(args[0]);
        if (!Number.isInteger(days) || ![7, 30, 90].includes(days) || args.length > 1) {
          return reply('Format: .iggrowth [7|30|90]');
        }
        try {
          const history = await getInstagramHistory();
          const report = compareSnapshots(history, days);
          if (!report) {
            const latest = history.at(-1);
            return reply([
              '━━ INSTAGRAM GROWTH REPORT ━━',
              `Periode diminta: ${days} hari`,
              `Snapshot tersedia: ${history.length}`,
              latest ? `Snapshot terakhir: ${latest.date} | followers ${latest.followers}` : 'Belum ada snapshot.',
              'Data pembanding belum cukup. Simpan snapshot berikutnya setelah periode pengamatan; jangan membuat angka historis palsu.'
            ].join('\n'));
          }
          await reply([
            '━━ INSTAGRAM GROWTH REPORT ━━',
            `Periode diminta: ${days} hari`,
            `Periode terukur: ${formatElapsed(report.elapsed)}`,
            `Dari: ${report.prior.date}`,
            `Sampai: ${report.current.date}`,
            `Followers: ${report.prior.followers} → ${report.current.followers} (${formatDelta(report.followers)})`,
            `Pertumbuhan relatif: ${formatPercent(report.followers, report.prior.followers)}`,
            `Rata-rata perubahan/hari: ${report.dailyAverage.toFixed(2)}`,
            `Following: ${formatDelta(report.following)}`,
            `Posts: ${formatDelta(report.posts)}`,
            `Source: ${report.current.source || 'manual'}`
          ].join('\n'));
        } catch (error) { await reply(`Analisis growth gagal: ${error.message}`); }
      }
    },
    {
      name: 'ighistory', category: 'Instagram Analytics', usage: '[jumlah]', description: 'Lihat histori snapshot Instagram',
      async execute({ args, reply }) {
        const limit = args[0] === undefined ? 10 : Number(args[0]);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20 || args.length > 1) return reply('Format: .ighistory [jumlah 1–20]');
        try {
          const history = (await getInstagramHistory()).slice(-limit).reverse();
          if (!history.length) return reply('Belum ada histori snapshot. Gunakan .igsync.');
          await reply(['━━ INSTAGRAM SNAPSHOT HISTORY ━━', ...history.map((row, index) => `${index + 1}. ${row.date}\nFollowers: ${row.followers} | Following: ${row.following} | Posts: ${row.posts}\nSource: ${row.source || 'manual'}`)].join('\n\n'));
        } catch (error) { await reply(`Gagal membaca histori: ${error.message}`); }
      }
    }
  ]
};
