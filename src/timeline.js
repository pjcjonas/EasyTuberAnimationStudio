/* The timeline: a ruler with the playhead (and a held action's loop), a row per part (opened up into
   one row per property), rows for eyes, mouth, expression, parts in front, sounds and effects.

   Keys: click to select (Shift adds), Shift/Ctrl+drag on empty space to box-select keys across rows,
   drag to move (snaps to 10 ms, Alt for 1 ms), right-click for easing, double-click a row to add a
   key there. Part names: click to select, Ctrl/Shift+click to select several. Bars: drag to move,
   drag an end to resize. */
(function (S) {
  const PT = window.PT;
  const el = PT.el;
  const LABEL_W = 190, MARGIN_R = 12;
  const TICKS = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000];
  const keyId = (part, prop, t) => `${part}|${prop}|${t}`;
  const parseKey = (s) => { const [part, prop, t] = s.split('|'); return { part, prop, t: +t }; };

  const Timeline = {
    root: null, head: null, body: null, lane: null, line: null, headLine: null,
    expanded: {},
    laneW: 100,

    init(root) {
      this.root = root;
      this.head = el('div', { class: 'tl-head' });
      this.body = el('div', { class: 'tl-body' });
      this.line = el('div', { class: 'tl-playhead' });
      root.append(this.head, this.body, this.line);
      new ResizeObserver(() => this.render()).observe(root);
      this.body.addEventListener('scroll', () => this.placeLine());
    },

    get d() { return S.App.project.duration; },
    x(t) { return (t / this.d) * this.laneW; },
    tAt(clientX) {
      const r = this.root.getBoundingClientRect();
      return Math.max(0, Math.min(this.d, ((clientX - r.left - LABEL_W) / this.laneW) * this.d));
    },
    snap(t, e) { return e && e.altKey ? Math.round(t) : Math.round(t / 10) * 10; },

    /* ---------- dragging (window listeners: rows are rebuilt while dragging) ---------- */
    track(e, onMove, onUp) {
      const x0 = e.clientX;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientX - x0) < 3) return;
        moved = true;
        onMove(ev, ((ev.clientX - x0) / this.laneW) * this.d);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (onUp) onUp(ev, moved);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },

    scrub(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      S.App.pause();
      if (S.App.sel.keys.size || S.App.sel.item) { S.App.sel.keys = new Set(); S.App.sel.item = null; S.App.refresh(); }
      S.App.seek(this.snap(this.tAt(e.clientX), e));
      this.track(e, (ev) => S.App.seek(this.snap(this.tAt(ev.clientX), ev)));
    },

    /* ---------- building ---------- */
    render() {
      if (!S.App.project) return;
      const sbw = this.body.offsetWidth - this.body.clientWidth;
      this.laneW = Math.max(50, this.root.clientWidth - LABEL_W - MARGIN_R - sbw);
      this.renderHead(sbw);
      const top = this.body.scrollTop;
      this.body.replaceChildren(...this.rows());
      this.body.scrollTop = top;
      this.placeLine();
    },

    renderHead(sbw) {
      const p = S.App.project;
      const lane = el('div', { class: 'tl-lane tl-ruler', onpointerdown: (e) => this.scrub(e) });
      let step = TICKS.find((s) => this.x(s) >= 64) || TICKS[TICKS.length - 1];
      for (let t = 0; t <= this.d + 0.5; t += step) {
        const label = step < 1000 && t % 1000 ? `${t} ms` : `${t / 1000} s`;
        lane.append(el('div', { class: 'tl-tick', style: { left: this.x(t) + 'px' } }, el('span', {}, label)));
      }
      if (p.hold) lane.append(this.loopBar());
      this.headLine = el('div', { class: 'tl-playhead head' });
      lane.append(this.headLine);
      const label = el('div', { class: 'tl-label' },
        el('button', { class: 'small', title: 'Open every part with keys', onclick: () => this.expandAll(true) }, '▾ all'),
        el('button', { class: 'small', title: 'Close every part', onclick: () => this.expandAll(false) }, '▸ all'));
      this.head.style.paddingRight = sbw + 'px';
      this.head.replaceChildren(label, lane);
      this.lane = lane;
    },

    loopBar() {
      const p = S.App.project;
      const bar = el('div', { class: 'tl-loop', title: `Held: loops ${p.loop.from}-${p.loop.to} ms until it is turned off`, style: { left: this.x(p.loop.from) + 'px', width: this.x(p.loop.to - p.loop.from) + 'px' } },
        el('div', { class: 'h l' }), el('div', { class: 'h r' }));
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const mode = e.target.classList.contains('l') ? 'from' : e.target.classList.contains('r') ? 'to' : 'both';
        const { from, to } = p.loop;
        this.track(e, (ev, dt) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          dt = this.snap(dt, ev);
          S.App.dragMove((q) => {
            let f = from, t = to;
            if (mode !== 'to') f = from + dt;
            if (mode !== 'from') t = to + dt;
            if (mode === 'both') { const len = to - from; f = Math.max(0, Math.min(q.duration - len, f)); t = f + len; }
            f = Math.max(0, Math.min(f, q.duration)); t = Math.max(0, Math.min(t, q.duration));
            if (t - f >= 50) q.loop = { from: f, to: t };
          });
        }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } });
      });
      return bar;
    },

    placeLine() {
      const t = S.Preview.timelineMs();
      const x = this.x(t);
      if (this.headLine) this.headLine.style.left = x + 'px';
      this.line.style.left = LABEL_W + x + 'px';
      this.line.style.top = this.head.offsetHeight + 'px';
    },
    setPlayhead() { this.placeLine(); },

    expandAll(on) {
      this.expanded = {};
      if (on) for (const id of Object.keys(S.App.project.tracks)) this.expanded[id] = true;
      this.render();
    },

    row({ cls = '', label = '', tw = null, title = '', onLabel = null, addKey = null, onLane = null, onDbl = null }) {
      const lane = el('div', { class: 'tl-lane' });
      lane.addEventListener('pointerdown', (e) => {
        if (e.target !== lane) return;
        if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey)) { this.boxSelect(e); return; }
        if (onLane) onLane(e);
        this.scrub(e);
      });
      if (onDbl) lane.addEventListener('dblclick', (e) => { if (e.target === lane) onDbl(this.snap(this.tAt(e.clientX), e), e); });
      const lab = el('div', { class: 'tl-label', title, onclick: onLabel },
        tw === null ? null : el('span', { class: 'tw' }, tw),
        el('span', { class: 'name' }, label),
        addKey);
      return { row: el('div', { class: 'tl-row ' + cls }, lab, lane), lane };
    },

    section(label) {
      const lane = el('div', { class: 'tl-lane' });
      lane.addEventListener('pointerdown', (e) => {
        if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey)) this.boxSelect(e); else this.scrub(e);
      });
      return el('div', { class: 'tl-row section' }, el('div', { class: 'tl-label' }, label), lane);
    },

    rows() {
      const p = S.App.project, sel = S.App.sel, out = [];
      const now = Math.round(S.App.playhead());
      out.push(this.section('Parts'));
      const ids = PT.PARTS.map((d) => d.id);
      for (const id of Object.keys(p.tracks)) if (!ids.includes(id)) ids.push(id);
      for (const id of ids) {
        const def = PT.PART[id];
        const tr = p.tracks[id] || {};
        const open = !!this.expanded[id];
        const name = def ? PT.partName(def) : `${id} (not in this avatar)`;
        const times = [...new Set(Object.values(tr).flatMap((keys) => keys.map((k) => k.t)))].sort((a, b) => a - b);
        const keyedNow = times.includes(now);
        const add = el('button', { class: 'addkey' + (keyedNow ? ' on' : ''), title: 'Key this part at the playhead (K)', onclick: (e) => { e.stopPropagation(); S.App.keyPart(id); } }, '◆');
        const { row, lane } = this.row({
          cls: (times.length ? 'has ' : '') + (sel.parts.has(id) ? 'selpart' : ''), label: name, tw: open ? '▾' : '▸',
          title: def && def.hint ? def.hint : id,
          onLabel: (e) => {
            if (e.target.classList.contains('tw')) { this.expanded[id] = !open; this.render(); return; }
            S.App.selectPart(id, false, e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : null);
          },
          addKey: add,
          onLane: () => S.App.selectPart(id),
          onDbl: (t) => S.App.edit((q) => S.App.keyPartAt(q, id, t)),
        });
        if (times.length > 1) lane.append(el('div', { class: 'tl-seg', style: { left: this.x(times[0]) + 'px', width: this.x(times[times.length - 1] - times[0]) + 'px' } }));
        for (const t of times) {
          const items = Object.entries(tr).filter(([, keys]) => keys.some((k) => k.t === t)).map(([prop]) => keyId(id, prop, t));
          lane.append(this.diamond(t, items, 'summary', id));
        }
        out.push(row);
        if (!open) continue;
        const rowProps = [...S.Model.FREE_PROPS, ...S.Model.JOINT_PROPS.filter((pr) => tr[pr] || S.Tools.space === 'joint')];
        for (const prop of rowProps) {
          const keys = tr[prop] || [];
          const on = keys.some((k) => k.t === now);
          const addp = el('button', { class: 'addkey' + (on ? ' on' : ''), title: 'Key at the playhead', onclick: (e) => { e.stopPropagation(); S.App.edit((q) => S.App.keyValue(q, id, prop, now, S.Model.valueAt(q, id, prop, now))); } }, '◆');
          const sub = this.row({
            cls: 'sub' + (keys.length ? ' has' : ''), label: S.Model.PROP_LABEL[prop], addKey: addp,
            onLabel: (e) => S.App.selectPart(id, false, e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : null),
            onDbl: (t) => S.App.edit((q) => S.App.keyValue(q, id, prop, t, S.Model.valueAt(q, id, prop, t))),
          });
          for (const k of keys) sub.lane.append(this.diamond(k.t, [keyId(id, prop, k.t)], k.ease === 'step' ? 'step' : '', id));
          out.push(sub.row);
        }
      }

      out.push(this.section('Face'));
      for (const name of S.Model.STATE_TRACKS) {
        const labels = { eyes: 'Eyes', mouth: 'Mouth', expression: 'Expression' };
        const { row, lane } = this.row({
          label: labels[name], cls: p.states[name].length ? 'has' : '',
          title: name === 'expression' ? 'One of the avatar\'s expressions while the action plays' : `Override the ${name} picture`,
          onDbl: (t) => S.App.addStateKey(name, t),
        });
        for (const k of p.states[name]) lane.append(this.stateChip(name, k));
        if (!p.states[name].length) lane.append(el('span', { class: 'tl-empty' }, 'double-click to add'));
        out.push(row);
      }

      out.push(this.section('Layers and sound'));
      {
        const { row, lane } = this.row({ label: 'Parts in front', cls: p.inFront.length ? 'has' : '', title: 'Parts drawn on top of the rest while the bar is on (an arm across the face)', onDbl: (t) => S.App.addInFront(t) });
        p.inFront.forEach((r, i) => lane.append(this.bar(r, r.parts.map((id) => (PT.PART[id] ? PT.partName(PT.PART[id]) : id)).join(', '), { kind: 'front', i }, 'front')));
        if (!p.inFront.length) lane.append(el('span', { class: 'tl-empty' }, 'double-click to add'));
        out.push(row);
      }
      {
        const { row, lane } = this.row({ label: 'Sounds', cls: p.sounds.length ? 'has' : '', onDbl: (t) => S.App.addSound(t) });
        p.sounds.forEach((s, i) => lane.append(this.chip(s.t, '♪ ' + s.file, { kind: 'sound', i }, (q, t) => { q.sounds[i].t = t; })));
        if (!p.sounds.length) lane.append(el('span', { class: 'tl-empty' }, 'double-click to add a sound'));
        out.push(row);
      }
      out.push(this.section('Effects'));
      for (const fx of p.effects) {
        const preset = S.Effects.BY_ID[fx.preset];
        const { row, lane } = this.row({ label: fx.label, cls: 'has', title: preset ? preset.label : fx.preset, onLabel: () => S.App.select({ kind: 'effect', id: fx.id }) });
        lane.append(this.bar(fx, `${fx.label} · ${fx.layer}`, { kind: 'effect', id: fx.id }, fx.layer));
        out.push(row);
      }
      if (!p.effects.length) {
        const { row, lane } = this.row({ label: 'Add one in the Inspector' });
        lane.append(el('span', { class: 'tl-empty' }, 'sparkles, music notes, captions, pictures…'));
        out.push(row);
      }
      return out;
    },

    /* ---------- keys ---------- */
    diamond(t, items, cls, part) {
      const sel = S.App.sel.keys;
      const on = items.some((k) => sel.has(k));
      const d = el('div', { class: `tl-key ${cls} ${on ? 'sel' : ''}`, style: { left: this.x(t) + 'px' }, title: `${t} ms` });
      d.dataset.items = items.join(',');
      d.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        const keys = S.App.sel.keys;
        if (e.shiftKey) { const all = items.every((k) => keys.has(k)); for (const k of items) all ? keys.delete(k) : keys.add(k); } else if (!items.every((k) => keys.has(k))) S.App.sel.keys = new Set(items);
        S.App.selectPart(part, true);
        S.App.seek(t);
        const orig = [...S.App.sel.keys].map(parseKey);
        this.track(e, (ev, dt) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          dt = this.snap(dt, ev);
          let moved = [];
          S.App.dragMove((q) => { moved = this.moveKeys(q, orig, dt); });
          S.App.sel.keys = new Set(moved.map((k) => keyId(k.part, k.prop, k.t)));
          S.App.seek(Math.max(0, Math.min(this.d, t + dt)));
        }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } else S.App.refresh(); });
      });
      d.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!items.some((k) => S.App.sel.keys.has(k))) S.App.sel.keys = new Set(items);
        S.App.refresh();
        this.keyMenu(e.clientX, e.clientY);
      });
      return d;
    },

    /* Shift/Ctrl+drag on empty space: a box that adds every key inside it to the selection */
    boxSelect(e) {
      e.preventDefault();
      const root = this.root.getBoundingClientRect();
      const box = el('div', { class: 'tl-box' });
      this.root.append(box);
      const x0 = e.clientX, y0 = e.clientY;
      const before = new Set(S.App.sel.keys);
      let inside = [];
      const move = (ev) => {
        const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY);
        Object.assign(box.style, { left: l - root.left + 'px', top: t - root.top + 'px', width: r - l + 'px', height: b - t + 'px' });
        inside = [];
        for (const d of this.body.querySelectorAll('.tl-key')) {
          const q = d.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
          const hit = cx >= l && cx <= r && cy >= t && cy <= b;
          d.classList.toggle('sel', hit || d.dataset.items.split(',').some((k) => before.has(k)));
          if (hit) inside.push(...d.dataset.items.split(','));
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        box.remove();
        S.App.sel.keys = new Set([...before, ...inside]);
        S.App.sel.item = null;
        S.App.refresh();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },

    // move keys by dt ms; keys moving the same way are done in the right order so none land on another
    moveKeys(q, keys, dt) {
      const sorted = keys.slice().sort((a, b) => (dt > 0 ? b.t - a.t : a.t - b.t));
      const out = [];
      for (const k of sorted) {
        const to = Math.max(0, Math.min(q.duration, k.t + dt));
        if (S.Model.moveKey(q, k.part, k.prop, k.t, to)) out.push({ ...k, t: to });
      }
      return out;
    },

    keyMenu(x, y) {
      const keys = [...S.App.sel.keys].map(parseKey);
      const p = S.App.project;
      const cur = new Set(keys.map((k) => (S.Model.track(p, k.part, k.prop).find((x) => x.t === k.t) || {}).ease));
      const items = [{ label: 'Ease to the next key' }];
      for (const e of S.Interp.EASES) {
        items.push({ text: e, cur: cur.size === 1 && cur.has(e), run: () => S.App.edit((q) => { for (const k of keys) { const key = S.Model.track(q, k.part, k.prop).find((x) => x.t === k.t); if (key) key.ease = e; } }) });
      }
      items.push({ sep: true }, { text: `Delete ${keys.length > 1 ? keys.length + ' keys' : 'key'}`, run: () => S.App.deleteSelection() });
      S.App.menu(x, y, items);
    },

    /* ---------- chips and bars ---------- */
    chip(t, text, item, retime, cls = '') {
      const on = S.App.isSelected(item);
      const c = el('div', { class: `tl-chip ${cls} ${on ? 'sel' : ''}`, style: { left: this.x(t) + 'px' }, title: `${text} at ${t} ms` }, text);
      c.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        S.App.select(item);
        S.App.seek(t);
        this.track(e, (ev, dt) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          const to = Math.max(0, Math.min(this.d, this.snap(t + dt, ev)));
          S.App.dragMove((q) => retime(q, to));
          S.App.seek(to);
        }, () => { if (this.dragging) { this.dragging = false; S.App.dragEnd(); } });
      });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); S.App.select(item); S.App.menu(e.clientX, e.clientY, [{ text: 'Delete', run: () => S.App.deleteSelection() }]); });
      return c;
    },

    stateChip(name, k) {
      const item = { kind: 'state', name, t: k.t };
      const c = this.chip(k.t, k.v || 'normal', item, (q, to) => {
        const key = q.states[name].find((x) => x.t === k.t);
        if (!key) return;
        q.states[name] = q.states[name].filter((x) => x === key || x.t !== to);
        key.t = to;
        q.states[name].sort((a, b) => a.t - b.t);
        S.App.sel.item = { kind: 'state', name, t: to };
      }, k.v ? '' : 'normal');
      return c;
    },

    bar(r, text, item, layer) {
      const on = S.App.isSelected(item);
      const b = el('div', { class: `tl-bar ${layer} ${on ? 'sel' : ''}`, style: { left: this.x(r.from) + 'px', width: Math.max(6, this.x(r.to - r.from)) + 'px' }, title: `${text}: ${r.from}-${r.to} ms` },
        el('div', { class: 'h l' }), text, el('div', { class: 'h r' }));
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button === 2) return;
        S.App.select(item);
        const mode = e.target.classList.contains('l') ? 'from' : e.target.classList.contains('r') ? 'to' : 'both';
        const { from, to } = r;
        this.track(e, (ev, dt) => {
          if (!this.dragging) { this.dragging = true; S.App.dragStart(); }
          dt = this.snap(dt, ev);
          S.App.dragMove((q) => {
            const target = item.kind === 'effect' ? q.effects.find((x) => x.id === item.id) : q.inFront[item.i];
            if (!target) return;
            let f = from, t = to;
            if (mode === 'both') { const len = to - from; f = Math.max(0, Math.min(q.duration - len, from + dt)); t = f + len; }
            if (mode === 'from') f = Math.max(0, Math.min(to - 20, from + dt));
            if (mode === 'to') t = Math.min(q.duration, Math.max(from + 20, to + dt));
            target.from = f; target.to = t;
          });
        }, (ev, moved) => {
          if (this.dragging) { this.dragging = false; S.App.dragEnd(); }
          if (!moved) S.App.seek(this.snap(this.tAt(ev.clientX), ev));
        });
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); S.App.select(item); S.App.menu(e.clientX, e.clientY, [{ text: 'Delete', run: () => S.App.deleteSelection() }]); });
      return b;
    },
  };

  S.Timeline = Timeline;
})(window.Studio);
