# Referral Module — Active Implementation

Dokumen ini menjelaskan implementasi referral yang aktif pada v0.10.6. Dokumen ini menggantikan panduan worker referral generasi lama. Folder lama `referral-module/` dan endpoint `/v1/referrals/attribute` sudah dihapus dari source aktif. Kontrak saat ini berada di `src/referral/` dan menggunakan `/v1/referrals/claims`.

## File dan tanggung jawab

| Lokasi | Tanggung jawab |
|---|---|
| `src/referral/trigger.mjs` | Memverifikasi HMAC, timestamp, event type, event ID, dan claim token dari webhook backend |
| `src/referral/webhook-server.mjs` | Listener HTTP webhook yang di-bind ke loopback secara default dan mempertahankan raw body untuk validasi signature |
| `src/referral/queue-processor.mjs` | Durable queue, deduplication, batas pemrosesan, status dan penyimpanan privat |
| `src/referral/referral-conversion-batch.mjs` | Mengirim satu-time claim ke route `/v1/referrals/claims` pada HTTPS host allowlist |
| `src/referral/bot.mjs` | Definisi command `.referralstatus` dan `.referralprocess` |
| `src/plugins/referral.mjs` | Registrasi command ke plugin loader |
| `test/referral-integration.test.mjs` | Test HMAC webhook, replay prevention, queue, route pinning, listener dan plugin trigger |
| `test/referral-conversion-batch.test.mjs` | Test batch, retry, cancellation, dan redaksi token |

Alur komunikasi lengkap dan format webhook ada pada [Referral Integration](../REFERRAL-INTEGRATION.md).

## Alur aman

1. Aplikasi/backend menyelesaikan signup normal dan verifikasi identitas.
2. Backend menerbitkan `claimToken` opaque, singkat masa berlakunya, dan hanya dapat digunakan sekali.
3. Backend mengirim `referral.signup.verified` dengan HMAC-SHA256 ke listener WHISKAY.
4. `trigger.mjs` memvalidasi timestamp, signature, event type, serta bentuk data sebelum event masuk ke queue.
5. `queue-processor.mjs` menyimpan event secara privat dan menolak event ID duplikat.
6. Processor memanggil `submitReferralConversionBatch()` untuk mengirim payload minimal `{ claimToken }` ke `/v1/referrals/claims`.
7. Backend tujuan wajib memverifikasi token, expiry, signup status, referral ownership, eligibility, dan idempotency sebelum memberikan attribution/reward.

WHISKAY tidak membuat akun, tidak memproses daftar password, tidak mengakses cookie akun, dan tidak mengirim data pendaftaran mentah.

## Kontrak batch

`submitReferralConversionBatch(claims, options)` menerima array item:

```js
[
  { eventId: 'signup_evt_00000001', claimToken: 'opaque-one-time-token' }
]
```

Opsi utama:

| Opsi | Default | Aturan |
|---|---:|---|
| `endpoint` | `REFERRAL_CLAIM_ENDPOINT` | HTTPS, path tetap `/v1/referrals/claims`, host allowlist |
| `allowedHosts` | `REFERRAL_CLAIM_ALLOWED_HOSTS` | Hostname harus cocok persis |
| `serviceToken` | `REFERRAL_SERVICE_TOKEN` | Secret minimal dan hanya dikirim ke endpoint tervalidasi |
| `delayMs` | 1000 ms | Minimum 1000 ms |
| `timeoutMs` | 15000 ms | Minimum 1000 ms |
| `maxAttempts` | 3 | Rentang 1–5 |
| `fetchImpl` | `globalThis.fetch` | Injection untuk test |
| `sleepImpl` | timer bawaan | Injection untuk test deterministik; runtime tetap memakai sleep default |
| `signal` | — | Pembatalan batch menggunakan `AbortSignal` |
| `onProgress` | no-op | Callback progress; exception callback tidak menggagalkan queue |

Seluruh batch divalidasi sebelum request pertama dikirim. Event ID harus unik. Response `409 ALREADY_CLAIMED` diperlakukan sebagai hasil idempotent, bukan kegagalan. Status `429` dan `5xx` dapat dicoba ulang dengan delay bounded dan `Retry-After`.

## Bentuk hasil dan perlindungan secret

Hasil hanya memuat event ID, status, HTTP status (bila ada), attempt count, dan kode error generik. Raw response body backend tidak diteruskan kepada pemanggil. Error jaringan tidak mengembalikan `error.message`, dan pesan rejection backend tidak diteruskan karena backend yang tidak dipercaya dapat memantulkan token atau nilai sensitif di dalamnya.

Kode hasil yang dapat muncul:

- `network_error`
- `request_timeout`
- `referral_claim_rejected`
- `claim_processing_failed`

Claim token memang harus dikirim ke backend tujuan, tetapi tidak disimpan dalam hasil command, progress callback, atau log diagnostik.

## Hal yang tidak didukung

- Endpoint registrasi akun atau `/v1/referrals/attribute`.
- Host arbitrary, URL dengan credential/query/hash, atau redirect ke host lain.
- Signup yang belum diverifikasi atau token yang dibuat oleh client.
- Penggunaan modul ini sebagai bulk account creation, follower delivery, atau engagement automation.

## QA

```bash
npm run test:adapter
node --test test/referral-conversion-batch.test.mjs test/referral-integration.test.mjs
```

Tes menggunakan mock `fetchImpl` dan `sleepImpl`; tidak menghubungi backend eksternal. Hasil QA rilis dicatat di [QA Report v0.10.6](../qa/QA-REPORT-v0.10.6.md).
