#!/usr/bin/env python3
"""Choose the root GitHub Pages app; keep both apps and all data intact."""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def select_site(site: str, root: Path = ROOT) -> None:
    if site not in {"rental", "claims"}:
        raise ValueError("Site must be rental or claims")
    source = root / "sites" / site / "index.html"
    html = source.read_text()
    if site == "rental":
        # Only HTML attribute URLs; JS modules resolve their imports from app.mjs.
        html = re.sub(r'(\b(?:src|href)=([\"\']))\./', r'\1./sites/rental/', html)
    target = root / "index.html"
    temporary = root / ".index.html.tmp"
    temporary.write_text(html)
    temporary.replace(target)
    (root / "ACTIVE_SITE").write_text(site + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", choices=("rental", "claims"))
    args = parser.parse_args()
    select_site(args.site)
    print(f"Root entrypoint now serves {args.site}. Review, commit, and push index.html and ACTIVE_SITE.")
