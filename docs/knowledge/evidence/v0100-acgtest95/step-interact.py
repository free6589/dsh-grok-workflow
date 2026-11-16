import sys, json, os, time
from playwright.sync_api import sync_playwright
URL, OUT = os.environ['DSH_URL'], sys.argv[1]
PROMPT = '用一句话介绍北京、上海、广州三座城市，然后汇总成一句话结论'
res = {'prompt': PROMPT}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    p = ctx.new_page()
    msgs = []
    p.on('console', lambda m: msgs.append(m.type + ':' + m.text[:250]) if m.type in ('error', 'warning') else None)
    p.goto(URL); p.wait_for_timeout(5000)
    box = p.locator('[contenteditable="true"]').last
    box.click()
    p.keyboard.insert_text(PROMPT)
    p.wait_for_timeout(400)
    p.keyboard.press('Enter')
    res['sent_at'] = time.strftime('%H:%M:%S')
    # wait for the run to reach a settled state; poll up to 300s
    deadline = time.time() + 300
    seen_progress = False
    while time.time() < deadline:
        p.wait_for_timeout(10000)
        state = p.evaluate("""() => {
          const tab = [...document.querySelectorAll('[role="tab"]')].map(e => (e.innerText||'').trim());
          const root = document.querySelector('[data-gw-progress]');
          const body = document.body.innerText || '';
          const busy = /Stop|停止|running/i.test(body.slice(0, 400));
          return { tabs: tab, progress: !!root, busy, len: body.length };
        }""")
        if state['progress'] and not seen_progress:
            seen_progress = True
            p.screenshot(path=f'{OUT}/10-run-progress-appeared.png')
        if not state['busy'] and state['len'] > 300:
            res['settled_state'] = state
            break
    res['poll_state'] = state
    p.screenshot(path=f'{OUT}/11-run-settled.png')
    # open the Progress tab if present
    opened = False
    for name in ('Progress', '进度'):
        loc = p.get_by_role('tab', name=name, exact=True)
        if loc.count():
            loc.first.click(); opened = True; break
    res['progress_tab_found'] = opened
    p.wait_for_timeout(2500)
    dom = p.evaluate("""() => {
      const r = document.querySelector('[data-gw-progress]');
      if (!r) return { present: false };
      const nodes = [...r.querySelectorAll('[data-gw-progress-node]')];
      return { present: true,
        segs: nodes.length,
        segKeys: nodes.map(e => e.getAttribute('data-node-key')),
        segStates: nodes.map(e => e.getAttribute('data-node-key') + '=' + e.getAttribute('data-state')),
        openSeg: nodes.filter(e => e.getAttribute('aria-expanded') === 'true').map(e => e.getAttribute('data-node-key')),
        branches: r.querySelectorAll('[data-gw-progress-branch]').length,
        members: r.querySelectorAll('[data-gw-progress-member]').length,
        jump: r.querySelectorAll('[data-gw-progress-jump]').length,
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    }""")
    res['progress_dom'] = dom
    p.screenshot(path=f'{OUT}/12-progress-tab.png')
    # answer text (last assistant bubble)
    res['answer_tail'] = p.evaluate("""() => {
      const t = document.body.innerText || '';
      return t.replace(/\\n+/g, ' | ').slice(-1500);
    }""")
    res['console'] = [m for m in msgs if 'grok' in m.lower()][:6]
    b.close()
print('RESULT:' + json.dumps(res, ensure_ascii=False))
print('DONE')
