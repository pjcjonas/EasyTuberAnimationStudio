/* The studio: the project being edited, selection, undo, files, and the wiring between the preview,
   stage tools, timeline and inspector. */
(function (S) {
  const PT = window.PT, el = PT.el, $ = (id) => document.getElementById(id);
  const host = window.studioHost || null;   // file access from electron/preload.js (absent in a plain browser)
  const MAX_UNDO = 200;

  const App = {
    project: null, filePath: null, dirty: false,
    /* part = the one clicked last; parts = the selected parts and groups ("nodes"); keys = selected
       keys; item = a sound / effect / bar / face key; frames = the frames selected in the timeline
       { rows: Set of row ids, f0, f1 } (see timeline.js) */
    sel: { part: null, parts: new Set(), keys: new Set(), item: null, frames: null },
    undoStack: [], redoStack: [],
    dragSnap: null, lastCoalesce: null,
    autoRest: true, stretch: false, keepTiming: false,
    autoKey: true,                 // off: a change on a frame between keys changes the key before it (Flash's classic way)
    hidden: new Set(), locked: new Set(),   // layers (parts and groups) hidden or locked in the studio (the eye and lock)
    entered: null,                 // the group being edited inside (double-click a group, like Flash), or null
    clip: null,
    code: '', issues: [],
    mediaSent: '',

    init() {
      S.Preview.init($('stage'));
      S.Tools.init($('stage'));
      S.Timeline.init($('timeline'));
      S.Inspector.init($('inspector'));
      S.Preview.onTick = (ms) => this.tick(ms);
      S.Preview.onError = (e) => this.showError(e, 'while playing');
      S.Preview.onStopped = () => this.refresh();
      this.wire();
      this.load(S.Model.newProject(), null);
      if (!host) PT.toast('Running without the desktop app: opening, saving and exporting files are off. Copy code still works.', 'warn', 8000);
    },

    /* ---------- the project ---------- */
    load(project, filePath) {
      this.project = S.Model.normalize(project);
      this.filePath = filePath;
      this.sel = { part: null, parts: new Set(), keys: new Set(), item: null, frames: null };
      this.undoStack = []; this.redoStack = [];
      this.hidden = new Set(); this.locked = new Set(); this.entered = null;
      S.Preview.settings = {};
      S.Preview.ms = 0; S.Preview.playing = false;
      this.setDirty(false);
      this.after({});
    },

    snapshot() { return JSON.stringify(this.project); },
    pushUndo(snap) {
      this.undoStack.push(snap);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
    },

    /* One change. opts.source = 'inspector': only refresh the inspector's values (don't rebuild it
       under the pointer). opts.coalesce: a run of changes with the same name is one undo step. */
    edit(fn, opts = {}) {
      const now = performance.now();
      const merge = opts.coalesce && this.lastCoalesce && this.lastCoalesce.key === opts.coalesce && now - this.lastCoalesce.t < 1500;
      if (!merge) this.pushUndo(this.snapshot());
      this.lastCoalesce = opts.coalesce ? { key: opts.coalesce, t: now } : null;
      fn(this.project);
      this.project = S.Model.normalize(this.project);
      this.setDirty(true);
      this.after(opts);
    },

    // a drag: one undo step, each move applied to the project as it was when the drag began
    dragStart() { this.dragSnap = this.snapshot(); this.pushUndo(this.dragSnap); this.lastCoalesce = null; },
    dragMove(fn) {
      if (!this.dragSnap) return;
      this.project = JSON.parse(this.dragSnap);
      fn(this.project);
      this.project = S.Model.normalize(this.project);
      this.setDirty(true);
      this.after({ source: 'inspector' });
    },
    dragEnd() { this.dragSnap = null; this.after({}); },

    undo() { this.step(this.undoStack, this.redoStack); },
    redo() { this.step(this.redoStack, this.undoStack); },
    step(from, to) {
      if (!from.length) return;
      to.push(this.snapshot());
      this.project = S.Model.normalize(JSON.parse(from.pop()));
      this.lastCoalesce = null;
      this.cleanSelection();
      this.setDirty(true);
      this.after({});
    },

    setDirty(v) {
      this.dirty = v;
      if (host) host.setDirty(v);
      const p = this.project;
      document.title = `${v ? '• ' : ''}${p.label} (${p.id}.js) · EasyTuber Animation Studio`;
    },

    // after any change: the action file, the preview, and every view
    after(opts) {
      this.regen();
      this.syncTopbar();
      S.Timeline.render();
      if (opts.source === 'inspector') S.Inspector.sync(); else S.Inspector.render();
      const media = JSON.stringify(this.project.assets);
      if (host && media !== this.mediaSent) { this.mediaSent = media; host.setMedia(this.project.assets); }
    },
    refresh() { S.Timeline.render(); S.Inspector.render(); this.syncTopbar(); },

    regen() {
      const p = this.project;
      this.code = S.Codegen.generate(p);
      this.issues = S.Codegen.validate(p);
      const err = S.Preview.setAction(p, this.code);
      if (err) this.showError(err, 'in the generated file'); else $('defError').hidden = true;
      $('codeText').textContent = this.code;
      $('codeIssues').replaceChildren(...this.issues.map((x) => el('div', { class: x.level }, (x.level === 'error' ? '✖ ' : '⚠ ') + x.msg)));
    },

    showError(e, where) {
      const box = $('defError');
      box.hidden = false;
      box.textContent = `The action failed ${where}: ${e && e.message ? e.message : e}`;
    },

    /* ---------- selection ---------- */
    /* Select a part. how: null = only this part, 'toggle' = add it to the selection or take it
       out (Ctrl+click), 'primary' = keep the selection and make this the part clicked last. */
    selectPart(id, keepKeys = false, how = null) {
      const s = this.sel;
      if (how === 'toggle' && id) {
        if (s.parts.has(id)) { s.parts.delete(id); if (s.part === id) s.part = [...s.parts].pop() || null; } else { s.parts.add(id); s.part = id; }
      } else if (how === 'primary' && id && s.parts.has(id)) s.part = id;
      else { s.parts = new Set(id ? [id] : []); s.part = id || null; }
      if (!keepKeys) { s.keys = new Set(); s.frames = null; }
      s.item = null;
      this.refresh();
    },
    isNode(id) { return !!(PT.PART[id] || S.Model.groupById(this.project, id)); },
    selectParts(ids) {
      const list = [...new Set(ids)].filter((id) => this.isNode(id));
      this.sel.parts = new Set(list);
      if (!list.includes(this.sel.part)) this.sel.part = list[list.length - 1] || null;
      this.sel.keys = new Set();
      this.sel.item = null;
      this.sel.frames = null;
      this.refresh();
    },
    // the selected parts and groups: groups first (in the order they were made), then parts in skeleton order
    selectedParts() {
      const order = [...this.project.groups.map((g) => g.id), ...PT.PARTS.map((d) => d.id)];
      return [...this.sel.parts].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    },
    select(item) {
      this.sel.item = item;
      this.sel.keys = new Set();
      this.sel.frames = null;
      if (item && item.kind !== 'effect') { this.sel.part = null; this.sel.parts = new Set(); }
      this.refresh();
    },
    isSelected(item) {
      const s = this.sel.item;
      if (!s || !item || s.kind !== item.kind) return false;
      return item.kind === 'effect' ? s.id === item.id : item.kind === 'state' ? s.name === item.name && s.t === item.t : s.i === item.i;
    },
    cleanSelection() {
      const p = this.project;
      this.sel.parts = new Set([...this.sel.parts].filter((id) => this.isNode(id)));
      if (this.entered && !S.Model.groupById(p, this.entered)) this.entered = null;
      if (this.sel.part && !this.sel.parts.has(this.sel.part)) this.sel.part = [...this.sel.parts].pop() || null;
      this.sel.keys = new Set([...this.sel.keys].filter((k) => {
        const [part, prop, t] = k.split('|');
        if (part.startsWith('state:')) return (p.states[part.slice(6)] || []).some((x) => x.t === +t);
        return S.Model.track(p, part, prop).some((x) => x.t === +t);
      }));
      const it = this.sel.item;
      if (it && ((it.kind === 'effect' && !p.effects.some((x) => x.id === it.id)) || (it.kind === 'sound' && !p.sounds[it.i]) || (it.kind === 'front' && !p.inFront[it.i]) || (it.kind === 'state' && !p.states[it.name].some((x) => x.t === it.t)))) this.sel.item = null;
    },

    /* ---------- layers: the eye and the lock, groups ---------- */
    // a part or group is hidden / locked when it is, or a group around it is
    layerHidden(id) { return this.hidden.has(id) || S.Model.groupChain(this.project, id).some((g) => this.hidden.has(g)); },
    layerLocked(id) { return this.locked.has(id) || S.Model.groupChain(this.project, id).some((g) => this.locked.has(g)); },
    hiddenParts() { return new Set(PT.PARTS.map((d) => d.id).filter((id) => this.layerHidden(id))); },
    toggleLayer(kind, id, only = false) {
      const set = this[kind];
      if (only) {
        // Alt+click (Flash): this layer alone shows / stays unlocked, or every layer back on
        const all = this.layerIds().filter((x) => x !== id);
        const allOn = all.every((x) => set.has(x)) && !set.has(id);
        this[kind] = allOn ? new Set() : new Set(all);
      } else if (set.has(id)) set.delete(id); else set.add(id);
      if (kind === 'locked') this.sel.parts = new Set([...this.sel.parts].filter((x) => !this.layerLocked(x)));
      this.refresh();
    },
    // every layer id: groups, then parts
    layerIds() { return [...this.project.groups.map((g) => g.id), ...PT.PARTS.map((d) => d.id)]; },
    toggleAllLayers(kind) {
      const ids = this.layerIds();
      this[kind] = ids.every((x) => this[kind].has(x)) ? new Set() : new Set(ids);
      if (kind === 'locked') this.sel.parts = new Set();
      this.refresh();
    },

    /* Ctrl+G: the selected parts and groups become a group (inside the group being edited) */
    groupSelection() {
      const ids = this.selectedParts();
      if (!ids.length) { PT.toast('Select the parts to group first (Ctrl+click or drag a box on the stage).'); return; }
      let gid = null;
      this.edit((q) => { gid = S.Model.makeGroup(q, ids); });
      if (!gid) { PT.toast('No more groups can be made.', 'warn'); return; }
      S.Timeline.openFolder(gid);
      this.selectParts([gid]);
      PT.toast(`${S.Model.groupById(this.project, gid).name}: ${ids.length} item${ids.length > 1 ? 's' : ''} grouped. Double-click it on the stage to edit inside it.`, 'ok');
    },
    /* Ctrl+Shift+G: break the selected groups apart */
    ungroupSelection() {
      const groups = this.selectedParts().filter((id) => S.Model.isGroup(id));
      if (!groups.length) { PT.toast('Select a group to ungroup.'); return; }
      const keyed = groups.filter((g) => this.project.tracks[g]);
      if (keyed.length && !window.confirm(`Ungrouping removes the group's own motion (its keys). The parts keep theirs. Ungroup?`)) return;
      const members = groups.flatMap((g) => S.Model.groupById(this.project, g).members);
      this.edit((q) => { for (const g of groups) S.Model.ungroup(q, g); });
      if (groups.includes(this.entered)) this.entered = null;
      this.selectParts(members);
    },
    renameGroup(gid, name) { this.edit((q) => { const g = S.Model.groupById(q, gid); if (g) g.name = String(name).trim().slice(0, 40) || g.id; }); },
    /* editing inside a group (double-click it on the stage): clicks pick what is in it */
    enterGroup(gid) {
      this.entered = gid && S.Model.groupById(this.project, gid) ? gid : null;
      if (this.entered) S.Timeline.openFolder(this.entered);
      this.refresh();
    },
    exitGroup() {
      const was = this.entered;
      if (!was) return false;
      this.entered = S.Model.groupOf(this.project, was);
      this.selectParts([was]);
      return true;
    },

    deleteSelection() {
      const { keys, item } = this.sel;
      if (keys.size) {
        const list = [...keys].map((s) => s.split('|'));
        this.edit((q) => {
          for (const [part, prop, t] of list) {
            if (part.startsWith('state:')) q.states[part.slice(6)] = q.states[part.slice(6)].filter((x) => x.t !== +t);
            else S.Model.removeKey(q, part, prop, +t);
          }
        });
        this.sel.keys = new Set();
        this.sel.item = null;
      } else if (item) {
        this.edit((q) => {
          if (item.kind === 'effect') q.effects = q.effects.filter((x) => x.id !== item.id);
          if (item.kind === 'sound') q.sounds.splice(item.i, 1);
          if (item.kind === 'front') q.inFront.splice(item.i, 1);
          if (item.kind === 'state') q.states[item.name] = q.states[item.name].filter((x) => x.t !== item.t);
        });
        this.sel.item = null;
      } else return;
      this.refresh();
    },

    /* ---------- time ---------- */
    playhead() { return S.Preview.timelineMs(); },
    frame() { return S.Model.toFrame(this.project, this.playhead()); },
    lastFrame() { return S.Model.frameCount(this.project) - 1; },
    seekFrame(f) { this.seek(S.Model.toMs(this.project, Math.max(0, Math.min(this.lastFrame(), f)))); },
    stepFrame(n) { this.pause(); this.seekFrame(this.frame() + n); },
    seek(ms) { S.Preview.seek(ms); S.Timeline.placeLine(); S.Inspector.sync(); this.tick(S.Preview.timelineMs()); },
    pause() { if (S.Preview.playing) { S.Preview.pause(); this.tick(this.playhead()); S.Inspector.sync(); } },
    togglePlay() { S.Preview.toggle(); this.tick(this.playhead()); },

    tick(ms) {
      const P = S.Preview;
      const shown = Math.round(ms);
      if (shown !== this.lastShown || P.playing !== this.lastPlaying) {
        const was = this.lastPlaying;
        this.lastShown = shown; this.lastPlaying = P.playing;
        const p = this.project, f = S.Model.toFrame(p, ms);
        $('timeReadout').textContent = `frame ${f + 1} / ${S.Model.frameCount(p)} · ${(shown / 1000).toFixed(2)} s`;
        $('btnPlay').textContent = P.playing ? '❚❚' : '▶';
        S.Timeline.placeLine();
        if (!P.playing || was !== P.playing) S.Inspector.sync();
      }
    },

    jumpKey(dir) {
      const t = Math.round(this.playhead());
      const times = S.Model.keyTimes(this.project);
      const next = dir > 0 ? times.find((x) => x > t) : [...times].reverse().find((x) => x < t);
      if (next !== undefined) { this.pause(); this.seek(next); }
    },

    /* the preview shows a key's value times this (the blend in / out and the strength) */
    factorAt(ms) {
      const p = this.project, c = (u) => Math.max(0, Math.min(1, u));
      // paused (posing), the stage leaves the blend out (see preview.js); playing, it's in
      let env = 1;
      if (S.Preview.playing) {
        env = p.blend.in > 0 ? c(ms / p.blend.in) : 1;
        if (!p.hold) env = Math.min(env, p.blend.out > 0 ? c((p.duration - ms) / p.blend.out) : 1);
      }
      const s = p.strength.on ? (S.Preview.settings.strength ?? p.strength.default) / 100 : 1;
      return env * s;
    },

    /* ---------- keys ---------- */
    // set a key; the first key of a track also gets rest keys at the start and end (auto rest keys)
    keyValue(q, part, prop, t, v) {
      if (this.autoRest && !S.Model.track(q, part, prop).length) {
        const rest = S.Model.REST[prop];
        if (t > 0) S.Model.setKey(q, part, prop, 0, rest);
        if (!q.hold && t < q.duration) S.Model.setKey(q, part, prop, q.duration, rest);
      }
      S.Model.setKey(q, part, prop, t, v);
    },
    // key the properties a part (or group) already moves (or where it is and its turn) at time t
    keyPartAt(q, id, t) {
      const tr = q.tracks[id] || {}, group = S.Model.isGroup(id);
      const space = group ? S.Model.FREE_PROPS : S.Tools.props;
      const mine = Object.keys(tr).filter((prop) => space.includes(prop));
      const props = mine.length ? mine : group || S.Tools.space === 'free' ? ['x', 'y', 'angle'] : ['rot'];
      for (const prop of props) this.keyValue(q, id, prop, t, S.Model.valueAt(q, id, prop, t));
    },
    keyPart(id) { this.keyParts(id ? [id] : []); },
    /* Where a change made at time t is keyed. Auto keyframe on (the default): at t. Off, as in
       Flash's classic tweens: on the keyframe that frame belongs to (the last one at or before it). */
    keyTime(id, t, q = this.project) {
      t = Math.round(t);
      if (this.autoKey) return t;
      const times = Object.values(q.tracks[id] || {}).flatMap((keys) => keys.map((k) => k.t)).filter((x) => x <= t);
      return times.length ? Math.max(...times) : t;
    },
    // key several parts at the playhead in one step (K keys every selected part)
    keyParts(ids) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) { PT.toast('Select a part first (Ctrl+click or drag a box for several).'); return; }
      const t = Math.round(this.playhead());
      this.edit((q) => { for (const id of ids) this.keyPartAt(q, id, t); });
    },
    // one property set to the same value on several parts, keyed at time t
    setOnParts(ids, prop, t, v, opts) {
      this.edit((q) => { for (const id of ids) this.keyValue(q, id, prop, this.keyTime(id, t, q), v); }, opts);
    },

    copyKeys(quiet = false) {
      const p = this.project;
      const keys = [...this.sel.keys].map((s) => { const [part, prop, t] = s.split('|'); return { part, prop, t: +t }; });
      if (!keys.length) return;
      // from the first selected frame (a key later in the selection keeps its distance from it)
      const f0 = this.sel.frames ? this.sel.frames.f0 : S.Model.toFrame(p, Math.min(...keys.map((k) => k.t)));
      const base = S.Model.toMs(p, f0);
      this.clip = keys.map((k) => {
        if (k.part.startsWith('state:')) { const x = p.states[k.part.slice(6)].find((y) => y.t === k.t); return x && { part: k.part, prop: 'v', dt: k.t - base, v: x.v }; }
        const x = S.Model.track(p, k.part, k.prop).find((y) => y.t === k.t);
        return x && { part: k.part, prop: k.prop, dt: k.t - base, v: x.v, ease: x.ease };
      }).filter(Boolean);
      if (!quiet) PT.toast(`${keys.length} key${keys.length > 1 ? 's' : ''} copied`);
    },
    pasteKeys() {
      if (!this.clip) return;
      const t = this.sel.frames ? S.Model.toMs(this.project, this.sel.frames.f0) : Math.round(this.playhead());
      const parts = new Set(this.clip.filter((k) => !k.part.startsWith('state:')).map((k) => k.part));
      // one part's keys, with other parts selected: they go on every selected part
      const sel = this.selectedParts();
      const onto = parts.size === 1 && sel.length && !(sel.length === 1 && parts.has(sel[0])) ? sel : null;
      const added = [];
      this.edit((q) => {
        for (const k of this.clip) {
          const at = Math.min(q.duration, S.Model.snapMs(q, t + k.dt));
          if (k.part.startsWith('state:')) { S.Model.setStateKey(q, k.part.slice(6), at, k.v); added.push(`${k.part}|v|${at}`); continue; }
          for (const part of onto || [k.part]) {
            S.Model.setKey(q, part, k.prop, at, k.v, k.ease);
            added.push(`${part}|${k.prop}|${at}`);
          }
        }
      });
      this.sel.keys = new Set(added);
      this.sel.frames = null;
      this.refresh();
    },

    addStateKey(name, t) {
      let v = name === 'eyes' ? 'closed' : name === 'mouth' ? 'open' : '';
      if (name === 'expression') {
        const ex = S.Preview.expressions();
        if (!ex.length) { PT.toast('This avatar has no expressions. Load your EasyTuber avatar (top right) to use one.', 'warn'); return; }
        v = ex[0].id;
      }
      this.edit((q) => S.Model.setStateKey(q, name, t, v));
      const at = Math.max(0, Math.min(this.project.duration, Math.round(t)));
      this.sel = { part: null, parts: new Set(), keys: new Set([`state:${name}|v|${at}`]), item: { kind: 'state', name, t: at }, frames: null };
      this.refresh();
    },

    addInFront(t) {
      const p = this.project;
      let parts = ['armRUpper', 'armRLower'];
      if (this.sel.parts.size) {
        const ids = new Set(this.selectedParts());
        for (const d of PT.PARTS) if (d.parent && ids.has(d.parent)) ids.add(d.id);
        parts = [...ids];
      }
      const from = Math.max(0, Math.min(p.duration - 100, Math.round(t)));
      this.edit((q) => q.inFront.push({ from, to: Math.min(q.duration, from + 1000), parts }));
      this.select({ kind: 'front', i: this.project.inFront.length - 1 });
    },

    async addSound(t) {
      if (!host) { PT.toast('Adding sounds needs the desktop app.', 'warn'); return; }
      const f = await host.pickFile('sound');
      if (!f) return;
      if (f.error) { PT.toast(f.error, 'error'); return; }
      this.edit((q) => { q.assets[f.name] = f.path; q.sounds.push({ t: Math.max(0, Math.min(q.duration, Math.round(t))), file: f.name, volume: 1, loop: false }); });
      this.select({ kind: 'sound', i: this.project.sounds.length - 1 });
    },
    async replaceSound(i) {
      if (!host) return;
      const f = await host.pickFile('sound');
      if (!f || f.error) { if (f) PT.toast(f.error, 'error'); return; }
      this.edit((q) => { q.assets[f.name] = f.path; q.sounds[i].file = f.name; });
    },

    addEffect(presetId) {
      const preset = S.Effects.BY_ID[presetId];
      const p = this.project, t = Math.round(this.playhead());
      const id = S.Model.uniqueId(preset.id, ['strength', ...p.effects.map((x) => x.id)]);
      const len = Math.min(p.duration, 1200), from = Math.max(0, Math.min(p.duration - len, t));
      const n = p.effects.filter((x) => x.preset === presetId).length;
      this.edit((q) => q.effects.push({
        id, preset: presetId, label: preset.label + (n ? ' ' + (n + 1) : ''), layer: 'front', from, to: from + len,
        anchor: { ...preset.anchor }, params: S.Effects.defaults(preset), toggle: true,
      }));
      this.select({ kind: 'effect', id });
      if (presetId === 'image') this.pickEffectImage(id);
    },
    duplicateEffect(id) {
      const p = this.project, fx = p.effects.find((x) => x.id === id);
      if (!fx) return;
      const nid = S.Model.uniqueId(fx.preset, ['strength', ...p.effects.map((x) => x.id)]);
      this.edit((q) => q.effects.push({ ...JSON.parse(JSON.stringify(fx)), id: nid, label: fx.label + ' copy' }));
      this.select({ kind: 'effect', id: nid });
    },
    async pickEffectImage(id) {
      if (!host) { PT.toast('Adding pictures needs the desktop app.', 'warn'); return; }
      const f = await host.pickFile('image');
      if (!f) return;
      if (f.error) { PT.toast(f.error, 'error'); return; }
      this.edit((q) => { const fx = q.effects.find((x) => x.id === id); if (!fx) return; q.assets[f.name] = f.path; fx.params.file = f.name; });
    },

    /* ---------- files ---------- */
    confirmDiscard() { return !this.dirty || window.confirm('The action has unsaved changes. Discard them?'); },

    newProject() { if (this.confirmDiscard()) this.load(S.Model.newProject(), null); },

    async open() {
      if (!host || !this.confirmDiscard()) return;
      const f = await host.openProject();
      if (!f) return;
      let project = null;
      if (/\.js$/i.test(f.path)) {
        project = S.Codegen.extractProject(f.text);
        if (!project) { PT.toast('That action file wasn\'t made with the studio, so it can\'t be opened for editing.', 'error', 6000); return; }
        project.assets = await host.locateMedia(f.path, project.id, S.Codegen.mediaFiles(project));
        this.load(project, null);
      } else {
        try { project = JSON.parse(f.text); } catch (e) { PT.toast('That file is not a studio project.', 'error'); return; }
        if (!project || project.format !== S.Model.FORMAT) { PT.toast('That file is not a studio project.', 'error'); return; }
        this.load(project, f.path);
      }
      PT.toast(`Opened ${this.project.label}`, 'ok');
    },

    async save(as = false) {
      if (!host) { PT.toast('Saving needs the desktop app.', 'warn'); return false; }
      const file = await host.saveProject(as ? null : this.filePath, JSON.stringify(this.project, null, 2), this.project.id);
      if (!file) return false;
      this.filePath = file;
      this.setDirty(false);
      PT.toast('Project saved', 'ok');
      return true;
    },

    // stop an export with errors; returns the media to copy { name: path }
    readyToExport() {
      const errors = this.issues.filter((x) => x.level === 'error');
      if (errors.length) { PT.toast(errors.map((x) => x.msg).join('\n'), 'error', 6000); this.showTab('codeView'); return null; }
      const media = {};
      for (const f of S.Codegen.mediaFiles(this.project)) if (this.project.assets[f]) media[f] = this.project.assets[f];
      return media;
    },

    async exportSave() {
      if (!host) { this.exportCopy(); return; }
      const media = this.readyToExport();
      if (!media) return;
      const r = await host.exportAction(this.project.id, this.code, media);
      if (!r) return;
      if (r.error) { PT.toast(r.error, 'error'); return; }
      const lines = [`Saved ${r.path}`];
      if (r.copied.length) lines.push(`Copied ${r.copied.length} file${r.copied.length > 1 ? 's' : ''} to ${r.folder}`);
      if (r.missing.length) lines.push(`Couldn't copy: ${r.missing.join(', ')}`);
      lines.push(this.project.mediaPrefix === 'user-actions'
        ? `Put ${this.project.id}.js${r.folder ? ` and the ${this.project.id} folder` : ''} in EasyTuber's actions folder (Actions tab > Open actions folder), then press Reload actions.`
        : `Put ${this.project.id}.js in js/actions/ and the folder in media/actions/ of the EasyTuber repo.`);
      PT.toast(lines.join('\n'), r.missing.length ? 'warn' : 'ok', 12000);
      host.showFile(r.path);
    },

    async exportCopy() {
      if (this.issues.some((x) => x.level === 'error')) { this.readyToExport(); return; }
      if (host) await host.copy(this.code); else await navigator.clipboard.writeText(this.code);
      const media = S.Codegen.mediaFiles(this.project);
      PT.toast(media.length ? `Code copied. Copy its files yourself into the ${this.project.id} folder: ${media.join(', ')}` : 'Code copied', media.length ? 'warn' : 'ok', 7000);
    },

    /* ---------- the avatar ---------- */
    async pickRig(kind) {
      const sel = $('rigPick');
      if (kind === 'placeholder') { S.Preview.usePlaceholder(); this.rigChanged(); return; }
      if (!host) { PT.toast('Loading your avatar needs the desktop app.', 'warn'); sel.value = S.Preview.rigKind; return; }
      const r = await host.loadAvatar(kind === 'pick');
      if (!r || r.error) {
        if (r) PT.toast(r.error, 'error', 7000);
        sel.value = S.Preview.rigKind === 'avatar' ? 'avatar' : 'placeholder';
        return;
      }
      try {
        await S.Preview.useAvatar(r.text);
        sel.value = 'avatar';
        PT.toast(`Previewing on ${S.Preview.rigName}`, 'ok');
      } catch (e) {
        PT.toast('That avatar could not be loaded: ' + e.message, 'error');
        S.Preview.usePlaceholder(); sel.value = 'placeholder';
      }
      this.rigChanged();
    },
    rigChanged() {
      this.cleanSelection();
      this.regen();
      this.refresh();
    },

    /* ---------- menus and tabs ---------- */
    menu(x, y, items) {
      const m = $('ctxMenu');
      m.replaceChildren(...items.map((it) => {
        if (it.sep) return el('hr');
        if (it.label) return el('div', { class: 'lbl' }, it.label);
        return el('button', { class: it.cur ? 'cur' : '', disabled: !!it.disabled, onclick: () => { m.hidden = true; it.run(); } }, el('span', {}, it.text), it.key ? el('kbd', {}, it.key) : null);
      }));
      m.hidden = false;
      const r = m.getBoundingClientRect();
      m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    },

    /* About: version, shortcuts, and the attributions the NOTICE file asks for */
    async toggleAbout() {
      const box = $('aboutBox');
      if (!box.hidden) { box.hidden = true; return; }
      const info = host && host.info ? host.info() : { version: 'dev', electron: '' };
      let runtime = '?';
      try { runtime = (await (await fetch('runtime/easytuber/VERSION')).text()).trim(); } catch (e) { /* unknown */ }
      const a = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
      const keys = [
        ['F  J', 'free motion (anywhere, your own pivot) / EasyTuber joints'], ['R  M  S', 'rotate / move / scale tool (Shift: move, Alt: scale)'], ['drag pivot', 'move a part\'s (or group\'s) pivot anywhere (Ctrl snaps)'],
        ['Enter, Space', 'play / stop'], ['Ctrl+Enter', 'play from the first frame'], [', .  ← →', 'previous / next frame (Shift+arrow: 10)'], ['Shift+, .', 'previous / next keyframe'], ['Home  End', 'first / last frame'],
        ['F5', 'insert frame (Shift+F5: remove frames)'], ['F6', 'insert keyframe (Shift+F6: clear keyframe)'], ['F7', 'insert blank keyframe'],
        ['drag frames', 'select frames; drag a keyframe or the selection to move it (Alt+drag copies)'], ['double-click', 'a frame: select its span'],
        ['Ctrl+Alt+C / X / V', 'copy / cut / paste frames'], ['Ctrl+Alt+A', 'select all frames'], ['Alt+Backspace', 'clear frames'],
        ['Ctrl+G', 'group the selected parts (Ctrl+Shift+G: ungroup)'], ['double-click', 'a group on the stage: edit inside it (Esc: back out)'],
        ['Ctrl+click', 'select several parts (stage or timeline)'], ['drag on stage', 'box-select parts'], ['Ctrl+A', 'select every layer'],
        ['K', 'key the selected layers at the playhead'], ['Ctrl+C / V', 'copy / paste keys'],
        ['Ctrl+wheel, - =', 'zoom the timeline (Shift+wheel scrolls it); drag its top edge for height'],
        ['Del', 'delete'], ['Ctrl+Z / Y', 'undo / redo'], ['Ctrl+S, Ctrl+E', 'save, export'],
      ];
      box.replaceChildren(
        el('h3', {}, 'EasyTuber Animation Studio'),
        el('div', { class: 'ver' }, `Version ${info.version} · EASY-TUBER runtime ${runtime}${info.electron ? ' · Electron ' + info.electron : ''}`),
        el('table', {}, keys.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, v)))),
        el('p', {}, 'Based on EasyTuber Animation Studio, created by pjcjonas — ', a('https://github.com/pjcjonas/EasyTuberAnimationStudio', 'github.com/pjcjonas/EasyTuberAnimationStudio')),
        el('p', {}, 'Based on EASY-TUBER, created by pjcjonas — ', a('https://github.com/pjcjonas/EasyTuber', 'github.com/pjcjonas/EasyTuber')),
        el('p', {}, 'Free software under the GNU General Public License version 3, with the additional terms in the NOTICE file. The action files you export are yours to use under any terms.'));
      box.hidden = false;
    },

    showTab(id) {
      for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === id);
      $('inspector').hidden = id !== 'inspector';
      $('codeView').hidden = id !== 'codeView';
    },

    syncTopbar() {
      const p = this.project, a = document.activeElement;
      if (a !== $('fId')) $('fId').value = p.id;
      if (a !== $('fLabel')) $('fLabel').value = p.label;
      if (a !== $('fDuration')) $('fDuration').value = S.Model.frameCount(p);
      $('fFps').value = p.fps;
      $('fSeconds').textContent = `${(p.duration / 1000).toFixed(2)} s`;
      $('fHold').checked = p.hold;
      $('heldControls').hidden = !p.hold;
      $('loopWrap').hidden = p.hold;
      $('btnUndo').disabled = !this.undoStack.length;
      $('btnRedo').disabled = !this.redoStack.length;
      this.setDirty(this.dirty);
    },

    /* ---------- wiring ---------- */
    wire() {
      const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
      on('btnNew', 'click', () => this.newProject());
      on('btnOpen', 'click', () => this.open());
      on('btnSave', 'click', () => this.save());
      on('btnExport', 'click', (e) => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
      for (const b of document.querySelectorAll('#exportMenu button')) {
        b.addEventListener('click', () => {
          $('exportMenu').hidden = true;
          ({ exportSave: () => this.exportSave(), exportCopy: () => this.exportCopy(), saveAs: () => this.save(true) })[b.dataset.cmd]();
        });
      }
      on('btnCopyCode', 'click', () => this.exportCopy());
      on('btnExportCode', 'click', () => this.exportSave());
      on('btnAbout', 'click', (e) => { e.stopPropagation(); this.toggleAbout(); });
      on('btnUndo', 'click', () => this.undo());
      on('btnRedo', 'click', () => this.redo());
      on('rigPick', 'change', (e) => this.pickRig(e.target.value));
      on('btnPickCancel', 'click', () => S.Tools.stopPick());

      on('fId', 'change', (e) => {
        const v = e.target.value.trim();
        if (!S.Model.ID.test(v)) { PT.toast('The id must be 1-40 letters, digits, - or _ (it becomes the file name).', 'error'); e.target.value = this.project.id; return; }
        this.edit((q) => { q.id = v; });
      });
      on('fLabel', 'change', (e) => this.edit((q) => { q.label = e.target.value.trim().slice(0, 60) || q.id; }));
      on('fDuration', 'change', (e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v)) { e.target.value = S.Model.frameCount(this.project); return; }
        this.edit((q) => S.Model.setDuration(q, S.Model.framesToDuration(q, v), this.stretch));
        S.Preview.seek(Math.min(S.Preview.ms, this.project.duration));
      });
      on('fFps', 'change', (e) => {
        const f = this.frame();
        this.edit((q) => S.Model.setFps(q, +e.target.value, this.keepTiming));
        this.seekFrame(f);
      });
      on('fHold', 'change', (e) => {
        this.pause();
        this.edit((q) => { q.hold = e.target.checked; if (q.hold) q.overlap = false; });
        S.Preview.ms = 0;
      });

      on('btnPlay', 'click', () => this.togglePlay());
      on('btnStart', 'click', () => { this.pause(); this.seek(0); });
      on('btnPrevKey', 'click', () => this.jumpKey(-1));
      on('btnNextKey', 'click', () => this.jumpKey(1));
      on('btnPrevFrame', 'click', () => this.stepFrame(-1));
      on('btnNextFrame', 'click', () => this.stepFrame(1));
      on('btnHeldOn', 'click', () => { S.Preview.ms = 0; S.Preview.play(); });
      on('btnHeldOff', 'click', () => S.Preview.turnOff());
      on('optLoop', 'change', (e) => { S.Preview.loop = e.target.checked; });
      on('optSpeed', 'change', (e) => { S.Preview.speed = parseFloat(e.target.value); });
      on('optIdle', 'change', (e) => { S.Preview.idle = e.target.checked; });
      on('optTalk', 'change', (e) => { S.Preview.talk = e.target.checked; });
      on('optBg', 'change', (e) => { S.Preview.bg = e.target.value; });
      on('btnFit', 'click', () => S.Preview.fitAvatar());
      for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => this.showTab(b.dataset.tab));

      window.addEventListener('pointerdown', (e) => {
        if (!$('ctxMenu').contains(e.target)) $('ctxMenu').hidden = true;
        if (!e.target.closest('.menu')) { $('exportMenu').hidden = true; $('aboutBox').hidden = true; }
      });
      window.addEventListener('keydown', (e) => this.key(e));
    },

    key(e) {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range';
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      // the timeline's frame commands (Flash's keys); F-keys work even from a field
      const T = S.Timeline;
      if (/^F[567]$/.test(e.key) && !ctrl) {
        e.preventDefault();
        if (e.key === 'F5') { if (e.shiftKey) T.removeFrames(); else T.insertFrames(); }
        else if (e.key === 'F6') { if (e.shiftKey) T.clearKeyframes(); else T.insertKeyframes(false); }
        else if (!e.shiftKey) T.insertKeyframes(true);
        return;
      }
      if (ctrl && e.altKey && !typing) {
        const frameCmd = { c: () => T.copyFrames(), x: () => T.cutFrames(), v: () => T.pasteFrames(), a: () => T.selectAllFrames() }[k];
        if (frameCmd) { e.preventDefault(); frameCmd(); return; }
      }
      if (ctrl && k === 'g' && !typing) { e.preventDefault(); if (e.shiftKey) this.ungroupSelection(); else this.groupSelection(); return; }
      if (ctrl && e.key === 'Enter') { e.preventDefault(); this.pause(); this.seek(0); this.togglePlay(); return; }
      if (ctrl) {
        const map = { s: () => this.save(e.shiftKey), o: () => this.open(), n: () => this.newProject(), e: () => this.exportSave() };
        if (map[k]) { e.preventDefault(); map[k](); return; }
        if (typing) return;
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
        if (k === 'c') { e.preventDefault(); this.copyKeys(); return; }
        if (k === 'v') { e.preventDefault(); this.pasteKeys(); return; }
        if (k === 'a') { e.preventDefault(); this.selectParts(S.Tools.topLevel().filter((id) => !this.layerLocked(id))); return; }
        return;
      }
      if (typing) return;
      const d = this.project.duration;
      if (e.code === 'Comma' || e.code === 'Period') {   // , . frame by frame; Shift: keyframe to keyframe
        const dir = e.code === 'Comma' ? -1 : 1;
        if (e.shiftKey) this.jumpKey(dir); else this.stepFrame(dir);
        return;
      }
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePlay(); break;
        case 'Enter': e.preventDefault(); this.togglePlay(); break;
        case 'Home': this.pause(); this.seek(0); break;
        case 'End': this.pause(); this.seek(d); break;
        case 'ArrowLeft': e.preventDefault(); this.stepFrame(e.shiftKey ? -10 : -1); break;
        case 'ArrowRight': e.preventDefault(); this.stepFrame(e.shiftKey ? 10 : 1); break;
        case 'Delete': this.deleteSelection(); break;
        case 'Backspace': if (e.altKey) T.clearFrames(); else this.deleteSelection(); break;
        case '=': case '+': S.Timeline.zoomBy(1.5); break;
        case '-': S.Timeline.zoomBy(1 / 1.5); break;
        case 'Escape':
          if (S.Tools.picking) S.Tools.stopPick();
          else if (!this.exitGroup()) { this.sel = { part: null, parts: new Set(), keys: new Set(), item: null, frames: null }; this.refresh(); }
          $('ctxMenu').hidden = true;
          break;
        default:
          if (k === 'k') this.keyParts(this.selectedParts());
          else if (k === 'r') S.Tools.setTool('rotate');
          else if (k === 'm') S.Tools.setTool('move');
          else if (k === 's') S.Tools.setTool('scale');
          else if (k === 'f') S.Tools.setSpace('free');
          else if (k === 'j') S.Tools.setSpace('joint');
      }
    },
  };

  S.App = App;
  window.addEventListener('DOMContentLoaded', () => {
    try { App.init(); } catch (e) { console.error(e); PT.toast('The studio could not start: ' + e.message, 'error', 15000); }
  });
})(window.Studio);
