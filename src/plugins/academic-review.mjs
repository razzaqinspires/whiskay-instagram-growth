import {
  apiKeyFromEnv, countWords, deleteCheck, downloadReport, formatCheck,
  getCheck, listChecks, productsForMode, submitCheck, MAX_FILE_BYTES
} from '../academic/client.mjs';
import { config } from '../config.mjs';
import { sanitizeError } from '../security/redact.mjs';

const HELP = [
  '╭━━ ACADEMI.CX DOCUMENT REVIEW ━━╮',
  '.acad ai CONFIRM <teks|nama_file> — Pemeriksaan indikator AI-writing',
  '.acad similarity CONFIRM <teks|nama_file> — Pemeriksaan similarity',
  '.acad full CONFIRM <teks|nama_file> — Pemeriksaan AI + similarity',
  '.acad CONFIRM <teks|nama_file> — Alias mode full',
  '.acad status <check_id> — Status dan ringkasan hasil',
  '.acad report <check_id> [similarity|pdf|original] — Kirim report ke chat',
  '.acad list [1–100] [starting_after_id] — Riwayat pemeriksaan API',
  '.acad delete <check_id> CONFIRM — Hapus check dan file provider permanen',
  '.acad info — Status integrasi, batas dokumen, dan privasi',
  '.acad help — Tampilkan bantuan',
  '',
  'File: letakkan PDF/DOC/DOCX/TXT di data/academic-inputs/ lalu berikan nama filenya.',
  'Ukuran file maksimal 50 MB; file di atas 4 MB memakai signed-upload flow.',
  'Teks: 125–50.000 kata. Teks langsung dibatasi config.academix.maxTextChars; gunakan file untuk naskah panjang.',
  'Pemeriksaan berpotensi menimbulkan biaya pada akun API eksternal Academi.cx. Perintah submit wajib memuat kata CONFIRM.',
  'WHISKAY tidak memiliki balance, wallet, payment, billing, atau usage-ledger command.',
  'Gunakan hanya dokumen yang kamu miliki atau berwenang periksa. Skor AI bukan bukti pasti kepengarangan.'
].join('\n');

