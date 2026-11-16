import sys, json, os, time
from playwright.sync_api import sync_playwright
URL, OUT = os.environ['DSH_URL'], sys.argv[1]
PROMPT = '分别查一下北京、上海、广州今天的天气，然后汇总成一句话结论'
res = {'prompt': PROMPT}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    p = ctx.new_page()
    p.goto(URL); p.wait_for_timeout(5000)
    p.get_by_role('button', name='New Session').first.click(); p.wait_for_timeout(2000)
    box = p.locator('[contenteditable="true"]').last
    box.click()
    p.keyboard.insert_text(PROMPT)
    p.wait_for_timeout(400)
    p.keyboard.press('Enter')
    deadline = time.time() + 420
    state = {}
    while time.time() < deadline:
        p.wait_for_timeout(15000)
        state = p.evaluate("""() => {
          const tabs = [...document.querySelectorAll('[role="tab"]')].map(e => (e.innerText||'').trim());
          const body = document.body.innerText || '';
          const busy = /Stop|停止/.test(body.slice(0, 600)) || /running/i.test(body.slice(0, 300));
          const meter = (body.match(/(\\d+) turns?\\s*(\\d+) steps?/) || [])[0] || '';
          return { tabs, busy, meter, len: body.length };
        }""")
        if state.get('tabs') and not state.get('busy') and state.get('len', 0) > 300:
            break
    res['final_state'] = state
    p.screenshot(path=f'{OUT}/20-run2-settled.png')
    for name in ('Progress', '进度'):
        loc = p.get_by_role('tab', name=name, exact=True)
        if loc.count():
            loc.first.click(); break
    p.wait_for_timeout(3000)
    dom = p.evaluate("""() => {
      const r = document.querySelector('[data-gw-progress]');
      if (!r) return { present: false };
      const nodes = [...r.querySelectorAll('[data-gw-progress-node]')];
      const segs = nodes.map(n => ({ key: n.getAttribute('data-node-key'), state: n.getAttribute('data-state'),
        meta: (n.querySelector('[data-gw-progress-meta]')||{}).textContent || '',
        expanded: n.getAttribute('aria-expanded') }));
      return { present: true, segs,
        branches: r.querySelectorAll('[data-gw-progress-branch]').length,
        members: r.querySelectorAll('[data-gw-progress-member]').length,
        more: r.querySelectorAll('[data-gw-progress-more]').length,
        jump: r.querySelectorAll('[data-gw-progress-jump]').length,
        labels: [...r.querySelectorAll('[data-gw-progress-label]')].map(e => e.textContent),
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    }""")
    res['progress_dom'] = dom
    p.screenshot(path=f'{OUT}/21-run2-progress.png')
    # expand the execute segment to look for member cards / child session links
    try:
        seg = p.locator('[data-gw-progress-node][data-node-key="stage:execute"]')
        if seg.count():
            seg.first.click(); p.wait_for_timeout(1500)
            p.screenshot(path=f'{OUT}/22-run2-execute-open.png')
            res['execute_open'] = p.evaluate("""() => ({
              members: document.querySelectorAll('[data-gw-progress-member]').length,
              openBtns: document.querySelectorAll('[data-gw-progress-open]').length,
              rows: [...document.querySelectorAll('[data-gw-progress-row]')].map(e => (e.innerText||'').replace(/\\n/g,' / ').slice(0,80))
            })""")
    except Exception as e:
        res['execute_open_error'] = str(e)[:150]
    # chat tab: capture the answer
    for name in ('Chat', '对话'):
        loc = p.get_by_role('tab', name=name, exact=True)
        if loc.count():
            loc.first.click(); break
    p.wait_for_timeout(1500)
    p.screenshot(path=f'{OUT}/23-run2-chat-answer.png')
    res['chat_text'] = p.evaluate("() => (document.body.innerText||'').replace(/\\n+/g,' | ').slice(0, 2500)")
    b.close()
print('RESULT:' + json.dumps(res, ensure_ascii=False))
print('DONE')
