"""Tests written before selector implementation."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
SPEC = importlib.util.spec_from_file_location("selector", Path(__file__).resolve().parents[1] / "scripts/select_site.py")
selector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selector)

class SelectorTests(unittest.TestCase):
    def test_switch_roundtrip_preserves_claims_and_unrelated_assets(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sites/claims").mkdir(parents=True)
            (root / "sites/rental").mkdir()
            claims = '<title>Claims Card</title><script src="app.js"></script>'
            rental = '<title>Tideland</title><link href="./style.css"><script src="./app.mjs"></script><img src="./coast.svg">'
            (root / "sites/claims/index.html").write_text(claims)
            (root / "sites/rental/index.html").write_text(rental)
            (root / "app.js").write_text('original claims code')
            selector.select_site('rental',root)
            self.assertIn('./sites/rental/style.css',(root/'index.html').read_text())
            self.assertIn('./sites/rental/app.mjs',(root/'index.html').read_text())
            selector.select_site('claims',root)
            self.assertEqual((root/'index.html').read_text(),claims)
            self.assertEqual((root/'app.js').read_text(),'original claims code')
            self.assertEqual((root/'sites/rental/index.html').read_text(),rental)
            self.assertEqual((root/'sites/claims/index.html').read_text(),claims)

    def test_invalid_site_does_not_modify_entry(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/'index.html').write_text('untouched')
            with self.assertRaises(ValueError): selector.select_site('../../secret',root)
            self.assertEqual((root/'index.html').read_text(),'untouched')

    def test_missing_source_does_not_modify_entry(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/'index.html').write_text('untouched')
            with self.assertRaises(FileNotFoundError): selector.select_site('rental',root)
            self.assertEqual((root/'index.html').read_text(),'untouched')

if __name__ == '__main__': unittest.main()