function unquote(value) {
  const text = String(value || '').trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function errorText(error) {
  return sanitizeError(error).message.slice(0, 300);
}

function formatList(result) {
  const rows = Array.isArray(result?.data) ? result.data : [];
  if (!rows.length) return 'Belum ada pemeriksaan API pada akun Academi.cx ini.';
  return [
    `━━ ACADEMI.CX CHECK HISTORY (${rows.length}) ━━`,
    ...rows.map((item, index) => `${index + 1}. ${item.id || '-'} | ${item.name || 'Dokumen'} | ${item.status || '-'} | AI ${item.ai?.score ?? '-'}% | Similarity ${item.similarity?.score ?? '-'}%`),
    result.has_more ? 'Masih ada halaman berikutnya. Gunakan .acad list <limit> <last_check_id>.' : 'Akhir daftar.'
  ].join('\n').slice(0, 3700);
}

export default {
  name: 'academic-review',
  commands: [{
    name: 'acad', aliases: ['acx', 'academix'], category: 'Academi.cx Document Review',
    usage: '[ai|similarity|full] CONFIRM <teks|file> | status|report|list|delete|info|help',
    description: 'Pemeriksaan AI-writing dan similarity dokumen melalui API Academi.cx',
    async execute({ rawArgs = '', args = [], reply, sock, key, msg }) {
      const raw = String(rawArgs || '').trim();
      const lower = raw.toLowerCase();
      if (!raw || ['help', '-h', '--help'].includes(lower)) return reply(HELP);
      if (!config.academix.enabled) return reply('Integrasi Academi.cx dinonaktifkan pada config/app.json.');
      const first = String(args[0] || '').toLowerCase();

      if (first === 'info') {
        return reply([
          '━━ ACADEMI.CX INTEGRATION ━━',
          'API: https://academi.cx/api/v1',
          `API key: ${apiKeyFromEnv() ? 'configured' : 'missing'}`,
          `Timeout: ${config.academix.timeoutMs} ms`,
          `Maksimal file: ${(Math.min(config.academix.maxFileBytes, MAX_FILE_BYTES) / 1024 / 1024).toFixed(0)} MB`,
          `Input folder: ${config.academix.inboxDir}`,
          'AI: indikator AI-writing Academi.cx. Similarity: laporan Turnitin melalui provider.',
          'Dokumen dan teks akan dikirim ke layanan eksternal. Pastikan kamu berwenang mengirimnya.',
          'Biaya/pemakaian berada di akun API Academi.cx. WHISKAY tidak mengelola saldo atau pembayaran.'
        ].join('\n'));
      }

      if (first === 'status') {
        if (args.length !== 2) return reply('Format: .acad status <check_id>');
        try { return reply(formatCheck(await getCheck(args[1]))); }
        catch (error) { return reply(`Academic review gagal: ${errorText(error)}`); }
      }

      if (first === 'report') {
        if (args.length < 2 || args.length > 3) return reply('Format: .acad report <check_id> [similarity|pdf|original]');
        const kind = String(args[2] || 'similarity').toLowerCase();
        try {
          const report = await downloadReport(args[1], kind);
          if (typeof sock?.sendMessage !== 'function' || !key?.remoteJid) {
            return reply(`Report siap: ${report.filename}\nUkuran: ${report.bytes} byte. Kirim command dari chat WhatsApp untuk mengirim dokumen.`);
          }
          await sock.sendMessage(key.remoteJid, {
            document: report.buffer,
            mimetype: report.contentType,
            fileName: report.filename,
            caption: `Academi.cx report · ${args[1]} · ${kind}`
          }, { quoted: msg });
          return true;
        } catch (error) { return reply(`Unduhan report gagal: ${errorText(error)}`); }
      }

      if (first === 'list') {
        const limit = args[1] === undefined ? 10 : Number(args[1]);
        if (args.length > 3 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
          return reply('Format: .acad list [1–100] [starting_after_id]');
        }
        try { return reply(formatList(await listChecks(limit, { startingAfter: args[2] }))); }
        catch (error) { return reply(`Daftar pemeriksaan gagal: ${errorText(error)}`); }
      }

      if (first === 'delete') {
        if (args.length !== 3 || args[2] !== 'CONFIRM') {
          return reply('Format: .acad delete <check_id> CONFIRM\nPERINGATAN: dokumen dan report provider akan dihapus permanen. Tindakan tidak dapat dibatalkan.');
        }
        try {
          const result = await deleteCheck(args[1]);
          return reply(result.deleted === true
            ? `Check ${args[1]} dan dokumen terkait berhasil dihapus permanen dari Academi.cx.`
            : 'Provider tidak mengonfirmasi penghapusan.');
        } catch (error) { return reply(`Penghapusan gagal: ${errorText(error)}`); }
      }

      const submitMatch = raw.match(/^(?:(ai|similarity|full)\s+)?CONFIRM(?:\s+|$)([\s\S]*)$/i);
      if (!submitMatch) {
        return reply('Pemeriksaan dapat menimbulkan biaya pada akun API eksternal. Untuk mengirim, gunakan `.acad ai CONFIRM <teks|file>`, `.acad similarity CONFIRM <teks|file>`, atau `.acad full CONFIRM <teks|file>`. Ketik `.acad help` untuk bantuan.');
      }
      const mode = String(submitMatch[1] || 'full').toLowerCase();
      const input = unquote(submitMatch[2]);
      if (!input) return reply(HELP);
      if (!apiKeyFromEnv()) return reply('API key belum diatur. Tambahkan ACADEMICX_KEY=... pada .env, lalu restart WHISKAY. Jangan kirim API key melalui chat.');

      try {
        const products = productsForMode(mode);
        const submitted = await submitCheck(input, products);
        const submittedWords = submitted.submittedWords ?? (typeof submitted.words === 'number' ? submitted.words : countWords(input));
        return reply([
          'Pemeriksaan berhasil dikirim ke Academi.cx.',
          `Mode: ${mode.toUpperCase()}`,
          `Check ID: ${submitted?.id || '(ID tidak dikembalikan)'}`,
          `Jumlah kata: ${submittedWords || '-'}`,
          `Status awal: ${submitted?.status || 'processing'}`,
          '',
          `Periksa hasil: .acad status ${submitted?.id || '<check_id>'}`,
          `Unduh report: .acad report ${submitted?.id || '<check_id>'} similarity`,
          'WHISKAY mengirim dokumen apa adanya dan tidak mengubah isi atau hasil deteksi.'
        ].join('\n'));
      } catch (error) {
        return reply(`Academic review gagal: ${errorText(error)}\nKetik .acad help untuk panduan.`);
      }
    }
  }]
};
