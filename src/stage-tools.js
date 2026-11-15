/* Posing on the stage: click a part to select it, drag to key it at the playhead.
     drag        rotate around the part's joint
     Shift+drag  move (ox / oy, in rig units)
     Alt+drag    scale (sx and sy together)
     Ctrl+click  add a part to the selection or take it out; drag on empty stage to box-select
   With several parts selected, a drag changes them all by the same amount and keys each one.
   Mouse wheel zooms, middle-drag pans. While an effect's anchor is being picked,
   a click sets the anchor instead. */
(function (S) {
  const PT = window.PT, M = PT.M;

  const Tools = {
    canvas: null, drag: null, picking: null,

    init(canvas) {
      this.canvas = canvas;
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      canvas.addEventListener('pointerup', (e) => this.up(e));
      canvas.addEventListener('pointercancel', (e) => this.up(e));
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [x, y] = this.px(e);
        S.Preview.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
      }, { passive: false });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      S.Preview.overlay = (ctx, pose) => this.drawOverlay(ctx, pose);
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

    // where a part's joint (pivot) is on the canvas right now
    joint(id, pose = S.Preview.lastPose) {
      const p = S.Preview.rig.parts[id];
      return pose && pose[id] && p ? M.apply(pose[id].world, p.px, p.py) : null;
    },

    // the part's drawn area (its art without transparent margins), in image pixels
    artBox(id) {
      const e = PT.Assets.primary(id, S.Preview.rig.stage.placeholders);
      return e ? (e.bbox || { x: 0, y: 0, w: e.w, h: e.h }) : null;
    },

    startPick(cb) { this.picking = cb; this.canvas.classList.add('picking'); document.getElementById('pickBanner').hidden = false; },
    stopPick() { this.picking = null; this.canvas.classList.remove('picking'); document.getElementById('pickBanner').hidden = true; },

    // the middle of a part's drawing on the canvas right now
    center(id, pose = S.Preview.lastPose) {
      const box = this.artBox(id);
      return box && pose && pose[id] ? M.apply(pose[id].world, box.x + box.w / 2, box.y + box.h / 2) : null;
    },

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
      const mode = e.altKey ? 'scale' : e.shiftKey ? 'move' : 'rotate';
      const j = this.joint(id) || [x, y];
      this.drag = { mode, id, ids, t, start, x, y, j, a0: Math.atan2(y - j[1], x - j[0]), k: S.App.factorAt(t), moved: false };
      this.canvas.classList.add('dragging');
    },

    move(e) {
      const d = this.drag;
      const [x, y] = this.px(e);
      if (!d) {
        this.canvas.classList.toggle('rotate', !this.picking && !!this.hit(x, y));
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
      // the preview shows a key's value scaled by the blend and strength: undo that, so the part
      // follows the pointer (unless the factor is so small that it would jump)
      const k = d.k > 0.15 ? d.k : 1;
      const r1 = (v) => Math.round(v * 10) / 10;
      // every selected part changes by the same amount, each around its own joint
      const change = {};
      if (d.mode === 'rotate') {
        let da = (Math.atan2(y - d.j[1], x - d.j[0]) - d.a0) * 180 / Math.PI;
        da = ((da + 540) % 360) - 180;
        let rot = d.start[d.id].rot + da / k;
        if (e.ctrlKey) rot = Math.round(rot / 15) * 15;   // snaps the part under the pointer
        const delta = rot - d.start[d.id].rot;
        for (const pid of d.ids) change[pid] = { rot: r1(d.start[pid].rot + delta) };
      } else if (d.mode === 'move') {
        const pose = S.Preview.lastPose;
        const [dx, dy] = M.applyVec(M.inv(pose.base), x - d.x, y - d.y);   // canvas pixels -> rig units
        for (const pid of d.ids) change[pid] = { ox: r1(d.start[pid].ox + dx / k), oy: r1(d.start[pid].oy + dy / k) };
      } else {
        const f = Math.max(0.05, 1 - (y - d.y) / 200);
        // what the preview shows is 1 + (v - 1) * k: scale that by f, then back to a key value
        const s = (v) => Math.round((1 + ((1 + (v - 1) * k) * f - 1) / k) * 1000) / 1000;
        for (const pid of d.ids) change[pid] = { sx: s(d.start[pid].sx), sy: s(d.start[pid].sy) };
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

    /* joints, the selected parts' outlines, the selection box, and the selected effect's anchor */
    drawOverlay(ctx, pose) {
      const P = S.Preview, rig = P.rig, sel = S.App.sel;
      const dpr = P.renderer.dpr || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // bones: parent joint -> child joint
      ctx.lineWidth = 1.5 * dpr;
      for (const def of PT.PARTS) {
        if (!def.parent || !rig.parts[def.id] || !rig.parts[def.id].visible) continue;
        const a = this.joint(def.parent, pose), b = this.joint(def.id, pose);
        if (!a || !b) continue;
        ctx.strokeStyle = 'rgba(165,151,255,.35)';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      for (const def of PT.PARTS) {
        const part = rig.parts[def.id];
        if (!part || !part.visible) continue;
        const j = this.joint(def.id, pose);
        if (!j) continue;
        const on = sel.parts.has(def.id), keyed = !!S.App.project.tracks[def.id];
        ctx.fillStyle = on ? '#ff7ac8' : keyed ? '#ffd166' : 'rgba(255,255,255,.55)';
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.beginPath(); ctx.arc(j[0], j[1], (on ? 5 : 3.5) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      for (const id of sel.parts) {
        const box = pose[id] && this.artBox(id);
        if (!box) continue;
        const w = pose[id].world;
        const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([u, v]) => M.apply(w, u, v));
        ctx.strokeStyle = id === sel.part ? '#ff7ac8' : 'rgba(255,122,200,.6)';
        ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineWidth = (id === sel.part ? 1.5 : 1) * dpr;
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (this.drag && this.drag.mode === 'box' && this.drag.moved) {
        const d = this.drag;
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
