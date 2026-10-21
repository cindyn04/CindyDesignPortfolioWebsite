/* Clickable prototype with feedback annotations.

   Prototype.mount(element, {
     accent: '#2B63C7',
     frames: {                       // one or more device views; a toggle appears when there are 2+
       mobile:  { label: 'Mobile',  type: 'phone' },
       desktop: { label: 'Desktop', type: 'browser', url: 'example.org' },
     },                              // type: 'phone' | 'browser' | 'none' (image already has a bezel)
     start: 'home',                  // first screen id
     screens: [{
       id, label, frame,             // frame = key in `frames`, or '*' for every frame (live sites)
       img | site,                   // a screenshot, or a live URL shown in an iframe
       url,                          // text shown in the browser address bar
       compare: { img, label, note },// optional "before feedback" version of the screen
       pins: [{ x, y, title, feedback, source, change, where }],   // x / y in % of the screenshot
       hotspots: [{ x, y, w, h, to, toast, label }],               // to = screen id
     }],
   });
*/
(function () {
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  function mount(root, cfg) {
    const frames = cfg.frames || { main: { label: 'Prototype', type: 'none' } };
    const frameKeys = Object.keys(frames);
    cfg.screens.forEach(s => { if (!s.frame) s.frame = frameKeys[0]; });
    const byId = Object.fromEntries(cfg.screens.map(s => [s.id, s]));
    const state = {
      frame: byId[cfg.start] && byId[cfg.start].frame !== '*' ? byId[cfg.start].frame : frameKeys[0],
      screen: cfg.start || cfg.screens[0].id,
      pins: true,
      compare: false,
      active: null,
    };

    root.classList.add('pt');
    const stacked = cfg.layout === 'stack';  // notes below the screen + popovers on the pins
    root.classList.toggle('pt--stack', stacked);
    if (cfg.accent) root.style.setProperty('--pt-accent', cfg.accent);
    if (cfg.stageHeight) root.style.setProperty('--pt-stage-h', cfg.stageHeight + 'px');
    root.innerHTML = '';

    /* ── Bar ── */
    const bar = el('div', 'pt-bar');
    const tabs = el('div', 'pt-tabs');
    tabs.setAttribute('aria-label', 'Prototype screens');
    const controls = el('div', 'pt-controls');
    bar.append(tabs, controls);

    let seg = null;
    if (frameKeys.length > 1) {
      seg = el('div', 'pt-seg');
      seg.setAttribute('aria-label', 'Device');
      frameKeys.forEach(k => {
        const b = el('button', null, frames[k].label);
        b.type = 'button';
        b.dataset.frame = k;
        b.addEventListener('click', () => switchFrame(k));
        seg.append(b);
      });
      controls.append(seg);
    }

    const compareBtn = el('button', 'pt-toggle', '<span class="pt-switch"></span><span>Before feedback</span>');
    compareBtn.type = 'button';
    compareBtn.addEventListener('click', () => { state.compare = !state.compare; render(); });
    const pinsBtn = el('button', 'pt-toggle', '<span class="pt-switch"></span><span>Annotations</span>');
    pinsBtn.type = 'button';
    pinsBtn.addEventListener('click', () => { state.pins = !state.pins; render(false); });
    controls.append(compareBtn, pinsBtn);

    /* ── Body ── */
    const body = el('div', 'pt-body');
    const stage = el('div', 'pt-stage');
    const device = el('div', 'pt-device');
    const viewport = el('div', 'pt-viewport');
    const canvas = el('div', 'pt-canvas');
    viewport.append(canvas);
    const hint = el('p', 'pt-hint');
    const toast = el('div', 'pt-toast');
    toast.setAttribute('role', 'status');
    stage.append(device, hint, toast);

    const notes = el('aside', 'pt-notes');
    body.append(stage, notes);
    root.append(bar, body);

    canvas.addEventListener('mouseleave', () => { if (stacked) setActive(null); });
    canvas.addEventListener('click', e => {
      if (e.target.closest('.pt-pin, .pt-hot')) return;
      flashHotspots();
    });

    /* ── Helpers ── */
    const screensFor = f => cfg.screens.filter(s => s.frame === f || s.frame === '*');
    const current = () => byId[state.screen];

    function switchFrame(k) {
      if (k === state.frame) return;
      const cur = current();
      state.frame = k;
      // Stay on the matching screen in the other device if one exists (same `pair` or same label)
      const list = screensFor(k);
      const match = cur.frame === '*' ? cur
        : list.find(s => (cur.pair && s.pair === cur.pair) || s.label === cur.label) || list[0];
      go(match.id);
    }

    function go(id) {
      if (!byId[id]) return;
      state.screen = id;
      state.active = null;
      state.compare = false;
      render(true);
      flashHotspots(500);
    }

    let flashTimer;
    function flashHotspots(delay = 0) {
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        canvas.classList.add('is-flash');
        flashTimer = setTimeout(() => canvas.classList.remove('is-flash'), 900);
      }, delay);
    }

    let toastTimer;
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
    }

    function showPopover(i) {
      const old = canvas.querySelector('.pt-pop');
      if (old) old.remove();
      const p = i != null && (current().pins || [])[i];
      if (!stacked || !p || p.x == null || !state.pins || state.compare) return;
      const pop = el('div', 'pt-pop');
      pop.append(el('div', 'pt-pop-title', `<span>${i + 1}</span>${p.title}`));
      if (p.change) pop.append(el('div', 'pt-pop-body', p.change));
      pop.style.top = p.y + '%';
      if (p.x > 55) { pop.style.right = (100 - p.x) + '%'; pop.classList.add('is-left'); }
      else pop.style.left = p.x + '%';
      if (p.y > 60) pop.classList.add('is-up');
      canvas.append(pop);
    }

    function setActive(i, from) {
      state.active = i;
      canvas.querySelectorAll('.pt-pin').forEach((p, j) => p.classList.toggle('is-active', j === i));
      notes.querySelectorAll('.pt-note').forEach((n, j) => n.classList.toggle('is-active', j === i));
      showPopover(i);
      if (i == null) return;
      if (from === 'pin') {
        const item = notes.querySelectorAll('.pt-note')[i];
        const list = notes.querySelector('.pt-list');
        if (item && list && list.scrollHeight > list.clientHeight) {
          list.scrollTo({ top: item.offsetTop - list.offsetTop - 8, behavior: 'smooth' });
        }
      }
      if (from === 'note') {
        const pin = canvas.querySelectorAll('.pt-pin')[i];
        if (pin && viewport.scrollHeight > viewport.clientHeight) {
          viewport.scrollTo({ top: Math.max(0, pin.offsetTop - viewport.clientHeight / 3), behavior: 'smooth' });
        }
      }
    }

    /* Live sites render at a fixed "device" width and get scaled down to fit */
    let iframe = null;
    function fitIframe() {
      if (!iframe) return;
      const f = frames[state.frame];
      const virtualW = f.type === 'phone' ? 390 : 1280;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      const scale = Math.min(1, w / virtualW);
      iframe.style.width = virtualW + 'px';
      iframe.style.height = (h / scale) + 'px';
      iframe.style.transform = `scale(${scale})`;
    }
    if ('ResizeObserver' in window) new ResizeObserver(fitIframe).observe(viewport);

    /* ── Render ── */
    function render(screenChanged) {
      const s = current();
      const f = frames[state.frame];
      const comparing = state.compare && !!s.compare;

      root.classList.toggle('no-pins', !state.pins);
      root.classList.toggle('is-compare', comparing);

      // Tabs
      tabs.innerHTML = '';
      screensFor(state.frame).forEach(sc => {
        const b = el('button', 'pt-tab', sc.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', sc.id === s.id);
        b.addEventListener('click', () => go(sc.id));
        tabs.append(b);
      });
      if (seg) seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.frame === state.frame));
      compareBtn.hidden = !s.compare;
      compareBtn.setAttribute('aria-pressed', comparing);
      pinsBtn.hidden = !(s.pins || []).some(p => p.x != null);
      pinsBtn.setAttribute('aria-pressed', state.pins);

      // Device frame
      const type = comparing ? 'none' : (s.type || f.type);
      device.className = 'pt-device pt-device--' + type;
      device.innerHTML = '';
      if (type === 'browser') {
        const bb = el('div', 'pt-browser-bar', '<i></i><i></i><i></i>');
        bb.append(el('span', 'pt-browser-url', s.url || f.url || ''));
        device.append(bb);
      }
      if (type === 'none' && cfg.maxWidth) device.style.setProperty('--pt-max', cfg.maxWidth + 'px');
      device.append(viewport);

      if (screenChanged !== false) buildCanvas(s, comparing);

      // Hint
      hint.innerHTML = comparing
        ? `<b>Showing the earlier version</b> that received the feedback. Turn off “Before feedback” to see the fixes.`
        : s.site
          ? `This is the <b>live coded redesign</b> — click and scroll inside the frame. Notes on the right point to where each change lives.`
          : `<b>Click around the screen</b> — tappable areas light up. Numbered pins mark changes made in response to feedback.`;

      renderNotes(s, comparing);
    }

    function buildCanvas(s, comparing) {
      canvas.innerHTML = '';
      canvas.className = 'pt-canvas';
      iframe = null;
      viewport.scrollTop = 0;

      if (s.site && !comparing) {
        canvas.classList.add('pt-canvas--iframe');
        iframe = el('iframe');
        iframe.src = s.site;
        iframe.title = s.label + ' — live site';
        iframe.loading = 'lazy';
        canvas.append(iframe);
        requestAnimationFrame(fitIframe);
        return;
      }

      const img = el('img');
      img.alt = comparing ? (s.compare.alt || s.compare.label) : (s.alt || s.label);
      img.decoding = 'async';
      canvas.classList.add('is-loading');
      img.addEventListener('load', () => canvas.classList.remove('is-loading'));
      img.addEventListener('error', () => canvas.classList.remove('is-loading'));
      img.src = comparing ? s.compare.img : s.img;
      canvas.append(img);
      if (comparing) return;

      (s.hotspots || []).forEach(h => {
        const b = el('button', 'pt-hot');
        b.type = 'button';
        Object.assign(b.style, { left: h.x + '%', top: h.y + '%', width: h.w + '%', height: h.h + '%' });
        const target = h.to && byId[h.to];
        b.setAttribute('aria-label', h.label || (target ? 'Go to ' + target.label : h.toast || 'Not linked'));
        b.addEventListener('click', () => {
          if (target) {
            if (target.frame !== '*' && target.frame !== state.frame) state.frame = target.frame;
            go(h.to);
          } else showToast(h.toast || 'Not linked in this prototype');
        });
        canvas.append(b);
      });

      (s.pins || []).forEach((p, i) => {
        if (p.x == null) return;
        const b = el('button', 'pt-pin', String(i + 1));
        b.type = 'button';
        b.style.left = p.x + '%';
        b.style.top = p.y + '%';
        b.setAttribute('aria-label', `Annotation ${i + 1}: ${p.title}`);
        b.addEventListener('click', () => setActive(i, 'pin'));
        b.addEventListener('mouseenter', () => setActive(i));
        canvas.append(b);
      });
    }

    function renderNotes(s, comparing) {
      const pins = s.pins || [];
      notes.innerHTML = '';
      const head = el('div', 'pt-notes-head');
      head.append(
        el('div', 'pt-notes-kicker', cfg.kicker || 'Feedback → design change'),
        el('div', 'pt-notes-title', comparing ? s.compare.label : s.label),
      );
      if (s.summary) head.append(el('div', 'pt-notes-sub', s.summary));
      notes.append(head);

      if (comparing && s.compare.note) notes.append(el('div', 'pt-compare-banner', s.compare.note));

      if (!pins.length) {
        notes.append(el('div', 'pt-empty', s.empty || 'Use this screen to move through the flow.'));
      } else {
        const list = el('ol', 'pt-list');
        pins.forEach((p, i) => {
          const li = el('li', 'pt-note');
          li.tabIndex = 0;
          li.append(el('span', 'pt-note-num', String(i + 1)));
          const txt = el('div');
          txt.append(el('div', 'pt-note-title', p.title));
          if (p.feedback) {
            const fb = el('div', 'pt-note-fb', `<span class="pt-note-label">Feedback</span>${p.feedback}`);
            if (p.source) fb.append(el('span', 'pt-note-src', p.source));
            txt.append(fb);
          }
          if (p.change) txt.append(el('div', 'pt-note-change', `<b>Change →</b> ${p.change}`));
          if (p.where) txt.append(el('div', 'pt-note-where', `Where to look: ${p.where}`));
          li.append(txt);
          li.addEventListener('click', () => setActive(i, 'note'));
          li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i, 'note'); } });
          li.addEventListener('mouseenter', () => setActive(i));
          list.append(li);
        });
        notes.append(list);
      }

      if (s.site) {
        const foot = el('div', 'pt-notes-foot');
        const a = el('a', null, 'Open this page in a new tab ↗');
        a.href = s.site; a.target = '_blank'; a.rel = 'noopener noreferrer';
        foot.append(a);
        notes.append(foot);
      }
      if (state.active != null) setActive(state.active);
    }

    render(true);

    // On small screens, open on the phone view when there is one
    const phoneKey = frameKeys.find(k => frames[k].type === 'phone');
    if (phoneKey && window.matchMedia('(max-width: 600px)').matches) switchFrame(phoneKey);
  }

  window.Prototype = { mount };
})();
