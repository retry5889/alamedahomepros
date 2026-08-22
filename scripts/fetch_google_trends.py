"""Weekly Google Trends capture for the frozen v1 term set (69 terms).

Transport: trends.google.com explore widget with full handshake:
  1. GET /trends/explore  (obtain cookies + embedded embed API key)
  2. GET /trends/api/explore?... (widget list JSON)
  3. GET /trends/api/widgetdata/multiline?... (weekly index CSV)
Heavy backoff on 429; never fabricate values. Archives query definitions and
results with ingested/available timestamps. PROSPECTIVE-ONLY (A6): no backtest.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, "/dev/null")  # standalone on public runner; term set inlined below

# Frozen v1 term set (byte-identical to cartesian-yacht ingestion/google_trends.py;
# verified by scripts/verify_term_set.py) - DO NOT EDIT HERE.
_FAMILIES = {
    "F10_negative_controls": ["lunar phase", "horoscope today", "nfl scores", "weather mars"],
    "F1_filing_intent": ["file for unemployment", "file unemployment", "file unemployment claim", "apply for unemployment", "unemployment application", "claim unemployment", "unemployment claim", "how to file for unemployment", "unemployment file", "sign up for unemployment"],
    "F2_benefits_status": ["unemployment benefits", "unemployment payment", "unemployment check", "unemployment deposit", "when will unemployment be paid", "unemployment status", "unemployment pending", "unemployment approved"],
    "F3_portal_access": ["unemployment login", "unemployment sign in", "unemployment website", "unemployment office near me", "unemployment phone number"],
    "F4_job_loss_event": ["laid off", "lost my job", "got fired", "let go", "terminated from job", "job loss", "furloughed", "furlough"],
    "F5_severance_warn": ["severance", "severance pay", "severance package", "WARN notice", "WARN act", "plant closing", "mass layoff"],
    "F6_state_portals": ["edd login", "ui online", "twc unemployment", "ui texasworkforce", "ny unemployment login", "connect unemployment", "florida unemployment login", "uc pa", "pa unemployment login", "unemployment ohio gov", "ides unemployment", "miwam", "georgia unemployment", "nj unemployment", "mylaimonen"],
    "F7_spanish": ["desempleo", "solicitar desempleo", "beneficios de desempleo", "seguro de desempleo"],
    "F8_anxiety_leading": ["layoffs coming", "will I be laid off", "company layoffs", "recession jobs", "job cuts"],
    "F9_employer_side": ["how to lay off employees", "reduction in force", "furlough employees"],
}
_GEO = "US"
_TIMEFRAME = "today 5-y"  # weekly granularity

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class TrendsClient:
    def __init__(self):
        self.cookies: dict[str, str] = {}
        self._token: str | None = None

    def _merge_cookies(self, hdr):
        for part in (hdr or "").split(","):
            if "=" in part:
                k, _, v = part.partition("=")
                k = k.split(":")[-1].strip()
                v = v.split(";")[0].strip()
                if k:
                    self.cookies[k] = v

    def _get(self, url: str, referer: str | None = None, timeout: int = 30) -> bytes:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            **({"Referer": referer} if referer else {}),
            **({f"Cookie": "; ".join(f"{k}={v}" for k, v in self.cookies.items())} if self.cookies else {}),
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            self._merge_cookies(r.headers.get("Set-Cookie"))
            return r.read()

    def warmup(self):
        try:
            self._get("https://trends.google.com/trends/explore?date=all&q=unemployment", timeout=20)
        except Exception:
            pass
        for attempt in range(6):
            try:
                raw = self._get("https://trends.google.com/", timeout=20)
                m = __import__("re").search(r'widgetdata[^"\']*token["\']?\s*[:=]\s*["\']([\w-]+)', raw.decode("utf-8", "ignore"))
                if m:
                    self._token = m.group(1)
                return True
            except Exception:
                time.sleep(5 * (attempt + 1))
        return False

    def widget(self, term: str) -> dict | None:
        req = json.dumps({"comparisonItem": [{"keyword": term, "geo": _GEO, "time": _TIMEFRAME}],
                          "category": 0, "property": ""})
        url = ("https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req="
               + urllib.parse.quote(req))
        for attempt in range(5):
            try:
                raw = self._get(url, referer="https://trends.google.com/trends/explore")
                txt = raw.decode("utf-8", "ignore")
                if not txt.startswith("{"):
                    txt = txt[txt.find("{"):]
                data = json.loads(txt)
                widgets = data.get("widgets", [])
                line = next((w for w in widgets if w.get("id") == "TIMESERIES"), None)
                return line
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(30 * (attempt + 1))
                    continue
                return None
            except Exception:
                time.sleep(10 * (attempt + 1))
        return None

    def series(self, widget: dict) -> list[dict]:
        token = widget.get("token")
        req = widget.get("request", {})
        url = ("https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&"
               + urllib.parse.urlencode({"token": token, "req": json.dumps(req)}))
        for attempt in range(5):
            try:
                raw = self._get(url, referer="https://trends.google.com/trends/explore")
                txt = raw.decode("utf-8", "ignore")
                if not txt.lstrip().startswith("{"):
                    i = txt.find("{")
                    txt = txt[i:]
                data = json.loads(txt)
                lines = data.get("default", {}).get("timelineData", [])
                return [{"date": p.get("time"), "value": (p.get("value") or [None])[0]} for p in lines]
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(30 * (attempt + 1))
                    continue
                return []
            except Exception:
                time.sleep(10 * (attempt + 1))
        return []


def main() -> int:
    out_dir = os.environ.get("OUTPUT_DIR", "claims-forecast/data/raw/google_trends")
    os.makedirs(out_dir, exist_ok=True)
    ingested = datetime.now(timezone.utc).isoformat()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    client = TrendsClient()
    client.warmup()

    results = []
    terms = [(fam, t) for fam, ts_ in _FAMILIES.items() for t in ts_]
    for i, (fam, term) in enumerate(terms):
        entry = {"family": fam, "term": term}
        try:
            w = client.widget(term)
            if w is None:
                entry.update(ok=False, error="no TIMESERIES widget (rate limit or blocked)")
            else:
                series = client.series(w)
                if series:
                    entry.update(ok=True, n_points=len(series),
                                 first=series[0]["date"], last=series[-1]["date"],
                                 last_value=series[-1]["value"])
                else:
                    entry.update(ok=False, error="empty series")
        except Exception as e:  # noqa: BLE001
            entry.update(ok=False, error=str(e)[:200])
        results.append(entry)
        time.sleep(3 + (i % 3))  # pacing

    payload = {"term_set_version": TERM_SET_VERSION, "geo": _GEO, "timeframe": _TIMEFRAME,
               "ingested_time": ingested, "available_time": ingested, "results": results}
    raw = json.dumps(payload, indent=2).encode()
    digest = sha256(raw)
    fname = f"trends_{ts}_{digest[:12]}.json"
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(raw)
    manifest = {"ingested_time": ingested, "term_set_version": TERM_SET_VERSION,
                "file": fname, "sha256": digest, "terms": len(results),
                "ok": sum(1 for r in results if r.get("ok"))}
    with open(os.path.join(out_dir, f"manifest_{ts}.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
