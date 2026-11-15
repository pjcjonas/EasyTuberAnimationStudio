/* Posing on the stage: click a part to select it, drag to key it at the playhead.

   Every part turns around its PIVOT, the joint EasyTuber gave it (Part tab in EasyTuber): the torso
   at the hips, the neck at its base, the face at the chin, an upper arm at the shoulder, a forearm
   at the elbow. Children follow their parent: turn the torso and the head and arms go with it.

   The tool (the buttons on the stage, or R / M / S) says what a drag does:
     Rotate  turn the part around its pivot (Ctrl snaps to 15°)
     Move    shift it (ox / oy, in rig units)
     Scale   grow or shrink it (drag up / down)
   Holding Shift moves and holding Alt scales, whatever the tool.
   Ctrl+click adds a part to the selection or takes it out; drag on empty stage to box-select.
   With several parts selected, a drag changes them all; a part whose parent is also selected is
   only turned or moved by its parent, so nothing turns twice.
   Mouse wheel zooms, middle-drag pans. While an effect's anchor is being picked, a click sets it. */
(function (S) {
  const PT = window.PT, M = PT.M;
  const TOOLS = ['rotate', 'move', 'scale'];

  const Tools = {
    canvas: null, drag: null, picking: null, tool: 'rotate', hover: null, pointer: null, showPivots: true,

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
      const piv = document.getElementById('optPivots');
      if (piv) piv.addEventListener('change', () => { this.showPivots = piv.checked; });
      this.setTool('rotate');
      S.Preview.overlay = (ctx, pose) => this.drawOverlay(ctx, pose);
    },

    setTool(t) {
      if (!TOOLS.includes(t)) return;
      this.tool = t;
      for (const b of document.querySelectorAll('#stageTools [data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
      this.canvas.dataset.tool = t;
    },

    // pointer position in canvas pixels
    px(e) {
      const r = this.canvas.getBoundingClientRect(), dpr = S.Preview.renderer.dpr || 1;
      return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
    },

    hit(x, y) {
      const P = S.Preview;
      if (!P.lastPose) return null;
      try { return P.renderer.hitTest(P.rig, P.lastPose, P.lastStates, x, y); } catch (e) { return null; }
    },

    // where a part's pivot (joint) is on the canvas right now
    joint(id, pose = S.Preview.lastPose) {
      const p = S.Preview.rig.parts[id];
      return pose && pose[id] && p ? M.apply(pose[id].world, p.px, p.py) : null;
    },

    // the part's drawn area (its art without transparent margins), in image pixels
    artBox(id) {
      const e = PT.Assets.primary(id, S.Preview.rig.stage.placeholders);
      return e ? (e.bbox || { x: 0, y: 0, w: e.w, h: e.h }) : null;
    },

    // the middle of a part's drawing on the canvas right now
    center(id, pose = S.Preview.lastPose) {
      const box = this.artBox(id);
      return box && pose && pose[id] ? M.apply(pose[id].world, box.x + box.w / 2, box.y + box.h / 2) : null;
    },

    // the selected parts without a selected parent (or grandparent…): the ones a turn or move goes on
    roots(ids) {
      const set = new Set(ids);
      return ids.filter((id) => {
        for (let p = PT.PART[id] && PT.PART[id].parent; p; p = PT.PART[p] && PT.PART[p].parent) if (set.has(p)) return false;
        return true;
      });
    },

    startPick(cb) { this.picking = cb; this.canvas.classList.add('picking'); document.getElementById('pickBanner').hidden = false; },
    stopPick() { this.picking = null; this.canvas.classList.remove('picking'); document.getElementById('pickBanner').hidden = true; },

    down(e) {
      const [x, y] = this.px(e);
      this.canvas.setPointerCapture(e.pointerId);
      if (e.button === 1) {
        this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, px: S.Preview.panX, py: S.Preview.panY };
        return;
      }
      if (e.button !== 0) return;
      const id = this.hit(x, y);
      if (this.picking) {
        if (id) {
          const box = this.artBox(id), pose = S.Preview.lastPose;
          const [ix, iy] = M.apply(M.inv(pose[id].world), x, y);
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
      // the part that really turns: the grabbed one, or its highest selected parent (which carries it)
      let anchor = id;
      for (let pa = PT.PART[id] && PT.PART[id].parent; pa; pa = PT.PART[pa] && PT.PART[pa].parent) if (start[pa]) anchor = pa;
      const j = this.joint(anchor) || [x, y];
      const dpr = S.Preview.renderer.dpr || 1;
      // grabbed right next to the pivot, the angle swings wildly: turn by sideways distance instead
      const near = Math.hypot(x - j[0], y - j[1]) < 40 * dpr;
      const a0 = Math.atan2(y - j[1], x - j[0]);
      this.drag = { mode, id: anchor, ids, roots: this.roots(ids), t, start, x, y, j, near, a0, last: a0, turned: 0, k: S.App.factorAt(t), moved: false, readout: '' };
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
      const dpr = S.Preview.renderer.dpr || 1;
      // the preview shows a key's value scaled by the blend and strength: undo that, so the part
      // follows the pointer (unless the factor is so small that it would jump)
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
        let rot = d.start[d.id].rot + turn / k;
        if (e.ctrlKey) rot = Math.round(rot / 15) * 15;   // snaps the part under the pointer
        const delta = rot - d.start[d.id].rot;
        for (const pid of d.roots) change[pid] = { rot: r1(d.start[pid].rot + delta) };
        d.readout = `${delta >= 0 ? '+' : ''}${r1(delta)}°`;
      } else if (d.mode === 'move') {
        const pose = S.Preview.lastPose;
        const [dx, dy] = M.applyVec(M.inv(pose.base), x - d.x, y - d.y);   // canvas pixels -> rig units
        for (const pid of d.roots) change[pid] = { ox: r1(d.start[pid].ox + dx / k), oy: r1(d.start[pid].oy + dy / k) };
        d.readout = `x ${Math.round(dx / k)}  y ${Math.round(dy / k)}`;
      } else {
        // children aren't stretched by their parent, so every selected part scales on its own
        const f = Math.max(0.05, 1 - (y - d.y) / (200 * dpr));
        // what the preview shows is 1 + (v - 1) * k: scale that by f, then back to a key value
        const s = (v) => Math.round((1 + ((1 + (v - 1) * k) * f - 1) / k) * 1000) / 1000;
        for (const pid of d.ids) change[pid] = { sx: s(d.start[pid].sx), sy: s(d.start[pid].sy) };
        d.readout = `${Math.round(f * 100)}%`;
      }
      S.App.dragMove((p) => {
        for (const [pid, vals] of Object.entries(change)) for (const [prop, v] of Object.entries(vals)) S.App.keyValue(p, pid, prop, d.t, v);
      });
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
      const w = pose[id].world;
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

    // the pivot of a selected part: a crosshair, with a ring when the tool turns it
    pivotMark(ctx, j, dpr, mode, primary) {
      const r = (primary ? 13 : 9) * dpr;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#ff7ac8';
      ctx.fillStyle = '#ff7ac8';
      ctx.beginPath(); ctx.arc(j[0], j[1], 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(j[0] - r, j[1]); ctx.lineTo(j[0] - r * 0.45, j[1]); ctx.moveTo(j[0] + r * 0.45, j[1]); ctx.lineTo(j[0] + r, j[1]);
      ctx.moveTo(j[0], j[1] - r); ctx.lineTo(j[0], j[1] - r * 0.45); ctx.moveTo(j[0], j[1] + r * 0.45); ctx.lineTo(j[0], j[1] + r);
      ctx.stroke();
      if (mode === 'rotate' && primary) {
        ctx.strokeStyle = 'rgba(255,122,200,.55)';
        ctx.beginPath(); ctx.arc(j[0], j[1], r * 2.2, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
        // arrow head at the end of the arc
        const a = -Math.PI * 0.15, ex = j[0] + Math.cos(a) * r * 2.2, ey = j[1] + Math.sin(a) * r * 2.2;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 7 * dpr, ey - 3 * dpr); ctx.moveTo(ex, ey); ctx.lineTo(ex - 2 * dpr, ey - 8 * dpr); ctx.stroke();
      }
    },

    /* pivots, the hovered and selected parts, the selection box, the drag readout, the effect anchor */
    drawOverlay(ctx, pose) {
      const P = S.Preview, rig = P.rig, sel = S.App.sel;
      const dpr = P.renderer.dpr || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const d = this.drag;
      const mode = d && d.mode !== 'box' && d.mode !== 'pan' ? d.mode : this.tool;
      // every part's pivot, small and faint (yellow: the part has keys)
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
      // the part under the pointer, with its name
      if (this.hover && !d && !sel.parts.has(this.hover)) this.outline(ctx, pose, this.hover, 'rgba(255,255,255,.7)', dpr, [3 * dpr, 3 * dpr]);
      for (const id of sel.parts) this.outline(ctx, pose, id, id === sel.part ? '#ff7ac8' : 'rgba(255,122,200,.6)', (id === sel.part ? 1.5 : 1) * dpr, [5 * dpr, 4 * dpr]);
      const turning = d && d.roots ? new Set(mode === 'scale' ? d.ids : d.roots) : null;
      for (const id of sel.parts) {
        const j = this.joint(id, pose);
        if (!j) continue;
        if (turning && !turning.has(id)) continue;   // follows its parent: no pivot of its own in this drag
        this.pivotMark(ctx, j, dpr, mode, id === sel.part);
      }
      if (sel.part && !d) {
        const j = this.joint(sel.part, pose);
        if (j) this.label(ctx, 'pivot', j[0] + 16 * dpr, j[1] + 6 * dpr, dpr, '#ff7ac8');
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
        const box = this.artBox(fx.anchor.part);
        if (box) {
          const [x, y] = M.apply(pose[fx.anchor.part].world, box.x + fx.anchor.u * box.w, box.y + fx.anchor.v * box.h);
          const r = 9 * dpr;
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
