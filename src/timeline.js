/* The timeline, laid out like Flash / Adobe Animate: a ruler of frame numbers with the red playhead
   (and a held action's loop and the onion skin markers), one layer per part, groups as folders with
   their parts inside, folders for the face, sounds and effects, and a frame grid in every layer.

   Frames: a filled dot is a keyframe, a hollow dot a blank keyframe (the layer shows nothing from
   there: opacity 0, or a face track handed back to EasyTuber). The frames after a keyframe are grey
   while nothing changes, and blue with an arrow while they tween to the next keyframe. A layer's
   ≡ button opens its motion rows: one row per property (X, Y, Turn…), like Animate's motion editor.

   Mouse: click a frame to select it (and move the playhead there); drag across frames and layers to
   select a block; Shift+click extends the selection; double-click selects a whole span. Drag a
   keyframe, or the selected frames, to move them (Alt+drag copies). Right-click: tweens, eases and
   the frame commands. The ruler scrubs. Layer names: click to select (Ctrl+click several); the eye
   hides a layer in the studio, the lock keeps it from being picked on the stage (Alt+click: only
   this one); double-click a group's name to rename it.

   Keys (app.js): F5 / Shift+F5 insert / remove frames, F6 / Shift+F6 insert / clear keyframes, F7
   blank keyframe, Ctrl+Alt+C / X / V / A copy / cut / paste / select all frames, Alt+Backspace clear.

   View: drag the strip along the top edge to make the timeline taller or shorter (double-click: the
   default height). Ctrl+wheel (or a pinch, the - + buttons, - =, or the frame size menu) zooms; the
   list then scrolls sideways (Shift+wheel, or the wheel over the ruler). */
