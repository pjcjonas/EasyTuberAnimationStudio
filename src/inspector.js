/* The Inspector: what is selected (a part, keys, a face key, a sound, an effect, a parts-in-front
   bar), quick face keys at the playhead, adding things, and the action's own settings.

   Fields are bound to getters: sync() refreshes their values (the playhead moved, an undo) without
   rebuilding, so a slider being dragged keeps working. render() rebuilds when the selection or the
   project's structure changes. */
(function (S) {
  const PT = window.PT, el = PT.el;
  const r1 = (v) => Math.round(v * 10) / 10;

  const Inspector = {
    root: null, bindings: [],

    init(root) { this.root = root; },

    // edits made here: refresh values only, never rebuild under the pointer
    edit(fn, coalesce) { S.App.edit(fn, { source: 'inspector', coalesce }); },

    bind(input, get) {
      this.bindings.push({ input, get });
      return input;
    },

    sync() {
      for (const b of this.bindings) {
        if (document.activeElement === b.input) continue;
        const v = b.get();
        if (b.input.type === 'checkbox') b.input.checked = !!v;
        else if (b.input.classList.contains('keybtn')) b.input.className = 'keybtn ' + v;
        else if (b.input.tagName === 'SPAN' || b.input.tagName === 'DIV') b.input.textContent = v;
        else if (String(b.input.value) !== String(v)) b.input.value = v;
      }
    },

    /* ---------- field helpers ---------- */
    f(label, control, extra = null, title = '') {
      return el('div', { class: 'f', title }, el('span', {}, label), control, extra || el('span'));
    },
    num(get, set, { step = 1, min = null, max = null, coalesce = null } = {}) {
      const i = el('input', { type: 'number', step, min, max });
      i.value = get();
      i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) set(v); else i.value = get(); });
      return this.bind(i, get);
    },
    range(get, set, { min, max, step, coalesce, fmt = (v) => v }) {
      const i = el('input', { type: 'range', min, max, step });
      i.value = get();
      const out = el('span', { class: 'val' }, fmt(get()));
      i.addEventListener('input', () => { set(parseFloat(i.value)); out.textContent = fmt(parseFloat(i.value)); });
      this.bind(out, () => fmt(get()));
      return [this.bind(i, get), out];
    },
    check(get, set, text = '') {
      const i = el('input', { type: 'checkbox' });
      i.checked = !!get();
      i.addEventListener('change', () => set(i.checked));
      this.bind(i, get);
      return text ? el('label', { class: 'check' }, i, text) : i;
    },
    select(options, get, set) {
      const s = el('select', {}, options.map((o) => (Array.isArray(o) ? el('option', { value: o[0] }, o[1]) : el('option', { value: o }, o))));
      s.value = get();
      s.addEventListener('change', () => set(s.value));
      return this.bind(s, get);
    },
    text(get, set, coalesce) {
      const i = el('input', { type: 'text', spellcheck: 'false' });
      i.value = get();
      i.addEventListener('input', () => set(i.value));
      return this.bind(i, get);
    },
    color(get, set, coalesce) {
      const i = el('input', { type: 'color' });
      i.value = get();
      i.addEventListener('input', () => set(i.value));
      return this.bind(i, get);
    },
    card(title, ...children) {
      return el('div', { class: 'card' }, el('h4', {}, ...(Array.isArray(title) ? title : [title])), ...children);
    },

    /* ---------- the panel ---------- */
    render() {
      if (!S.App.project) return;
      this.bindings = [];
      const top = this.root.scrollTop;
      const cards = [];
      const sel = S.App.sel;
      if (sel.item) cards.push(this.itemCard(sel.item));
      if (sel.keys.size) cards.push(this.keysCard());
      if (sel.parts.size) cards.push(this.partCard(S.App.selectedParts()));
      if (!sel.item && !sel.parts.size && !sel.keys.size) cards.push(el('div', { class: 'empty-sel' }, 'Click a part on the stage or in the timeline to pose it. Drag it to set a key at the playhead. Ctrl+click or drag a box on the stage to pose several parts at once.'));
      cards.push(this.faceCard(), this.addCard(), this.actionCard(), this.previewCard());
      this.root.replaceChildren(...cards.filter(Boolean));
      this.root.scrollTop = top;
    },

    /* One part, or several: a value typed here goes on every selected part, keyed at the playhead.
       Free motion first (anywhere on the stage, around your pivot), then EasyTuber's joint motion. */
    propRow(ids, prop, t) {
      const pct = S.Model.PERCENT.has(prop), many = ids.length > 1;
      const get = () => {
        const vals = ids.map((id) => r1(S.Model.valueAt(S.App.project, id, prop, t()) * (pct ? 100 : 1)));
        return vals.every((v) => v === vals[0]) ? vals[0] : '';
      };
      const input = this.num(get, (v) => {
        let val = pct ? v / 100 : v;
        if (prop === 'opacity') val = Math.max(0, Math.min(1, val));
        if (prop === 'size') val = Math.max(0, val);
        S.App.setOnParts(ids, prop, t(), val, { source: 'inspector' });
      }, { step: 1 });
      if (many) input.placeholder = 'mixed';
      const keyState = () => {
        const keyed = ids.filter((id) => S.Model.track(S.App.project, id, prop).some((k) => k.t === t()));
        if (keyed.length === ids.length) return 'on';
        return keyed.length || ids.some((id) => S.Model.track(S.App.project, id, prop).length) ? 'has' : '';
      };
      const kb = el('button', { class: 'keybtn ' + keyState(), title: many ? 'Key every selected part at the playhead (click again to remove the keys)' : 'Key at the playhead (click again to remove it)' }, '◆');
      kb.addEventListener('click', () => {
        const on = keyState() === 'on';
        this.edit((q) => {
          for (const id of ids) {
            if (on) S.Model.removeKey(q, id, prop, t());
            else if (!S.Model.track(q, id, prop).some((k) => k.t === t())) S.App.keyValue(q, id, prop, t(), S.Model.valueAt(q, id, prop, t()));
          }
        });
      });
      this.bind(kb, keyState);
      return this.f(S.Model.PROP_LABEL[prop].replace(/^Joint (\w)/, (m, c) => c.toUpperCase()), el('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, input, el('span', { class: 'val' }, S.Model.UNIT[prop])), kb);
    },

    partCard(ids) {
      const t = () => Math.round(S.App.playhead());
      const many = ids.length > 1;
      const id = ids[0], def = PT.PART[id], mirror = !many && PT.MIRROR[id];
      const title = many ? `${ids.length} parts` : def ? PT.partName(def) : id;
      const free = S.Tools.space === 'free';

      // where the pivot of the (first) part is on the 1920x1080 stage right now
      const where = el('div', { class: 'stagepos' });
      const whereText = () => {
        const j = S.Preview.lastPose && S.Tools.joint(id);
        if (!j) return '';
        const [x, y] = S.Tools.toStage(j);
        return `pivot on the stage: x ${Math.round(x)}, y ${Math.round(y)} (of 1920 × 1080)`;
      };
      where.textContent = whereText();
      this.bind(where, whereText);

      const r3 = (n) => Math.round(n * 1000) / 1000;
      const pv = () => S.Tools.freePivot(id);   // the joint, worked out, when it's on the joint
      const pivotRow = !many ? this.f('Pivot', el('span', { style: { display: 'flex', gap: '6px' } },
        this.num(() => r3(pv().u), (v) => this.edit((q) => { q.pivots[id] = { u: v, v: r3(pv().v) }; }), { step: 0.05 }),
        this.num(() => r3(pv().v), (v) => this.edit((q) => { q.pivots[id] = { u: r3(pv().u), v }; }), { step: 0.05 })),
        this.bind(el('span', { class: 'val' }, S.App.project.pivots[id] && S.App.project.pivots[id].joint ? 'joint' : ''), () => (S.App.project.pivots[id] && S.App.project.pivots[id].joint ? 'joint' : '')),
        'Across and down the part\'s drawing: 0 to 1 is inside it, other numbers are outside. Or drag the pink crosshair on the stage (Ctrl snaps).') : null;
      const setPivot = (value) => S.App.edit((q) => { for (const x of ids) { if (value) q.pivots[x] = { ...value }; else delete q.pivots[x]; } });
      const followBox = this.check(() => ids.every((x) => S.App.project.follow[x] === true),
        (v) => S.App.edit((q) => { for (const x of ids) { if (v) q.follow[x] = true; else delete q.follow[x]; } }), 'children go with it');

      const freeRows = S.Model.FREE_PROPS.map((prop) => this.propRow(ids, prop, t));
      const jointRows = S.Model.JOINT_PROPS.map((prop) => this.propRow(ids, prop, t));
      const hasJoint = ids.some((x) => S.Model.JOINT_PROPS.some((prop) => S.Model.track(S.App.project, x, prop).length));

      return this.card([title, el('span', { class: 'grow' }), el('span', { class: 'val' }, '@ playhead')],
        many ? el('p', { class: 'note' }, ids.map((x) => (PT.PART[x] ? PT.partName(PT.PART[x]) : x)).join(', ') + '. A value typed here goes on all of them; a drag on the stage changes them all by the same amount.') : null,
        el('h5', {}, 'Free: anywhere on the stage', el('span', { class: 'grow' }), free ? el('span', { class: 'val' }, 'drag mode') : null),
        where,
        ...freeRows,
        pivotRow,
        el('div', { class: 'row' },
          el('button', { class: 'small', onclick: () => setPivot(null), title: 'Put the pivot in the middle of the drawing' }, 'Pivot: middle'),
          el('button', { class: 'small', onclick: () => setPivot({ joint: true }), title: 'Put the pivot on the joint the avatar gives this part (it then fits any avatar)' }, 'Pivot: joint'),
          el('label', { class: 'check', title: 'Off: this part moves on its own (the default). On: the parts hanging from it go with it.' }, followBox)),
        el('h5', {}, 'Joint: EasyTuber\'s rig', el('span', { class: 'grow' }), !free ? el('span', { class: 'val' }, 'drag mode') : null),
        ...(hasJoint || !free ? jointRows : [el('p', { class: 'note' }, 'Turns around the joint EasyTuber gives the part. Switch the stage to Joint (J) to pose this way.')]),
        el('div', { class: 'row' },
          el('button', { onclick: () => S.App.keyParts(ids), title: 'K' }, many ? '◆ Key all parts' : '◆ Key'),
          mirror ? el('button', { onclick: () => S.App.edit((q) => S.Model.mirror(q, { [id]: mirror }, id.startsWith('armL'))), title: `Copy this part's keys to ${PT.partName(PT.PART[mirror])}, mirrored` }, '⇄ Mirror to other arm') : null,
          mirror ? el('button', { onclick: () => S.App.edit((q) => S.Model.mirror(q, PT.MIRROR, id.startsWith('armL'))), title: 'Copy both parts of this arm to the other arm, mirrored' }, '⇄ Whole arm') : null,
          el('button', { class: 'danger', onclick: () => S.App.edit((q) => { for (const x of ids) { delete q.tracks[x]; delete q.pivots[x]; delete q.follow[x]; } }) }, 'Clear')));
    },

    keysCard() {
      const keys = [...S.App.sel.keys].map((s) => { const [part, prop, t] = s.split('|'); return { part, prop, t: +t }; });
      const find = (q, k) => S.Model.track(q, k.part, k.prop).find((x) => x.t === k.t);
      const p = S.App.project;
      const eases = new Set(keys.map((k) => (find(p, k) || {}).ease));
      const ease = this.select([...(eases.size > 1 ? [['', 'mixed']] : []), ...S.Interp.EASES], () => (eases.size === 1 ? [...eases][0] : ''),
        (v) => { if (v) S.App.edit((q) => { for (const k of keys) { const x = find(q, k); if (x) x.ease = v; } }); });
      const out = [];
      // the keys' value, when they are all the same kind (all rotations, all scales…)
      const kinds = new Set(keys.map((k) => (S.Model.PERCENT.has(k.prop) ? 'pct' : k.prop === 'rot' || k.prop === 'angle' ? 'rot' : 'move')));
      if (kinds.size === 1) {
        const isScale = kinds.has('pct');
        const label = keys.length === 1 ? S.Model.PROP_LABEL[keys[0].prop] : 'Value (all)';
        const get = () => {
          const vals = keys.map((k) => { const x = find(S.App.project, k); return x ? r1(x.v * (isScale ? 100 : 1)) : 0; });
          return vals.every((v) => v === vals[0]) ? vals[0] : '';
        };
        const input = this.num(get, (v) => this.edit((q) => { for (const k of keys) { const x = find(q, k); if (x) x.v = isScale ? v / 100 : v; } }));
        if (keys.length > 1) input.placeholder = 'mixed';
        out.push(this.f(label, input, el('span', { class: 'val' }, isScale ? '%' : kinds.has('rot') ? '°' : '')));
      }
      if (keys.length === 1) {
        const k = keys[0];
        out.unshift(this.f('Time', this.num(() => k.t, (v) => {
          S.App.edit((q) => { const to = Math.max(0, Math.min(q.duration, Math.round(v))); S.Model.moveKey(q, k.part, k.prop, k.t, to); S.App.sel.keys = new Set([`${k.part}|${k.prop}|${to}`]); });
        }, { step: 10 }), el('span', { class: 'val' }, 'ms')));
      } else {
        // move them all together by a number of ms
        const by = el('input', { type: 'number', step: 10, value: 100 });
        const shift = (dir) => {
          const dt = dir * (parseFloat(by.value) || 0);
          if (!dt) return;
          let moved = [];
          S.App.edit((q) => { moved = S.Timeline.moveKeys(q, keys, dt); });
          S.App.sel.keys = new Set(moved.map((k) => `${k.part}|${k.prop}|${k.t}`));
          S.App.refresh();
        };
        out.push(this.f('Move by', by, el('span', { style: { display: 'flex', gap: '4px' } },
          el('button', { class: 'small', title: 'Earlier', onclick: () => shift(-1) }, '◂'),
          el('button', { class: 'small', title: 'Later', onclick: () => shift(1) }, '▸')), 'Move every selected key earlier or later (ms)'));
      }
      out.push(this.f('Ease', ease, null, 'How the value moves from this key to the next one'));
      const parts = new Set(keys.map((k) => k.part));
      return this.card(`${keys.length} key${keys.length > 1 ? 's' : ''} selected`,
        keys.length > 1 ? el('p', { class: 'note' }, `On ${parts.size} part${parts.size > 1 ? 's' : ''}. Shift+click keys, or Shift+drag a box in the timeline, to select more.`) : null,
        ...out,
        el('div', { class: 'row' }, el('button', { class: 'danger', onclick: () => S.App.deleteSelection() }, 'Delete (Del)')));
    },

    stateOptions(name) {
      if (name === 'expression') return [['', 'normal'], ...S.Preview.expressions().map((x) => [x.id, x.name])];
      return [['', 'normal'], ...S.Model.STATE_VALUES[name].map((v) => [v, v])];
    },

    faceCard() {
      const t = () => Math.round(S.App.playhead());
      const rows = S.Model.STATE_TRACKS.map((name) => {
        const opts = this.stateOptions(name);
        const cur = S.Model.stateAt(S.App.project, name, t());
        if (cur && !opts.some((o) => o[0] === cur)) opts.push([cur, cur + ' (not in this avatar)']);
        return this.f(name[0].toUpperCase() + name.slice(1), this.select(opts, () => S.Model.stateAt(S.App.project, name, t()),
          (v) => S.App.edit((q) => S.Model.setStateKey(q, name, t(), v))));
      });
      const ex = S.Preview.expressions();
      return this.card('Face at the playhead', ...rows,
        el('p', { class: 'note' }, ex.length ? `Expressions come from ${S.Preview.rigName}.` : S.Preview.rigKind === 'avatar' ? `${S.Preview.rigName} has no expressions. Make some in EasyTuber to use them here.` : 'Load your EasyTuber avatar (top right) to pick one of its expressions.'));
    },

    addCard() {
      const presetSel = el('select', {}, S.Effects.PRESETS.map((x) => el('option', { value: x.id }, x.label)));
      return this.card('Add',
        el('div', { class: 'row' }, presetSel, el('button', { class: 'primary', onclick: () => S.App.addEffect(presetSel.value) }, '+ Effect')),
        el('div', { class: 'row' },
          el('button', { onclick: () => S.App.addSound(Math.round(S.App.playhead())) }, '+ Sound…'),
          el('button', { onclick: () => S.App.addInFront(Math.round(S.App.playhead())), title: 'Draw parts on top of the rest for a while' }, '+ Parts in front')));
    },

    actionCard() {
      const p = () => S.App.project;
      const set = (fn, c) => this.edit(fn, c);
      const rows = [
        this.f('Blend in', this.num(() => p().blend.in, (v) => set((q) => { q.blend.in = Math.max(0, Math.min(5000, Math.round(v))); }), { step: 50 }), el('span', { class: 'val' }, 'ms'), 'The motion fades in over this time'),
      ];
      if (!p().hold) rows.push(this.f('Blend out', this.num(() => p().blend.out, (v) => set((q) => { q.blend.out = Math.max(0, Math.min(5000, Math.round(v))); }), { step: 50 }), el('span', { class: 'val' }, 'ms'), 'The motion fades out over the last part'));
      if (p().hold) {
        rows.push(
          this.f('Release', this.num(() => p().release, (v) => set((q) => { q.release = Math.max(0, Math.min(S.Model.MAX_RELEASE, Math.round(v))); }), { step: 50 }), el('span', { class: 'val' }, 'ms'), 'How long it takes to blend out once it is turned off'),
          this.f('Loop from', this.num(() => p().loop.from, (v) => set((q) => { const f = Math.max(0, Math.min(q.loop.to - 50, Math.round(v))); q.loop.from = f; }), { step: 50 }), el('span', { class: 'val' }, 'ms')),
          this.f('Loop to', this.num(() => p().loop.to, (v) => set((q) => { q.loop.to = Math.max(q.loop.from + 50, Math.min(q.duration, Math.round(v))); }), { step: 50 }), el('span', { class: 'val' }, 'ms')));
      } else {
        rows.push(this.f('Overlap', this.check(() => p().overlap, (v) => set((q) => { q.overlap = v; }), 'play copies side by side'), null, 'Playing it again while it runs adds a second copy instead of restarting'));
      }
      rows.push(
        this.f('Strength', this.check(() => p().strength.on, (v) => S.App.edit((q) => { q.strength.on = v; })), null, 'A Strength slider in EasyTuber\'s Actions tab'));
      if (p().strength.on) {
        rows.push(
          this.f('  default', this.num(() => p().strength.default, (v) => set((q) => { q.strength.default = Math.max(0, Math.min(q.strength.max, Math.round(v))); }), { step: 5 }), el('span', { class: 'val' }, '%')),
          this.f('  max', this.num(() => p().strength.max, (v) => set((q) => { q.strength.max = Math.max(100, Math.min(300, Math.round(v))); q.strength.default = Math.min(q.strength.default, q.strength.max); }), { step: 10 }), el('span', { class: 'val' }, '%')));
      }
      rows.push(
        this.f('Media folder', this.select([['user-actions', 'your actions folder'], ['media/actions', 'built into EasyTuber']], () => p().mediaPrefix, (v) => S.App.edit((q) => { q.mediaPrefix = v; })), null, 'Where the action\'s pictures and sounds will live'),
        this.f('Rest keys', this.check(() => S.App.autoRest, (v) => { S.App.autoRest = v; }, 'auto'), null, 'The first key on a track also adds rest keys at the start (and end), so the part moves from rest and back'),
        this.f('Length edits', this.check(() => S.App.stretch, (v) => { S.App.stretch = v; }, 'stretch keys'), null, 'Changing the length moves every key in proportion'));
      return this.card('Action', ...rows);
    },

    previewCard() {
      const P = S.Preview, p = S.App.project, rows = [];
      if (p.strength.on) {
        const [r, out] = this.range(() => P.settings.strength ?? p.strength.default, (v) => P.setSettings({ ...P.settings, strength: v }), { min: 0, max: p.strength.max, step: 5, fmt: (v) => v + '%' });
        rows.push(this.f('Strength', r, out));
      }
      for (const fx of p.effects) if (fx.toggle) rows.push(this.f(fx.label, this.check(() => P.settings[fx.id] !== false, (v) => P.setSettings({ ...P.settings, [fx.id]: v }), 'on')));
      if (!rows.length) return null;
      return this.card('Preview the settings', el('p', { class: 'note' }, 'How the action looks with other values in EasyTuber\'s Actions tab. Not saved.'), ...rows);
    },

    /* ---------- a selected item ---------- */
    itemCard(item) {
      const p = S.App.project;
      if (item.kind === 'state') {
        const k = p.states[item.name].find((x) => x.t === item.t);
        if (!k) return null;
        const find = (q) => q.states[item.name].find((x) => x.t === S.App.sel.item.t);
        return this.card(`${item.name} key`,
          this.f('Time', this.num(() => S.App.sel.item.t, (v) => S.App.edit((q) => {
            const key = find(q); if (!key) return;
            const to = Math.max(0, Math.min(q.duration, Math.round(v)));
            q.states[item.name] = q.states[item.name].filter((x) => x === key || x.t !== to);
            key.t = to; q.states[item.name].sort((a, b) => a.t - b.t);
            S.App.sel.item = { ...item, t: to };
          }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
          this.f('Shows', this.select(this.stateOptions(item.name), () => (find(S.App.project) || {}).v || '', (v) => this.edit((q) => { const key = find(q); if (key) key.v = v; }))),
          el('p', { class: 'note' }, '"normal" hands the ' + item.name + ' back to EasyTuber (blinking, talking).'),
          el('div', { class: 'row' }, el('button', { class: 'danger', onclick: () => S.App.deleteSelection() }, 'Delete')));
      }
      if (item.kind === 'sound') {
        const s = p.sounds[item.i];
        if (!s) return null;
        const g = (q) => q.sounds[item.i];
        const rows = [
          this.f('File', el('span', { class: 'grow', title: p.assets[s.file] || 'location unknown' }, s.file), el('button', { class: 'small', onclick: () => S.App.replaceSound(item.i) }, 'Replace…')),
          this.f('Starts at', this.num(() => g(S.App.project).t, (v) => this.edit((q) => { g(q).t = Math.max(0, Math.min(q.duration, Math.round(v))); }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
        ];
        const [r, out] = this.range(() => Math.round(g(S.App.project).volume * 100), (v) => this.edit((q) => { g(q).volume = v / 100; }, 'vol' + item.i), { min: 0, max: 100, step: 5, fmt: (v) => v + '%' });
        rows.push(this.f('Volume', r, out));
        if (p.hold) rows.push(this.f('Loop', this.check(() => g(S.App.project).loop, (v) => this.edit((q) => { g(q).loop = v; }), 'until turned off')));
        if (!p.assets[s.file]) rows.push(el('p', { class: 'note' }, 'The studio doesn\'t know where this file is. Replace it, or copy it into the action\'s folder yourself.'));
        rows.push(el('p', { class: 'note' }, 'Sounds play once per run. In EasyTuber they play where its Actions tab says (EasyTuber, OBS or nowhere).'));
        return this.card('Sound', ...rows, el('div', { class: 'row' }, el('button', { class: 'danger', onclick: () => S.App.deleteSelection() }, 'Delete')));
      }
      if (item.kind === 'front') {
        const r = p.inFront[item.i];
        if (!r) return null;
        const g = (q) => q.inFront[item.i];
        const chips = el('div', { class: 'chips' }, PT.PARTS.map((d) => el('label', { class: 'check' },
          this.check(() => (g(S.App.project) || { parts: [] }).parts.includes(d.id), (v) => S.App.edit((q) => {
            const x = g(q); const order = PT.PARTS.map((z) => z.id);
            x.parts = v ? [...new Set([...x.parts, d.id])].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : x.parts.filter((z) => z !== d.id);
          })), PT.partName(d))));
        return this.card('Parts in front',
          el('p', { class: 'note' }, 'Drawn on top of the rest, in this order, while the bar is on. Useful when an arm reaches across the face.'),
          chips,
          this.f('From', this.num(() => g(S.App.project).from, (v) => this.edit((q) => { g(q).from = Math.max(0, Math.min(g(q).to - 20, Math.round(v))); }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
          this.f('To', this.num(() => g(S.App.project).to, (v) => this.edit((q) => { g(q).to = Math.min(q.duration, Math.max(g(q).from + 20, Math.round(v))); }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
          el('div', { class: 'row' }, el('button', { class: 'danger', onclick: () => S.App.deleteSelection() }, 'Delete')));
      }
      if (item.kind === 'effect') return this.effectCard(item.id);
      return null;
    },

    effectCard(id) {
      const p = S.App.project;
      const fx = p.effects.find((x) => x.id === id);
      if (!fx) return null;
      const preset = S.Effects.BY_ID[fx.preset];
      const g = (q) => q.effects.find((x) => x.id === id);
      const parts = PT.PARTS.map((d) => [d.id, PT.partName(d)]);
      if (!PT.PART[fx.anchor.part]) parts.push([fx.anchor.part, fx.anchor.part + ' (not in this avatar)']);
      const rows = [
        this.f('Name', this.text(() => g(S.App.project).label, (v) => this.edit((q) => { g(q).label = v.slice(0, 40) || id; }, 'label' + id)), null, 'Also the checkbox label in EasyTuber\'s Actions tab'),
        this.f('Layer', this.select([['front', 'in front of the avatar'], ['behind', 'behind the avatar']], () => g(S.App.project).layer, (v) => S.App.edit((q) => { g(q).layer = v; }))),
        this.f('From', this.num(() => g(S.App.project).from, (v) => this.edit((q) => { g(q).from = Math.max(0, Math.min(g(q).to - 20, Math.round(v))); }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
        this.f('To', this.num(() => g(S.App.project).to, (v) => this.edit((q) => { g(q).to = Math.min(q.duration, Math.max(g(q).from + 20, Math.round(v))); }), { step: 10 }), el('span', { class: 'val' }, 'ms')),
        this.f('Anchor', this.select(parts, () => g(S.App.project).anchor.part, (v) => this.edit((q) => { g(q).anchor.part = v; })),
          el('button', { class: 'small', title: 'Click the avatar to place it', onclick: () => S.Tools.startPick((a) => S.App.edit((q) => { g(q).anchor = a; })) }, '⌖ Pick')),
        this.f('  across / down', el('span', { style: { display: 'flex', gap: '6px' } },
          this.num(() => g(S.App.project).anchor.u, (v) => this.edit((q) => { g(q).anchor.u = Math.max(-2, Math.min(3, v)); }), { step: 0.05 }),
          this.num(() => g(S.App.project).anchor.v, (v) => this.edit((q) => { g(q).anchor.v = Math.max(-2, Math.min(3, v)); }), { step: 0.05 })), null,
          '0..1 across and down the part\'s drawing'),
        this.f('Switch', this.check(() => g(S.App.project).toggle, (v) => S.App.edit((q) => { g(q).toggle = v; }), 'can be turned off'), null, 'A checkbox for it in EasyTuber\'s Actions tab'),
      ];
      for (const s of preset ? preset.params : []) {
        const get = () => S.Effects.cleanParams(preset, g(S.App.project).params)[s.key];
        const setv = (v, c) => this.edit((q) => { g(q).params[s.key] = v; }, c ? s.key + id : null);
        if (s.type === 'range') { const [r, out] = this.range(get, (v) => setv(v, true), { min: s.min, max: s.max, step: s.step, fmt: (v) => (Math.round(v * 100) / 100).toString() }); rows.push(this.f(s.label, r, out)); }
        else if (s.type === 'color') rows.push(this.f(s.label, this.color(get, (v) => setv(v, true))));
        else if (s.type === 'select') rows.push(this.f(s.label, this.select(s.options, get, (v) => setv(v))));
        else if (s.type === 'file') rows.push(this.f(s.label, el('span', { class: 'grow' }, get() || '(none)'), el('button', { class: 'small', onclick: () => S.App.pickEffectImage(id) }, 'Choose…')));
        else rows.push(this.f(s.label, this.text(get, (v) => setv(v, true)), null, s.label));
      }
      if (fx.preset === 'caption' || fx.preset === 'burst') rows.push(el('p', { class: 'note' }, fx.preset === 'caption' ? 'Use {user} for a value from the Streamer.bot URL (…&user=%user%), or {user|someone} with a fallback.' : 'Any emoji or short text.'));
      return this.card([preset ? preset.label : fx.preset, el('span', { class: 'grow' }), el('span', { class: 'val' }, id)], ...rows,
        el('div', { class: 'row' },
          el('button', { onclick: () => S.App.duplicateEffect(id) }, 'Duplicate'),
          el('button', { class: 'danger', onclick: () => S.App.deleteSelection() }, 'Delete')));
    },
  };

  S.Inspector = Inspector;
})(window.Studio);
