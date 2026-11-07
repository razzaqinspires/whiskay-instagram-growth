import { CATALOG, getCatalogItem } from './catalog.mjs';
import { createOrder, getOrder, getOrders, getOrdersPage, updateOrderStatus } from './store.mjs';
import { config } from '../config.mjs';

const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function normalizeInstagramTarget(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 300) throw new TypeError('Target Instagram kosong atau terlalu panjang.');
  let username;
  if (/^@?[a-zA-Z0-9._]{1,30}$/.test(raw)) {
    username = raw.replace(/^@/, '');
  } else {
    let url;
    try { url = new URL(raw); } catch { throw new TypeError('Target harus username atau URL profil Instagram yang valid.'); }
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) || url.protocol !== 'https:' || url.username || url.password) {
      throw new TypeError('URL target harus menggunakan https://www.instagram.com/ dan host yang tepat.');
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) throw new TypeError('URL harus menuju satu profil Instagram, bukan halaman lain.');
    username = segments[0];
  }
  if (!USERNAME_RE.test(username)) throw new TypeError('Username Instagram tidak valid.');
  return `https://www.instagram.com/${username}/`;
}

export function parseBudget(input) {
  const raw = String(input ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:_\d{3})+)$/.test(raw)) throw new TypeError('Budget harus angka bulat tanpa desimal/notasi ilmiah; pemisah ribuan boleh koma atau underscore.');
  const value = Number(raw.replace(/[,_]/g, ''));
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw new TypeError('Budget harus bilangan bulat 0–1.000.000.000.');
  return value;
}

export function listServices() { return CATALOG; }

export async function submitGrowthOrder({ serviceId, target, budget, notes, idempotencyKey }) {
  const service = getCatalogItem(serviceId);
  if (!service) throw new Error(`Layanan tidak dikenal: ${serviceId}. Lihat .igservices`);
  const normalizedTarget = normalizeInstagramTarget(target);
  const amount = parseBudget(budget);
  if (amount < service.minBudget) throw new Error(`Budget minimum untuk ${service.id}: ${service.minBudget}`);
  const order = await createOrder({ service: service.id, target: normalizedTarget, budget: amount, notes, idempotencyKey, chargeAmount: config.growth.requireWallet ? amount : 0 });
  const providerResult = { accepted: false, provider: 'MANUAL_REVIEW', status: 'PENDING_REVIEW', message: 'Order disimpan. Persetujuan owner diperlukan sebelum antrean provider dijalankan.' };
  return { order, providerResult };
}

export async function listGrowthOrders() { return getOrders(); }
export async function listGrowthOrdersPage(options) { return getOrdersPage(options); }
export async function findGrowthOrder(id) { return getOrder(id); }
export async function setGrowthOrderStatus(id, status, note, progress) { return updateOrderStatus(id, status, note, progress); }
