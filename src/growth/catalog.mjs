/** Curated organic growth strategies for one owner-controlled Instagram account. */
export const CATALOG = Object.freeze([
  { id: 'profile-optimization', name: 'Profile Optimization', description: 'Perjelas bio, niche, value proposition, foto profil, pinned posts, dan alasan audiens untuk mengikuti akun.' },
  { id: 'content-audit', name: 'Content Audit', description: 'Evaluasi kualitas konten, konsistensi tema, keterbacaan hook, retensi, saves, shares, dan kesesuaian audiens.' },
  { id: 'reels-strategy', name: 'Reels Growth Strategy', description: 'Susun eksperimen Reels dengan hook, struktur cerita, CTA relevan, dan evaluasi retention serta follows dari Insights.' },
  { id: 'creator-collab-plan', name: 'Creator Collaboration Plan', description: 'Rencanakan kolaborasi autentik dan transparan dengan kreator yang audiensnya relevan; koordinasi dilakukan owner secara langsung.' },
  { id: 'community-engagement', name: 'Community Engagement', description: 'Bangun percakapan yang relevan melalui balasan komentar, diskusi niche, dan interaksi manusia yang wajar; tanpa spam atau auto-follow.' }
]);

export function getCatalogItem(id) {
  return CATALOG.find(item => item.id === String(id || '').toLowerCase()) || null;
}
