"""Expanded multi-source data fetch for claims-forecast signals (Group F/L/X/E).

Runs on the public runner (free minutes). Each source is fetched as an immutable
vintage and committed to the fetched-data branch. Failures are recorded, never
fatal, so one bad host does not block the rest.

Sources (handoff S6):
  FEMA declarations (Group F 7-8): OpenFEMA DisasterDeclarationsSummaries v2
  SEC 8-K (Group L 15): EDGAR full-text / submissions (Item 2.05 restructuring)
  Treasury withholding (Group E Wildcard F): Daily Treasury Statement API
  EIA electricity (Group E Wildcard E): EIA v2 electricity/rto regional data
  BLS work stoppages (Group L 16): BLS public data API (strikes)
  QCEW employment weights (signal 2 weighting): BLS QCEW county employment
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "claims-forecast/0.1 (github actions runner; contact: repo issues)"


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _get(url: str, timeout: int = 90, headers: dict | None = None) -> bytes:
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


def fetch_fema(out_root: str) -> dict:
    # All disaster declarations since 2010. OpenFEMA v2, JSON.
    filt = urllib.parse.quote("declarationDate ge '2010-01-01T00:00:00.000Z'")
    url = ("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?"
           "$filter=" + filt + "&$top=10000")
    try:
        raw = _get(url)
        return _save(out_root, "fema_declarations", raw, {"source_url": url, "family": "F"})
    except Exception as e:  # noqa: BLE001
        return {"name": "fema", "ok": False, "error": str(e)}


def fetch_treasury(out_root: str) -> dict:
    # Daily Treasury Statement: withheld income/employment taxes (Table II).
    url = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
           "v1/accounting/dts/deposits_withdrawals_operating_cash_balance?"
           "filter=account_type:eq:Treasury General Account (TGA) Closing Balance&sort=-record_date&page[size]=2000")
    try:
        raw = _get(url)
        return _save(out_root, "treasury_dts", raw, {"source_url": url, "family": "E"})
    except Exception as e:  # noqa: BLE001
        return {"name": "treasury", "ok": False, "error": str(e)}


def fetch_treasury_withholding(out_root: str) -> dict:
    # DTS Table: deposits of withheld income + payroll taxes (labor-income proxy).
    url = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
           "v1/accounting/dts/issuance_of_tax_refunds?sort=-record_date&page[size]=2000")
    try:
        raw = _get(url)
        return _save(out_root, "treasury_tax", raw, {"source_url": url, "family": "E"})
    except Exception as e:  # noqa: BLE001
        return {"name": "treasury_tax", "ok": False, "error": str(e)}


def fetch_eia(out_root: str) -> dict:
    # EIA requires an api_key. Without one we record the gap. Register at
    # https://www.eia.gov/opendata/register.php and set EIA_API_KEY secret.
    key = os.environ.get("EIA_API_KEY", "").strip()
    if not key:
        return {"name": "eia", "ok": False, "error": "EIA_API_KEY not set (register free at eia.gov/opendata)"}
    url = ("https://api.eia.gov/v2/electricity/rto/region-data/data/?api_key=" + key +
           "&frequency=hourly&data[0]=value&facets[respondent][]=US48&sort[0][column]=period&sort[0][direction]=desc&length=5000")
    try:
        raw = _get(url)
        return _save(out_root, "eia_rto", raw, {"source_url": "eia.gov v2 rto", "family": "E"})
    except Exception as e:  # noqa: BLE001
        return {"name": "eia", "ok": False, "error": str(e)}


def fetch_bls_stoppages(out_root: str) -> dict:
    # BLS public data API for work stoppages (series WSU001). No key for v1 limited.
    url = "https://api.bls.gov/publicAPI/v2/timeseries/data/WSU001?startyear=2010&endyear=2022"
    try:
        raw = _get(url, headers={"Content-type": "application/json"})
        return _save(out_root, "bls_stoppages", raw, {"source_url": url, "family": "L"})
    except Exception as e:  # noqa: BLE001
        return {"name": "bls_stoppages", "ok": False, "error": str(e)}


def fetch_sec_edgar_index(out_root: str) -> dict:
    # SEC EDGAR full-text search for 8-K Item 2.05. EDGAR requires a declared UA.
    url = ("https://efts.sec.gov/LATEST/search-index?q=%22Item+2.05%22&forms=8-K"
           "&startdt=2019-01-01&enddt=2022-12-31")
    try:
        raw = _get(url, headers={"User-Agent": "claims-forecast research contact@example.com"})
        return _save(out_root, "sec_8k_item205", raw, {"source_url": url, "family": "L"})
    except Exception as e:  # noqa: BLE001
        return {"name": "sec_8k", "ok": False, "error": str(e)}


def main() -> int:
    out_root = os.environ.get("OUTPUT_DIR", "payload/raw")
    results = [
        fetch_fema(out_root + "/fema"),
        fetch_treasury(out_root + "/treasury"),
        fetch_treasury_withholding(out_root + "/treasury"),
        fetch_eia(out_root + "/eia"),
        fetch_bls_stoppages(out_root + "/bls"),
        fetch_sec_edgar_index(out_root + "/sec"),
    ]
    ok = sum(1 for r in results if r.get("ok"))
    print(json.dumps({"fetched": ok, "attempted": len(results), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
