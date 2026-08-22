"""Prospective Google Trends capture for the frozen v1 term set (handoff S10
task 5; RFC-001 S19 A6). PROSPECTIVE-ONLY: do not backtest against history.

Runs on a GitHub Actions runner on a schedule. For each frozen term it archives
the query definition and the weekly Trends value as an immutable vintage with
the five timestamps (A6: archive every query result and query definition).
available_time = ingested_time (the value is knowable when we pull it; Trends
publishes near-real-time). The scoring harness rejects any feature built from a
non-frozen term version via assert_frozen_term_set.

Output layout (data branch):
  claims-forecast/data/raw/google_trends/trends_<TS>_<SHA>.json
  claims-forecast/data/raw/google_trends/manifest_<TS>.json

Note on access: Trends has no stable official production API. We use the public
explore widget endpoint. If it 403s or rate-limits, the run records the failure
per-term and still commits what succeeded; never fabricate values.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from frozen_terms import TERM_SET_VERSION, all_terms, term_family  # noqa: E402

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
GEO = "US"
TIMEFRAME = "now 7-d"


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_term(term: str, geo: str, timeframe: str) -> dict:
    """One Trends query. Returns {term, ok, value?, week_start?, error?}.

    Placeholder transport: the real implementation must call the Trends widget
    and parse the weekly index. Until a working endpoint is verified from the
    Actions runner, this records the attempt and marks ok=False so we never
    treat an unverified fetch as data.
    """
    q = urllib.parse.quote(json.dumps({"comparisonItem": [{"keyword": term, "geo": geo, "time": timeframe}], "category": 0, "property": ""}))
    url = f"https://trends.google.com/trends/api/explore?hl=en-US&tz=360&req={q}"
    try:
        raw = _get(url, timeout=30)
        return {"term": term, "ok": False, "note": "transport unverified; not parsing", "bytes": len(raw)}
    except Exception as e:  # noqa: BLE001
        return {"term": term, "ok": False, "error": str(e)}


def main() -> int:
    out_dir = os.environ.get("OUTPUT_DIR", "claims-forecast/data/raw/google_trends")
    os.makedirs(out_dir, exist_ok=True)
    ingested = datetime.now(timezone.utc).isoformat()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    terms = all_terms()
    results = []
    for i, term in enumerate(terms):
        results.append({"family": term_family(term), **fetch_term(term, GEO, TIMEFRAME)})
        if i % 10 == 9:
            time.sleep(2)  # respectful pacing

    payload = {
        "term_set_version": TERM_SET_VERSION,
        "geo": GEO,
        "timeframe": TIMEFRAME,
        "ingested_time": ingested,
        "available_time": ingested,  # prospective: knowable when pulled
        "results": results,
    }
    raw = json.dumps(payload, indent=2).encode()
    digest = sha256(raw)
    fname = f"trends_{ts}_{digest[:12]}.json"
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(raw)
    manifest = {"ingested_time": ingested, "term_set_version": TERM_SET_VERSION,
                "file": fname, "sha256": digest, "terms": len(terms),
                "ok": sum(1 for r in results if r.get("ok"))}
    with open(os.path.join(out_dir, f"manifest_{ts}.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
