import sys, json, os, time
from playwright.sync_api import sync_playwright
URL, OUT = os.environ['DSH_URL'], sys.argv[1]
res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    p = ctx.new_page()
    p.goto(URL); p.wait_for_timeout(5000)
    p.get_by_text('北京、上海、广州三城天气查询与汇总', exact=False).first.click()
    p.wait_for_timeout(3000)
    deadline = time.time() + 420
    state = {}
    while time.time() < deadline:
        state = p.evaluate("""() => { const t = document.body.innerText||''; return { running: /subagents? running|subagent running/i.test(t), len: t.length, head: t.slice(0,200).replace(/\\n/g,' | ') }; }""")
        if not state['running']:
            break
        p.wait_for_timeout(15000)
    res['settled'] = state
    p.wait_for_timeout(2000)
    p.screenshot(path=f'{OUT}/30-run2-final-chat.png')
    for name in ('Progress', '进度'):
        loc = p.get_by_role('tab', name=name, exact=True)
        if loc.count():
            loc.first.click(); break
    p.wait_for_timeout(2500)
    res['progress'] = p.evaluate("""() => {
      const r = document.querySelector('[data-gw-progress]');
      if (!r) return { present: false };
      return { present: true,
        segs: [...r.querySelectorAll('[data-gw-progress-node]')].map(n => n.getAttribute('data-node-key') + '=' + n.getAttribute('data-state') + ' [' + ((n.querySelector('[data-gw-progress-meta]')||{}).textContent||'') + ']'),
        branches: r.querySelectorAll('[data-gw-progress-branch]').length,
        members: r.querySelectorAll('[data-gw-progress-member]').length,
        openBtns: r.querySelectorAll('[data-gw-progress-open]').length,
        track: (r.querySelector('[data-gw-progress-track]')||{}).textContent||'' };
    }""")
    p.screenshot(path=f'{OUT}/31-run2-final-progress.png')
    for name in ('Chat', '对话'):
        loc = p.get_by_role('tab', name=name, exact=True)
        if loc.count():
            loc.first.click(); break
    p.wait_for_timeout(1500)
    res['chat'] = p.evaluate("() => (document.body.innerText||'').replace(/\\n+/g,' | ').slice(0, 2200)")
    p.screenshot(path=f'{OUT}/32-run2-final-chat.png')
    b.close()
print('RESULT:' + json.dumps(res, ensure_ascii=False))
print('DONE')
