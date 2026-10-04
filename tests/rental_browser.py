"""End-to-end checks. pip install playwright; playwright install --with-deps chromium webkit.
Run against a local HTTP server: python3 tests/rental_browser.py [URL].
Set BROWSER_LIB_DIR and FONTCONFIG_FILE only for unprivileged minimal containers.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'sites/rental/qa';QA.mkdir(exist_ok=True)
ENV=dict(os.environ)
if os.getenv('BROWSER_LIB_DIR'): ENV['LD_LIBRARY_PATH']=os.environ['BROWSER_LIB_DIR']
RESULTS=[]

def no_overflow(page,label):
    sizes=page.evaluate('({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth})')
    assert sizes['scroll']<=sizes['width']+1,(label,sizes)

def nav(page,name):
    page.locator(f'.section-nav [data-view="{name}"]').click()
    expect(page.locator('#view-'+name)).to_be_visible()

def smoke(browser_type):
    browser=browser_type.launch(env=ENV,**({'args':['--no-sandbox']} if browser_type.name=='chromium' else {}))
    errors=[]
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True)
    page=context.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    requests=[];page.on('request',lambda r:requests.append(r.url))
    page.goto(URL);expect(page.locator('#property-title')).to_have_text('The headland cottage')
    expect(page.locator('#overview-main')).to_contain_text('$215,593')
    expect(page.locator('#example-note')).to_be_visible()
    assert not [u for u in requests if not u.startswith(URL.rsplit('/',1)[0])],requests
    for width in [320,360,375,390,430,768,1280]:
        page.set_viewport_size({'width':width,'height':900})
        for view in ['overview','startup','recurring','income','research']:
            nav(page,view);no_overflow(page,f'{browser_type.name}-{width}-{view}')
    page.set_viewport_size({'width':390,'height':844})
    nav(page,'overview');page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(QA/f'{browser_type.name}-mobile.png'),full_page=True)
    nav(page,'startup')
    price=page.locator('#in-price');price.fill('610000');page.wait_for_timeout(400)
    assert page.evaluate('document.activeElement.id')=='in-price','Live calculation stole input focus'
    expect(page.locator('#startup-summary')).not_to_contain_text('$215,593')
    page.reload();nav(page,'startup');expect(page.locator('#in-price')).to_have_value('610000')
    page.locator('#in-price').fill('-100');page.wait_for_timeout(400)
    expect(page.locator('#in-price')).to_have_attribute('aria-invalid','true')
    expect(page.locator('#input-warning')).to_be_visible()
    page.locator('#in-price').fill('525000');page.wait_for_timeout(400)
    page.screenshot(path=str(QA/f'{browser_type.name}-inputs.png'),full_page=True)
    # Research note jump, edit, persistence.
    page.locator('[data-source="price"]').click()
    expect(page.locator('#record-price')).to_have_attribute('open','')
    page.locator('#source-price').fill('Written broker quote')
    page.locator('#note-price').fill('<script>window.injected=1</script>')
    page.wait_for_timeout(400);page.reload();nav(page,'research')
    page.locator('#record-price > summary').click()
    expect(page.locator('#source-price')).to_have_value('Written broker quote')
    assert not page.evaluate('window.injected||false')
    page.locator('#review-legal').select_option('blocked')
    nav(page,'overview');expect(page.locator('.verdict')).to_contain_text('Resolve the flagged research')
    # Seasonality and annual cap.
    nav(page,'income');page.locator('#month-0-adr').fill('400');page.locator('#month-0-blocked').fill('31');page.wait_for_timeout(400)
    expect(page.locator('#month-result-0')).to_contain_text('0 booked nights')
    # Scenario edits retain focus and persist.
    nav(page,'overview');page.get_by_text('Edit the scenario assumptions',exact=True).click()
    scenario=page.locator('#scenario-down-adrChange');scenario.fill('-25');page.wait_for_timeout(400)
    assert page.evaluate('document.activeElement.id')=='scenario-down-adrChange'
    page.reload();page.get_by_text('Edit the scenario assumptions',exact=True).click()
    expect(page.locator('#scenario-down-adrChange')).to_have_value('-25')
    # Property creation and blank guardrail.
    page.locator('#places-button').click();page.locator('#places-dialog [data-action="new"]').click()
    expect(page.locator('#places-dialog')).to_be_visible();page.locator('#property-name').fill('My coastal study');page.wait_for_timeout(400)
    page.locator('[data-action="close"]').click();nav(page,'overview')
    expect(page.locator('.verdict')).to_contain_text('A few numbers first')
    expect(page.locator('#example-note')).to_be_hidden()
    expect(page.locator('#input-warning')).to_be_visible()
    # Export is a real download, includes both properties.
    page.locator('#places-button').click()
    with page.expect_download() as event:page.locator('[data-action="export"]').click()
    backup=Path(event.value.path()).read_text();parsed=json.loads(backup);assert len(parsed['properties'])==2
    # Failed import leaves original data unchanged.
    page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":999}'})
    expect(page.locator('#import-status')).to_contain_text('Import not applied')
    assert len(json.loads(page.evaluate('localStorage.getItem("tideland.fieldbook.v1")'))['properties'])==2
    # Valid restore asks for confirmation.
    page.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':backup.encode()})
    expect(page.locator('#confirm-dialog')).to_be_visible();page.locator('#confirm-yes').click()
    expect(page.locator('#import-status')).to_contain_text('Backup imported and validated')
    # Delete requires explicit confirm and leaves the other property.
    page.locator('[data-action="delete"]').click();page.locator('#confirm-cancel').click()
    assert len(json.loads(page.evaluate('localStorage.getItem("tideland.fieldbook.v1")'))['properties'])==2
    page.locator('[data-action="delete"]').click();page.locator('#confirm-yes').click()
    assert len(json.loads(page.evaluate('localStorage.getItem("tideland.fieldbook.v1")'))['properties'])==1
    page.locator('[data-action="close"]').click()
    # Corrupt storage is protected from silent replacement.
    page.add_init_script('localStorage.setItem("tideland.fieldbook.v1","broken")');page.reload()
    expect(page.locator('#storage-warning')).to_be_visible()
    nav(page,'startup');page.locator('#in-price').fill('123456');page.wait_for_timeout(450)
    assert page.evaluate('localStorage.getItem("tideland.fieldbook.v1")')=='broken'
    context.close()
    # Privacy/security: app still operates with storage unavailable.
    failure=browser.new_context(viewport={'width':375,'height':812})
    failure.add_init_script('Object.defineProperty(window,"localStorage",{get(){throw new Error("storage blocked")}})')
    page=failure.new_page();page.goto(URL)
    expect(page.locator('#storage-warning')).to_be_visible();expect(page.locator('#overview-main')).to_contain_text('Your cash to open')
    failure.close()
    assert not errors,errors
    RESULTS.append({'browser':browser_type.name,'status':'passed','widths':[320,360,375,390,430,768,1280],'checks':'all five views; overflow; input focus; recalculation; persistence; research; source text XSS; seasonality; scenarios; new property; backup export; invalid/valid import; delete confirmation; corrupt storage protection; storage blocked; no external requests'})
    browser.close()

with sync_playwright() as pw:
    for browser_type in [pw.chromium,pw.webkit]:smoke(browser_type)
(QA/'browser-results.json').write_text(json.dumps(RESULTS,indent=2)+'\n')
print(json.dumps(RESULTS,indent=2))
