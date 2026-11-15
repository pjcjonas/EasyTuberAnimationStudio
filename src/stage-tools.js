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
   parent is left to its parent, so nothing moves twice. Wheel zooms, middle-drag pans. */
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
    // the free motion of the action, as maps of the stage per part (see codegen freeSource)
    freeMaps() {
      const run = PT.Actions.running.find((r) => S.Preview.def && r.def === S.Preview.def);
      return (run && run.state.free && run.state.free.maps) || {};
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
        if (!part || !part.visible || !def || !pose[id]) continue;
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
    // the point a drag turns the part around, in the current mode
    joint(id, pose = S.Preview.lastPose) {
      if (this.space === 'joint') return this.rigJoint(id, pose);
      const pv = this.freePivot(id);
      return this.artPoint(id, pv.u, pv.v, pose);
    },
    // canvas pixels -> stage pixels (the 1920x1080 stage)
    toStage(pt) { return M.apply(M.inv(S.Preview.view()), pt[0], pt[1]); },

    // the selected parts that a turn or move goes on: not those carried by a selected parent
    roots(ids) {
      const set = new Set(ids), p = S.App.project, free = this.space === 'free';
      return ids.filter((id) => {
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
      // the pink crosshair of a selected part, in free mode: drag it to move the pivot
      if (this.space === 'free' && !this.picking) {
        for (const id of S.App.sel.parts) {
          const j = this.joint(id);
          if (j && Math.hypot(x - j[0], y - j[1]) < 11 * dpr) {
            if (S.Preview.playing) S.App.pause();
            this.drag = { mode: 'pivot', id, x, y, moved: false };
            this.canvas.classList.add('dragging');
            return;
          }
        }
      }
      const id = this.hit(x, y);
      if (this.picking) {
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
      const start = {};
      for (const pid of ids) {
        start[pid] = {};
        for (const prop of S.Model.PROPS) start[pid][prop] = S.Model.valueAt(p, pid, prop, t);
      }
      const mode = e.altKey ? 'scale' : e.shiftKey ? 'move' : this.tool;
      const roots = this.roots(ids);
      // the part that really turns: the grabbed one, or the selected parent that carries it
      let anchor = id;
      for (let pa = PT.PART[id] && PT.PART[id].parent; pa; pa = PT.PART[pa] && PT.PART[pa].parent) if (start[pa] && roots.includes(pa)) anchor = pa;
      const j = this.joint(anchor) || [x, y];
      // a free move goes in the parent's own frame: undo the parent's free turn and size
      const maps = this.freeMaps(), frame = {};
      for (const pid of ids) {
        const par = PT.PART[pid] && PT.PART[pid].parent;
        const m = par && p.follow[par] === true ? maps[par] : null;
        frame[pid] = m ? [m[0], m[1]] : [1, 0];
      }
      // grabbed right next to the pivot, the angle swings wildly: turn by sideways distance instead
      const near = Math.hypot(x - j[0], y - j[1]) < 18 * dpr;
      const a0 = Math.atan2(y - j[1], x - j[0]);
      // free, several parts: they turn and scale as one group around the grabbed part's pivot
      const pstart = {};
      if (this.space === 'free') for (const pid of roots) { const q = this.joint(pid); if (q) pstart[pid] = this.toStage(q); }
      this.drag = { mode, space: this.space, id: anchor, ids, roots, frame, pstart, t, start, x, y, j, near, a0, last: a0, turned: 0, k: S.App.factorAt(t), moved: false, readout: '' };
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
          const at = this.toStage(this.joint(d.id) || [x, y]);
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
        for (const [pid, vals] of Object.entries(change)) for (const [prop, v] of Object.entries(vals)) S.App.keyValue(p, pid, prop, d.t, v);
      });
    },

    // drag the pivot: anywhere, even off the part. Ctrl snaps to the joint, the middle, edges, corners
    movePivot(d, x, y, e) {
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
            const part = S.Preview.rig.parts[def.id], c = part && part.visible && this.center(def.id);
            return c && c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1;
          }).map((def) => def.id);
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
          if (!part || !part.visible || sel.parts.has(def.id)) continue;
          const j = this.joint(def.id, pose);
          if (!j) continue;
          ctx.fillStyle = S.App.project.tracks[def.id] ? 'rgba(255,209,102,.9)' : 'rgba(255,255,255,.45)';
          ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.arc(j[0], j[1], 3 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      if (this.hover && !d && !sel.parts.has(this.hover)) this.outline(ctx, pose, this.hover, 'rgba(255,255,255,.7)', dpr, [3 * dpr, 3 * dpr]);
      for (const id of sel.parts) this.outline(ctx, pose, id, id === sel.part ? '#ff7ac8' : 'rgba(255,122,200,.6)', (id === sel.part ? 1.5 : 1) * dpr, [5 * dpr, 4 * dpr]);
      const turning = d && d.roots ? new Set(mode === 'scale' && d.space === 'joint' ? d.ids : d.roots) : null;
      for (const id of sel.parts) {
        const j = this.joint(id, pose);
        if (!j || (turning && !turning.has(id))) continue;   // carried by its parent in this drag
        this.pivotMark(ctx, j, dpr, mode, id === sel.part, free);
      }
      if (sel.part && !d) {
        const j = this.joint(sel.part, pose);
        if (j) this.label(ctx, free ? 'pivot · drag to move' : 'joint', j[0] + 16 * dpr, j[1] + 6 * dpr, dpr, '#ff7ac8');
      }
      if (this.pointer && !d && this.hover) {
        const def = PT.PART[this.hover];
        this.label(ctx, def ? PT.partName(def) : this.hover, this.pointer[0] + 16 * dpr, this.pointer[1] + 14 * dpr, dpr);
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
