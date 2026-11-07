# Upgrade WHISKAY v0.10.0 → v0.10.1

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


1. Stop WHISKAY with `Ctrl+C` and ensure the worker/runtime has exited.
2. Keep the release ZIP outside the active project and extract it to a temporary directory.
3. Run the upgrade script from the extracted release directory:

   ```bash
   bash scripts/upgrade-v0.10.1.sh /root/wbself
   ```

4. The script creates a full backup beside the active project, patches only the listed source/docs/test files, and runs `npm run check`, `npm test`, and `npm run validate`.
5. If QA fails, the script restores every patched file from backup. It does not overwrite `.env`, `config/app.json`, `session/`, `auth_ig/`, `data/`, `node_modules`, or the Instagram virtual environment.
6. After a successful patch, run `npm run doctor`, then `npm start`.
7. Test `.igpanel` and `.igservices` from the owner account. Native Flow rendering is client/version dependent; plain-text command fallback remains available.

The upgrade script requires the target `package.json` version to be exactly `0.10.0` and Node 22.x. It does not run Instagram login, read the Instagram password, or issue Instagram requests.