(function (S) {
  const PT = window.PT;
  const el = PT.el;
  const Mdl = () => S.Model;
  const LABEL_W = 236, MARGIN_R = 12;
  const keyId = (part, prop, t) => `${part}|${prop}|${t}`;
  const parseKey = (s) => { const [part, prop, t] = s.split('|'); return { part, prop, t: +t }; };
  // eyes / mouth / expression keys are selected like part keys, as 'state:<track>|v|<t>'
  const stateKey = (name, t) => keyId('state:' + name, 'v', t);
  const isState = (k) => k.part.startsWith('state:');
  const FW_MAX = 40;                              // zoomed all the way in: a frame is 40 px wide
  const SIZES = [['Tiny', 4], ['Small', 7], ['Normal', 10], ['Medium', 15], ['Large', 22]];   // Flash's frame view menu
  const NUM_STEPS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];
  const HEIGHT_DEFAULT = 300, HEIGHT_MIN = 110;   // the timeline's height (#app's last grid row)
  const ABOVE = 48 + 40, STAGE_MIN = 140;         // top bar + transport, and the least stage left
  const HEIGHT_STORE = 'studio.timelineHeight';
  const SELECTABLE = new Set(['node', 'prop', 'state', 'sounds', 'front', 'fx']);
  const ICON = {
    eye: '<svg viewBox="0 0 16 16"><path d="M1 8s2.6-4.6 7-4.6S15 8 15 8s-2.6 4.6-7 4.6S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.4" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    folder: '<svg viewBox="0 0 16 16"><path d="M1.5 3.5h4.8l1.5 1.8h6.7v7.9h-13z" fill="currentColor"/></svg>',
    layer: '<svg viewBox="0 0 16 16"><path d="M3.5 2h6l3 3v9h-9z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    group: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.6"/><rect x="4" y="4" width="5" height="5" fill="currentColor"/><rect x="8" y="8" width="4.5" height="4.5" fill="currentColor" opacity=".6"/></svg>',
    onion: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="8" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/><rect x="6.5" y="3" width="8" height="10" rx="1" fill="currentColor" opacity=".9"/></svg>',
    center: '<svg viewBox="0 0 16 16"><path d="M8 1v14M3 5l-2 3 2 3M13 5l2 3-2 3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const icon = (name, cls = '') => { const s = el('span', { class: 'ico ' + cls }); s.innerHTML = ICON[name]; return s; };

  const Timeline = {
    root: null, head: null, body: null, foot: null, line: null, headLine: null,
    closed: {},        // folders closed: group ids and 'folder:face' / 'folder:layers' / 'folder:fx'
    motion: {},        // layers showing their motion rows (one per property)
    zoom: 1, fitFw: 10, fw: 10, cells: 50,
    list: [],          // the selectable rows, top to bottom
    rowEls: [],        // { row, el } for every row shown
    anchor: null,      // where the frame selection started { id, f }

    init(root) {
      this.root = root;
      this.grip = el('div', { class: 'tl-grip', title: 'Drag to resize the timeline (double-click: default height)' });
      this.head = el('div', { class: 'tl-head' });
      this.body = el('div', { class: 'tl-body' });
      this.foot = el('div', { class: 'tl-foot' });
      this.line = el('div', { class: 'tl-playhead' });
      root.append(this.head, this.body, this.foot, this.line, this.grip);
      // a change of height alone moves nothing sideways: only a new width (or scrollbar) rebuilds the rows
      new ResizeObserver(() => {
        if (root.clientWidth !== this.lastW || this.body.offsetWidth - this.body.clientWidth !== this.lastSbw) this.render();
        else this.placeLine();
      }).observe(root);
      this.body.addEventListener('scroll', () => { this.head.scrollLeft = this.body.scrollLeft; this.placeLine(); });
      root.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      this.initHeight();
    },

    /* ---------- height: drag the grip on the top edge ---------- */
    initHeight() {
      const app = document.getElementById('app');
      let want = HEIGHT_DEFAULT;
      try { want = +localStorage.getItem(HEIGHT_STORE) || HEIGHT_DEFAULT; } catch (e) { /* no storage */ }
      // the height asked for is kept; what shows is clamped to the window, so a bigger window gets it back
      const apply = () => {
        const h = Math.round(Math.max(HEIGHT_MIN, Math.min(window.innerHeight - ABOVE - STAGE_MIN, want)));
        app.style.setProperty('--tl-h', h + 'px');
        return h;
      };
      const save = () => { try { localStorage.setItem(HEIGHT_STORE, String(want)); } catch (e) { /* no storage */ } };
      apply();
      window.addEventListener('resize', apply);
      this.grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const y0 = e.clientY, h0 = apply();
        document.body.classList.add('tl-resizing');
        const move = (ev) => { want = h0 - (ev.clientY - y0); want = apply(); };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.classList.remove('tl-resizing');
          save();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      this.grip.addEventListener('dblclick', () => { want = HEIGHT_DEFAULT; apply(); save(); });
    },

    /* ---------- frames and pixels ---------- */
    get p() { return S.App.project; },
    get n() { return Mdl().frameCount(this.p); },                  // frames in the action
    last() { return this.n - 1; },
    F(t) { return Mdl().toFrame(this.p, t); },
    T(f) { return Mdl().toMs(this.p, f); },
    xf(f) { return f * this.fw; },                                 // a frame's left edge
    x(t) { return ((t * this.p.fps) / 1000) * this.fw + this.fw / 2; },   // a time, in the middle of its frame
    viewW() { return Math.max(1, this.body.clientWidth - LABEL_W); },     // the lane area showing
    frameAt(clientX, clamp = true) {
      const r = this.root.getBoundingClientRect();
      const f = Math.floor((clientX - r.left - LABEL_W + this.body.scrollLeft) / this.fw);
      return clamp ? Math.max(0, Math.min(this.cells - 1, f)) : f;
    },

    /* ---------- zoom: from the whole action fitting (1) up to FW_MAX px a frame ---------- */
    maxZoom() { return Math.max(1, FW_MAX / this.fitFw); },
    // zoom keeping the frame under clientX where it is (no clientX: the playhead if it shows, else the middle)
    setZoom(z, clientX) {
      z = Math.max(1, Math.min(this.maxZoom(), z));
      if (z < 1.01) z = 1;
      if (z === this.zoom) return;
      const view = this.viewW(), sl = this.body.scrollLeft;
      let off;
      if (clientX != null) off = Math.max(0, Math.min(view, clientX - this.root.getBoundingClientRect().left - LABEL_W));
      else {
        const px = this.x(S.Preview.timelineMs()) - sl;
        off = px >= 0 && px <= view ? px : view / 2;
      }
      const at = (off + sl) / this.fw;   // in frames
      this.zoom = z;
      this.render();
      this.body.scrollLeft = at * this.fw - off;
      this.head.scrollLeft = this.body.scrollLeft;
      this.placeLine();
    },
    zoomBy(f, clientX) { this.setZoom(this.zoom * f, clientX); },
    setFrameWidth(px) { this.setZoom(px / this.fitFw); },

    wheel(e) {
      if (e.ctrlKey || e.metaKey) {   // Ctrl+wheel, or a touchpad pinch
        e.preventDefault();
        this.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX);
      } else if (this.head.contains(e.target) && !e.shiftKey && e.deltaY) {
        e.preventDefault();             // the wheel over the ruler scrolls through time
        this.body.scrollLeft += e.deltaY;
      }
    },
    centerFrame() {
      const x = this.x(S.Preview.timelineMs());
      this.body.scrollLeft = Math.max(0, x - this.viewW() / 2);
      this.head.scrollLeft = this.body.scrollLeft;
      this.placeLine();
    },

    /* ---------- dragging (window listeners: rows are rebuilt while dragging) ---------- */
    track(e, onMove, onUp) {
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
        moved = true;
        onMove(ev);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (onUp) onUp(ev, moved);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    // while dragging near an edge, the list scrolls
    autoScroll(getLast, redraw) {
      return setInterval(() => {
        const last = getLast();
        if (!last) return;
        const b = this.body.getBoundingClientRect();
        const dy = last.clientY < b.top + 14 ? -12 : last.clientY > b.bottom - 14 ? 12 : 0;
        const left = b.left + LABEL_W, right = b.left + this.body.clientWidth;
        const dx = last.clientX < left + 14 ? -16 : last.clientX > right - 14 ? 16 : 0;
        const before = [this.body.scrollTop, this.body.scrollLeft];
        if (dy) this.body.scrollTop += dy;
        if (dx) this.body.scrollLeft += dx;
        if (before[0] !== this.body.scrollTop || before[1] !== this.body.scrollLeft) redraw(last);
      }, 30);
    },

    scrub(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      S.App.pause();
      const go = (ev) => S.App.seekFrame(this.frameAt(ev.clientX));
      go(e);
      this.track(e, go);
    },

    /* ---------- the layers ---------- */
    openFolder(id) { delete this.closed[id]; },

    // the parts and groups at the top (Flash order: the layer drawn in front is at the top)
    layerTree() {
      const p = this.p, M = Mdl(), rig = S.Preview.rig;
      const order = rig && rig.order ? rig.order : PT.DEFAULT_ORDER;
      const parts = PT.PARTS.map((d) => d.id);
      const more = (id) => { if (!M.isGroup(id) && !parts.includes(id)) parts.push(id); };
      Object.keys(p.tracks).forEach(more);
      for (const g of p.groups) g.members.forEach(more);
      const front = (id) => order.indexOf(id);
      const score = (id) => (M.isGroup(id) ? Math.max(-1, ...M.groupParts(p, id).map(front)) : front(id));
      const sortFront = (ids) => ids.slice().sort((a, b) => score(b) - score(a));
      const top = sortFront([...p.groups.filter((g) => !M.groupOf(p, g.id)).map((g) => g.id), ...parts.filter((id) => !M.groupOf(p, id))]);
      return { top, sortFront };
    },

    // the rows, top to bottom: { id, kind, node, prop, name, depth, label, title }
    buildRows() {
      const p = this.p, M = Mdl(), out = [];
      const { top, sortFront } = this.layerTree();
      const nodeRows = (id, depth) => {
        const group = M.isGroup(id), def = PT.PART[id], g = group ? M.groupById(p, id) : null;
        out.push({ id, kind: 'node', node: id, depth, group, label: group ? g.name : def ? PT.partName(def) : `${id} (not in this avatar)`, title: group ? `${g.name}: ${M.groupParts(p, id).map((x) => (PT.PART[x] ? PT.partName(PT.PART[x]) : x)).join(', ')}` : def && def.hint ? def.hint : id });
        if (this.motion[id]) {
          const tr = p.tracks[id] || {};
          const props = group ? M.FREE_PROPS : [...M.FREE_PROPS, ...M.JOINT_PROPS.filter((pr) => tr[pr] || S.Tools.space === 'joint')];
          for (const prop of props) out.push({ id: `${id}|${prop}`, kind: 'prop', node: id, prop, depth: depth + 1, label: M.PROP_LABEL[prop] });
        }
        if (group && !this.closed[id]) for (const m of sortFront(g.members)) nodeRows(m, depth + 1);
      };
      out.push({ id: 'folder:layers', kind: 'folder', label: 'Layers', depth: 0, folder: 'layers', title: 'The avatar\'s parts, front to back, and your groups' });
      if (!this.closed['folder:layers']) for (const id of top) nodeRows(id, 1);
      out.push({ id: 'folder:face', kind: 'folder', label: 'Face', depth: 0 });
      if (!this.closed['folder:face']) {
        const labels = { eyes: 'Eyes', mouth: 'Mouth', expression: 'Expression' };
        for (const name of M.STATE_TRACKS) out.push({ id: 'state:' + name, kind: 'state', name, depth: 1, label: labels[name], title: name === 'expression' ? 'One of the avatar\'s expressions while the action plays' : `Override the ${name} picture` });
      }
      out.push({ id: 'folder:sound', kind: 'folder', label: 'Layers and sound', depth: 0 });
      if (!this.closed['folder:sound']) {
        out.push({ id: 'front', kind: 'front', depth: 1, label: 'Parts in front', title: 'Parts drawn on top of the rest while the bar is on (an arm across the face)' });
        out.push({ id: 'sounds', kind: 'sounds', depth: 1, label: 'Sounds' });
      }
      out.push({ id: 'folder:fx', kind: 'folder', label: 'Effects', depth: 0 });
      if (!this.closed['folder:fx']) {
        for (const fx of p.effects) {
          const preset = S.Effects.BY_ID[fx.preset];
          out.push({ id: 'fx:' + fx.id, kind: 'fx', fx: fx.id, depth: 1, label: fx.label, title: preset ? preset.label : fx.preset });
        }
        if (!p.effects.length) out.push({ id: 'fx:none', kind: 'empty', depth: 1, label: 'Add one in the Inspector', hint: 'sparkles, music notes, captions, pictures…' });
      }
      return out;
    },

    /* What a row holds: its keyframes { f, ids, blank, label } and spans { f0, f1, kind: tween |
       static | empty, label }. */
    rowData(row) {
      const p = this.p, M = Mdl(), byF = new Map();
      const add = (f, id) => { let k = byF.get(f); if (!k) byF.set(f, (k = { f, ids: [] })); k.ids.push(id); return k; };
      let tracks = null;
      if (row.kind === 'node' || row.kind === 'prop') {
        const tr = p.tracks[row.node] || {};
        tracks = (row.kind === 'prop' ? [row.prop] : Object.keys(tr)).filter((pr) => tr[pr]).map((pr) => [pr, tr[pr]]);
        for (const [prop, keys] of tracks) for (const k of keys) add(this.F(k.t), keyId(row.node, prop, k.t));
      } else if (row.kind === 'state') {
        for (const k of p.states[row.name]) { const e = add(this.F(k.t), stateKey(row.name, k.t)); e.label = k.v || 'normal'; e.blank = !k.v; }
      } else return { keys: [], spans: [] };
      const keys = [...byF.values()].sort((a, b) => a.f - b.f);
      const last = this.last(), spans = [];
      keys.forEach((k, i) => {
        const next = keys[i + 1];
        let tween = false;
        if (tracks) {
          const t = this.T(k.f);
          // blank: nothing shows on this frame (faded out)
          if (row.kind === 'node' || row.prop === 'opacity') k.blank = M.valueAt(p, row.node, 'opacity', t) <= 0.001;
          // a tween: some property keyed here eases on to a later key
          for (const [, list] of tracks) {
            const j = list.findIndex((x) => this.F(x.t) === k.f);
            if (j >= 0 && j < list.length - 1 && list[j].ease !== 'step') { tween = true; break; }
          }
        }
        const f1 = next ? next.f - 1 : last;
        if (f1 >= k.f) spans.push({ f0: k.f, f1, kind: tween && next ? 'tween' : k.blank ? 'empty' : 'static', label: k.label, end: !next });
      });
      return { keys, spans };
    },

    /* ---------- building ---------- */
    render() {
      if (!S.App.project) return;
      const sbw = this.body.offsetWidth - this.body.clientWidth;
      this.lastW = this.root.clientWidth; this.lastSbw = sbw;
      const n = this.n;
      this.fitFw = Math.max(0.5, (Math.max(50, this.root.clientWidth - LABEL_W - MARGIN_R - sbw)) / (n + 2));
      this.zoom = Math.min(this.zoom, this.maxZoom());
      this.fw = this.fitFw * this.zoom;
      // frames past the end are shown too, so F5 / F6 there can make the action longer (as in Flash)
      const maxCells = Math.floor((Mdl().MAX_MS * this.p.fps) / 1000) + 1;
      this.cells = Math.min(maxCells, Math.max(n + 2, n + Math.ceil(n * 0.25), Math.ceil(this.viewW() / this.fw) + 1));
      const laneW = this.cells * this.fw;
      this.root.style.setProperty('--lane-w', laneW + 'px');
      this.root.style.setProperty('--fw', this.fw + 'px');
      this.root.classList.toggle('tl-tiny', this.fw < 5);
      this.renderHead(sbw);
      this.renderFoot();
      const top = this.body.scrollTop, left = this.body.scrollLeft;
      const rows = this.buildRows();
      this.list = rows.filter((r) => SELECTABLE.has(r.kind));
      this.rowEls = rows.map((r) => ({ row: r, el: this.rowEl(r) }));
      this.body.replaceChildren(...this.rowEls.map((x) => x.el));
      this.body.scrollTop = top;
      this.body.scrollLeft = left;
      this.head.scrollLeft = this.body.scrollLeft;
      this.placeLine();
    },

    renderHead(sbw) {
      const p = this.p, n = this.n;
      const lane = el('div', { class: 'tl-lane tl-ruler', onpointerdown: (e) => this.scrub(e) });
      const step = NUM_STEPS.find((s) => s * this.fw >= 30) || NUM_STEPS[NUM_STEPS.length - 1];
      // frame numbers: 1, then every step (5, 10, 15… like Flash)
      for (let f = 0; f < this.cells; f++) {
        const num = f + 1;
        if (num !== 1 && num % step) continue;
        lane.append(el('div', { class: 'tl-num' + (f >= n ? ' past' : ''), style: { left: this.xf(f) + 'px', width: Math.max(this.fw, 1) + 'px' } }, el('span', {}, String(num))));
      }
      // seconds, when there is room for them
      const secPx = this.fw * p.fps;
      const secStep = [1, 2, 5, 10, 20, 30].find((s) => s * secPx >= 46);
      if (secStep) for (let s = secStep; this.T(0) + s * 1000 <= (this.cells - 1) * 1000 / p.fps; s += secStep) lane.append(el('div', { class: 'tl-sec', style: { left: this.x(s * 1000) + 'px' } }, `${s}s`));
      lane.append(el('div', { class: 'tl-end', style: { left: this.xf(n) + 'px' }, title: 'The end of the action' }));
      if (p.hold) lane.append(this.loopBar());
      if (S.Preview.onion.on) lane.append(this.onionBar());
      this.headNum = el('span', {});
      this.headLine = el('div', { class: 'tl-playhead head' }, this.headNum);
      lane.append(this.headLine);
      const allHidden = S.App.layerIds().every((x) => S.App.hidden.has(x)), allLocked = S.App.layerIds().every((x) => S.App.locked.has(x));
      const label = el('div', { class: 'tl-label tl-cols' },
        el('span', { class: 'name' }, 'Layers'),
        el('button', { class: 'tl-ico-btn', title: 'Motion rows: open every layer that has keys', onclick: () => this.allMotion() }, '≡'),
        el('span', { class: 'addkey-sp' }),
        el('span', { class: 'tl-col eye' + (allHidden ? ' on' : ''), title: 'Show / hide every layer', onclick: () => S.App.toggleAllLayers('hidden') }, icon('eye')),
        el('span', { class: 'tl-col lock' + (allLocked ? ' on' : ''), title: 'Lock / unlock every layer', onclick: () => S.App.toggleAllLayers('locked') }, icon('lock')));
      // the head scrolls sideways with the list (kept in step in init): a row's width plus the list's scrollbar
      this.head.replaceChildren(label, lane, el('div', { style: { flex: 'none', width: sbw + 'px' } }));
    },

    // the bar along the bottom: groups, onion skin, auto keyframe, frame / fps / time, zoom
    renderFoot() {
      const P = S.Preview, p = this.p, max = this.maxZoom();
      const sel = S.App.selectedParts();
      // the onion skin's frames either side; markers dragged apart on the ruler show as "before / after"
      const same = P.onion.before === P.onion.after;
      const counts = [...new Set([1, 2, 3, 4, 5, 10, ...(same ? [P.onion.before] : [])])].sort((a, b) => a - b);
      const onionSel = el('select', { title: 'How many frames the onion skin shows before and after the playhead (or drag its markers on the ruler)' },
        same ? null : el('option', { value: 'x' }, `${P.onion.before} / ${P.onion.after}`),
        counts.map((v) => el('option', { value: v }, `±${v}`)));
      onionSel.value = same ? String(P.onion.before) : 'x';
      onionSel.addEventListener('change', () => { if (onionSel.value !== 'x') { P.onion.before = P.onion.after = +onionSel.value; this.render(); } });
      const sizeBtn = el('button', { class: 'small', title: 'Frame size (Flash\'s frame view menu)' }, '▤');
      sizeBtn.addEventListener('click', (e) => {
        const r = sizeBtn.getBoundingClientRect();
        S.App.menu(r.left, r.top - 8, [{ label: 'Frame size' }, ...SIZES.map(([name, px]) => ({ text: name, cur: Math.abs(this.fw - px) < 0.5, run: () => this.setFrameWidth(px) })), { sep: true }, { text: 'Fit the whole action', cur: this.zoom === 1, run: () => this.setZoom(1) }]);
        e.stopPropagation();
      });
      const auto = el('label', { class: 'check', title: 'On: a change on the stage or in the Inspector sets a key at the playhead. Off (Flash\'s classic tweens): it changes the keyframe the playhead\'s frame belongs to.' },
        el('input', { type: 'checkbox', checked: S.App.autoKey, onchange: (e) => { S.App.autoKey = e.target.checked; } }), 'Auto keyframe');
      const f = S.App.frame();
      this.footFrame = el('span', { class: 'tl-stat', title: 'The current frame' }, String(f + 1));
      this.footTime = el('span', { class: 'tl-stat', title: 'Time at the playhead' }, `${(S.App.playhead() / 1000).toFixed(2)}s`);
      this.foot.replaceChildren(
        el('div', { class: 'tl-foot-l' },
          el('button', { class: 'small', title: 'Group the selected parts (Ctrl+G)', disabled: !sel.length, onclick: () => S.App.groupSelection() }, icon('group'), ' Group'),
          el('button', { class: 'small', title: 'Ungroup the selected group (Ctrl+Shift+G)', disabled: !sel.some((id) => Mdl().isGroup(id)), onclick: () => S.App.ungroupSelection() }, 'Ungroup')),
        el('div', { class: 'tl-foot-r' },
          el('button', { class: 'small tl-ico-btn', title: 'Center the frame at the playhead', onclick: () => this.centerFrame() }, icon('center')),
          el('button', { class: 'small tl-ico-btn' + (P.onion.on ? ' on' : ''), title: 'Onion skin: show the frames before (blue) and after (green) the playhead, faintly', onclick: () => { P.onion.on = !P.onion.on; this.render(); } }, icon('onion')),
          onionSel,
          auto,
          el('span', { class: 'spacer' }),
          this.footFrame,
          el('select', { class: 'tl-fps', title: 'Frame rate (frames a second)', onchange: (e) => { document.getElementById('fFps').value = e.target.value; document.getElementById('fFps').dispatchEvent(new Event('change')); } },
            Mdl().FPS_OPTIONS.map((v) => el('option', { value: v, selected: v === p.fps }, `${v} fps`))),
          this.footTime,
          el('span', { class: 'tl-zoom' },
            el('button', { class: 'small', title: 'Zoom out (-, Ctrl+wheel)', disabled: this.zoom <= 1, onclick: () => this.zoomBy(1 / 1.5) }, '−'),
            el('button', { class: 'small', title: 'Zoom in (=, Ctrl+wheel)', disabled: this.zoom >= max, onclick: () => this.zoomBy(1.5) }, '+'),
            el('button', { class: 'small', title: 'Show the whole action', disabled: this.zoom <= 1, onclick: () => this.setZoom(1) }, '↔'),
            sizeBtn)));
    },

    loopBar() {
      const p = this.p, a = this.F(p.loop.from), b = this.F(p.loop.to);
      const bar = el('div', { class: 'tl-loop', title: `Held: loops frames ${a + 1}-${b + 1} until it is turned off`, style: { left: this.xf(a) + this.fw / 2 + 'px', width: this.xf(b - a) + 'px' } },
        el('div', { class: 'h l' }), el('div', { class: 'h r' }));
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const mode = e.target.classList.contains('l') ? 'from' : e.target.classList.contains('r') ? 'to' : 'both';
        const f0 = this.frameAt(e.clientX);
        this.track(e, (ev) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          const df = this.frameAt(ev.clientX) - f0;
          S.App.dragMove((q) => {
            const last = Mdl().frameCount(q) - 1;
            let fa = a, fb = b;
            if (mode !== 'to') fa = a + df;
            if (mode !== 'from') fb = b + df;
            if (mode === 'both') { const len = b - a; fa = Math.max(0, Math.min(last - len, fa)); fb = fa + len; }
            fa = Math.max(0, Math.min(fa, last)); fb = Math.max(0, Math.min(fb, last));
            const from = Mdl().toMs(q, fa), to = Mdl().toMs(q, fb);
            if (to - from >= 50) q.loop = { from, to };
          });
        }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } });
      });
      return bar;
    },

    // the onion skin markers: drag either end to show more or fewer frames
    onionBar() {
      const o = S.Preview.onion, f = S.App.frame();
      const a = Math.max(0, f - o.before), b = Math.min(this.last(), f + o.after);
      const bar = el('div', { class: 'tl-onion', title: 'Onion skin: drag an end to show more or fewer frames', style: { left: this.xf(a) + 'px', width: this.xf(b - a + 1) + 'px' } },
        el('div', { class: 'h l' }), el('div', { class: 'h r' }));
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const side = e.target.classList.contains('l') ? 'before' : e.target.classList.contains('r') ? 'after' : null;
        if (!side) { this.scrub(e); return; }
        this.track(e, (ev) => {
          const at = this.frameAt(ev.clientX), cur = S.App.frame();
          o[side] = Math.max(0, Math.min(30, side === 'before' ? cur - at : at - cur));
          this.render();
        });
      });
      return bar;
    },

    placeLine() {
      if (!this.headLine) return;
      const t = S.Preview.timelineMs(), f = Math.max(0, Math.min(this.last(), Math.round((t * this.p.fps) / 1000)));
      const x = this.xf(f) + this.fw / 2, b = this.body, view = this.viewW();
      this.headLine.style.left = this.xf(f) + 'px';
      this.headLine.style.width = Math.max(2, this.fw) + 'px';
      this.headNum.textContent = String(f + 1);
      if (this.footFrame) { this.footFrame.textContent = String(f + 1); this.footTime.textContent = `${(t / 1000).toFixed(2)}s`; }
      // playing: the view pages along to keep the playhead in sight
      if (S.Preview.playing && (x < b.scrollLeft || x > b.scrollLeft + view - MARGIN_R)) {
        b.scrollLeft = x - view * 0.1;
        this.head.scrollLeft = b.scrollLeft;
      }
      const vx = x - b.scrollLeft;
      this.line.hidden = vx < -1 || vx > view;   // scrolled out of sight (never drawn over the names)
      this.line.style.left = LABEL_W + vx + 'px';
      this.line.style.top = this.head.offsetHeight + 'px';
      this.line.style.bottom = this.foot.offsetHeight + 'px';
      // the onion skin markers follow the playhead
      if (S.Preview.onion.on && this.onionFrame !== f) { this.onionFrame = f; const ob = this.head.querySelector('.tl-onion'); if (ob) ob.replaceWith(this.onionBar()); }
    },
    setPlayhead() { this.placeLine(); },

    // open the motion rows of every layer with keys, or close them all
    allMotion() {
      const keyed = Object.keys(this.p.tracks);
      const open = keyed.length && keyed.every((id) => this.motion[id]);
      this.motion = {};
      if (!open) for (const id of keyed) this.motion[id] = true;
      this.render();
    },

    /* ---------- one row ---------- */
    rowEl(row) {
      const sel = S.App.sel, p = this.p, M = Mdl();
      const pad = { paddingLeft: 6 + row.depth * 12 + 'px' };
      if (row.kind === 'folder') {
        const open = !this.closed[row.id];
        const lab = el('div', { class: 'tl-label', style: pad, title: row.title || '', onclick: () => { if (open) this.closed[row.id] = true; else delete this.closed[row.id]; this.render(); } },
          el('span', { class: 'tw' }, open ? '▾' : '▸'), icon('folder', 'folder'), el('span', { class: 'name' }, row.label));
        const lane = el('div', { class: 'tl-lane frames section' });
        lane.append(el('div', { class: 'tl-past', style: { left: this.xf(this.n) + 'px' } }));
        return el('div', { class: 'tl-row section' }, lab, lane);
      }
      const lane = el('div', { class: 'tl-lane frames' });
      lane.append(el('div', { class: 'tl-past', style: { left: this.xf(this.n) + 'px' } }));
      const rowEl = el('div', { class: 'tl-row' + (row.kind === 'prop' ? ' sub' : '') });
      let lab;
      if (row.kind === 'node') {
        const id = row.node, open = !this.closed[id], hidden = S.App.layerHidden(id), locked = S.App.layerLocked(id);
        const now = S.App.frame();
        const data = this.rowData(row);
        const keyedNow = data.keys.some((k) => k.f === now);
        const nameEl = el('span', { class: 'name' }, row.label);
        lab = el('div', { class: 'tl-label', style: pad, title: row.title },
          row.group ? el('span', { class: 'tw', title: open ? 'Close the group' : 'Open the group' }, open ? '▾' : '▸') : el('span', { class: 'tw' }),
          icon(row.group ? 'group' : 'layer', row.group ? 'grp' : ''),
          nameEl,
          el('button', { class: 'tl-ico-btn mot' + (this.motion[id] ? ' on' : ''), title: 'Motion rows: one row per property (X, Y, Turn…)' }, '≡'),
          el('button', { class: 'addkey' + (keyedNow ? ' on' : ''), title: 'Insert a keyframe at the playhead (F6, K)' }, '◆'),
          el('span', { class: 'tl-col eye' + (S.App.hidden.has(id) ? ' on' : hidden ? ' inherited' : ''), title: 'Show / hide this layer in the studio (Alt+click: only this one). Hidden layers are still exported.' }, icon('eye')),
          el('span', { class: 'tl-col lock' + (S.App.locked.has(id) ? ' on' : locked ? ' inherited' : ''), title: 'Lock: it can\'t be picked on the stage (Alt+click: only this one unlocked)' }, icon('lock')));
        lab.addEventListener('click', (e) => {
          const c = e.target.closest('.tw, .mot, .addkey, .tl-col');
          if (c && c.classList.contains('tw') && row.group) { if (open) this.closed[id] = true; else delete this.closed[id]; this.render(); return; }
          if (c && c.classList.contains('mot')) { this.motion[id] = !this.motion[id]; this.render(); return; }
          if (c && c.classList.contains('addkey')) { S.App.keyPart(id); return; }
          if (c && c.classList.contains('eye')) { S.App.toggleLayer('hidden', id, e.altKey); return; }
          if (c && c.classList.contains('lock')) { S.App.toggleLayer('locked', id, e.altKey); return; }
          S.App.selectPart(id, false, e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : null);
        });
        if (row.group) nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); this.rename(nameEl, id); });
        rowEl.classList.toggle('has', !!data.keys.length);
        rowEl.classList.toggle('selpart', sel.parts.has(id));
        rowEl.classList.toggle('hidden-layer', hidden);
        rowEl.classList.toggle('is-group', !!row.group);
        this.drawFrames(lane, row, data);
      } else if (row.kind === 'prop') {
        const keys = M.track(p, row.node, row.prop), t = Math.round(S.App.playhead());
        const on = keys.some((k) => k.t === t);
        lab = el('div', { class: 'tl-label', style: pad },
          el('span', { class: 'name' }, row.label),
          el('button', { class: 'addkey' + (on ? ' on' : ''), title: 'Key this property at the playhead', onclick: (e) => { e.stopPropagation(); S.App.edit((q) => S.App.keyValue(q, row.node, row.prop, t, M.valueAt(q, row.node, row.prop, t))); } }, '◆'));
        lab.addEventListener('click', (e) => { if (!e.target.closest('.addkey')) S.App.selectPart(row.node, false, e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : null); });
        rowEl.classList.toggle('has', !!keys.length);
        this.drawFrames(lane, row, this.rowData(row));
      } else if (row.kind === 'state') {
        lab = el('div', { class: 'tl-label', style: pad, title: row.title }, el('span', { class: 'tw' }), el('span', { class: 'name' }, row.label));
        rowEl.classList.toggle('has', !!p.states[row.name].length);
        this.drawFrames(lane, row, this.rowData(row));
        if (!p.states[row.name].length) lane.append(el('span', { class: 'tl-empty' }, 'select a frame and press F6'));
      } else if (row.kind === 'front') {
        lab = el('div', { class: 'tl-label', style: pad, title: row.title }, el('span', { class: 'tw' }), el('span', { class: 'name' }, row.label));
        p.inFront.forEach((r, i) => lane.append(this.bar(r, r.parts.map((id) => (PT.PART[id] ? PT.partName(PT.PART[id]) : id)).join(', '), { kind: 'front', i }, 'front')));
        if (!p.inFront.length) lane.append(el('span', { class: 'tl-empty' }, 'double-click to add'));
        lane.addEventListener('dblclick', (e) => { if (e.target === lane || e.target.classList.contains('tl-empty')) S.App.addInFront(this.T(Math.min(this.last(), this.frameAt(e.clientX)))); });
        rowEl.classList.toggle('has', !!p.inFront.length);
      } else if (row.kind === 'sounds') {
        lab = el('div', { class: 'tl-label', style: pad }, el('span', { class: 'tw' }), el('span', { class: 'name' }, row.label));
        p.sounds.forEach((s, i) => lane.append(this.chip(s.t, '♪ ' + s.file, { kind: 'sound', i }, (q, t) => { q.sounds[i].t = t; })));
        if (!p.sounds.length) lane.append(el('span', { class: 'tl-empty' }, 'double-click to add a sound'));
        lane.addEventListener('dblclick', (e) => { if (e.target === lane || e.target.classList.contains('tl-empty')) S.App.addSound(this.T(Math.min(this.last(), this.frameAt(e.clientX)))); });
        rowEl.classList.toggle('has', !!p.sounds.length);
      } else if (row.kind === 'fx') {
        const fx = p.effects.find((x) => x.id === row.fx);
        lab = el('div', { class: 'tl-label', style: pad, title: row.title, onclick: () => S.App.select({ kind: 'effect', id: fx.id }) }, el('span', { class: 'tw' }), el('span', { class: 'name' }, row.label));
        lane.append(this.bar(fx, `${fx.label} · ${fx.layer}`, { kind: 'effect', id: fx.id }, fx.layer));
        rowEl.classList.add('has');
      } else {
        lab = el('div', { class: 'tl-label', style: pad }, el('span', { class: 'tw' }), el('span', { class: 'name' }, row.label));
        lane.append(el('span', { class: 'tl-empty' }, row.hint || ''));
      }
      // the selected frames
      const fs = sel.frames;
      if (fs && fs.rows.has(row.id)) lane.append(el('div', { class: 'tl-fsel', style: { left: this.xf(fs.f0) + 'px', width: this.xf(fs.f1 - fs.f0 + 1) + 'px' } }));
      if (SELECTABLE.has(row.kind)) {
        lane.addEventListener('pointerdown', (e) => this.laneDown(e, row));
        lane.addEventListener('dblclick', (e) => { if (!e.target.closest('.tl-bar, .tl-chip')) this.selectSpan(row, this.frameAt(e.clientX)); });
        lane.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!e.target.closest('.tl-bar, .tl-chip')) this.frameMenu(e, row); });
      }
      rowEl.append(lab, lane);
      return rowEl;
    },

    // the spans and keyframes of a layer, a motion row or a face row
    drawFrames(lane, row, data) {
      for (const s of data.spans) {
        const d = el('div', { class: `tl-span ${s.kind}${s.end ? ' end' : ''}${s.f1 > s.f0 ? ' long' : ''}`, style: { left: this.xf(s.f0) + 'px', width: this.xf(s.f1 - s.f0 + 1) + 'px' } });
        if (row.kind === 'state' && s.label) d.append(el('span', { class: 'tl-flabel' + (s.label === 'normal' ? ' dim' : '') }, s.label));
        lane.append(d);
      }
      for (const k of data.keys) {
        const on = k.ids.some((id) => S.App.sel.keys.has(id));
        lane.append(el('div', { class: `tl-kf${k.blank ? ' blank' : ''}${on ? ' sel' : ''}`, style: { left: this.xf(k.f) + 'px', width: this.fw + 'px' }, title: `Keyframe at frame ${k.f + 1}${k.label ? ': ' + k.label : ''}` }));
      }
    },

    // a group's name, edited in place
    rename(nameEl, gid) {
      const g = Mdl().groupById(this.p, gid);
      if (!g) return;
      const input = el('input', { class: 'tl-rename', value: g.name, maxlength: 40 });
      nameEl.replaceWith(input);
      input.focus(); input.select();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; if (ok && input.value.trim() && input.value.trim() !== g.name) S.App.renameGroup(gid, input.value); else this.render(); };
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('click', (e) => e.stopPropagation());
    },

    /* ---------- selecting frames ---------- */
    // the keys in some rows between two frames
    keysIn(rows, f0, f1) {
      const out = [];
      for (const r of rows) for (const k of this.rowData(r).keys) if (k.f >= f0 && k.f <= f1) out.push(...k.ids);
      return out;
    },
    rowById(id) { return this.list.find((r) => r.id === id) || null; },

    // select a block of frames: the keys in it, and the layers it covers
    selectFrames(rows, f0, f1, quiet = false) {
      const sel = S.App.sel;
      if (f1 < f0) [f0, f1] = [f1, f0];
      sel.frames = { rows: new Set(rows.map((r) => r.id)), f0, f1 };
      sel.keys = new Set(this.keysIn(rows, f0, f1));
      const nodes = [...new Set(rows.filter((r) => r.node).map((r) => r.node))];
      sel.parts = new Set(nodes);
      sel.part = nodes[0] || null;
      this.selectionChanged(quiet);
    },
    // after the keys changed: the keys in the selected frames again
    reselect() {
      const fs = S.App.sel.frames;
      if (!fs) return;
      const rows = [...fs.rows].map((id) => this.rowById(id)).filter(Boolean);
      S.App.sel.keys = new Set(this.keysIn(rows, fs.f0, fs.f1));
      this.selectionChanged();
    },
    // one face key alone shows its value in the Inspector; anything else shows the keys card
    selectionChanged(quiet = false) {
      const keys = [...S.App.sel.keys].map(parseKey);
      S.App.sel.item = keys.length === 1 && isState(keys[0]) ? { kind: 'state', name: keys[0].part.slice(6), t: keys[0].t } : null;
      if (!quiet) S.App.refresh();
    },
    selectSpan(row, f) {
      const kf = this.rowData(row).keys.map((k) => k.f);
      const before = kf.filter((x) => x <= f), after = kf.filter((x) => x > f);
      const f0 = before.length ? before[before.length - 1] : 0, f1 = after.length ? after[0] - 1 : this.last();
      this.anchor = { id: row.id, f: f0 };
      this.selectFrames([row], f0, Math.max(f0, f1));
    },
    selectAllFrames() {
      this.anchor = null;
      this.selectFrames(this.list, 0, this.last());
    },
    // the selectable row at a height on the screen (rows above / below the list: the first / last)
    rowAtY(y) {
      let best = null;
      for (const { row, el: e } of this.rowEls) {
        const r = e.getBoundingClientRect();
        if (SELECTABLE.has(row.kind)) best = best || row;
        if (y < r.top) break;
        if (SELECTABLE.has(row.kind)) best = row;
        if (y < r.bottom) break;
      }
      return best;
    },

    /* Pressing on a layer's frames: on a keyframe or inside the selection, drag them; anywhere else, drag
       out a block of frames. A click selects that frame and moves the playhead there. */
    laneDown(e, row) {
      if (e.button !== 0 || e.target.closest('.tl-bar, .tl-chip')) return;
      e.preventDefault();
      S.App.pause();
      const f = this.frameAt(e.clientX), fs = S.App.sel.frames;
      if (e.shiftKey && this.anchor && this.rowById(this.anchor.id)) { this.selectBlock(this.rowById(this.anchor.id), this.anchor.f, row, f); return; }
      const inSel = fs && fs.rows.has(row.id) && f >= fs.f0 && f <= fs.f1;
      const onKey = this.rowData(row).keys.some((k) => k.f === f);
      if ((inSel && S.App.sel.keys.size) || onKey) {
        if (!inSel) { this.anchor = { id: row.id, f }; this.selectFrames([row], f, f, true); }
        S.App.seekFrame(Math.min(f, this.last()));
        this.dragFrames(e, f);
        return;
      }
      this.anchor = { id: row.id, f };
      let last = null, moved = false;
      const draw = (ev) => { last = ev; moved = true; this.selectBlock(row, f, this.rowAtY(ev.clientY) || row, this.frameAt(ev.clientX), true); this.paintSelection(); };
      const timer = this.autoScroll(() => (moved ? last : null), draw);
      this.track(e, draw, (ev, didMove) => {
        clearInterval(timer);
        if (!didMove) { this.selectFrames([row], f, f, true); S.App.seekFrame(Math.min(f, this.last())); }
        this.selectionChanged();
      });
    },
    selectBlock(rowA, fa, rowB, fb, quiet = false) {
      const ia = this.list.indexOf(rowA), ib = this.list.indexOf(rowB);
      const rows = ia < 0 || ib < 0 ? [rowB] : this.list.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
      this.selectFrames(rows, Math.min(fa, fb), Math.max(fa, fb), quiet);
    },
    // show the selection without rebuilding the rows (while dragging it out)
    paintSelection() {
      const fs = S.App.sel.frames;
      for (const { row, el: e } of this.rowEls) {
        const lane = e.querySelector('.tl-lane');
        if (!lane) continue;
        let box = lane.querySelector('.tl-fsel');
        const on = fs && fs.rows.has(row.id);
        if (!on) { if (box) box.remove(); continue; }
        if (!box) { box = el('div', { class: 'tl-fsel' }); lane.append(box); }
        box.style.left = this.xf(fs.f0) + 'px';
        box.style.width = this.xf(fs.f1 - fs.f0 + 1) + 'px';
        for (const k of lane.querySelectorAll('.tl-kf')) {
          const kf = Math.round(parseFloat(k.style.left) / this.fw);
          k.classList.toggle('sel', kf >= fs.f0 && kf <= fs.f1);
        }
      }
    },

    /* Drag the selected keys by whole frames (Alt: copies them, as in Flash) */
    dragFrames(e, f0) {
      const orig = [...S.App.sel.keys].map(parseKey);
      const fs0 = S.App.sel.frames ? { ...S.App.sel.frames } : null;
      if (!orig.length) return;
      const frames = orig.map((k) => this.F(k.t));
      const lo = -Math.min(...frames), hi = this.last() - Math.max(...frames);
      this.track(e, (ev) => {
        const df = Math.max(lo, Math.min(hi, this.frameAt(ev.clientX, false) - f0));
        if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
        let moved = [];
        S.App.dragMove((q) => { moved = this.moveKeysFrames(q, orig, df, ev.altKey); });
        S.App.sel.keys = new Set(moved.map((k) => keyId(k.part, k.prop, k.t)));
        if (fs0) S.App.sel.frames = { rows: fs0.rows, f0: fs0.f0 + df, f1: fs0.f1 + df };
        this.selectionChanged(true);
        S.App.seekFrame(f0 + df);
      }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } else this.selectionChanged(); });
    },

    // move (or copy) keys by df frames; keys moving the same way go in the right order so none land on another
    moveKeysFrames(q, keys, df, copy = false) {
      const M = Mdl(), out = [];
      const sorted = keys.slice().sort((a, b) => (df > 0 ? b.t - a.t : a.t - b.t));
      for (const k of sorted) {
        const to = Math.max(0, Math.min(q.duration, M.toMs(q, M.toFrame(q, k.t) + df)));
        if (isState(k)) {
          const name = k.part.slice(6), list = q.states[name], key = list && list.find((x) => x.t === k.t);
          if (!key) continue;
          if (copy) { if (to !== k.t) M.setStateKey(q, name, to, key.v); }
          else { q.states[name] = list.filter((x) => x === key || x.t !== to); key.t = to; q.states[name].sort((a, b) => a.t - b.t); }
          out.push({ ...k, t: to });
        } else if (copy) {
          const key = M.track(q, k.part, k.prop).find((x) => x.t === k.t);
          if (key && to !== k.t) M.setKey(q, k.part, k.prop, to, key.v, key.ease);
          if (key) out.push({ ...k, t: to });
        } else if (M.moveKey(q, k.part, k.prop, k.t, to)) out.push({ ...k, t: to });
      }
      return out;
    },
    // the Inspector's "move by": ms, rounded to whole frames
    moveKeys(q, keys, dt) { return this.moveKeysFrames(q, keys, Math.round((dt * q.fps) / 1000)); },

    /* ---------- frame commands (the right-click menu and Flash's keys) ---------- */
    // what a command works on: the selected frames, or else the selected layers at the playhead
    target() {
      const fs = S.App.sel.frames;
      if (fs) return { rows: [...fs.rows].map((id) => this.rowById(id)).filter(Boolean), f0: fs.f0, f1: fs.f1, picked: true };
      const f = S.App.frame();
      const rows = S.App.selectedParts().map((id) => this.list.find((r) => r.kind === 'node' && r.node === id) || { id, kind: 'node', node: id });
      return { rows, f0: f, f1: f, picked: false };
    },
    // row ids for the model; a closed group takes what is inside it along (frames inserted into the whole group)
    modelRows(rows) {
      const M = Mdl(), p = this.p, out = new Set();
      const add = (id) => { out.add(id); const g = M.groupById(p, id); if (g && this.closed[id]) g.members.forEach(add); };
      for (const r of rows) {
        if (r.kind === 'node') add(r.node);
        else if (r.kind === 'prop') out.add(`${r.node}|${r.prop}`);
        else out.add(r.id);
      }
      return [...out];
    },
    // the selection covers every layer and track (the action's length can change with it)
    coversAll(ids) {
      const set = new Set(ids);
      return Mdl().allRows(this.p).every((r) => set.has(r)) && this.list.filter((r) => r.kind !== 'prop').every((r) => set.has(r.kind === 'node' ? r.node : r.id));
    },
    // the timeline grows to frame f (a command on frames past the end, as in Flash)
    growTo(q, f) {
      const M = Mdl();
      if (f <= M.frameCount(q) - 1) return;
      const old = q.duration;
      q.duration = M.framesToDuration(q, f + 1);
      if (q.loop.to === old) q.loop.to = q.duration;
    },
    nothing() { PT.toast('Select a frame in the timeline first (or a layer, for the playhead\'s frame).'); },

    /* F6: a keyframe on every selected frame, holding what shows there now. F7 (blank): the layer
       shows nothing from there (opacity 0); a face track goes back to normal. */
    insertKeyframes(blank) {
      const T = this.target(), M = Mdl();
      const rows = T.rows.filter((r) => ['node', 'prop', 'state'].includes(r.kind));
      if (!rows.length) { this.nothing(); return; }
      S.App.edit((q) => {
        this.growTo(q, T.f1);
        // the keys there were before: a new key takes the ease of the key before it (inside a tween
        // it splits the tween in two; on a still span, or a layer with no keys yet, nothing tweens), as in Flash
        const before = {};
        for (const r of rows) if (r.node) for (const [prop, keys] of Object.entries(q.tracks[r.node] || {})) before[`${r.node}|${prop}`] = keys.map((k) => ({ t: k.t, ease: k.ease }));
        for (let f = T.f0; f <= T.f1; f++) {
          const t = M.toMs(q, f);
          for (const r of rows) {
            if (r.kind === 'node') { if (blank) this.blankKey(q, r.node, t); else S.App.keyPartAt(q, r.node, t); }
            else if (r.kind === 'prop') {
              if (blank && r.prop === 'opacity') this.blankKey(q, r.node, t);
              else if (!blank) S.App.keyValue(q, r.node, r.prop, t, M.valueAt(q, r.node, r.prop, t));
            } else M.setStateKey(q, r.name, t, blank ? '' : M.stateAt(q, r.name, t));
          }
        }
        if (!blank) {
          for (const r of rows) {
            if (!r.node) continue;
            for (const [prop, keys] of Object.entries(q.tracks[r.node] || {})) {
              const old = before[`${r.node}|${prop}`] || [];
              for (const k of keys) {
                if (old.some((o) => o.t === k.t)) continue;
                const prev = old.filter((o) => o.t < k.t).pop();
                k.ease = prev ? prev.ease : 'step';
              }
            }
          }
        }
      });
      if (T.picked) this.reselect(); else this.selectFrames(rows.map((r) => this.rowById(r.id) || r).filter((r) => this.list.includes(r)), T.f0, T.f1);
    },
    // a blank keyframe: opacity 0 from t, popping (no fade) in and out
    blankKey(q, id, t) {
      const M = Mdl();
      if (!M.track(q, id, 'opacity').length && t > 0) M.setKey(q, id, 'opacity', 0, 1, 'step');
      let prev = null;
      for (const k of M.track(q, id, 'opacity')) if (k.t < t) prev = k;
      if (prev) prev.ease = 'step';
      M.setKey(q, id, 'opacity', t, 0, 'step');
    },
    // Shift+F6 / Alt+Backspace: the keys in the selected frames go
    clearKeyframes() {
      const T = this.target();
      const ids = this.keysIn(T.rows, T.f0, T.f1);
      if (!ids.length) return;
      S.App.edit((q) => this.removeKeys(q, ids));
      this.reselect();
    },
    clearFrames() { this.clearKeyframes(); },
    removeKeys(q, ids) {
      for (const s of ids) {
        const k = parseKey(s);
        if (isState(k)) q.states[k.part.slice(6)] = q.states[k.part.slice(6)].filter((x) => x.t !== k.t);
        else Mdl().removeKey(q, k.part, k.prop, k.t);
      }
    },
    // F5: frames inserted at the selection (the selection's width), on the selected layers (or all)
    insertFrames() {
      const T = this.target();
      const last = this.last(), n = T.f1 - T.f0 + 1;
      const rows = T.rows.length ? this.modelRows(T.rows) : Mdl().allRows(this.p);
      S.App.edit((q) => {
        if (T.f0 > last) this.growTo(q, T.f1);   // past the end: the action reaches to there
        else Mdl().insertFrames(q, rows, T.f0, n);
      });
      if (T.picked) this.reselect();
    },
    // Shift+F5: the selected frames taken out of their layers
    removeFrames() {
      const T = this.target(), last = this.last();
      if (T.f0 > last) return;
      const f1 = Math.min(T.f1, last);
      const rows = T.rows.length ? this.modelRows(T.rows) : Mdl().allRows(this.p);
      const all = !T.rows.length || this.coversAll(rows);
      S.App.edit((q) => Mdl().removeFrames(q, rows, T.f0, f1, all));
      if (T.picked) { S.App.sel.frames = { ...S.App.sel.frames, f1: T.f0 }; this.reselect(); }
    },
    reverseFrames() {
      const T = this.target();
      if (T.f1 <= T.f0) { PT.toast('Select more than one frame to reverse.'); return; }
      S.App.edit((q) => Mdl().reverseFrames(q, this.modelRows(T.rows), T.f0, Math.min(T.f1, this.last())));
      this.reselect();
    },
    /* Tweens: kind 'classic' (Create Classic Tween: the spans ease linearly), 'remove' (no tween: the
       value jumps at the next keyframe) or an ease name, on the spans the selected frames touch */
    tween(kind) {
      const T = this.target(), M = Mdl();
      const rows = T.rows.filter((r) => r.kind === 'node' || r.kind === 'prop');
      if (!rows.length) { this.nothing(); return; }
      S.App.edit((q) => {
        for (const r of rows) {
          const tr = q.tracks[r.node] || {}, props = (r.kind === 'prop' ? [r.prop] : Object.keys(tr)).filter((pr) => tr[pr]);
          const kfs = [...new Set(props.flatMap((pr) => tr[pr].map((k) => M.toFrame(q, k.t))))].sort((a, b) => a - b);
          const owners = new Set();
          for (let f = T.f0; f <= T.f1; f++) { const o = kfs.filter((x) => x <= f).pop(); if (o !== undefined) owners.add(o); }
          for (const pr of props) {
            for (const k of tr[pr]) {
              if (!owners.has(M.toFrame(q, k.t))) continue;
              if (kind === 'classic') { if (k.ease === 'step') k.ease = 'linear'; } else if (kind === 'remove') k.ease = 'step'; else k.ease = kind;
            }
          }
        }
      });
    },
    copyFrames() { S.App.copyKeys(); },
    cutFrames() { S.App.copyKeys(true); this.clearKeyframes(); PT.toast('Frames cut'); },
    pasteFrames() { S.App.pasteKeys(); },

    frameMenu(e, row) {
      const f = this.frameAt(e.clientX), fs = S.App.sel.frames;
      if (!(fs && fs.rows.has(row.id) && f >= fs.f0 && f <= fs.f1)) { this.anchor = { id: row.id, f }; this.selectFrames([row], f, f); }
      const T = this.target(), p = this.p;
      const motion = T.rows.some((r) => r.kind === 'node' || r.kind === 'prop');
      const keyed = this.keysIn(T.rows, T.f0, T.f1).length > 0;
      // the eases on the spans this touches
      const cur = new Set();
      for (const id of this.keysIn(T.rows, 0, T.f1)) { const k = parseKey(id); if (!isState(k)) { const x = Mdl().track(p, k.part, k.prop).find((y) => y.t === k.t); if (x) cur.add(x.ease); } }
      const items = [];
      if (motion) {
        items.push({ text: 'Create Classic Tween', run: () => this.tween('classic') }, { text: 'Remove Tween', run: () => this.tween('remove') }, { label: 'Ease' });
        for (const name of S.Interp.EASES.filter((x) => x !== 'step')) items.push({ text: name, cur: cur.size === 1 && cur.has(name), run: () => this.tween(name) });
        items.push({ sep: true });
      }
      items.push(
        { text: 'Insert Frame', key: 'F5', run: () => this.insertFrames() },
        { text: 'Remove Frames', key: 'Shift+F5', run: () => this.removeFrames() },
        { sep: true },
        { text: 'Insert Keyframe', key: 'F6', disabled: !['node', 'prop', 'state'].includes(row.kind), run: () => this.insertKeyframes(false) },
        { text: 'Insert Blank Keyframe', key: 'F7', disabled: !['node', 'prop', 'state'].includes(row.kind), run: () => this.insertKeyframes(true) },
        { text: 'Clear Keyframe', key: 'Shift+F6', disabled: !keyed, run: () => this.clearKeyframes() },
        { sep: true },
        { text: 'Cut Frames', key: 'Ctrl+Alt+X', disabled: !keyed, run: () => this.cutFrames() },
        { text: 'Copy Frames', key: 'Ctrl+Alt+C', disabled: !keyed, run: () => this.copyFrames() },
        { text: 'Paste Frames', key: 'Ctrl+Alt+V', disabled: !S.App.clip, run: () => this.pasteFrames() },
        { text: 'Clear Frames', key: 'Alt+Bksp', disabled: !keyed, run: () => this.clearFrames() },
        { text: 'Select All Frames', key: 'Ctrl+Alt+A', run: () => this.selectAllFrames() },
        { sep: true },
        { text: 'Reverse Frames', disabled: T.f1 <= T.f0, run: () => this.reverseFrames() });
      S.App.menu(e.clientX, e.clientY, items);
    },

    /* ---------- chips and bars (sounds, parts in front, effects) ---------- */
    chip(t, text, item, retime, cls = '') {
      const on = S.App.isSelected(item), f = this.F(t);
      const c = el('div', { class: `tl-chip ${cls} ${on ? 'sel' : ''}`, style: { left: this.xf(f) + 'px' }, title: `${text} at frame ${f + 1}` }, text);
      c.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        S.App.select(item);
        S.App.seekFrame(f);
        const x0 = this.frameAt(e.clientX, false);
        this.track(e, (ev) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          const to = Math.max(0, Math.min(this.last(), f + this.frameAt(ev.clientX, false) - x0));
          S.App.dragMove((q) => retime(q, Mdl().toMs(q, to)));
          S.App.seekFrame(to);
        }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } });
      });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); S.App.select(item); S.App.menu(e.clientX, e.clientY, [{ text: 'Delete', run: () => S.App.deleteSelection() }]); });
      return c;
    },

    bar(r, text, item, layer) {
      const on = S.App.isSelected(item), a = this.F(r.from), b = this.F(r.to);
      const d = el('div', { class: `tl-bar ${layer} ${on ? 'sel' : ''}`, style: { left: this.xf(a) + 'px', width: Math.max(6, this.xf(b - a + 1)) + 'px' }, title: `${text}: frames ${a + 1}-${b + 1}` },
        el('div', { class: 'h l' }), el('span', { class: 'tl-bar-dot' }), text, el('div', { class: 'h r' }));
      d.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        S.App.select(item);
        const mode = e.target.classList.contains('l') ? 'from' : e.target.classList.contains('r') ? 'to' : 'both';
        const x0 = this.frameAt(e.clientX, false);
        this.track(e, (ev) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          const df = this.frameAt(ev.clientX, false) - x0;
          S.App.dragMove((q) => {
            const target = item.kind === 'effect' ? q.effects.find((x) => x.id === item.id) : q.inFront[item.i];
            if (!target) return;
            const last = Mdl().frameCount(q) - 1;
            let fa = a, fb = b;
            if (mode === 'both') { const len = b - a; fa = Math.max(0, Math.min(last - len, a + df)); fb = fa + len; }
            if (mode === 'from') fa = Math.max(0, Math.min(b - 1, a + df));
            if (mode === 'to') fb = Math.min(last, Math.max(a + 1, b + df));
            target.from = Mdl().toMs(q, fa); target.to = Mdl().toMs(q, fb);
          });
        }, (ev, moved) => {
          if (this.dragging) { this.dragging = false; S.App.dragEnd(); }
          if (!moved) S.App.seekFrame(this.frameAt(ev.clientX));
        });
      });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); S.App.select(item); S.App.menu(e.clientX, e.clientY, [{ text: 'Delete', run: () => S.App.deleteSelection() }]); });
      return d;
    },
  };

  S.Timeline = Timeline;
})(window.Studio);
