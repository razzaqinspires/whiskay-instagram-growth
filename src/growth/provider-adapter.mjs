import { config } from '../config.mjs';
import { sanitizeError } from '../security/redact.mjs';

const ALLOWED_CAMPAIGN_SERVICES = new Set(['creator-collab', 'audience-promotion']);
const ACTIONS = new Set(['services', 'add', 'status', 'balance']);
const PROHIBITED_SERVICE_TEXT = /\b(followers?|likes?|views?|comments?|subscribers?|members?|engagement|impressions?|story[ -]?views?|auto[ -]?(follow|like|view)|bot traffic|guaranteed? followers?)\b/i;
const LEGITIMATE_SERVICE_TEXT = /\b(creator|influencer|advertis(?:e|ing|ement)|sponsor(?:ship)?|campaign|promotion|content|collab(?:oration)?|shoutout|placement|brand awareness|media buy)\b/i;

export function isAllowedProviderCampaignService(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const fields = ['name', 'description', 'category', 'type', 'title', 'details', 'package'];
  const values = fields.map(key => row[key]).filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean);
  if (!values.length) return false;
  const combined = values.join(' | ');
  if (PROHIBITED_SERVICE_TEXT.test(combined)) return false;
  return LEGITIMATE_SERVICE_TEXT.test(combined);
}

/**
 * SMM API v2-compatible transport for reviewed promotion providers.
 * Deliberately excludes follower/like/view/comment packages and any service
 * that fabricates engagement. Provider IDs are explicit local configuration.
 */
export class PromotionProviderAdapter {
  constructor({ settings = config.growth, fetchImpl = fetch } = {}) {
    this.settings = settings;
    this.fetchImpl = fetchImpl;
    this.provider = settings.provider || 'MANUAL_REVIEW';
  }

  enabled() { return Boolean(this.settings.providerEnabled); }

  async request(action, fields = {}) {
    if (!ACTIONS.has(action)) throw new TypeError('Provider action tidak diizinkan.');
    if (!this.enabled()) return { accepted: false, provider: this.provider, status: 'MANUAL_REVIEW', message: 'Provider belum diaktifkan.' };
    const body = new URLSearchParams({ key: this.settings.providerApiKey, action, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])) });
    let response;
    try {
      response = await this.fetchImpl(this.settings.providerApiUrl, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body, signal: AbortSignal.timeout(15000), redirect: 'error'
      });
    } catch (error) {
      const safeError = sanitizeError(error);
      throw new Error(`Provider transport gagal [${safeError.code}]: ${safeError.message}`);
    }
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}.`);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      const safeError = sanitizeError(error);
      throw new Error(`Respons provider bukan JSON valid [${safeError.code}]: ${safeError.message}`);
    }
    if (!data || typeof data !== 'object' || (Array.isArray(data) && action !== 'services')) throw new Error('Respons provider bukan format JSON yang diharapkan.');
    if (!Array.isArray(data) && data.error) {
      const safeProviderMessage = sanitizeError(new Error(String(data.error))).message;
      throw new Error(`Provider menolak permintaan: ${safeProviderMessage}`);
    }
    return data;
  }

  async listServices() { return this.request('services'); }
  async getBalance() { return this.request('balance'); }

  async submitPromotionOrder(order) {
    if (!order?.id || !order?.target || !order?.service) throw new TypeError('Order payload tidak lengkap.');
    if (!ALLOWED_CAMPAIGN_SERVICES.has(order.service)) {
      return { accepted: false, provider: this.provider, status: 'REJECTED_POLICY', message: 'Jenis layanan ini tidak boleh dikirim ke provider.' };
    }
    const service = this.settings.providerServiceMap?.[order.service];
    if (!service) return { accepted: false, provider: this.provider, status: 'MANUAL_REVIEW', message: `Mapping provider untuk ${order.service} belum diatur.` };
    const [catalog, balanceInfo] = await Promise.all([this.listServices(), this.getBalance()]);
    const rows = Array.isArray(catalog) ? catalog : (Array.isArray(catalog.services) ? catalog.services : []);
    const selected = rows.find(row => String(row.service ?? row.id) === String(service));
    if (!selected) throw new Error('Service ID tidak ditemukan pada katalog provider aktif.');
    if (!isAllowedProviderCampaignService(selected)) {
      throw new Error('Metadata layanan provider tidak lolos filter promosi autentik; nama, kategori, dan deskripsi harus konsisten serta bebas dari artificial engagement.');
    }
    const min = Number(selected.min ?? 1); const max = Number(selected.max ?? 1);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > 1 || max < 1) throw new Error('Provider tidak menerima quantity campaign satu unit.');
    const availableBalance = Number(balanceInfo.balance);
    if (!Number.isFinite(availableBalance) || availableBalance <= 0) throw new Error('Saldo provider tidak valid atau tidak mencukupi untuk memulai order.');
    const data = await this.request('add', { service, link: order.target, quantity: 1 });
    const providerOrderId = data.order ?? data.order_id;
    if (providerOrderId === undefined || providerOrderId === null || String(providerOrderId).length > 100) throw new Error('Provider tidak mengembalikan order ID yang valid.');
    return { accepted: true, provider: this.provider, providerOrderId: String(providerOrderId), providerServiceName: String(selected.name ?? selected.title ?? 'Approved campaign service').slice(0, 100), providerBalance: availableBalance, status: 'SUBMITTED', message: 'Order promosi diterima provider; status akhir tetap menunggu sinkronisasi.' };
  }

  async getOrderStatus(providerOrderId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(providerOrderId))) throw new TypeError('Provider order ID tidak valid.');
    return this.request('status', { order: providerOrderId });
  }
}
