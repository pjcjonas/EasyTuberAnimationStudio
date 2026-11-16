/* Posing on the stage: click a part to select it, drag to key it at the playhead.

   Two kinds of motion (the Free / Joint switch on the stage, or F / J):
     Free   every part is its own layer on the 1920x1080 stage: move it anywhere, turn and size it
            around a pivot you put wherever you like (drag the pink crosshair; Ctrl snaps it to the
            joint, the middle, an edge or a corner), fade it. Nothing else moves with it, unless you
            tick "children go with it" for that part.
     Joint  EasyTuber's own rig motion: turn around the joint the avatar gives the part.
   The tool (R / M / S) says what a drag does: Rotate, Move or Scale. Shift moves and Alt scales,
   whatever the tool. Ctrl+click adds a part to the selection or takes it out; drag on empty stage to
   box-select. With several parts selected a drag changes them all; a part carried by a selected
   parent is left to its parent, so nothing moves twice. Wheel zooms, middle-drag pans.

   Groups work as in Flash: a click on a part in a group picks the whole group (its own pivot, the
   cyan-boxed crosshair, can be dragged too); double-click it to edit inside it (the bar at the top
   says where you are; Esc or a double-click on empty stage backs out). Locked layers can't be
   picked (a click goes through them) and hidden ones aren't drawn. */
