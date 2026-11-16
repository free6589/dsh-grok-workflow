import sys, json, os
from playwright.sync_api import sync_playwright
URL, OUT = os.environ['DSH_URL'], sys.argv[1]
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    p = ctx.new_page()
    p.goto(URL); p.wait_for_timeout(5000)
    p.get_by_role('button', name='Plugins', exact=True).first.click(); p.wait_for_timeout(2500)
    p.get_by_text('Grok workflow', exact=True).first.click(); p.wait_for_timeout(2500)
    p.screenshot(path=f'{OUT}/09-grok-settings.png')
    dom = p.evaluate("""() => {
      const page = document.querySelector('[data-page="grok-workflow"]');
      if (!page) return { present: false, body: (document.body.innerText||'').slice(0,500) };
      const nums = Array.from(page.querySelectorAll('input[data-field]')).map(e => e.getAttribute('data-field') + '=' + e.value);
      const switches = Array.from(page.querySelectorAll('[role="switch"]')).map(e => (e.getAttribute('aria-checked')||'') );
      const roleTexts = Array.from(page.querySelectorAll('*')).filter(e => /Supervisor|监督/.test((e.textContent||'')) && e.children.length === 0).map(e => e.textContent.trim());
      return { present: true, nums, switches, roleTexts,
               save: !!page.querySelector('[data-action="save"]'),
               text: (page.innerText||'').replace(/\\n+/g,' | ').slice(0,1200),
               scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    }""")
    res['page'] = dom
    b.close()
print('RESULT:' + json.dumps(res, ensure_ascii=False))
print('DONE')
