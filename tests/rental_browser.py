"""Bounded mobile regression for the simplified flow. Run with a local HTTP URL."""
import json,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'sites/rental/qa';ENV=dict(os.environ)
if os.getenv('BROWSER_LIB_DIR'):ENV['LD_LIBRARY_PATH']=os.environ['BROWSER_LIB_DIR']
reports=[]
with sync_playwright() as pw:
 for engine in [pw.chromium,pw.webkit]:
  browser=engine.launch(env=ENV,**({'args':['--no-sandbox']} if engine.name=='chromium' else {}));context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(URL);expect(page.locator('h1')).to_have_text('Start with the purchase.')
  assert page.locator('#screen input').count()==4
  for key,value in [('price','500000'),('down','25'),('rate','6.5'),('closing','15000')]:page.locator('#major-'+key).fill(value)
  page.locator('#next').click();assert page.locator('#screen input').count()==2
  page.locator('#major-setup').fill('40000');page.locator('#major-reserveCash').fill('15000');page.locator('#next').click()
  for key,value in [('adr','250'),('occupancy','60'),('bills','1500'),('management','15'),('cleaningCost','150')]:page.locator('#major-'+key).fill(value)
  page.locator('#next').click();expect(page.locator('h1')).to_have_text('Your rough estimate.');expect(page.locator('.result-main')).to_contain_text('$199,000')
  assert page.locator('#screen input').count()==0
  for width in [320,375,390,768,1280]:
   page.set_viewport_size({'width':width,'height':844})
   for step in range(4):
    page.locator(f'[data-step="{step}"]').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(engine.name,width,step)
  page.set_viewport_size({'width':390,'height':844});page.locator('[data-step="0"]').click();page.screenshot(path=str(QA/f'{engine.name}-simple-buy.png'),full_page=True)
  page.reload();expect(page.locator('h1')).to_have_text('Your rough estimate.');page.screenshot(path=str(QA/f'{engine.name}-simple-result.png'),full_page=True)
  page.locator('#fine').click();page.locator('#advanced > details').first.locator('summary').first.click();page.locator('#detail-price').fill('600000');page.keyboard.press('Escape');expect(page.locator('.result-main')).to_contain_text('$224,000')
  page.locator('#saved').click()
  with page.expect_download() as dl:page.locator('#export').click()
  backup=Path(dl.value.path()).read_text();assert json.loads(backup)['properties'][0]['values']['price']==600000
  page.locator('#file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{}'});expect(page.locator('#file-status')).to_contain_text('Import not applied')
  page.locator('[data-close="places"]').click()
  # Existing detailed v1 data stays intact, including source notes.
  page.wait_for_timeout(350)
  path=URL+'sites/rental/schema.mjs' if '/sites/rental/' not in URL else URL+'schema.mjs'
  page.evaluate('''async url=>{const {createProperty}=await import(url);const p=createProperty(true);p.notes.price={source:'quote',date:'2026-10-04',note:'Keep this'};localStorage.setItem('tideland.fieldbook.v1',JSON.stringify({version:1,active:p.id,properties:[p]}));}''',path)
  # Navigate from a new tab so pagehide cannot replace fixture storage.
  page2=context.new_page();page2.goto(URL);expect(page2.locator('#example')).to_be_visible();assert page2.evaluate("JSON.parse(localStorage.getItem('tideland.fieldbook.v1')).properties[0].notes.price.note")=='Keep this'
  assert not errors,errors
  reports.append({'browser':engine.name,'status':'passed','main_inputs':11,'checks':'three-step entry; rounded estimates; five widths; persistence; advanced dialog; backup; invalid import; existing detailed data compatibility'})
  browser.close()
(QA/'browser-results.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports))