(function (S) {
  const PT = window.PT, M = PT.M;
  const TOOLS = ['rotate', 'move', 'scale'];
  const SPACES = ['free', 'joint'];

  const Tools = {
    canvas: null, drag: null, picking: null, tool: 'rotate', space: 'free', hover: null, pointer: null, showPivots: true,

    init(canvas) {
      this.canvas = canvas;
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      canvas.addEventListener('pointerup', (e) => this.up(e));
      canvas.addEventListener('pointercancel', (e) => this.up(e));
      canvas.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.pointer = null; } });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [x, y] = this.px(e);
        S.Preview.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
      }, { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('dblclick', (e) => this.dbl(e));
      for (const b of document.querySelectorAll('#stageTools [data-tool]')) b.addEventListener('click', () => this.setTool(b.dataset.tool));
      for (const b of document.querySelectorAll('#stageTools [data-space]')) b.addEventListener('click', () => this.setSpace(b.dataset.space));
      const piv = document.getElementById('optPivots');
      if (piv) piv.addEventListener('change', () => { this.showPivots = piv.checked; });
      this.setTool('rotate');
      this.setSpace('free');
      S.Preview.overlay = (ctx, pose) => this.drawOverlay(ctx, pose);
    },

    setTool(t) {
      if (!TOOLS.includes(t)) return;
      this.tool = t;
      for (const b of document.querySelectorAll('#stageTools [data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
      this.canvas.dataset.tool = t;
    },
    setSpace(s) {
      if (!SPACES.includes(s)) return;
      this.space = s;
      for (const b of document.querySelectorAll('#stageTools [data-space]')) b.classList.toggle('on', b.dataset.space === s);
      if (S.App && S.App.project) S.App.refresh();
    },
    get props() { return this.space === 'free' ? S.Model.FREE_PROPS : S.Model.JOINT_PROPS; },

    // pointer position in canvas pixels
    px(e) {
      const r = this.canvas.getBoundingClientRect(), dpr = S.Preview.renderer.dpr || 1;
      return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
    },

    /* ---------- where parts are drawn (with their free motion) ---------- */
    // the running action's free motion for a part: { dx, dy, rot, scale, alpha, hide } or null
    fxOf(id) {
      if (!PT.Actions.hasPartFx) return null;
      try { return PT.Actions.partFx(id); } catch (e) { return null; }
    },
    // the free motion of the action, as maps of the stage per part and group (see codegen freeSource)
    freeState() {
      const run = PT.Actions.running.find((r) => S.Preview.def && r.def === S.Preview.def);
      return (run && run.state.free) || null;
    },
    freeMaps() { const st = this.freeState(); return (st && st.maps) || {}; },
    groupMaps() { const st = this.freeState(); return (st && st.groups) || {}; },

    /* ---------- groups ---------- */
    // what you can pick at this level: the members of the group being edited, or the top level
    topLevel() {
      const p = S.App.project, Mo = S.Model;
      if (S.App.entered) { const g = Mo.groupById(p, S.App.entered); if (g) return g.members.slice(); }
      const rig = S.Preview.rig;
      const parts = PT.PARTS.filter((d) => rig.parts[d.id] && rig.parts[d.id].visible).map((d) => d.id);
      return [...p.groups.filter((g) => !Mo.groupOf(p, g.id)).map((g) => g.id), ...parts.filter((id) => !Mo.groupOf(p, id))];
    },
    // what a click on a part picks: the outermost group it is in, or inside the group being edited the
    // item of that group it is in; null when that is locked
    target(part) {
      if (!part) return null;
      const chain = [part, ...S.Model.groupChain(S.App.project, part)];   // innermost first
      const i = S.App.entered ? chain.indexOf(S.App.entered) : -1;
      const pick = i > 0 ? chain[i - 1] : chain[chain.length - 1];
      return S.App.layerLocked(pick) ? null : pick;
    },
    insideEntered(part) { return !S.App.entered || S.Model.groupChain(S.App.project, part).includes(S.App.entered); },
    // where a group's pivot is drawn: from the running action, or (no free motion yet) the middle
    // of its parts as they rest, moved by its pivot
    groupPivot(gid, pose = S.Preview.lastPose) {
      const st = this.freeState();
      if (st && st.pivots && st.pivots[gid]) return M.apply(S.Preview.view(), st.pivots[gid][0], st.pivots[gid][1]);
      const parts = S.Model.groupParts(S.App.project, gid).filter((id) => PT.PART[id] && pose && pose[id] && this.artBox(id));
      const g = S.Model.groupById(S.App.project, gid);
      if (!parts.length || !g) return null;
      let x = 0, y = 0;
      for (const id of parts) { const b = this.artBox(id), q = M.apply(pose[id].world, b.x + b.w / 2, b.y + b.h / 2); x += q[0]; y += q[1]; }
      const k = S.Preview.view()[0];
      return [x / parts.length + g.pivot.x * k, y / parts.length + g.pivot.y * k];
    },
    // the box around everything in a group, as drawn now (canvas pixels): [x0, y0, x1, y1]
    groupBox(gid, pose = S.Preview.lastPose) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of S.Model.groupParts(S.App.project, gid)) {
        const box = pose && pose[id] && this.artBox(id), fx = this.fxOf(id), part = S.Preview.rig.parts[id];
        if (!box || !part || !part.visible || (fx && fx.hide) || S.App.layerHidden(id)) continue;
        const w = this.artMatrix(id, pose);
        for (const [u, v] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) {
          const [x, y] = M.apply(w, u, v);
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      return x1 > x0 ? [x0, y0, x1, y1] : null;
    },
    // the frame a part's or group's free move is in: [a, b] (turn and size) of the map carrying it
    frameOf(id, maps = this.freeMaps(), groups = this.groupMaps()) {
      const p = S.App.project, Mo = S.Model;
      if (Mo.isGroup(id)) { const up = Mo.groupOf(p, id), m = up && groups[up]; return m ? [m[0], m[1]] : [1, 0]; }
      const par = PT.PART[id] && PT.PART[id].parent;
      if (par && p.follow[par] === true && maps[par]) return [maps[par][0], maps[par][1]];
      const g = Mo.groupOf(p, id), m = g && groups[g];
      return m ? [m[0], m[1]] : [1, 0];
    },
    // the bar at the top of the stage while editing inside a group: Scene ▸ Group 1 ▸ …
    syncCrumbs() {
      const box = document.getElementById('crumbs');
      if (!box) return;
      const p = S.App.project, e = S.App.entered;
      const chain = e ? [e, ...S.Model.groupChain(p, e)].reverse() : [];
      const key = chain.map((g) => g + ':' + (S.Model.groupById(p, g) || {}).name).join('/');
      if (key === this.crumbKey) return;
      this.crumbKey = key;
      box.hidden = !chain.length;
      box.replaceChildren(
        PT.el('button', { title: 'Back to the whole avatar (Esc)', onclick: () => S.App.enterGroup(null) }, '◂ Scene'),
        ...chain.flatMap((g, i) => [PT.el('span', {}, '▸'), PT.el('button', { class: i === chain.length - 1 ? 'cur' : '', onclick: () => S.App.enterGroup(g) }, (S.Model.groupById(p, g) || {}).name || g)]));
    },
    // double-click: a group opens for editing inside it; on empty stage, back out one level
    dbl(e) {
      if (this.picking) return;
      const [x, y] = this.px(e), part = this.hit(x, y);
      if (!part || !this.insideEntered(part)) { if (S.App.entered) S.App.exitGroup(); return; }
      const pick = this.target(part);
      if (pick && S.Model.isGroup(pick)) {
        S.App.enterGroup(pick);
        const inner = this.target(part);
        if (inner) S.App.selectPart(inner);
      }
    },
    // a matrix from the part's image to the canvas as it is drawn: like the renderer, the free
    // motion turns and scales around the drawing's middle and moves in stage units
    artMatrix(id, pose = S.Preview.lastPose, m = null) {
      const w = m || pose[id].world, fx = this.fxOf(id);
      if (!fx) return w;
      const box = this.artBox(id);
      if (!box) return w;
      const k = S.Preview.view()[0];
      const [cx, cy] = M.apply(w, box.x + box.w / 2, box.y + box.h / 2);
      return M.chain(M.t(cx + (fx.dx || 0) * k, cy + (fx.dy || 0) * k), M.r(fx.rot || 0), M.s(fx.scale ?? 1), M.t(-cx, -cy), w);
    },

    // the topmost part under a canvas point, where parts are drawn now (alpha-accurate)
    hit(x, y) {
      const P = S.Preview, rig = P.rig, pose = P.lastPose;
      if (!pose) return null;
      const usePH = rig.stage.placeholders, states = P.lastStates || {};
      const order = PT.Actions.active ? PT.Actions.drawOrder(rig.order) : rig.order;
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i], part = rig.parts[id], def = PT.PART[id];
        if (!part || !part.visible || !def || !pose[id] || S.App.layerHidden(id) || S.App.layerLocked(id)) continue;
        const fx = this.fxOf(id);
        if (fx && fx.hide) continue;
        const r = PT.Assets.resolve(id, def.states.length > 1 ? (states[id] || def.states[0]) : 'main', usePH, states.expression);
        if (!r) continue;
        let m = P.renderer.entryMatrix(pose, id, r.entry, r.squash, usePH, part.adj && part.adj[r.state]);
        if (fx) {
          const bb = r.entry.bbox, k = P.view()[0], [cx, cy] = M.apply(m, bb.x + bb.w / 2, bb.y + bb.h / 2);
          m = M.chain(M.t(cx + (fx.dx || 0) * k, cy + (fx.dy || 0) * k), M.r(fx.rot || 0), M.s(fx.scale ?? 1), M.t(-cx, -cy), m);
        }
        const [u, v] = M.apply(M.inv(m), x, y), e = r.entry;
        if (u < 0 || v < 0 || u >= e.w || v >= e.h) continue;
        const mx = Math.min(e.mask.w - 1, Math.floor(u / e.mask.sx)), my = Math.min(e.mask.h - 1, Math.floor(v / e.mask.sy));
        if (e.mask.alpha[my * e.mask.w + mx] > 24) return id;
      }
      return null;
    },

    // the part's drawn area (its art without transparent margins), in image pixels
    artBox(id) {
      const e = PT.Assets.primary(id, S.Preview.rig.stage.placeholders);
      return e ? (e.bbox || { x: 0, y: 0, w: e.w, h: e.h }) : null;
    },
    // a point u, v across and down the part's drawing, on the canvas as drawn now
    artPoint(id, u, v, pose = S.Preview.lastPose) {
      const box = this.artBox(id);
      return box && pose && pose[id] ? M.apply(this.artMatrix(id, pose), box.x + u * box.w, box.y + v * box.h) : null;
    },
    center(id, pose) { return this.artPoint(id, 0.5, 0.5, pose); },
    // EasyTuber's joint for the part, as drawn now
    rigJoint(id, pose = S.Preview.lastPose) {
      const p = S.Preview.rig.parts[id];
      return pose && pose[id] && p ? M.apply(this.artMatrix(id, pose), p.px, p.py) : null;
    },
    // the free pivot as { u, v } across the drawing (the joint, worked out; the middle when not set)
    freePivot(id) {
      const pv = S.App.project.pivots[id];
      if (pv && pv.joint) {
        const rp = S.Preview.rig.parts[id], box = this.artBox(id);
        return rp && box ? { u: (rp.px - box.x) / box.w, v: (rp.py - box.y) / box.h, joint: true } : { u: 0.5, v: 0.5 };
      }
      return pv || { u: 0.5, v: 0.5 };
    },
    // the point a drag turns the part (or group) around, in the current mode
    joint(id, pose = S.Preview.lastPose, space = this.space) {
      if (S.Model.isGroup(id)) return this.groupPivot(id, pose);
      if (space === 'joint') return this.rigJoint(id, pose);
      const pv = this.freePivot(id);
      return this.artPoint(id, pv.u, pv.v, pose);
    },
    // canvas pixels -> stage pixels (the 1920x1080 stage)
    toStage(pt) { return M.apply(M.inv(S.Preview.view()), pt[0], pt[1]); },

    // the selected parts that a turn or move goes on: not those carried by a selected parent
    roots(ids, space = this.space) {
      const set = new Set(ids), p = S.App.project, free = space === 'free';
      return ids.filter((id) => {
        if (S.Model.groupChain(p, id).some((g) => set.has(g))) return false;   // carried by a selected group
        if (S.Model.isGroup(id)) return true;
        for (let a = PT.PART[id] && PT.PART[id].parent; a; a = PT.PART[a] && PT.PART[a].parent) {
          if (free && p.follow[a] !== true) return true;    // free parts move on their own
          if (set.has(a)) return false;
        }
        return true;
      });
    },

    startPick(cb) { this.picking = cb; this.canvas.classList.add('picking'); document.getElementById('pickBanner').hidden = false; },
    stopPick() { this.picking = null; this.canvas.classList.remove('picking'); document.getElementById('pickBanner').hidden = true; },

    /* ---------- pointer ---------- */
    down(e) {
      const [x, y] = this.px(e);
      const dpr = S.Preview.renderer.dpr || 1;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      if (e.button === 1) {
        this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, px: S.Preview.panX, py: S.Preview.panY };
        return;
      }
      if (e.button !== 0) return;
      // the pink crosshair of a selected part (in free mode) or group: drag it to move the pivot
      if (!this.picking) {
        for (const id of S.App.sel.parts) {
          const group = S.Model.isGroup(id);
          if (!group && this.space !== 'free') continue;
          const j = this.joint(id);
          if (j && Math.hypot(x - j[0], y - j[1]) < 11 * dpr) {
            if (S.Preview.playing) S.App.pause();
            const g = group && S.Model.groupById(S.App.project, id);
            this.drag = { mode: 'pivot', id, x, y, moved: false, gpiv0: g ? { ...g.pivot } : null, s0: this.toStage([x, y]) };
            this.canvas.classList.add('dragging');
            return;
          }
        }
      }
      const part = this.hit(x, y);
      if (this.picking) {
        const id = part;
        if (id) {
          const box = this.artBox(id);
          const [ix, iy] = M.apply(M.inv(this.artMatrix(id)), x, y);
          const round = (v) => Math.round(v * 100) / 100;
          this.picking({ part: id, u: box ? round((ix - box.x) / box.w) : 0.5, v: box ? round((iy - box.y) / box.h) : 0.5 });
        }
        this.stopPick();
        return;
      }
      const add = e.ctrlKey || e.metaKey;
      // a click outside the group being edited leaves it (as in Flash)
      if (part && !this.insideEntered(part)) S.App.entered = null;
      const id = this.target(part);
      if (!id) {
        // empty stage: drag a box to select the parts inside it (Ctrl adds to the selection)
        this.drag = { mode: 'box', x, y, x1: x, y1: y, add, moved: false };
        return;
      }
      if (add) { S.App.selectPart(id, false, 'toggle'); return; }
      // a part that is already selected moves with the rest of the selection
      if (S.App.sel.parts.has(id)) S.App.selectPart(id, false, 'primary'); else S.App.selectPart(id);
      if (S.Preview.playing) S.App.pause();
      const t = S.App.playhead(), p = S.App.project;
      const ids = S.App.selectedParts();
      // groups only move freely: a drag with a group in it is a free one
      const space = ids.some((pid) => S.Model.isGroup(pid)) ? 'free' : this.space;
      // where each one is keyed: at the playhead, or (auto keyframe off) on the keyframe before it
      const times = {}, start = {};
      for (const pid of ids) {
        times[pid] = S.App.keyTime(pid, t);
        start[pid] = {};
        for (const prop of S.Model.PROPS) start[pid][prop] = S.Model.valueAt(p, pid, prop, times[pid]);
      }
      const mode = e.altKey ? 'scale' : e.shiftKey ? 'move' : this.tool;
      const roots = this.roots(ids, space);
      // the one that really turns: the grabbed one, or the selected parent or group that carries it
      let anchor = id;
      for (let pa = PT.PART[id] && PT.PART[id].parent; pa; pa = PT.PART[pa] && PT.PART[pa].parent) if (start[pa] && roots.includes(pa)) anchor = pa;
      for (const g of S.Model.groupChain(p, id)) if (start[g] && roots.includes(g)) anchor = g;
      const j = this.joint(anchor, undefined, space) || [x, y];
      // a free move goes in the frame of what carries it (its parent, or its group): undo its turn and size
      const maps = this.freeMaps(), groups = this.groupMaps(), frame = {};
      for (const pid of ids) frame[pid] = this.frameOf(pid, maps, groups);
      // grabbed right next to the pivot, the angle swings wildly: turn by sideways distance instead
      const near = Math.hypot(x - j[0], y - j[1]) < 18 * dpr;
      const a0 = Math.atan2(y - j[1], x - j[0]);
      // free, several parts: they turn and scale as one group around the grabbed part's pivot
      const pstart = {};
      if (space === 'free') for (const pid of roots) { const q = this.joint(pid, undefined, 'free'); if (q) pstart[pid] = this.toStage(q); }
      this.drag = { mode, space, id: anchor, ids, roots, frame, pstart, t, times, start, x, y, j, near, a0, last: a0, turned: 0, k: S.App.factorAt(t), moved: false, readout: '' };
      this.canvas.classList.add('dragging');
    },

    move(e) {
      const d = this.drag;
      const [x, y] = this.px(e);
      this.pointer = [x, y];
      if (!d) {
        this.hover = this.picking ? null : this.hit(x, y);
        this.canvas.classList.toggle('over', !!this.hover);
        return;
      }
      if (d.mode === 'pan') {
        S.Preview.panX = d.px + (e.clientX - d.x); S.Preview.panY = d.py + (e.clientY - d.y);
        return;
      }
      if (d.mode === 'box') { d.x1 = x; d.y1 = y; d.moved = d.moved || Math.hypot(x - d.x, y - d.y) > 3; return; }
      if (!d.moved) {
        if (Math.hypot(x - d.x, y - d.y) < 3) return;
        d.moved = true;
        S.App.dragStart();
      }
      if (d.mode === 'pivot') return this.movePivot(d, x, y, e);
      const dpr = S.Preview.renderer.dpr || 1, free = d.space === 'free';
      // the preview shows a key's value scaled by the strength: undo that, so the part follows the pointer
      const k = d.k > 0.15 ? d.k : 1;
      const r1 = (v) => Math.round(v * 10) / 10;
      const change = {};
      if (d.mode === 'rotate') {
        let turn;
        if (d.near) turn = ((x - d.x) / dpr) * 0.5;
        else {
          // add up small steps, so going past half a turn doesn't flip round
          const a = Math.atan2(y - d.j[1], x - d.j[0]);
          let step = (a - d.last) * 180 / Math.PI;
          step = ((step + 540) % 360) - 180;
          d.turned += step; d.last = a;
          turn = d.turned;
        }
        const prop = free ? 'angle' : 'rot';
        let v = d.start[d.id][prop] + turn / k;
        if (e.ctrlKey) v = Math.round(v / 15) * 15;   // snaps the part under the pointer
        const delta = v - d.start[d.id][prop];
        for (const pid of d.roots) change[pid] = { [prop]: r1(d.start[pid][prop] + delta) };
        if (free && d.roots.length > 1) {
          // each pivot swings round the grabbed part's pivot, so the group turns as one piece
          const A = d.pstart[d.id], c = Math.cos(delta * k * Math.PI / 180), sn = Math.sin(delta * k * Math.PI / 180);
          for (const pid of d.roots) {
            const P = d.pstart[pid];
            if (!A || !P || pid === d.id) continue;
            const rx = A[0] + c * (P[0] - A[0]) - sn * (P[1] - A[1]), ry = A[1] + sn * (P[0] - A[0]) + c * (P[1] - A[1]);
            change[pid].x = r1(d.start[pid].x + (rx - P[0]) / k);
            change[pid].y = r1(d.start[pid].y + (ry - P[1]) / k);
          }
        }
        d.readout = `${delta >= 0 ? '+' : ''}${r1(delta)}°`;
      } else if (d.mode === 'move') {
        const view = S.Preview.view(), ks = view[0];
        if (free) {
          // canvas pixels -> stage pixels, then into the parent's frame (its free turn and size undone)
          const sx = (x - d.x) / ks, sy = (y - d.y) / ks;
          for (const pid of d.roots) {
            const [a, b] = d.frame[pid], n = a * a + b * b || 1;
            const lx = (a * sx + b * sy) / n, ly = (-b * sx + a * sy) / n;
            change[pid] = { x: r1(d.start[pid].x + lx / k), y: r1(d.start[pid].y + ly / k) };
          }
          const at = this.toStage(this.joint(d.id, undefined, 'free') || [x, y]);
          d.readout = `x ${Math.round(at[0])}  y ${Math.round(at[1])}  on the stage`;
        } else {
          const pose = S.Preview.lastPose;
          const [dx, dy] = M.applyVec(M.inv(pose.base), x - d.x, y - d.y);   // canvas pixels -> rig units
          for (const pid of d.roots) change[pid] = { ox: r1(d.start[pid].ox + dx / k), oy: r1(d.start[pid].oy + dy / k) };
          d.readout = `x ${Math.round(dx / k)}  y ${Math.round(dy / k)}`;
        }
      } else {
        const f = Math.max(0.05, 1 - (y - d.y) / (200 * dpr));
        // what the preview shows is 1 + (v - 1) * k: scale that by f, then back to a key value
        const s = (v) => Math.round((1 + ((1 + (v - 1) * k) * f - 1) / k) * 1000) / 1000;
        if (free) {
          for (const pid of d.roots) change[pid] = { size: s(d.start[pid].size) };
          // a group grows and shrinks as one piece around the grabbed part's pivot
          const A = d.pstart[d.id];
          if (d.roots.length > 1 && A) {
            for (const pid of d.roots) {
              const P = d.pstart[pid];
              if (!P || pid === d.id) continue;
              change[pid].x = r1(d.start[pid].x + ((f - 1) * (P[0] - A[0])) / k);
              change[pid].y = r1(d.start[pid].y + ((f - 1) * (P[1] - A[1])) / k);
            }
          }
        }
        // joint scale isn't passed on to children, so every selected part scales on its own
        else for (const pid of d.ids) change[pid] = { sx: s(d.start[pid].sx), sy: s(d.start[pid].sy) };
        d.readout = `${Math.round(f * 100)}%`;
      }
      S.App.dragMove((p) => {
        for (const [pid, vals] of Object.entries(change)) for (const [prop, v] of Object.entries(vals)) S.App.keyValue(p, pid, prop, d.times[pid] ?? d.t, v);
      });
    },

    // drag the pivot: anywhere, even off the part. Ctrl snaps to the joint, the middle, edges, corners
    movePivot(d, x, y, e) {
      if (S.Model.isGroup(d.id)) {
        // the group's pivot is kept as a move (stage pixels) from the middle of its parts, in the frame
        // of the groups around it; Ctrl puts it back in the middle
        const s1 = this.toStage([x, y]), dx = s1[0] - d.s0[0], dy = s1[1] - d.s0[1];
        const [a, b] = this.frameOf(d.id), n = a * a + b * b || 1;
        let px = d.gpiv0.x + (a * dx + b * dy) / n, py = d.gpiv0.y + (-b * dx + a * dy) / n;
        if (e.ctrlKey) { px = 0; py = 0; }
        const r1 = (v) => Math.round(v * 10) / 10;
        d.readout = e.ctrlKey ? 'group pivot in the middle' : 'group pivot';
        S.App.dragMove((p) => { const g = S.Model.groupById(p, d.id); if (g) g.pivot = { x: r1(px), y: r1(py) }; });
        return;
      }
      const box = this.artBox(d.id);
      if (!box) return;
      const inv = M.inv(this.artMatrix(d.id));
      let [ix, iy] = M.apply(inv, x, y);
      let u = (ix - box.x) / box.w, v = (iy - box.y) / box.h;
      let joint = false;
      if (e.ctrlKey) {
        const rp = S.Preview.rig.parts[d.id];
        const spots = [[0.5, 0.5], [0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
        if (rp) spots.push([(rp.px - box.x) / box.w, (rp.py - box.y) / box.h, true]);
        let best = null, bd = Infinity;
        for (const [su, sv, j] of spots) {
          const q = this.artPoint(d.id, su, sv), dist = Math.hypot(q[0] - x, q[1] - y);
          if (dist < bd) { bd = dist; best = [su, sv, !!j]; }
        }
        [u, v, joint] = best;
      }
      const round = (n) => Math.round(n * 1000) / 1000;
      d.readout = joint ? 'pivot on the joint' : 'pivot';
      // on the joint, it is kept as "the joint": it then fits any avatar the action plays on
      S.App.dragMove((p) => { p.pivots[d.id] = joint ? { joint: true } : { u: round(u), v: round(v) }; });
    },

    up(e) {
      const d = this.drag;
      if (!d) return;
      if (d.mode === 'box') {
        if (d.moved) {
          const x0 = Math.min(d.x, d.x1), x1 = Math.max(d.x, d.x1), y0 = Math.min(d.y, d.y1), y1 = Math.max(d.y, d.y1);
          const inside = PT.PARTS.filter((def) => {
            const part = S.Preview.rig.parts[def.id], c = part && part.visible && !S.App.layerHidden(def.id) && this.insideEntered(def.id) && this.center(def.id);
            return c && c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1;
          }).map((def) => this.target(def.id)).filter(Boolean);
          S.App.selectParts(d.add ? [...S.App.sel.parts, ...inside] : inside);
        } else if (!d.add) S.App.selectPart(null);
      } else if (d.moved) S.App.dragEnd();
      this.drag = null;
      this.canvas.classList.remove('dragging');
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    },

    /* ---------- drawing ---------- */
    outline(ctx, pose, id, style, width, dash) {
      const box = pose[id] && this.artBox(id);
      if (!box) return;
      const w = this.artMatrix(id, pose);
      const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([u, v]) => M.apply(w, u, v));
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
    },

    // a group's box, as Flash draws a selected group
    groupRect(ctx, gid, pose, style, width, dash) {
      const b = this.groupBox(gid, pose);
      if (!b) return;
      const pad = 4 * (S.Preview.renderer.dpr || 1);
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.strokeRect(b[0] - pad + 0.5, b[1] - pad + 0.5, b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2);
      ctx.setLineDash([]);
    },

    label(ctx, text, x, y, dpr, color = '#fff', bg = 'rgba(20,18,28,.85)') {
      ctx.font = `${12 * dpr}px "Segoe UI", sans-serif`;
      const w = ctx.measureText(text).width + 12 * dpr, h = 20 * dpr;
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 5 * dpr); ctx.fill();
      ctx.fillStyle = color; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 6 * dpr, y + h / 2);
    },

    // the pivot of a selected part: a crosshair (in free mode a handle you can drag)
    pivotMark(ctx, j, dpr, mode, primary, free) {
      const r = (primary ? 13 : 9) * dpr;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#ff7ac8';
      ctx.fillStyle = '#ff7ac8';
      if (free) {
        ctx.fillStyle = 'rgba(255,122,200,.25)';
        ctx.beginPath(); ctx.arc(j[0], j[1], 8 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff7ac8';
      }
      ctx.beginPath(); ctx.arc(j[0], j[1], 3 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(j[0] - r, j[1]); ctx.lineTo(j[0] - r * 0.5, j[1]); ctx.moveTo(j[0] + r * 0.5, j[1]); ctx.lineTo(j[0] + r, j[1]);
      ctx.moveTo(j[0], j[1] - r); ctx.lineTo(j[0], j[1] - r * 0.5); ctx.moveTo(j[0], j[1] + r * 0.5); ctx.lineTo(j[0], j[1] + r);
      ctx.stroke();
      if (mode === 'rotate' && primary) {
        ctx.strokeStyle = 'rgba(255,122,200,.55)';
        ctx.beginPath(); ctx.arc(j[0], j[1], r * 2.2, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
        const a = -Math.PI * 0.15, ex = j[0] + Math.cos(a) * r * 2.2, ey = j[1] + Math.sin(a) * r * 2.2;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 7 * dpr, ey - 3 * dpr); ctx.moveTo(ex, ey); ctx.lineTo(ex - 2 * dpr, ey - 8 * dpr); ctx.stroke();
      }
    },

    /* pivots, the hovered and selected parts, the selection box, the drag readout, the effect anchor */
    drawOverlay(ctx, pose) {
      const P = S.Preview, rig = P.rig, sel = S.App.sel;
      const dpr = P.renderer.dpr || 1;
      const free = this.space === 'free';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const d = this.drag;
      const mode = d && !['box', 'pan', 'pivot'].includes(d.mode) ? d.mode : this.tool;
      if (this.showPivots) {
        for (const def of PT.PARTS) {
          const part = rig.parts[def.id];
          if (!part || !part.visible || sel.parts.has(def.id) || S.App.layerHidden(def.id)) continue;
          const j = this.joint(def.id, pose);
          if (!j) continue;
          ctx.fillStyle = S.App.project.tracks[def.id] ? 'rgba(255,209,102,.9)' : 'rgba(255,255,255,.45)';
          ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.arc(j[0], j[1], 3 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      this.syncCrumbs();
      // the group being edited inside: a faint box round it
      if (S.App.entered) this.groupRect(ctx, S.App.entered, pose, 'rgba(79,195,255,.35)', dpr, [2 * dpr, 4 * dpr]);
      const hoverPick = this.hover && !d ? this.target(this.hover) : null;
      if (hoverPick && !sel.parts.has(hoverPick)) {
        if (S.Model.isGroup(hoverPick)) this.groupRect(ctx, hoverPick, pose, 'rgba(79,195,255,.75)', dpr, [3 * dpr, 3 * dpr]);
        else this.outline(ctx, pose, hoverPick, 'rgba(255,255,255,.7)', dpr, [3 * dpr, 3 * dpr]);
      }
      for (const id of sel.parts) {
        if (S.Model.isGroup(id)) this.groupRect(ctx, id, pose, '#4fc3ff', (id === sel.part ? 1.6 : 1.1) * dpr, null);
        else this.outline(ctx, pose, id, id === sel.part ? '#ff7ac8' : 'rgba(255,122,200,.6)', (id === sel.part ? 1.5 : 1) * dpr, [5 * dpr, 4 * dpr]);
      }
      const turning = d && d.roots ? new Set(mode === 'scale' && d.space === 'joint' ? d.ids : d.roots) : null;
      for (const id of sel.parts) {
        const j = this.joint(id, pose);
        if (!j || (turning && !turning.has(id))) continue;   // carried by its parent in this drag
        this.pivotMark(ctx, j, dpr, mode, id === sel.part, free || S.Model.isGroup(id));
      }
      if (sel.part && !d) {
        const j = this.joint(sel.part, pose), group = S.Model.isGroup(sel.part);
        if (j) this.label(ctx, group ? 'group pivot · drag to move · double-click to edit inside' : free ? 'pivot · drag to move' : 'joint', j[0] + 16 * dpr, j[1] + 6 * dpr, dpr, group ? '#4fc3ff' : '#ff7ac8');
      }
      if (this.pointer && !d && hoverPick) {
        const def = PT.PART[hoverPick], g = S.Model.groupById(S.App.project, hoverPick);
        this.label(ctx, g ? `${g.name} (group)` : def ? PT.partName(def) : hoverPick, this.pointer[0] + 16 * dpr, this.pointer[1] + 14 * dpr, dpr);
      }
      if (d && d.moved && d.readout && this.pointer) this.label(ctx, d.readout, this.pointer[0] + 16 * dpr, this.pointer[1] + 14 * dpr, dpr, '#ffd166');
      if (d && d.mode === 'box' && d.moved) {
        ctx.fillStyle = 'rgba(124,108,240,.12)'; ctx.strokeStyle = '#a597ff'; ctx.lineWidth = dpr;
        ctx.fillRect(Math.min(d.x, d.x1), Math.min(d.y, d.y1), Math.abs(d.x1 - d.x), Math.abs(d.y1 - d.y));
        ctx.strokeRect(Math.min(d.x, d.x1) + 0.5, Math.min(d.y, d.y1) + 0.5, Math.abs(d.x1 - d.x), Math.abs(d.y1 - d.y));
      }
      const fx = sel.item && sel.item.kind === 'effect' && S.App.project.effects.find((x) => x.id === sel.item.id);
      if (fx && pose[fx.anchor.part]) {
        const q = this.artPoint(fx.anchor.part, fx.anchor.u, fx.anchor.v, pose);
        if (q) {
          const [x, y] = q, r = 9 * dpr;
          ctx.strokeStyle = '#5fd39a'; ctx.lineWidth = 2 * dpr;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.moveTo(x - r * 1.8, y); ctx.lineTo(x + r * 1.8, y); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x, y + r * 1.8);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };

  S.Tools = Tools;
})(window.Studio);
