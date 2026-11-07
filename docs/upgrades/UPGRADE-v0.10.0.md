# Upgrade WHISKAY v0.9.4 → v0.10.0

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


1. Extract the release ZIP outside `/root/wbself`.
2. Stop WHISKAY cleanly with `Ctrl+C`. Confirm no worker or bot process is still running.
3. From the extracted release folder, run:

   ```bash
   bash scripts/upgrade-v0.10.0.sh /root/wbself
   ```

4. The script creates a full backup beside the project and patches only the files listed in the script. It does not copy release placeholders over runtime state.
5. Review the QA output. If QA fails, the script restores each patched file from the backup.
6. Run `npm run doctor`, then `npm start`.
7. In WhatsApp owner chat, verify `.igstats`, `.iggrowth`, `.ighistory`, and `.igcampaign list`.

## Preserved runtime state

The upgrade does not overwrite `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, SQLite files, the Python virtual environment, or `node_modules`.

## Rollback

Stop the runtime and copy the patched files back from the exact backup directory printed by the upgrade script. The full backup remains available beside `/root/wbself`.
