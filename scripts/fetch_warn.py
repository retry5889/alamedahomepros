"""Fetch state WARN layoff-notice snapshots (handoff S10 task 4; RFC-001 S8).

Runs on a GitHub Actions runner (schedule or dispatch). WARN is decentralized:
each state labor agency publishes its own notices, formats vary, and effective
dates can precede public availability, so we archive each state's raw page/CSV
as an immutable vintage and stamp the publication/retrieval time (A6). The
parser maps heterogeneous columns to the common schema at parse time.

Output layout (data branch):
  claims-forecast/data/raw/warn/<STATE>/warn_<STATE>_<TS>_<SHA>.<ext>
  claims-forecast/data/raw/warn/<STATE>/manifest_<TS>.json

State source registry below is the starting set (machine-readable first). Add
states as their endpoints are verified reachable from Actions runners.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

UA = "claims-forecast/0.1 (github actions runner; contact: repo issues)"

# state -> (url, format, column_map or None). column_map keys: state, company,
# workers, effective, publication. None = use parser defaults.
STATE_SOURCES: dict[str, dict] = {
    # California EDD: publishes a current WARN report as XLSX plus yearly PDF
    # archives (Jul-Jun fiscal years). The current XLSX is the machine-readable
    # source; URL verified against edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/.
    "CA": {
        "url": "https://edd.ca.gov/siteassets/files/jobs_and_training/pub/warn.xlsx",
        "format": "xlsx",
        "column_map": None,
        "verified": False,  # endpoint path inferred; confirm 200 + schema on first run
        "note": "Current-year XLSX; historical backfill needs the per-year PDFs",
    },
    # Texas TWC: WARN provided as Excel but the download URL is not stable and
    # older notices require an email request (warn.list@twc.texas.gov). No clean
    # anonymous bulk CSV. Marked unverified pending a stable endpoint.
    "TX": {
        "url": "",
        "format": "xlsx",
        "column_map": None,
        "verified": False,
        "note": "TWC distributes via data-reports/warn-notice page; bulk by request",
    },
    # New York DOL: WARN is a Tableau dashboard (dol.ny.gov/warn-dashboard);
    # no stable anonymous CSV. Marked unverified pending the retired-database
    # CSV or a Tableau data extract.
    "NY": {
        "url": "",
        "format": "csv",
        "column_map": None,
        "verified": False,
        "note": "Tableau dashboard; historical CSV via retired database TBD",
    },
}

# Honest status: WARN has NO free centralized federal bulk file. Reliable
# historical WARN for the dev window requires either (a) per-state verified
# endpoints added here after a reachability probe, or (b) a licensed aggregator
# (e.g. layoffdata.com) which needs a paid API key. Do NOT run the dev-window
# WARN evaluation until at least the top-5 claimant states are verified.
def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_state(state: str, spec: dict, out_root: str, ts: str, ingested: str) -> dict:
    out_dir = os.path.join(out_root, state)
    os.makedirs(out_dir, exist_ok=True)
    if not spec.get("url") or not spec.get("verified"):
        return {"state": state, "ok": False, "skipped": True,
                "reason": spec.get("note", "unverified endpoint"), "url": spec.get("url", "")}
    try:
        raw = _get(spec["url"])
    except Exception as e:  # noqa: BLE001
        return {"state": state, "ok": False, "error": str(e), "url": spec["url"]}
    digest = sha256(raw)
    ext = "xlsx" if spec["format"] == "xlsx" else "csv"
    fname = f"warn_{state}_{ts}_{digest[:12]}.{ext}"
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(raw)
    manifest = {
        "state": state,
        "ok": True,
        "ingested_time": ingested,
        "retrieval_time": ingested,  # publication proxy: when we pulled it (A6)
        "source_url": spec["url"],
        "file": fname,
        "sha256": digest,
        "bytes": len(raw),
    }
    with open(os.path.join(out_dir, f"manifest_{ts}.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    return manifest


def main() -> int:
    out_root = os.environ.get("OUTPUT_DIR", "claims-forecast/data/raw/warn")
    only = os.environ.get("STATES", "").strip()
    states = [s for s in only.split(",") if s] if only else list(STATE_SOURCES)
    ingested = datetime.now(timezone.utc).isoformat()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    results = [fetch_state(s, STATE_SOURCES[s], out_root, ts, ingested) for s in states if s in STATE_SOURCES]
    ok = sum(1 for r in results if r.get("ok"))
    print(json.dumps({"fetched": ok, "attempted": len(results), "states": results}, indent=2))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
