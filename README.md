# Tideland: rental property fieldbook

A phone-first, client-only short-term-rental purchase feasibility tool at
https://retry5889.github.io/alamedahomepros/.

The visual direction is a Mendocino coastal cottage: cream paper, sea-glass green, redwood tones, locally served Fraunces type and original SVG coastal artwork. It is not a source of Mendocino market data or legal requirements.

## Current compact worksheet

All 11 major inputs are visible together. No steps or Continue buttons. Two rounded totals update in place. Details remain optional.

## Previous guided interface

The main flow is now **Buy → Set up → Run → Estimate**, with 11 major inputs total (4 / 2 / 5 per step). New visitors start blank. Output emphasizes cash to open rounded to $1,000 and monthly cash flow rounded to $100, plus a ±10% rate/cost stress range. Minor inputs, seasonal overrides and calculation details are hidden behind optional controls.

Existing detailed values, research notes and JSON backups remain compatible. Aggregate edits scale existing setup/fixed-cost allocations; editing the closing total replaces its fee allocation. Source notes are retained in backups. The original calculation engine remains unchanged.

## Underlying capabilities (not all shown on the main screen)

- 69 editable financial inputs, plus monthly rate/occupancy overrides and blocked nights.
- Separate purchase equity, financing, closing, guest-ready setup, contingency, pre-opening carrying, escrow/deposits and cash reserves.
- Fixed, per-stay, per-night and revenue-percentage costs, with explicit cleaning-fee bases.
- Stabilized revenue, NOI, cash flow, cash-on-cash return, cap rate, debt coverage and occupancy break-even.
- Acquisition-year ramp-up, operating balance, funding shortfalls, scenarios and rate/occupancy sensitivity.
- Six research gates and source/date/notes for every assumption. Conditional results, not investment advice.
- Local multi-property storage, duplication/deletion, validated JSON backups and print reports.

First launch starts a blank property. Previously saved examples remain explicitly labeled. Optional zero values must be reviewed; they are not researched estimates.

## Run locally

No build, npm install, database, API keys or backend required:

```sh
python3 -m http.server 8765
# Open http://localhost:8765/ or http://localhost:8765/sites/rental/
```

Serve over HTTP(S), not `file://`, because the app uses native JavaScript modules. All calculations run in the browser. Fonts and artwork are local assets. There are no third-party runtime requests, trackers or service workers.

## Switching the public URL

Both apps are retained. Only the root entrypoint changes.

```sh
python3 scripts/select_site.py claims  # restore Claims Card
# or
python3 scripts/select_site.py rental  # serve Tideland
git add index.html ACTIVE_SITE
git commit -m "Select the public app"
git push origin main
```

Alternatively, run **Actions → Select public site → Run workflow**, choosing `rental` or `claims`. The workflow commits the entrypoint and explicitly requests a Pages rebuild.

- `sites/rental/`: canonical new app.
- `sites/claims/`: exact snapshot of Claims Card at replacement, with SHA-256 manifest and source commit.
- Root `app.css`, `app.js`, `data.json`: untouched Claims Card assets. Existing prefill jobs can continue updating the root data.
- `docs/`: prior complete Claims Card copy, untouched.
- `legacy/`: older site, untouched.

**Do not copy archived `data.json` over the live root data when switching.** The selector restores only the original claims HTML and reuses the original root assets and current data. Switching sites does not erase browser data; Tideland uses its own localStorage key.

## Storage and safety

Data stays in localStorage on this device/browser/origin. It is not encrypted, synced or automatically backed up. Export a JSON backup before clearing browser data or changing devices. Import validates version, ranges, IDs, all monthly inputs and research data, and requires confirmation before replacing the fieldbook. Failed imports leave existing data intact. Corrupt or unavailable storage produces a visible warning, not a false success. Cross-tab changes pause saving.

## Verification

```sh
node --test sites/rental/model.test.mjs sites/rental/storage.test.mjs sites/rental/simple.test.mjs
python3 -m unittest discover -s tests -p test_site_selector.py
pip install -r tests/requirements-rental.txt
python3 -m playwright install --with-deps chromium webkit
# Start a local server in another terminal, then:
python3 tests/rental_browser.py http://127.0.0.1:8765/sites/rental/
```

`Rental fieldbook checks` runs the same tests in GitHub Actions. QA artifacts and screenshots are in `sites/rental/qa/`. See [the model specification](sites/rental/MODEL.md) for assumptions and known limitations. Work tracked in retry5889/cartesian-yacht#399.
