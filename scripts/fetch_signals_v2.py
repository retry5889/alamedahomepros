"""Prospective signal capture v2: WARN (CA), News RSS (layoffs), Treasury
withholding (correct DTS table), Trading Economics via Wayback (ICSA consensus).

Runs weekly on the public runner. Each source is an immutable vintage with
manifest; failures recorded per-source, never fatal.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "claims-forecast/0.2 (+github: retry5889/cartesian-yacht; research)"


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 60, headers: dict | None = None) -> bytes:
    h = {"User-Agent": UA, "Accept": "application/json, text/csv, */*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _save(out_root: str, name: str, raw: bytes, meta: dict) -> dict:
    os.makedirs(out_root, exist_ok=True)
    digest = sha256(raw)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fname = f"{name}_{ts}_{digest[:12]}.json"
    with open(os.path.join(out_root, fname), "wb") as f:
        f.write(raw)
    man = {"ingested_time": datetime.now(timezone.utc).isoformat(), "file": fname,
           "sha256": digest, "bytes": len(raw), **meta}
    with open(os.path.join(out_root, f"manifest_{name}_{ts}.json"), "w") as f:
        json.dump(man, f, indent=2)
    return {"name": name, "ok": True, "file": fname, "bytes": len(raw)}


def fetch_warn_ca(out_root: str) -> dict:
    """California WARN: published xlsx, no auth. Cover ~2 months weekly."""
    for url in [
        "https://www.edd.ca.gov/Jobs_and_Training/warn/WARN-Report-for-7-31-2026.xlsx",
        "https://www.edd.ca.gov/Jobs_and_Training/warn.htm",
    ]:
        try:
            raw = _get(url, headers={"Accept": "*/*"})
            return _save(out_root + "/warn", "warn_ca", raw,
                         {"source_url": url, "family": "L", "format": "xlsx/html"})
        except Exception:
            continue
    return {"name": "warn_ca", "ok": False, "error": "both CA WARN endpoints failed"}


def fetch_news_rss(out_root: str) -> dict:
    """Google News RSS: layoff/termination queries. Genuine publication timestamps."""
    queries = ["layoffs", "mass layoff", "job cuts", "furlough workers",
               "unemployment claims week", "workers laid off"]
    all_items = []
    for q in queries:
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q)
               + "&hl=en-US&gl=US&ceid=US:en")
        try:
            raw = _get(url)
            txt = raw.decode("utf-8", "ignore")
            items = re.findall(r"<item>(.*?)</item>", txt, re.S)
            for it in items:
                t = re.search(r"<title>(.*?)</title>", it, re.S)
                d = re.search(r"<pubDate>(.*?)</pubDate>", it, re.S)
                l = re.search(r"<link>(.*?)</link>", it, re.S)
                all_items.append({
                    "query": q,
                    "title": (t.group(1) if t else "")[:300],
                    "pub_date": d.group(1) if d else "",
                    "link": (l.group(1) if l else "")[:300],
                })
        except Exception as e:  # noqa: BLE001
            all_items.append({"query": q, "error": str(e)[:200]})
    payload = json.dumps({"ingested_time": datetime.now(timezone.utc).isoformat(),
                          "items": all_items}, indent=2).encode()
    return _save(out_root + "/news_rss", "news_rss_layoffs", payload,
                 {"source_url": "news.google.com/rss", "family": "L",
                  "queries": queries, "items": len(all_items)})


def fetch_treasury_withholding_v2(out_root: str) -> dict:
    """DTS deposits WITH the withheld income + employment tax classifications."""
    filt = urllib.parse.urlencode({
        "filter": "transaction_type:eq:Deposits",
        "sort": "-record_date", "page[size]": "5000",
        "fields": "record_date,classification_desc,transaction_today_amt,table_nbr,table_nm",
    })
    url = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
           "v1/accounting/dts/deposits?" + filt)
    try:
        raw = _get(url)
        return _save(out_root + "/treasury", "treasury_withholding_v2", raw,
                     {"source_url": url, "family": "E"})
    except Exception as e:  # noqa: BLE001
        return {"name": "treasury_withholding_v2", "ok": False, "error": str(e)[:200]}


def fetch_te_wayback(out_root: str) -> dict:
    """Trading Economics ICSA forecast/actual page snapshots via Wayback CDX."""
    te = "tradingeconomics.com/united-states/jobless-claims"
    cdx = ("https://web.archive.org/cdx/search/cdx?url=" + urllib.parse.quote(te)
           + "&output=json&from=2019&to=2026&collapse=timestamp:8&limit=2000")
    try:
        cdx_raw = _get(cdx, timeout=120)
        rows = json.loads(cdx_raw.decode("utf-8", "ignore"))
        snaps = []
        ts_list = rows[1:] if rows else []
        os.makedirs(os.path.join(out_root, "te_wayback"), exist_ok=True)
        # Sample ~weekly: one snapshot per ISO week, most recent per week
        by_week = {}
        for r in ts_list:
            ts = r[1]
            wk = ts[:8]  # daily key
            by_week.setdefault(ts[:6], []).append(ts)  # monthly key
        weekly = [max(v) for _, v in sorted(by_week.items())]
        # Fetch up to 12 snapshots per run (rotate coverage over weeks; bounded)
        for ts in weekly[-12:]:
            ts = r[1]
            snap_url = f"https://web.archive.org/web/{ts}/{te}"
            try:
                page = _get(snap_url, timeout=90)
                snaps.append({"timestamp": ts, "bytes": len(page)})
                digest = sha256(page)
                fname = f"te_wayback_{ts}.json"
                with open(os.path.join(out_root, "te_wayback", fname), "wb") as f:
                    f.write(page)
                with open(os.path.join(out_root, "te_wayback", f"manifest_te_{ts}.json"), "w") as f:
                    json.dump({"ingested_time": datetime.now(timezone.utc).isoformat(),
                               "wayback_timestamp": ts, "sha256": digest,
                               "bytes": len(page)}, f, indent=2)
            except Exception as e:  # noqa: BLE001
                snaps.append({"timestamp": ts, "error": str(e)[:200]})
        payload = json.dumps({"cdx_rows": len(ts_list), "fetched": snaps}, indent=2).encode()
        return _save(out_root + "/te_wayback", "te_wayback_index", payload,
                     {"source_url": "web.archive.org", "family": "X"})
    except Exception as e:  # noqa: BLE001
        return {"name": "te_wayback", "ok": False, "error": str(e)[:200]}


def main() -> int:
    out_root = os.environ.get("OUTPUT_DIR", "payload/raw")
    results = [
        fetch_warn_ca(out_root),
        fetch_news_rss(out_root),
        fetch_treasury_withholding_v2(out_root),
        fetch_te_wayback(out_root),
    ]
    ok = sum(1 for r in results if r.get("ok"))
    print(json.dumps({"fetched": ok, "attempted": len(results), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
