"""Measure the built client bundle's progress wires in a real browser.

Renders .rsi/evidence/fixed-gutter-2026-11-22-harness.html (which loads lib/client.js,
runs the real component against a real DOM and real layout) and prints the raw geometry
plus the wire invariants for each case at the requested viewport widths.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent.parent
HARNESS = (ROOT / '.rsi/evidence/fixed-gutter-2026-11-22-harness.html').as_uri()
WIDTHS = [int(value) for value in sys.argv[1:]] or [1440, 760, 480]
CHROME = Path.home() / '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
INSET = 0.5


def segments(points):
    return [[points[index], points[index + 1]] for index in range(len(points) - 1)]


def crosses(leg, rect):
    (x1, y1), (x2, y2) = leg
    left, right = rect['left'] + INSET, rect['right'] - INSET
    top, bottom = rect['top'] + INSET, rect['bottom'] - INSET
    if x1 == x2:
        return left < x1 < right and max(min(y1, y2), top) < min(max(y1, y2), bottom)
    if y1 == y2:
        return top < y1 < bottom and max(min(x1, x2), left) < min(max(x1, x2), right)
    return False


def check(page_result, width):
    problems = []
    report = {'width': width, 'cases': []}
    for case in page_result:
        cards = case['cards']
        by_key = {card['key']: card for card in cards}
        lefts = sorted({round(card['rect']['left'], 2) for card in cards})
        entry = {
            'case': case['case'],
            'innerWidth': case['innerWidth'],
            'passes': case['passes'],
            'bandPaddingLeft': case['bandPaddingLeft'],
            'bandMarginTop': case['bandMarginTop'],
            'depthVar': case['flowDepthVar'],
            'svg': case['svgDisplay'],
            'counts': case['counts'],
            'cardLefts': lefts,
            'owners': sorted({card['owner'] for card in cards}),
            'trunks': [],
            'branches': [],
        }
        if len(lefts) != 1:
            problems.append(f"{case['case']}: cards disagree on their left edge: {lefts}")
        if width > 480:
            if case['bandPaddingLeft'] != '40px':
                problems.append(f"{case['case']}: band padding-left is {case['bandPaddingLeft']}, not 40px")
            if case['svgDisplay'] == 'none':
                problems.append(f"{case['case']}: wires hidden above 480px")
        else:
            if case['bandPaddingLeft'] != '12px':
                problems.append(f"{case['case']}: narrow padding-left is {case['bandPaddingLeft']}, not 12px")
            if case['svgDisplay'] != 'none':
                problems.append(f"{case['case']}: wires still drawn at {width}px")
        if case['counts']['trunks'] != len(entry['owners']):
            problems.append(f"{case['case']}: {case['counts']['trunks']} trunks for {len(entry['owners'])} owners")
        if case['counts']['heads'] != case['counts']['branches']:
            problems.append(f"{case['case']}: {case['counts']['heads']} arrow heads for {case['counts']['branches']} stubs")

        # Under 480px the wires are hidden, so their measured geometry is not drawn at
        # all: the card-left and padding checks above are the whole contract there.
        visible = case['svgDisplay'] != 'none'
        if not visible:
            report['cases'].append(entry)
            continue

        # every leg must stay off every card
        for trunk in case['trunks']:
            for leg in segments(trunk['points']):
                for card in cards:
                    if crosses(leg, card['rect']):
                        problems.append(f"{case['case']}: trunk {trunk['owner']} leg {leg} crosses card {card['key']}")
        for branch in case['branches']:
            for leg in segments(branch['points']):
                for card in cards:
                    if crosses(leg, card['rect']):
                        problems.append(f"{case['case']}: stub for {branch['card']} leg {leg} crosses card {card['key']}")

        # lane and channel bookkeeping
        lanes = []
        channels = []
        for index, trunk in enumerate(case['trunks']):
            points = trunk['points']
            if len(points) != 4:
                problems.append(f"{case['case']}: trunk {trunk['owner']} has {len(points)} vertices, not 4")
                continue
            (x0, y0), (x1, y1), (x2, y2), (x3, y3) = points
            owner_cards = [card for card in cards if card['owner'] == trunk['owner']]
            ring_x = owner_cards[0]['ringX'] if owner_cards else None
            lane = round((y1 - case['trackBottom'] - 4) / 8)
            expected_channel = 18 + index * (min(10, (38 - 18) // (len(case['trunks']) - 1)) if len(case['trunks']) > 1 else 10)
            lanes.append(y1)
            channels.append(x2)
            entry['trunks'].append({
                'owner': trunk['owner'], 'd': trunk['d'],
                'ringX': ring_x, 'laneY': y1, 'lane': lane, 'channel': x2,
                'lastCardY': y3,
            })
            if not (x0 == x1 and abs(x0 - ring_x) <= 0.5):
                problems.append(f"{case['case']}: trunk {trunk['owner']} starts at x={x0}, ring centre is {ring_x}")
            if not (y0 == case['trackBottom']):
                problems.append(f"{case['case']}: trunk {trunk['owner']} starts at y={y0}, track bottom is {case['trackBottom']}")
            if not (round(lane * 8 + 4 + case['trackBottom']) == y1):
                problems.append(f"{case['case']}: trunk {trunk['owner']} lane y={y1} is not track bottom+4+8*{lane}")
            if not (y2 == y1 and x2 < x0):
                problems.append(f"{case['case']}: trunk {trunk['owner']} elbow is not a leftward run at one y ({points})")
            if not (x3 == x2):
                problems.append(f"{case['case']}: trunk {trunk['owner']} channel is not vertical ({points})")
            if not (x2 == expected_channel):
                problems.append(f"{case['case']}: trunk {trunk['owner']} channel {x2} != expected {expected_channel}")
            center_ys = sorted(round(card['rect']['top'] + card['rect']['height'] / 2) for card in owner_cards)
            if not center_ys:
                problems.append(f"{case['case']}: trunk {trunk['owner']} has no cards")
                continue
            if y3 != center_ys[-1]:
                problems.append(f"{case['case']}: trunk {trunk['owner']} ends at y={y3}, last card centre is {center_ys[-1]}")
            entry['trunks'][-1]['cardCentres'] = center_ys

        if len(set(lanes)) != len(lanes):
            problems.append(f"{case['case']}: two owners share lane y {lanes}")
        if len(set(channels)) != len(channels):
            problems.append(f"{case['case']}: two owners share channel x {channels}")

        # stubs: from the owner's channel to the card's left edge, arrow pointing right
        channels_by_owner = {trunk['owner']: trunk['channel'] for trunk in entry['trunks']}
        for branch in case['branches']:
            card = by_key.get(branch['card'])
            if card is None:
                problems.append(f"{case['case']}: stub for unknown card {branch['card']}")
                continue
            (sx, sy), (ex, ey) = branch['points']
            centre = round(card['rect']['top'] + card['rect']['height'] / 2)
            entry['branches'].append({
                'card': branch['card'], 'owner': branch['owner'], 'd': branch['d'],
                'head': branch['headPoints'], 'cardLeft': card['rect']['left'], 'cardCentre': centre,
            })
            if not (sx == channels_by_owner.get(branch['owner'])):
                problems.append(f"{case['case']}: stub {branch['card']} starts at x={sx}, channel is {channels_by_owner.get(branch['owner'])}")
            if not (ex == card['rect']['left']):
                problems.append(f"{case['case']}: stub {branch['card']} ends at x={ex}, card left is {card['rect']['left']}")
            if not (sy == ey == centre):
                problems.append(f"{case['case']}: stub {branch['card']} runs at y={sy}/{ey}, card centre is {centre}")
            head = branch['headPoints']
            if head is None or len(head) != 3:
                problems.append(f"{case['case']}: stub {branch['card']} has no triangle")
                continue
            tip, base_a, base_b = head
            if not (tip == [card['rect']['left'], centre]):
                problems.append(f"{case['case']}: stub {branch['card']} arrow tip {tip} is not the card edge/centre")
            if not (base_a[0] == base_b[0] == tip[0] - 8 and base_a[1] < tip[1] < base_b[1]):
                problems.append(f"{case['case']}: stub {branch['card']} arrow does not point right ({head})")
        report['cases'].append(entry)
    return report, problems


def main():
    with sync_playwright() as play:
        # The installed build is 1248; the pip package asks for its own revision, so point at
        # the browser that is actually on this machine instead of downloading another one.
        browser = play.chromium.launch(executable_path=str(CHROME))
        page = browser.new_page()
        collected = {}
        for width in WIDTHS:
            page.set_viewport_size({'width': width, 'height': 1000})
            page.goto(HARNESS)
            page.wait_for_function("document.title === 'done'", timeout=30000)
            collected[width] = page.evaluate('window.__RESULT')
        browser.close()
    out = {'widths': WIDTHS, 'problems': []}
    for width in WIDTHS:
        report, problems = check(collected[width], width)
        out.setdefault('reports', []).append(report)
        out['problems'].extend(problems)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
