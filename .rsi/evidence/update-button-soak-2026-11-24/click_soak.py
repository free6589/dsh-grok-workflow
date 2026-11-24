"""Click the settings-page upgrade button in the isolated instance, for real.

Usage: python3 click_soak.py <url> <prefix>

Reads and writes nothing outside the browser session: it opens the settings page,
records what the card says before the click, presses "check", presses "install"
when the card offers it, waits for the card to settle, and prints one JSON object
with every state it saw plus the browser console errors. The installed version is
read from the profile on disk by the caller, not from this script.
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

url = sys.argv[1]
prefix = sys.argv[2] if len(sys.argv) > 2 else "soak"
result = {"url": url, "states": [], "console": [], "requests": [], "responses": []}


def card_state(page):
    # The card can be replaced under the page while an install lands (the installed
    # build takes over the registration), so a handle read mid-swap is expected to
    # throw: that state is "no card right now", not a failed run.
    try:
        card = page.query_selector("[data-gw-update]")
        if card is None:
            return None
        return _card_of(card)
    except Exception:
        return None


def _card_of(card):
    return {
        "phase": card.get_attribute("data-gw-update-phase"),
        "data": card.evaluate("e => ({...e.dataset})"),
        "text": card.inner_text(),
        "buttons": [
            {
                "action": b.get_attribute("data-action"),
                "text": (b.inner_text() or "").strip(),
                "disabled": b.is_disabled(),
            }
            for b in card.query_selector_all("button")
        ],
    }


def wait_phase(page, wanted, timeout_s=30):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        state = card_state(page)
        last = state
        if state is not None and state["phase"] in wanted:
            return state
        page.wait_for_timeout(400)
    return last


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium")
    page = browser.new_page(viewport={"width": 1400, "height": 1200})
    page.on("console", lambda msg: result["console"].append(f"{msg.type}: {msg.text}"[:400]))
    page.on("request", lambda req: result["requests"].append(f"{req.method} {req.url}"[:300])
            if "grok-workflow/update" in req.url else None)
    page.on("response", lambda res: result["responses"].append({
        "status": res.status, "url": res.url[:200],
        "body": (res.text() if "grok-workflow/update" in res.url else "")[:1200],
    }) if "grok-workflow/update" in res.url else None)

    page.goto(url, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="插件", exact=True).first.click()
    page.wait_for_timeout(2000)
    page.get_by_text("Grok workflow", exact=False).first.click()
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{prefix}-0-open.png", full_page=True)
    result["states"].append({"step": "opened", "card": card_state(page)})

    check = page.query_selector("[data-action=update-check]")
    if check is None:
        result["error"] = "no check button on the card"
    else:
        check.click()
        # A check is one round trip; the install offer appears in the same phase.
        state = wait_phase(page, {"latest", "failed", "installing"}, timeout_s=25)
        page.wait_for_timeout(800)
        state = card_state(page) or state
        result["states"].append({"step": "after-check", "card": state})
        page.screenshot(path=f"{prefix}-1-checked.png", full_page=True)
        install = page.query_selector("[data-action=update-install]")
        if install is None:
            result["note"] = "the card offered no install button after the check"
        else:
            install.click()
            result["states"].append({"step": "clicked-install", "card": card_state(page)})
            page.screenshot(path=f"{prefix}-2-installing.png", full_page=True)
            # A real install fetches from GitHub and runs pnpm: allow it minutes.
            state = wait_phase(page, {"latest", "failed"}, timeout_s=300)
            page.wait_for_timeout(1000)
            state = card_state(page) or state
            result["states"].append({"step": "settled", "card": state})
            page.screenshot(path=f"{prefix}-3-settled.png", full_page=True)

    browser.close()

print(json.dumps(result, ensure_ascii=False, indent=1))