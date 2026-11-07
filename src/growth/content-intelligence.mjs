const METRIC_KEYS = ['reach', 'impressions', 'profileVisits', 'follows', 'likes', 'comments', 'shares', 'saves'];
const FORMATS = new Set(['reel', 'post', 'story', 'video', 'carousel', 'live']);
const MAX_METRIC = 1_000_000_000;

function metric(value, key) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_METRIC) {
    throw new TypeError(`${key} harus integer 0–1.000.000.000.`);
  }
  return value;
}

function rate(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function normalizeContentMetrics(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Metrics konten harus object.');
  return Object.fromEntries(METRIC_KEYS.map(key => [key, metric(input[key], key)]));
}

export function calculateContentMetrics(input) {
  const values = normalizeContentMetrics(input);
  const { reach, impressions, profileVisits, follows, likes, comments, shares, saves } = values;
  const engagements = likes + comments + shares + saves;
  return Object.freeze({
    ...values,
    engagements,
    profileVisitRatePct: rate(profileVisits, reach),
    profileVisitToFollowRatePct: rate(follows, profileVisits),
    reachToFollowRatePct: rate(follows, reach),
    engagementRatePct: rate(engagements, reach),
    saveRatePct: rate(saves, reach),
    shareRatePct: rate(shares, reach),
    followsPerThousandReach: reach > 0 ? (follows / reach) * 1000 : null,
    impressionsPerReach: reach > 0 ? impressions / reach : null
  });
}

function aggregate(rows) {
  const totals = Object.fromEntries(METRIC_KEYS.map(key => [key, 0]));
  for (const row of rows) {
    const source = row.metrics || row;
    for (const key of METRIC_KEYS) totals[key] += Number(source[key] || 0);
  }
  return { count: rows.length, ...calculateContentMetrics(totals) };
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = String(row[key] || 'unspecified').trim().toLowerCase();
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, ...aggregate(items) }))
    .sort((a, b) => (b.followsPerThousandReach ?? -1) - (a.followsPerThousandReach ?? -1));
}

/**
 * Compare manually recorded per-content Insights snapshots. Rates are weighted
 * from summed metrics rather than averaging post-level percentages.
 */
export function buildContentIntelligence(posts = []) {
  if (!Array.isArray(posts)) throw new TypeError('Daftar konten harus array.');
  const rows = posts.map(post => ({
    ...post,
    metrics: calculateContentMetrics(post.metrics || post.snapshots?.at(-1)?.metrics || post)
  }));
  const eligible = rows.filter(row => row.metrics.reach > 0);
  const ranked = [...eligible].sort((a, b) =>
    (b.metrics.followsPerThousandReach ?? -1) - (a.metrics.followsPerThousandReach ?? -1)
    || b.metrics.follows - a.metrics.follows
  );
  const totals = rows.length ? aggregate(rows) : null;
  const recommendations = [];
  if (!rows.length) {
    recommendations.push('Belum ada data konten. Catat performa dari Instagram Insights dengan .igcontent add.');
  } else {
    if (!eligible.length) recommendations.push('Reach seluruh konten masih nol. Periksa periode laporan dan catat metrik distribusi terlebih dahulu.');
    if (eligible.length && rows.every(row => row.metrics.profileVisits === 0)) {
      recommendations.push('Konten belum menghasilkan profile visits terukur. Uji CTA yang relevan untuk melihat profil dan pastikan CTA sesuai isi konten.');
    }
    if (rows.some(row => row.metrics.profileVisits > 0) && rows.every(row => row.metrics.follows === 0)) {
      recommendations.push('Ada kunjungan profil tetapi belum ada follows terukur. Tinjau bio, pinned posts, kejelasan niche, dan konsistensi manfaat akun.');
    }
    if (ranked.length > 1) {
      recommendations.push(`Uji ulang format/tema konten dengan efisiensi follow tertinggi: ${ranked[0].label || ranked[0].id} (${ranked[0].metrics.followsPerThousandReach.toFixed(2)} follows per 1.000 reach). Validasi pada periode berikutnya sebelum menyimpulkan pola.`);
    }
    if (!recommendations.length) recommendations.push('Bandingkan beberapa periode dengan rentang tanggal Insights yang sama dan prioritaskan konten yang menghasilkan profile visits, saves, shares, serta follows secara konsisten.');
  }
  recommendations.push('Follows per konten harus berasal dari metrik Insights konten dan periode yang sama. Jangan menganggap kenaikan total follower akun sebagai atribusi pasti ke satu konten.');

  return Object.freeze({
    contentCount: rows.length,
    totals,
    topContent: ranked.slice(0, 10),
    byFormat: groupBy(rows, 'format'),
    byTheme: groupBy(rows, 'theme'),
    recommendations
  });
}

export function formatContentMetric(value, suffix = '%') {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(2)}${suffix}`;
}
