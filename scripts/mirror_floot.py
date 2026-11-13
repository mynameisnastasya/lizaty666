#!/usr/bin/env python3
"""Mirror the PUBLIC anonymous production frontend of LIZ_TY666 Academy.

Only known publicly accessible HTML pages and fingerprinted static assets are fetched.
No cookies, credentials, authenticated APIs, user data, or database records are copied.
This is a frozen frontend build, NOT a port of Floot server-side APIs.
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import sys
import time
from collections import deque
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

SOURCE = "https://liz-ty666-academy.floot.app"
OUT = Path("academy_snapshot")
PAGES = [
    "/", "/app", "/daily-forecast", "/daily", "/delivery",
    "/ezhednevka", "/ezhednevka-consent", "/ezhednevka-cookies",
    "/ezhednevka-delivery", "/ezhednevka-marketing-consent",
    "/ezhednevka-mini", "/ezhednevka-offer", "/ezhednevka-oplata",
    "/ezhednevka-payments", "/ezhednevka-privacy", "/ezhednevka-refunds",
    "/ezhednevka-requisites", "/ezhednevka-terms",
    "/fortune", "/login", "/offer", "/order-consent",
    "/orders-admin", "/payment", "/payment-return", "/privacy",
    "/refunds", "/requisites",
]
EXT = (".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp",
       ".gif", ".avif", ".woff", ".woff2", ".ttf", ".ico", ".json")
RAW_RE = re.compile(
    r"""(?:(?:/|\\/)_(?:assets|cdn)/(?:static/)?[A-Za-z0-9._/~%+-]+|"""
    r"""(?:\\?./)[A-Za-z0-9._~%+/-]+\\.(?:js|css|png|jpe?g|svg|webp|avif|woff2?|ttf))"""
)
MAX_FILE = 9 * 1024 * 1024
MAX_TOTAL = 80 * 1024 * 1024
MAX_ASSETS = 450
USER_AGENT = "LIZ_TY666-Railway-Frontend-Migration/1.0 (public anonymous resources only)"

def fetch(path: str) -> bytes:
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("invalid path")
    url = SOURCE + path
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urlopen(req, timeout=25) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"unexpected HTTP {resp.status}: {path}")
                data = resp.read(MAX_FILE + 1)
                if len(data) > MAX_FILE:
                    raise RuntimeError(f"file too large: {path}")
                return data
        except (HTTPError, URLError, TimeoutError) as exc:
            if attempt == 2:
                raise RuntimeError(f"failed downloading {path}: {exc}") from exc
            time.sleep(1 + attempt)
    raise AssertionError("unreachable")

def references(text: str, relative_to: str = "/") -> set[str]:
    refs: set[str] = set()
    for match in RAW_RE.finditer(text):
        raw = match.group(0).replace("\\/", "/")
        if raw.startswith("./"):
            path = urlsplit(urljoin(SOURCE + relative_to, raw)).path
        else:
            path = raw if raw.startswith("/") else "/" + raw
        if not (path.startswith("/_assets/") or path.startswith("/_cdn/static/")):
            continue
        if any(v in path for v in ("..", "//", "\\", "?", "#")):
            continue
        refs.add(path)
    # Catch static HTML img/srcset and JS string URLs that are inlined as raw paths.
    for path in re.findall(r"/(?:_assets|_cdn/static)/[A-Za-z0-9._%+/-]+", text):
        if ".." not in path:
            refs.add(path)
    return refs

def store(path: Path, data: bytes, manifest: dict, key: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    manifest[key] = {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }

def main():
    manifest: dict = {"source": SOURCE, "pages": {}, "assets": {}}
    todo: deque[str] = deque()
    seen: set[str] = set()
    total = 0
    for page in PAGES:
        try:
            data = fetch(page)
        except Exception as exc:
            raise RuntimeError(f"cannot mirror required page {page}: {exc}") from exc
        page_name = "index" if page == "/" else page.lstrip("/")
        path = OUT / "pages" / (page_name + ".html")
        store(path, data, manifest["pages"], page)
        total += len(data)
        todo.extend(sorted(references(data.decode("utf-8", "replace"), page)))
        print(f"PAGE {page} {len(data)} bytes", flush=True)

    while todo:
        asset = todo.popleft()
        if asset in seen:
            continue
        seen.add(asset)
        if len(seen) > MAX_ASSETS:
            raise RuntimeError(f"asset count exceeds {MAX_ASSETS}; review source")
        if not (asset.startswith("/_assets/") or asset.startswith("/_cdn/static/")):
            continue
        try:
            data = fetch(asset)
        except Exception as exc:
            # Some dynamically linked language/file variants do not exist on the
            # published bundle; record misses instead of publishing placeholders.
            print(f"MISSING {asset}: {exc}", flush=True)
            manifest.setdefault("unavailable", []).append(asset)
            continue
        total += len(data)
        if total > MAX_TOTAL:
            raise RuntimeError(f"snapshot exceeds {MAX_TOTAL} bytes")
        path = OUT / asset.lstrip("/")
        store(path, data, manifest["assets"], asset)
        if asset.endswith((".js", ".css", ".svg")):
            todo.extend(sorted(references(data.decode("utf-8", "replace"), asset)))
        print(f"ASSET {asset} {len(data)} bytes", flush=True)

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"CAPTURED pages={len(manifest['pages'])} assets={len(manifest['assets'])} "
          f"bytes={total} unavailable={len(manifest.get('unavailable', []))}", flush=True)
    if len(manifest["assets"]) < 10:
        raise RuntimeError("too few assets captured; snapshot is incomplete")
    if any(x in manifest.get("unavailable", []) for x in (
        "/_assets/index-CL6k-n2Q.js", "/_assets/vendor-Bi_sAcyh.js"
    )):
        raise RuntimeError("critical application assets missing")

if __name__ == "__main__":
    main()
