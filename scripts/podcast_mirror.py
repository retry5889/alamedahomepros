"""Mirror publicly staged podcast assets using the hosting repo's own token."""

import os
import re
import shutil
import subprocess
import tempfile
import time
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests
from defusedxml import ElementTree as ET

SOURCE_ROOT = "https://retry5889.github.io/cartesian-yacht/"
DEST_ROOT = "https://retry5889.github.io/alamedahomepros/a/"
ITUNES = "http://www.itunes.com/dtds/podcast-1.0.dtd"


def asset_manifest(data, token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise ValueError("Unsafe feed folder")
    root = ET.fromstring(data)
    base = DEST_ROOT + token + "/"
    if root.findtext("channel/link") != base:
        raise ValueError("Wrong canonical feed destination")
    image = root.find("channel/{" + ITUNES + "}image")
    cover_url = image.get("href", "") if image is not None else ""
    if not cover_url.startswith(base):
        raise ValueError("Cover outside feed folder")
    cover = cover_url.removeprefix(base)
    if not re.fullmatch(r"cover(?:-v[1-9][0-9]*)?\.(?:png|jpg)", cover):
        raise ValueError("Unsafe cover name")
    items = root.findall("channel/item")
    if not 1 <= len(items) <= 30:
        raise ValueError("Unexpected episode count")
    audio = []
    for item in items:
        enclosure = item.find("enclosure")
        if enclosure is None or not enclosure.get("url", "").startswith(
            base + "audio/"
        ):
            raise ValueError("Audio outside feed folder")
        name = enclosure.get("url").removeprefix(base + "audio/")
        if not re.fullmatch(r"[0-9a-f]{32}(?:-[0-9a-f]{12})?\.mp3", name):
            raise ValueError("Unsafe audio name")
        size = int(enclosure.get("length", "0"))
        if not 0 < size <= 95_000_000:
            raise ValueError("Audio exceeds Git-safe limit")
        audio.append((name, size))
    if sum(size for _, size in audio) > 650_000_000:
        raise ValueError("Site-size budget exceeded")
    return {
        "audio": audio,
        "cover": cover,
        "build_date": root.findtext("channel/lastBuildDate", ""),
    }


def download(url, path, limit, expected=None):
    with requests.get(url, stream=True, timeout=(15, 120)) as r:
        r.raise_for_status()
        total = 0
        with path.open("wb") as f:
            for chunk in r.iter_content(65536):
                total += len(chunk)
                if total > limit:
                    raise ValueError("Download exceeds size limit")
                f.write(chunk)
        if expected is not None and total != expected:
            raise ValueError("Downloaded audio length mismatch")


def git(*args, check=True):
    result = subprocess.run(["git", *args], capture_output=True, text=True, check=False)
    if check and result.returncode:
        raise RuntimeError("Public mirror git operation failed: " + args[0])
    return result


def main():
    if os.getenv("GITHUB_REPOSITORY") != "retry5889/alamedahomepros":
        raise ValueError("This copier runs only in the intended hosting repository")
    folders = [
        p
        for p in Path("a").iterdir()
        if p.is_dir()
        and re.fullmatch(r"[A-Za-z0-9_-]{43}", p.name)
        and (p / "feed.xml").exists()
    ]
    if len(folders) != 1:
        raise ValueError("Expected one existing opaque podcast folder")
    dest = folders[0]
    source = SOURCE_ROOT + dest.name + "/"
    response = requests.get(source + "feed.xml", timeout=(15, 30))
    if response.status_code == 404:
        print(
            "::notice::Staging Pages is not enabled or no staging output exists yet; nothing changed."
        )
        return
    response.raise_for_status()
    if len(response.content) > 2_000_000:
        raise ValueError("Unexpected RSS size")
    manifest = asset_manifest(response.content, dest.name)
    current = asset_manifest((dest / "feed.xml").read_bytes(), dest.name)
    # A subsequently activated direct publisher must not be rolled back.
    if (
        current["build_date"]
        and manifest["build_date"]
        and parsedate_to_datetime(current["build_date"])
        > parsedate_to_datetime(manifest["build_date"])
    ):
        print("Staging output is older than the live feed; skipped.")
        return
    old_version = (
        int(re.search(r"-v(\d+)", current["cover"]).group(1))
        if "-v" in current["cover"]
        else 0
    )
    new_version = (
        int(re.search(r"-v(\d+)", manifest["cover"]).group(1))
        if "-v" in manifest["cover"]
        else 0
    )
    if new_version < old_version:
        print("Staging artwork version is older than live artwork; skipped.")
        return
    with tempfile.TemporaryDirectory() as tmp:
        payload = Path(tmp) / "payload"
        (payload / "audio").mkdir(parents=True)
        (payload / "feed.xml").write_bytes(response.content)
        for name, size in manifest["audio"]:
            existing = dest / "audio" / name
            if existing.exists() and existing.stat().st_size == size:
                shutil.copy2(existing, payload / "audio" / name)
            else:
                download(
                    source + "audio/" + name, payload / "audio" / name, 95_000_000, size
                )
        download(source + manifest["cover"], payload / manifest["cover"], 5_000_000)
        header = (payload / manifest["cover"]).read_bytes()[:8]
        if not (header == b"\x89PNG\r\n\x1a\n" or header.startswith(b"\xff\xd8")):
            raise ValueError("Invalid staged artwork")
        (payload / "index.html").write_text(
            '<!doctype html><meta name="robots" content="noindex,nofollow"><title>Personal audio</title><p>Personal audio feed.</p>'
        )
        if dest.is_symlink():
            raise ValueError("Unsafe destination")
        shutil.rmtree(dest)
        shutil.copytree(payload, dest)
    git("add", "--", str(dest))
    changed = git("diff", "--cached", "--name-only").stdout.splitlines()
    if any(not name.startswith(str(dest) + "/") for name in changed):
        raise ValueError("Unexpected changes outside the podcast folder")
    if not changed:
        print("Public feed already matches staging; no commit needed.")
        return
    git("config", "user.name", "podcast-mirror[bot]")
    git("config", "user.email", "podcast-mirror@users.noreply.github.com")
    git("commit", "-m", "Mirror finished podcast assets from public staging")
    for attempt in range(3):
        if git("push", "origin", "HEAD:main", check=False).returncode == 0:
            break
        if attempt == 2:
            raise RuntimeError("Public mirror push failed")
        git("pull", "--rebase", "origin", "main")
        time.sleep(2)
    # Built-in token pushes do not themselves trigger a legacy Pages build.
    subprocess.run(
        [
            "gh",
            "api",
            "--method",
            "POST",
            "repos/retry5889/alamedahomepros/pages/builds",
        ],
        check=True,
        capture_output=True,
    )
    print("Mirrored finished RSS, image, and audio; requested Pages rebuild.")


if __name__ == "__main__":
    main()
