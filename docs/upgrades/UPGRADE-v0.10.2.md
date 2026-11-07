# Upgrade WHISKAY v0.10.1 → v0.10.2

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


1. Stop WHISKAY with `Ctrl+C` and verify the runtime lock is gone.
2. Extract this ZIP outside the active project directory.
3. Run `bash scripts/upgrade-v0.10.2.sh /root/wbself`.
4. The script backs up the installation, patches only the listed v0.10.2 files, and runs source checks, the test suite, and config validation. On failure it restores patched files.
5. Add the four referral environment values from `.env.example` only after the backend webhook and dedicated claim endpoint are implemented. Include only the exact staging/production API host in `REFERRAL_CLAIM_ALLOWED_HOSTS`.
6. Restart with `npm start`; check `.referralstatus` from the owner account.

The upgrade preserves `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, `node_modules`, and the Instagram virtual environment.
