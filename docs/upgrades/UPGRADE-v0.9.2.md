# Upgrade WHISKAY Instagram Growth to v0.9.2

> **Dokumen historis:** instruksi ini merekam prosedur untuk versi lama. Script updater yang disebutkan mungkin sudah dihapus dan tidak tersedia pada source v0.10.6. Jangan jalankan command lama dari dokumen ini pada instalasi sekarang. Untuk upgrade saat ini, gunakan [UPGRADE v0.10.6](UPGRADE-v0.10.6.md).


This release is a source update, not a replacement of your local runtime data.

## Preserve these existing paths
Do not overwrite or delete:
- `.env`
- `config/app.json`
- `auth_ig/` (especially `instagrapi-session.json`)
- `session/`
- `data/` and all SQLite/JSON databases
- `node_modules/` and `.venv-instagram/` unless a separate dependency update is explicitly required

## Apply safely
1. Stop WHISKAY.
2. Extract the release ZIP to a temporary directory.
3. Copy the updated source and documentation into the existing project, but do not replace the preserved paths above.
4. Ensure `python/instagram_bridge.py` and `src/instagram.mjs` are updated together.
5. Run `npm run check`, `npm test`, and `python3 -m py_compile python/instagram_bridge.py`.
6. Restart WHISKAY.
7. Test `.igcheck`, `.igprofile`, `.igstats`.
8. Test `.iglogin` only as a guard check: with the existing session present, it must refuse login and leave the session untouched.

## Expected behavior
- `.iglogin` is first-login-only and refuses if the session file already exists.
- `.igprofile` reads the existing session only.
- `.igsync` allows one remote snapshot per six hours.
- `.igstats` reads local data and does not contact Instagram.

Do not run `.iglogin` to test the guard if the session is absent. Do not remove a valid session to force a new login. If Instagram displays checkpoint/challenge/restriction, stop and complete any required review in the official Instagram app.
