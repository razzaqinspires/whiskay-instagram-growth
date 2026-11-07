const METRIC_KEYS = ['reach', 'impressions', 'profileVisits', 'follows'];

function normalizeMetric(value, key) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new TypeError(`${key} harus integer 0–1.000.000.000.`);
  }
  return value;
}

function rate(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/**
 * Analyze a manually recorded Instagram Insights snapshot as a conversion
 * funnel. The helper never fetches data or performs Instagram actions.
 */
export function calculateFollowerFunnel(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new TypeError('Metrik funnel harus berupa object.');
  }

  const values = Object.fromEntries(METRIC_KEYS.map(key => [key, normalizeMetric(metrics[key], key)]));
  const { reach, impressions, profileVisits, follows } = values;

  return Object.freeze({
    ...values,
    reachToProfileVisitRatePct: rate(profileVisits, reach),
    profileVisitToFollowRatePct: rate(follows, profileVisits),
    reachToFollowRatePct: rate(follows, reach),
    impressionsPerReachedAccount: reach > 0 ? impressions / reach : null,
    followsPerThousandReach: reach > 0 ? (follows / reach) * 1000 : null
  });
}

/** Return practical diagnostics without inventing universal performance benchmarks. */
export function recommendFollowerFunnelActions(funnel) {
  if (!funnel) return ['Catat metrik reach, profile visits, dan follows dari Instagram Insights pada periode yang sama.'];

  const actions = [];
  if (funnel.reach === 0) {
    actions.push('Belum ada reach yang tercatat. Prioritaskan distribusi konten yang relevan: Reels, kolaborasi kreator, dan cross-promotion yang disclosed.');
  } else if (funnel.profileVisits === 0) {
    actions.push('Reach sudah tercatat tetapi profile visits masih nol. Uji hook dan ajakan melihat profil yang jelas serta relevan dengan isi konten.');
  } else if (funnel.follows === 0) {
    actions.push('Profile visits sudah terjadi tetapi follows masih nol. Perjelas janji manfaat di bio, konsistensi niche, pinned posts, dan alasan audiens perlu mengikuti akun.');
  } else {
    actions.push('Follows sudah tercatat. Identifikasi konten dan sumber distribusi yang menghasilkan kunjungan serta follow, lalu ulangi format yang relevan tanpa mengasumsikan semua follow berasal dari satu campaign.');
  }

  if (funnel.impressions > 0 && funnel.reach > 0) {
    actions.push('Bandingkan impressions per reached account antarperiode untuk memahami frekuensi paparan; angka ini sendiri bukan bukti konversi.');
  }
  actions.push('Gunakan rentang tanggal Insights yang sama saat membandingkan campaign; hasil funnel adalah atribusi indikatif, bukan bukti kausal.');
  return actions;
}

export function formatFollowerFunnel(funnel) {
  if (!funnel) return null;
  const pct = value => value === null ? 'n/a (denominator 0)' : `${value.toFixed(2)}%`;
  const ratio = value => value === null ? 'n/a (reach 0)' : value.toFixed(2);
  return {
    reachToProfileVisit: pct(funnel.reachToProfileVisitRatePct),
    profileVisitToFollow: pct(funnel.profileVisitToFollowRatePct),
    reachToFollow: pct(funnel.reachToFollowRatePct),
    impressionsPerReach: ratio(funnel.impressionsPerReachedAccount),
    followsPerThousandReach: funnel.followsPerThousandReach === null ? 'n/a (reach 0)' : funnel.followsPerThousandReach.toFixed(2)
  };
}
