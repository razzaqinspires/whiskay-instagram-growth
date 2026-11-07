#!/usr/bin/env python3
"""WHISKAY Instagram adapter.

Uses instagrapi only for explicit first login and read-only profile retrieval.
No automatic password login, challenge bypass, proxy rotation, or mass actions.
"""
from __future__ import annotations

import json
import os
import platform
import sys
import uuid
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


def emit(ok: bool, data=None, error: str | None = None, code: int = 0) -> None:
    payload = {"ok": ok}
    if data is not None:
        payload["data"] = data
    if error:
        payload["error"] = error
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    raise SystemExit(code)


def safe_error(exc: Exception) -> str:
    message = str(exc).splitlines()[0][:450]
    sensitive = ("password", "cookie", "sessionid", "authorization", "token", "csrf")
    if any(word in message.lower() for word in sensitive):
        return f"{type(exc).__name__}: detail disembunyikan demi keamanan."
    return f"{type(exc).__name__}: {message}"


def read_settings_path() -> Path:
    return Path(os.environ.get("IG_SESSION_FILE", "./auth_ig/instagrapi-session.json")).expanduser()


def setup():
    try:
        from instagrapi import Client
    except Exception as exc:
        emit(False, error=f"instagrapi belum tersedia di Python aktif: {safe_error(exc)}. Jalankan bash scripts/install-instagram-python.sh.", code=2)

    username = os.environ.get("IG_USERNAME", "").strip()
    if not username:
        emit(False, error="instagram.username belum diisi di config/app.json.", code=2)
    session_file = read_settings_path()
    session_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(session_file.parent, 0o700)
    except OSError:
        pass
    return Client, username, session_file


def profile_data(client):
    user_id = getattr(client, "user_id", None)
    if not user_id:
        raise RuntimeError("Session tidak memuat user_id Instagram.")
    # user_info() returns the User model which contains count fields.
    user = client.user_info(user_id)
    return {
        "userId": str(user.pk),
        "username": str(user.username or ""),
        "fullName": user.full_name or "",
        "followers": int(user.follower_count or 0),
        "following": int(user.following_count or 0),
        "posts": int(user.media_count or 0),
    }


def save_settings_atomic(client, session_file: Path) -> None:
    """Persist settings through a private temp file and atomic replace."""
    temporary = session_file.with_name(f".{session_file.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        client.dump_settings(str(temporary))
        os.chmod(temporary, 0o600)
        # Avoid replacing a symlinked destination. The application treats it as unsafe.
        if session_file.is_symlink():
            raise RuntimeError("Path session adalah symbolic link; penulisan ditolak.")
        os.replace(temporary, session_file)
        os.chmod(session_file, 0o600)
        try:
            directory_fd = os.open(str(session_file.parent), os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def doctor():
    try:
        package_version = version("instagrapi")
    except PackageNotFoundError:
        package_version = None
    session_file = read_settings_path()
    try:
        session_info = session_file.lstat()
        session_exists = session_file.is_file() and session_info.st_size > 0 and not session_file.is_symlink()
    except OSError:
        session_exists = False
    emit(True, {
        "python": platform.python_version(),
        "instagrapi": package_version,
        "usernameConfigured": bool(os.environ.get("IG_USERNAME", "").strip()),
        "sessionExists": session_exists,
        "sessionPath": str(session_file),
    })


def login():
    Client, username, session_file = setup()
    if session_file.exists() or session_file.is_symlink():
        emit(False, error="Session/path Instagram sudah tersedia. Login ulang ditolak; gunakan .igprofile. Jangan hapus session untuk memaksa login.", code=3)

    password = os.environ.get("IG_PASSWORD", "")
    if not password:
        emit(False, error="IG_PASSWORD tidak tersedia di .env. Jangan kirim password melalui chat.", code=2)

    try:
        client = Client()
        client.login(username, password)
        data = profile_data(client)
        if data["username"].lower() != username.lower():
            raise RuntimeError("Username pada hasil login tidak cocok dengan konfigurasi.")
        # Do not leave a partially valid session if profile validation fails.
        save_settings_atomic(client, session_file)
        emit(True, data | {"sessionSaved": True, "sessionPath": str(session_file)})
    except SystemExit:
        raise
    except Exception as exc:
        emit(False, error=f"Login Instagram gagal: {safe_error(exc)}. Jika muncul checkpoint/challenge atau pembatasan, hentikan percobaan dan selesaikan verifikasi melalui aplikasi resmi.", code=1)


def profile():
    Client, username, session_file = setup()
    try:
        info = session_file.lstat()
        if session_file.is_symlink() or not session_file.is_file() or info.st_size <= 0:
            emit(False, error=f"Session belum ditemukan atau bukan file reguler: {session_file}. Jika belum pernah login, gunakan .iglogin satu kali setelah pemeriksaan keamanan.", code=1)
    except FileNotFoundError:
        emit(False, error=f"Session belum ditemukan: {session_file}. Jika belum pernah login, gunakan .iglogin satu kali setelah pemeriksaan keamanan.", code=1)
    except OSError as exc:
        emit(False, error=f"Tidak dapat memeriksa file session: {safe_error(exc)}", code=1)

    try:
        client = Client()
        client.load_settings(str(session_file))
        data = profile_data(client)
        if data["username"].lower() != username.lower():
            emit(False, error="Username pada session tidak cocok dengan konfigurasi. Operasi dihentikan.", code=4)
        save_settings_atomic(client, session_file)
        emit(True, data)
    except SystemExit:
        raise
    except Exception as exc:
        emit(False, error=f"Session Instagram tidak dapat digunakan: {safe_error(exc)}. Tidak ada login ulang otomatis.", code=1)


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action == "doctor":
        doctor()
    elif action == "login":
        login()
    elif action == "profile":
        profile()
    else:
        emit(False, error="Aksi tidak dikenal. Gunakan doctor, login, atau profile.", code=2)


if __name__ == "__main__":
    main()
