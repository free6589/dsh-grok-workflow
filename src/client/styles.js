    const HAIRLINE = 'rgba(128,128,128,0.14)'
    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 2px 32px', fontSize: '13px', lineHeight: 1.55 },
      section: { display: 'flex', flexDirection: 'column', gap: '10px' },
      card: { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid rgba(128,128,128,0.22)', borderRadius: '12px', padding: '18px 20px 10px', background: 'rgba(128,128,128,0.03)' },
      heading: { fontSize: '15px', fontWeight: 650, margin: '0 0 4px', letterSpacing: '-0.01em' },
      title: { fontSize: '17px', fontWeight: 650, margin: '0 0 6px', letterSpacing: '-0.01em' },
      sub: { fontSize: '12px', fontWeight: 600, margin: 0 },
      row: { display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', gap: '16px', alignItems: 'start', padding: '12px 0' },
      label: { display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '6px' },
      labelTitle: { fontSize: '13px', fontWeight: 600 },
      hint: { opacity: 0.75, fontSize: '12px', lineHeight: 1.6 },
      /** A whole-page state (reading / failed / not served): a column, never a squeezed line. */
      state: { display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', padding: '4px 2px' },
      control: { minWidth: 0, paddingTop: '6px' },
      input: { width: '100%', minWidth: 0, boxSizing: 'border-box', height: '32px', padding: '0 10px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px' },
      narrow: { maxWidth: '220px' },
      statusOn: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: `1px solid ${STATUS_COLOR.done}`, background: 'var(--dsw-alias-state-success-tertiary, rgba(26,157,90,0.10))', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
      statusOff: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '4px', border: `1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))`, background: 'var(--dsw-alias-fill-l2, rgba(128,128,128,0.08))', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' },
      statusDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px', flex: 'none' },
      /**
       * A heads-up box. Both colours are tokens: the previous pair was a literal
       * `#f5c542` on `#fff7e6`, which reads as a bright light-mode block in a dark
       * composition and ignores a contrast pass. The `currentColor`/translucent fallbacks
       * keep the box visible on a theme that does not define the warn tokens.
       */
      warn: { border: '1px solid var(--dsw-alias-state-warn-primary, currentColor)', background: 'var(--dsw-alias-state-warn-tertiary, rgba(183,121,31,0.12))', borderRadius: '10px', padding: '9px 13px', fontSize: '12px', lineHeight: 1.6 },
      /** The same box when it wraps a whole section (a refused write): same tokens, roomier. */
      danger: { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid var(--dsw-alias-state-warn-primary, currentColor)', background: 'var(--dsw-alias-state-warn-tertiary, rgba(183,121,31,0.12))', borderRadius: '12px', padding: '16px 20px 8px' },
      chain: { display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid rgba(128,128,128,0.25)', paddingLeft: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px', paddingTop: '2px', paddingBottom: '2px' },
      roleCard: { display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.16)', borderRadius: '10px', padding: '12px 14px' },
      roleHead: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
      roleIndex: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(59,110,246,0.12)', color: '#3b6ef6', fontSize: '12px', fontWeight: 700, flex: 'none' },
      route: { display: 'flex', gap: '8px', alignItems: 'center' },
      switch: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', padding: '2px' },
      switchOn: { position: 'relative', width: '38px', height: '21px', borderRadius: '999px', border: 0, cursor: 'pointer', flex: 'none', background: '#2f9e44', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', padding: '2px' },
      /** The moving part. Without it the pill reads as a flat block, not a switch. */
      switchThumb: { width: '17px', height: '17px', borderRadius: '50%', background: 'var(--dsw-alias-label-inverse, #fff)', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'transform 120ms ease' },
      button: { minHeight: '32px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' },
      primary: { minHeight: '32px', padding: '5px 18px', borderRadius: '8px', border: '1px solid transparent', background: '#3b6ef6', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
      footer: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, padding: '12px 0', marginTop: '4px', borderTop: `1px solid ${HAIRLINE}`, background: 'var(--dsh-settings-footer-bg, rgba(128,128,128,0.12))', backdropFilter: 'blur(8px)' },
      step: { minWidth: '32px', minHeight: '32px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: '15px', lineHeight: 1 },
      groupTitle: { fontSize: '15px', fontWeight: 650, margin: '0 0 4px', letterSpacing: '-0.01em' },
      error: { color: STATUS_COLOR.failed },
      errorBox: { background: 'rgba(229,72,77,0.07)', border: '1px solid rgba(229,72,77,0.35)', borderRadius: '10px', padding: '10px 14px' },
      empty: { display: 'block', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '10px 12px', background: 'transparent' },
      ok: { color: STATUS_COLOR.done },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
      /**
       * One switch's cell in the composer tool row. Ambient, not a card: it must not
       * compete with the model selector it sits beside, so it is one muted line on the
       * theme's own surface tokens rather than a panel with a border of its own.
       */
      loopDock: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '2px 2px', fontSize: '12px', lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, inherit)' },
      loopLabel: { fontWeight: 600 },
      /**
       * The workflow switch's lamp. Filled when the session runs workflow work, a hollow
       * ring when it does not — the non-textual half of "off", so a grey pill is never
       * the only signal that the switch is off. Both are component-local inline styles:
       * no page-level rule and nothing that touches a neighbour in the row.
       */
      dockDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flex: 'none', background: STATUS_COLOR.done },
      dockDotOff: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: '2px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.7))', background: 'transparent' },
    }

    // One injected rule set for what inline styles cannot express: hairline
    // dividers between stacked rows (`.gw-row + .gw-row`), the disclosure
    // marker for the collapsed group, its inner indent, and the one thing no
    // inline style can be: a width-dependent rule.
    //
    // A field row is a two-column grid whose label column has a 200px minimum, so
    // below ~430px the pair cannot fit and the row used to push the card wider than
    // the panel — the page scrolled sideways instead of stacking. `!important` is
    // required here and nowhere else: the row's own layout is an inline style, which
    // only an `!important` rule in a stylesheet can override.
    function PageStyle() {
      return h('style', null, [
        '.gw-row + .gw-row { border-top: 1px solid rgba(128,128,128,0.14); }',
        '.gw-adv > summary { list-style: none; }',
        '.gw-adv > summary::-webkit-details-marker { display: none; }',
        '.gw-adv > summary::before { content: "▸"; display: inline-block; width: 1.2em; color: rgba(128,128,128,0.9); }',
        '.gw-adv[open] > summary::before { content: "▾"; }',
        '.gw-adv-body { padding-left: 2px; }',
        'input[data-field]:hover, select[data-field]:hover { border-color: rgba(59,110,246,0.55); }',
        'input[data-field]:focus, select[data-field]:focus { outline: 2px solid rgba(59,110,246,0.35); outline-offset: 0; border-color: #3b6ef6; }',
        'button[data-action]:hover:not(:disabled), button[data-add-route]:hover:not(:disabled), button[data-remove-route]:hover:not(:disabled) { border-color: rgba(59,110,246,0.6); }',
        'button[data-action]:focus-visible, button[data-add-route]:focus-visible, button[data-remove-route]:focus-visible, summary:focus-visible { outline: 2px solid rgba(59,110,246,0.5); outline-offset: 2px; }',
        'button:disabled, input:disabled, select:disabled { opacity: 0.55; cursor: not-allowed; }',
        'input[data-field]:disabled, select[data-field]:disabled { background: rgba(128,128,128,0.08); }',
        '@media (max-width: 560px) { .gw-row { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; } }',
        // The route chain is an inner scroll box; on a narrow window its own left rule
        // and padding are what push the card out, so they shrink first.
        '@media (max-width: 560px) { .gw-chain { padding-left: 8px !important; } }',
      ].join('\n'))
    }

