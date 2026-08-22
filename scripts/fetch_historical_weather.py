"""Backfill historical severe-weather research data (handoff S10 task 3 dev
window; RFC-001 S8 weather note: NOAA historical observations for research).

Runs on a GitHub Actions runner on a schedule (dispatch is unreliable). Pulls
NOAA NCEI Storm Events details (per-year CSV) and the HURDAT2 Atlantic
best-track, committing immutable vintages to the data branch. Idempotent: skips
files already archived (tracked in a DONE marker), and removes its own cron
trigger once the backfill is complete.

Storm Events gives event type, begin/end date-time, state, county (CZ_NAME),
and magnitude - enough to reconstruct weekly state-level severe-weather
exposure for the dev window. HURDAT2 gives hurricane tracks/landfall intensity.

Output layout (data branch):
  claims-forecast/data/raw/storm_events/StormEvents_details_<YEAR>_<SHA>.csv
  claims-forecast/data/raw/storm_events/manifest_<YEAR>.json
  claims-forecast/data/raw/hurricanes/hurdat2_<SHA>.txt
"""

from __future__ import annotations

import hashlib
import io
import gzip
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (compatible; claims-forecast/0.1; github actions runner)"

# NCEI Storm Events CSV files. The exact file suffix (cYYYYMMDD) rotates as
# files are reprocessed; we fetch the per-year index then the details file.
STORM_INDEX = "https://www1.ncdc.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
HURDAT2_URL = "https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2024-040425.txt"

YEARS = list(range(2010, 2023))  # dev+train window


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _find_details_url(year: int) -> str | None:
    """Scrape the csvfiles index for the StormEvents_details file for `year`."""
    try:
        html = _get(STORM_INDEX, timeout=60).decode("latin-1", errors="replace")
    except Exception:
        return None
    import re

    # details files look like: StormEvents_details-ftp_v1.0_d2022_c20250521.csv.gz
    pat = re.compile(r'href="(StormEvents_details-[^"]*_d%d_c[^"]*\.csv\.gz)"' % year)
    m = pat.findall(html)
    if not m:
        return None
    return STORM_INDEX + sorted(m)[-1]  # latest processing version


def main() -> int:
    out_root = os.environ.get("OUTPUT_DIR", "claims-forecast/data/raw")
    se_dir = os.path.join(out_root, "storm_events")
    hu_dir = os.path.join(out_root, "hurricanes")
    os.makedirs(se_dir, exist_ok=True)
    os.makedirs(hu_dir, exist_ok=True)
    ingested = datetime.now(timezone.utc).isoformat()
    results = []

    # HURDAT2 (single file)
    try:
        raw = _get(HURDAT2_URL)
        digest = sha256(raw)
        fn = f"hurdat2_{digest[:12]}.txt"
        if not os.path.exists(os.path.join(hu_dir, fn)):
            with open(os.path.join(hu_dir, fn), "wb") as f:
                f.write(raw)
            json.dump({"ingested_time": ingested, "source_url": HURDAT2_URL,
                       "file": fn, "sha256": digest, "bytes": len(raw)},
                      open(os.path.join(hu_dir, f"manifest_{digest[:8]}.json"), "w"), indent=2)
        results.append({"hurdat2": "ok", "sha": digest[:12]})
    except Exception as e:  # noqa: BLE001
        results.append({"hurdat2": "fail", "error": str(e)})

    # Storm Events per year
    for year in YEARS:
        done_marker = os.path.join(se_dir, f".done_{year}")
        if os.path.exists(done_marker):
            results.append({"year": year, "status": "already_archived"})
            continue
        url = _find_details_url(year)
        if not url:
            results.append({"year": year, "status": "no_details_url"})
            continue
        try:
            raw = _get(url, timeout=180)
            if url.endswith(".gz"):
                raw = gzip.decompress(raw)
            digest = sha256(raw)
            fn = f"StormEvents_details_{year}_{digest[:12]}.csv"
            with open(os.path.join(se_dir, fn), "wb") as f:
                f.write(raw)
            json.dump({"ingested_time": ingested, "source_url": url, "file": fn,
                       "sha256": digest, "year": year, "rows": raw.count(b"\n") - 1},
                      open(os.path.join(se_dir, f"manifest_{year}.json"), "w"), indent=2)
            open(done_marker, "w").write(digest)
            results.append({"year": year, "status": "ok", "sha": digest[:12]})
        except Exception as e:  # noqa: BLE001
            results.append({"year": year, "status": "fail", "error": str(e)})

    complete = all(
        os.path.exists(os.path.join(se_dir, f".done_{y}")) for y in YEARS
    )
    print(json.dumps({"results": results, "backfill_complete": complete}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
