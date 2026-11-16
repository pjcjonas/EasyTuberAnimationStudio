/* The preview: EasyTuber's own renderer, idle animator and action engine, playing the action file the
   studio is about to export. The frame is built in the same order as EasyTuber's app.js frame().

   Time is the studio's: the playhead (ms) is pushed into the running action every frame by moving
   its start time, so scrubbing, pausing and playing all go through the real engine.

   The studio only: layers hidden with the timeline's eye aren't drawn (they are still exported), and
   while paused the onion skin draws the frames around the playhead faintly underneath, earlier ones
   blue and later ones green (as in Animate), each one the real engine at that frame. */
(function (S) {
  const PT = window.PT, M = PT.M;
  const SEED = 0x5eed;          // the same random choices every time, so effects hold still while scrubbing
  const STILL_MOTION = { breathAmount: 0, idleSway: 0, headBob: 0, headTilt: 0, bodyBounce: 0, armSway: 0, gesture: 0, hairPhysics: 0, blinkInterval: 1e9, doubleBlink: 0, eyesFollow: 0, headFollow: 0 };
  const BG = { green: '#00ff00', dark: '#22202c', light: '#e8e6ef' };

  const Preview = {
    renderer: null, rig: null, rigKind: 'placeholder', rigName: 'Placeholder rig',
    animator: null, still: null,
    idle: true, talk: false, bg: 'checker',
    zoom: 1, panX: 0, panY: 0,
    ms: 0, playing: false, speed: 1, loop: true,
    project: null,              // the studio project (for duration, loop, sounds)
    def: null, defError: null, runError: null, restart: true,
    settings: {},               // values for the action's settings while previewing
    lastPose: null, lastStates: {},
    onTick: null,               // (ms) -> void, every frame (playhead)
    onStopped: null,            // a held action finished blending out
    overlay: null,              // (ctx, pose) -> void, drawn on top (stage tools)
    onion: { on: false, before: 2, after: 2 },   // frames shown either side of the playhead
    last: 0,

    init(canvas) {
      PT.Assets.initPlaceholders();
      this.renderer = new PT.Renderer(canvas);
      this.renderer.stageMode = true;
      this.renderer.view = () => this.view();   // zoom and pan; actions read the view from here too
      /* Paused, the stage shows the pose at the playhead at full strength: the blend in / out would
         fade it to nothing at the start and end of the timeline, where you are often posing.
         Playing shows the action exactly as EasyTuber plays it, fades included. */
      const ctx = PT.Actions.ctx;
      PT.Actions.ctx = function (run, now, project) {
        const c = ctx.call(this, run, now, project);
        if (!Preview.playing && !(run.def.hold && run.releaseAt != null)) c.envelope = () => 1;
        return c;
      };
      this.usePlaceholder();
      PT.Actions.page = 'cam';
      PT.Actions.onError = (def, e) => { this.runError = e; if (this.onError) this.onError(e); };
      window.addEventListener('resize', () => this.renderer.resize());
      this.last = performance.now();
      const loop = (now) => { try { this.frame(now); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },

    /* ---------- the avatar ---------- */
    usePlaceholder() {
      PT.Actions.stop();
      const p = PT.normalizeProject(null);
      p.root = { x: 460, y: -40, scale: 1.05 };      // the placeholder art is laid out on the left of the stage
      p.stage.placeholders = true;
      PT.Assets.clearAll();
      this.setRig(p, 'placeholder', 'Placeholder rig');
    },

    // text = an EasyTuber avatar file (avatar.easytuber.json)
    async useAvatar(text, name) {
      const raw = JSON.parse(text);
      PT.Actions.stop();
      this.loading = true;                  // no frames while the skeleton and the pictures change
      try {
        const p = PT.normalizeProject(raw); // rebuilds the skeleton for its own parts (PT.applyRig)
        await PT.Assets.loadProject(p);
        this.setRig(p, 'avatar', name || p.name || 'My avatar');
      } finally { this.loading = false; }
    },

    setRig(p, kind, name) {
      p.stage.actionSound = 'editor';
      p.stage.actionVolume = 100;
      this.rig = p; this.rigKind = kind; this.rigName = name;
      this.animator = new PT.Animator();
      this.still = new PT.Animator();
      this.still.nextBlink = Infinity;
      this.restart = true;
      this.fitNext = true;
    },

    expressions() { return (this.rig && this.rig.expressions) || []; },

    /* ---------- the action ---------- */
    // src = the generated action file; it replaces whatever the preview had
    setAction(project, src) {
      this.project = project;
      PT.Actions.stop();
      PT.Actions.defs.clear();
      this.def = null; this.runError = null;
      try {
        new Function(src)();
        this.def = PT.Actions.get(project.id);
        this.defError = this.def ? null : new Error('The file did not define the action.');
      } catch (e) {
        this.defError = e;
      }
      this.restart = true;
      return this.defError;
    },

    setSettings(values) { this.settings = values; this.restart = true; },

    /* ---------- time ---------- */
    get duration() { return this.project ? this.project.duration : 1000; },
    get held() { return !!(this.project && this.project.hold); },

    // the playhead on the timeline (a held action's time wraps round its loop)
    timelineMs() {
      const p = this.project;
      if (!p || !p.hold || this.ms < p.loop.to) return Math.min(this.ms, this.duration);
      const len = Math.max(1, p.loop.to - p.loop.from);
      return p.loop.from + (this.ms - p.loop.from) % len;
    },

    seek(ms) {
      this.ms = Math.max(0, Math.min(this.duration, ms));
      if (this.releasing()) this.restart = true;
      this.restart = this.restart || this.playing;
    },

    play() {
      if (!this.held && this.ms >= this.duration - 1) this.ms = 0;
      if (this.held && this.ms >= this.duration) this.ms = 0;
      this.playing = true; this.restart = true;
    },
    pause() { this.playing = false; if (this.held) this.ms = this.timelineMs(); },
    toggle() { if (this.playing) this.pause(); else this.play(); },

    // held actions: turn off the way EasyTuber does, blending out over the release time
    turnOff() {
      if (!this.def || !this.def.hold) return;
      if (!this.playing) this.play();
      PT.Actions.release(this.def.id, performance.now());
    },
    releasing() { return PT.Actions.running.some((r) => r.def === this.def && r.releaseAt != null); },

    advance(dms) {
      this.ms += dms;
      const d = this.duration;
      if (this.held) return;                 // runs on; the timeline shows it looping
      if (this.ms >= d) {
        if (this.loop) { this.ms %= d; this.restart = true; } else { this.ms = d; this.playing = false; }
      }
    },

    /* ---------- the view ---------- */
    view() {
      const c = this.renderer.canvas, dpr = this.renderer.dpr || 1, pad = 24 * dpr;
      const fit = Math.max(0.01, Math.min((c.width - pad * 2) / PT.STAGE_W, (c.height - pad * 2) / PT.STAGE_H));
      const k = fit * this.zoom;
      return M.mul(M.t(c.width / 2 + this.panX * dpr - (PT.STAGE_W * k) / 2, c.height / 2 + this.panY * dpr - (PT.STAGE_H * k) / 2), M.s(k));
    },
    fit() { this.zoom = 1; this.panX = 0; this.panY = 0; },
    // zoom in on the avatar: its drawn parts fill most of the view
    fitAvatar() {
      const pose = this.lastPose, rig = this.rig;
      // the last pose was drawn with the current view: measure it with that view, then reset
      const inv = M.inv(this.view());
      this.fit();
      if (!pose) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const def of PT.PARTS) {
        const part = rig.parts[def.id], e = PT.Assets.primary(def.id, rig.stage.placeholders);
        if (!part || !part.visible || !e || !pose[def.id]) continue;
        const b = e.bbox || { x: 0, y: 0, w: e.w, h: e.h };
        for (const [u, v] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
          const [x, y] = M.apply(inv, ...M.apply(pose[def.id].world, u, v));
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      if (!(x1 > x0 && y1 > y0)) return;
      const c = this.renderer.canvas, dpr = this.renderer.dpr || 1, pad = 24 * dpr;
      const base = Math.min((c.width - pad * 2) / PT.STAGE_W, (c.height - pad * 2) / PT.STAGE_H);
      const k = Math.min((0.7 * c.width) / (x1 - x0), (0.7 * c.height) / (y1 - y0));
      this.zoom = Math.max(1, Math.min(8, k / base));
      const kk = base * this.zoom;
      this.panX = ((PT.STAGE_W / 2 - (x0 + x1) / 2) * kk) / dpr;
      this.panY = ((PT.STAGE_H / 2 - (y0 + y1) / 2) * kk) / dpr;
    },
    zoomAt(factor, cx, cy) {
      // keep the point under the pointer (canvas pixels) where it is
      const dpr = this.renderer.dpr || 1;
      const before = M.apply(M.inv(this.view()), cx, cy);
      this.zoom = Math.max(0.25, Math.min(8, this.zoom * factor));
      const after = M.apply(this.view(), before[0], before[1]);
      this.panX -= (after[0] - cx) / dpr; this.panY -= (after[1] - cy) / dpr;
    },

    clear() {
      const { ctx, canvas } = this.renderer;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#110f17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const v = this.view();
      const [x0, y0] = M.apply(v, 0, 0), [x1, y1] = M.apply(v, PT.STAGE_W, PT.STAGE_H);
      if (this.bg === 'checker') {
        if (!this.checker) {
          const c = document.createElement('canvas'); c.width = c.height = 24;
          const g = c.getContext('2d');
          g.fillStyle = '#26232f'; g.fillRect(0, 0, 24, 24);
          g.fillStyle = '#1e1b27'; g.fillRect(0, 0, 12, 12); g.fillRect(12, 12, 12, 12);
          this.checker = ctx.createPattern(c, 'repeat');
        }
        ctx.fillStyle = this.checker;
      } else ctx.fillStyle = BG[this.bg] || '#22202c';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    },

    /* keep the engine's run of the action at the studio's time */
    syncRun(now) {
      const def = this.def;
      if (!def || this.runError) return;
      let run = PT.Actions.running.find((r) => r.def === def);
      if (run && run.releaseAt != null) {
        if (this.restart && !this.playing) { PT.Actions.stop(); run = null; } else { run.t0 = now - this.ms; return; }
      }
      if (!run || this.restart) {
        PT.Actions.stop();
        if (!PT.Actions.play(def.id, { seed: SEED }, this.rig, now - this.ms)) return;
        run = PT.Actions.running.find((r) => r.def === def);
        if (!run) return;
        // sounds before the playhead have had their moment: don't start them all at once
        run.sounds = new Map();
        for (const s of this.project.sounds) if (s.t < this.ms - 1) run.sounds.set(S.Codegen.mediaPath(this.project, s.file), null);
        this.restart = false;
      }
      // a timed action must not reach its end while the studio holds it there
      run.t0 = now - (def.hold ? this.ms : Math.min(this.ms, def.duration - 0.5));
    },

    frame(now) {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const R = this.renderer, rig = this.rig;
      if (this.loading) return;
      if (this.playing) this.advance(dt * 1000 * this.speed);
      if (this.def) rig.actions = { [this.def.id]: { settings: this.settings } };
      PT.Actions.page = this.playing ? 'editor' : 'cam';   // sounds only while playing
      const wasReleasing = this.releasing();
      this.syncRun(now);

      const level = this.talk ? 0.45 + 0.4 * Math.abs(Math.sin(now / 1000 * 7.3)) * (Math.sin(now / 1000 * 1.7) > -0.6 ? 1 : 0) : 0;
      const anim = this.idle
        ? this.animator.update(dt, level, rig.motion, rig.mic)
        : this.still.update(dt, level, { ...rig.motion, ...STILL_MOTION }, rig.mic);
      const act = PT.Actions.update(now, rig);
      if (wasReleasing && !PT.Actions.running.some((r) => r.def === this.def)) {
        // a held action finished blending out: back to the start, paused
        this.playing = false; this.ms = 0; this.restart = true;
        if (this.onStopped) this.onStopped();
      }

      R.resize();
      // layers hidden in the timeline: left out of this frame only
      const hidden = [];
      if (S.App && S.App.project) for (const id of S.App.hiddenParts()) if (rig.parts[id] && rig.parts[id].visible) { rig.parts[id].visible = false; hidden.push(id); }
      try {
        const pose = R.computePose(rig, act ? PT.Actions.mergeDeltas(anim.deltas, act.deltas) : anim.deltas);
        this.clear();
        if (this.onion.on && !this.playing && act) this.drawOnion(now, rig, anim);
        if (act) PT.Actions.setPose(pose, R);
        if (act) PT.Actions.draw('behind', R);
        const states = { ...anim.states, expression: '', ...(act ? act.states : {}) };
        R.drawRigFx(rig, pose, states, {
          order: act ? PT.Actions.drawOrder(rig.order) : null,
          fx: act && PT.Actions.hasPartFx ? (id) => PT.Actions.partFx(id) : null,
        }, PT.stageFx(rig.stage, anim.vol, false));
        if (act) PT.Actions.draw('front', R);
        this.lastPose = pose; this.lastStates = states;
      } finally {
        for (const id of hidden) rig.parts[id].visible = true;
      }
      if (this.fitNext && R.canvas.width > 1) { this.fitNext = false; this.fitAvatar(); }
      if (this.overlay) this.overlay(R.ctx, this.lastPose);
      if (this.onTick) this.onTick(this.timelineMs());
    },
  };

  /* The onion skin: the action at the frames around the playhead, each drawn off screen, tinted and
     put under the stage faintly (nearer frames stronger). The run is put back afterwards. */
  Preview.drawOnion = function (now, rig, anim) {
    const run = PT.Actions.running.find((r) => r.def === this.def), p = this.project;
    if (!run || run.releaseAt != null || !p) return;
    const R = this.renderer, main = R.ctx, M = S.Model;
    const c = this.onionCanvas || (this.onionCanvas = document.createElement('canvas'));
    if (c.width !== R.canvas.width || c.height !== R.canvas.height) { c.width = R.canvas.width; c.height = R.canvas.height; }
    const g = c.getContext('2d');
    const t0 = run.t0, sounds = run.sounds, f = M.toFrame(p, this.timelineMs()), last = M.frameCount(p) - 1;
    const end = this.def.hold ? Infinity : this.def.duration - 0.5;
    try {
      for (const [dir, n, tint] of [[-1, this.onion.before, 'rgba(70,130,255,.6)'], [1, this.onion.after, 'rgba(70,215,130,.6)']]) {
        for (let i = n; i >= 1; i--) {
          const at = f + dir * i;
          if (at < 0 || at > last) continue;
          run.t0 = now - Math.min(M.toMs(p, at), end);
          run.sounds = new Map(sounds || []);   // nothing heard from the ghosts
          run.state.free = null;
          const act = PT.Actions.update(now, rig);
          if (!act) break;
          const pose = R.computePose(rig, PT.Actions.mergeDeltas(anim.deltas, act.deltas));
          PT.Actions.setPose(pose, R);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-over';
          g.clearRect(0, 0, c.width, c.height);
          R.ctx = g;
          try {
            R.drawRig(rig, pose, { ...anim.states, expression: '', ...act.states }, {
              order: PT.Actions.drawOrder(rig.order),
              fx: PT.Actions.hasPartFx ? (id) => PT.Actions.partFx(id) : null,
            });
          } finally { R.ctx = main; }
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = tint;
          g.fillRect(0, 0, c.width, c.height);
          main.save();
          main.setTransform(1, 0, 0, 1, 0, 0);
          main.globalAlpha = 0.45 * (1 - (i - 1) / (n + 1));
          main.drawImage(c, 0, 0);
          main.restore();
        }
      }
    } finally {
      run.t0 = t0; run.sounds = sounds; run.state.free = null;
      PT.Actions.update(now, rig);   // the engine back at the playhead
    }
  };

  S.Preview = Preview;
})(window.Studio);
