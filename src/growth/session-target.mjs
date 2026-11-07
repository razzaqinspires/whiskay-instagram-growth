const USERNAME_RE = /^[a-z0-9._]{1,30}$/i;

/** Build a campaign target only from the identity returned by the active Instagram session. */
export function buildSessionCampaignTarget(profile) {
  const username = String(profile?.username ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new TypeError('Identitas akun dari session Instagram tidak valid. Campaign tidak dibuat.');
  }
  return Object.freeze({
    username,
    target: `https://www.instagram.com/${username}/`,
    identitySource: 'active-instagram-session'
  });
}
