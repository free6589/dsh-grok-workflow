import sys, json, os
from playwright.sync_api import sync_playwright
URL, OUT = os.environ['DSH_URL'], sys.argv[1]
msgs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    p = ctx.new_page()
    p.on('console', lambda m: msgs.append(f'{m.type}:{m.text[:400]}'))
    p.goto(URL); p.wait_for_timeout(6000)
    # 1) sidebar Plugins page
    p.get_by_role('button', name='Plugins', exact=True).first.click(); p.wait_for_timeout(3000)
    p.screenshot(path=f'{OUT}/08-sidebar-plugins.png')
    t1 = p.evaluate("() => (document.body.innerText||'').replace(/\\n+/g,' | ').slice(0,1200)")
    print('PLUGINS_PAGE:' + t1)
    print('ANY_GROK_TEXT:' + json.dumps(p.evaluate("() => { const t=document.body.innerText||''; const i=t.toLowerCase().indexOf('grok'); return i<0? 'none' : t.slice(Math.max(0,i-80), i+160).replace(/\\n/g,' | ') }"), ensure_ascii=False))
    print('CONSOLE_ALL:' + json.dumps(msgs[-8:], ensure_ascii=False)[:1200])
    b.close()
print('DONE')
