"""Weekly prefill builder for the Claims Card.

Reads the freshest claims data available to the public runner:
1. FRED ALFRED ICSA latest vintage (anchor = latest advance print)
2. The most recent TE Wayback snapshot parsed for consensus/forecast
   (pulled from the fetched-data branch of this same repo, which the
   signals-v2 capture commits to every Wednesday).
Writes docs/data.json + data.json with {anchor, consensus, forecast,
threshold (anchor - 11), fetched_at}. Threshold default = anchor - 11K
(the ~80 cent strike). Runs after the Wednesday capture.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "claims-card-builder/1.0"}


def latest_icsa() -> int | None:
    """Anchor: latest ICSA print via the no-key fredgraph CSV endpoint."""
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=ICSA"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = r.read().decode().strip().splitlines()
        # rows: DATE,VALUE ... last row = newest
        last = rows[-1].split(",")
        return int(float(last[1]))
    except Exception as e:
        print("icsa fetch failed:", e)
        return None


def latest_te() -> tuple[float | None, float | None]:
    """Consensus + forecast from the newest TE snapshot in fetched-data."""
    try:
        out = subprocess.run(
            ["git", "ls-remote", "origin", "refs/heads/fetched-data"],
            capture_output=True, text=True, timeout=60).stdout.strip()
        if not out:
            return None, None
        # shallow-fetch just the branch tip's tree listing is heavy; instead
        # clone-free: fetch the branch and read files via git archive is not
        # available on remote. Simplest: this script runs in a checkout of
        # this repo; fetch the branch and git show.
        subprocess.run(["git", "fetch", "-q", "origin", "fetched-data"],
                       capture_output=True, timeout=120)
        listing = subprocess.run(
            ["git", "ls-tree", "-r", "origin/fetched-data", "--name-only"],
            capture_output=True, text=True, timeout=60).stdout
        pages = sorted(p for p in listing.split()
                       if p.startswith("raw/te_wayback/te_wayback_2"))
        if not pages:
            return None, None
        # newest page
        newest = pages[-1]
        html = subprocess.run(["git", "show", f"origin/fetched-data:{newest}"],
                              capture_output=True, timeout=60).stdout.decode("utf-8", "ignore")
        txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "~", html))
        flat = re.sub(r"[~\s]+", "~", txt)
        pat = re.compile(r"(\d{4}-\d{2}-\d{2})~\d{2}:\d{2}~PM~Initial~Jobless~Claims~"
                         r"([A-Z][a-z]{2}/\d{2})~([\d,\.]+)K~([\d,\.]+)K~([\d,\.]+)K~")
        rows = pat.findall(flat)
        # rows: (release, refweek, actual, forecast, consensus); the FUTURE row
        # (release in the future) is the pending week -> its forecast+consensus
        today = datetime.now(timezone.utc).date().isoformat()
        for rel, rw, actual, fc, cons in rows:
            if rel > today:
                return float(cons), float(fc)
        # fallback: last row's numbers
        if rows:
            rel, rw, actual, fc, cons = rows[-1]
            return float(cons), float(fc)
    except Exception as e:
        print("te parse failed:", e)
    return None, None


def main() -> int:
    anchor = latest_icsa()
    cons, fc = latest_te()
    data = {
        "anchor": anchor,
        "consensus": cons,
        "forecast": fc,
        "threshold": (anchor - 11) if anchor else None,
        "fetched_at": datetime.now(timezone.utc).strftime("%a %b %-d"),
    }
    payload = json.dumps(data, indent=2)
    for path in ("data.json", "docs/data.json"):
        with open(path, "w") as f:
            f.write(payload)
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
