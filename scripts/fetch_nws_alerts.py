"""Fetch NWS active alerts snapshot (handoff S10 task 2; RFC-001 S8).

Runs on a GitHub Actions runner. Archives the raw alerts payload as an
immutable vintage keyed by ingested_time + sha256, mirroring the ETA 539 and
FRED capture workflows. NWS active alerts are short-lived, so daily capture
builds the prospective archive; historical research uses NOAA sources per the
RFC weather note.

Output layout (data branch):
  claims-forecast/data/raw/nws_alerts/alerts_<TS>_<SHA>.json
  claims-forecast/data/raw/nws_alerts/manifest_<TS>.json
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

# NWS alerts API (GeoJSON/CAP). status=actual excludes tests; message_type
# filter keeps alerts+updates. We take the full active set per snapshot.
NWS_URL = "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update"
UA = "claims-forecast/0.1 (github actions runner; contact: repo issues)"


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/geo+json, application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main() -> int:
    out_dir = os.environ.get("OUTPUT_DIR", "claims-forecast/data/raw/nws_alerts")
    os.makedirs(out_dir, exist_ok=True)
    ingested = datetime.now(timezone.utc).isoformat()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    try:
        raw = _get(NWS_URL)
    except Exception as e:  # noqa: BLE001
        print(f"fetch failed {NWS_URL}: {e}", file=sys.stderr)
        return 2

    try:
        doc = json.loads(raw.decode("utf-8", errors="replace"))
        n_alerts = len(doc.get("features", []))
    except Exception:  # noqa: BLE001
        n_alerts = -1

    digest = sha256(raw)
    fname = f"alerts_{ts}_{digest[:12]}.json"
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(raw)

    manifest = {
        "ingested_time": ingested,
        "source_url": NWS_URL,
        "file": fname,
        "sha256": digest,
        "active_alerts": n_alerts,
    }
    with open(os.path.join(out_dir, f"manifest_{ts}.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
