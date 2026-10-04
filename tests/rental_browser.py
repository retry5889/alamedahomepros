import os,sys,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
env=dict(os.environ)
if os.getenv('BROWSER_LIB_DIR'):env['LD_LIBRARY_PATH']=os.environ['BROWSER_LIB_DIR']
with sync_playwright() as pw:
 for engine in [pw.chromium,pw.webkit]:
  b=engine.launch(env=env);p=b.new_page(viewport={'width':375,'height':812});p.goto(url)
  expect(p.locator('[data-major]')).to_have_count(11)
  for k,v in [('price','500000'),('rate','6.5'),('closing','15000'),('setup','40000'),('reserveCash','15000'),('adr','250'),('occupancy','60'),('bills','1500'),('management','15'),('cleaningCost','150')]:p.locator('#major-'+k).fill(v)
  expect(p.locator('#totals')).to_contain_text('$199,000')
  assert p.evaluate('document.activeElement.id')=='major-cleaningCost'
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  p.wait_for_timeout(250);p.reload();expect(p.locator('#major-price')).to_have_value('500000')
  p.locator('#fine').click();expect(p.locator('#settings')).to_be_visible()
  b.close()
print('Compact worksheet checks passed in Chromium and WebKit')
