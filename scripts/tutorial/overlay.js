/* Page-side helpers for recording the tutorial: a visible cursor, click ripples, highlight boxes,
   captions and chapter titles, and actions that drive the real studio the way a person would
   (pointer events on the stage and timeline, clicks on buttons, typing into fields).
   Loaded into the studio window by scripts/tutorial/build.js; never part of the app. */
(function () {
  const S = window.Studio, PT = window.PT;
  const T = {};
  let root, cur, cap, pill, cx = 980, cy = 560;
  const hl = [];

  const CSS = `
  #tut { position: fixed; inset: 0; pointer-events: none; z-index: 99999; font-family: "Segoe UI", sans-serif; }
  #tut .cur { position: absolute; width: 30px; height: 30px; margin: -3px 0 0 -5px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
  #tut .ripple { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 3px solid #ffd166; animation: tutRip .55s ease-out forwards; }
  @keyframes tutRip { to { transform: scale(3.6); opacity: 0; } }
  #tut .hl { position: absolute; border: 3px solid #ffd166; border-radius: 10px; box-shadow: 0 0 0 4000px rgba(0,0,0,.28), 0 0 24px #ffd166aa; transition: all .35s ease; }
  #tut .hl .tag { position: absolute; left: -3px; top: -34px; background: #ffd166; color: #17151f; font-weight: 700; font-size: 17px; padding: 4px 12px; border-radius: 7px; white-space: nowrap; }
  #tut .hl.below .tag { top: auto; bottom: -36px; }
  #tut .cap { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 1200px; background: rgba(12,10,18,.88); color: #fff; font-size: 22px; line-height: 1.35; padding: 12px 26px; border-radius: 12px; text-align: center; border: 1px solid #ffffff22; transition: opacity .25s; }
  #tut .cap:empty { opacity: 0; }
  #tut .pill { position: absolute; left: 50%; top: 60px; transform: translateX(-50%); background: #7c6cf0; color: #fff; font-size: 22px; font-weight: 700; padding: 8px 22px; border-radius: 30px; box-shadow: 0 6px 20px #0008; transition: opacity .4s; }
  #tut .title { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, #2a2350, #110f17 70%); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; transition: opacity .8s; }
  #tut .title h1 { font-size: 76px; margin: 0; letter-spacing: .5px; } #tut .title h1 span { color: #a597ff; }
  #tut .title p { font-size: 30px; color: #c9c3e6; margin: 18px 0 0; }
  #tut .title .diamond { width: 90px; height: 90px; background: #ffd166; transform: rotate(45deg); border-radius: 12px; margin-bottom: 50px; box-shadow: 0 0 40px #ffd16688; }`;

  T.init = () => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    root = document.createElement('div'); root.id = 'tut';
    cur = document.createElement('div'); cur.className = 'cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    cap = document.createElement('div'); cap.className = 'cap';
    pill = document.createElement('div'); pill.className = 'pill'; pill.style.opacity = 0;
    root.append(pill, cap, cur);
    document.body.append(root);
    place();
  };

  T.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const q = (sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel);
  function place() { cur.style.left = cx + 'px'; cur.style.top = cy + 'px'; }
  const canvas = () => document.getElementById('stage');

  // a point on the screen: [x, y], a selector or an element (its middle)
  T.at = (target) => {
    if (Array.isArray(target)) return target;
    const el = q(target);
    if (!el) throw new Error('Tutorial: nothing at ' + target);
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };

  function hoverAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.id === 'stage') el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons: 0, pointerId: 1 }));
  }

  T.cursorTo = (x, y, ms = 600) => new Promise((res) => {
    const x0 = cx, y0 = cy, t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms), e = ease(u);
      cx = x0 + (x - x0) * e; cy = y0 + (y - y0) * e; place();
      hoverAt(cx, cy);
      if (u < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  T.point = async (target, ms = 650) => { const [x, y] = T.at(target); await T.cursorTo(x, y, ms); };

  T.ripple = () => {
    const r = document.createElement('div'); r.className = 'ripple';
    r.style.left = cx + 'px'; r.style.top = cy + 'px';
    root.append(r); setTimeout(() => r.remove(), 700);
  };

  // move there and click a button / element
  T.click = async (target, ms = 650) => {
    const el = q(target);
    if (el && el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
    await T.point(el || target, ms);
    T.ripple();
    await T.wait(140);
    if (el) el.click();
    await T.wait(200);
  };

  // a button by its text (within a scope)
  T.button = (text, scope = document) => [...q(scope).querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
  // an Inspector card by its title
  T.card = (title) => [...document.querySelectorAll('#inspector .card')].find((c) => c.querySelector('h4').textContent.trim().toLowerCase().startsWith(title.toLowerCase()));

  T.type = async (target, text, cps = 13) => {
    const el = q(target);
    await T.click(el);
    el.focus(); el.value = '';
    let typed = '';   // kept here: a number box reads back '' while it holds just '-'
    for (const ch of text) { typed += ch; el.value = typed; el.dispatchEvent(new Event('input', { bubbles: true })); await T.wait(1000 / cps); }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    await T.wait(150);
  };

  T.choose = async (target, value) => {
    const el = q(target);
    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
    await T.point(el);
    T.ripple();
    await T.wait(250);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await T.wait(250);
  };

  T.key = async (key, mods = {}) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));
    await T.wait(250);
  };

  /* ---------- the stage ---------- */
  T.toClient = ([x, y]) => {
    const r = canvas().getBoundingClientRect(), dpr = S.Preview.renderer.dpr || 1;
    return [r.left + x / dpr, r.top + y / dpr];
  };
  const fire = (type, [x, y], mods = {}, buttons = 1) => canvas().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, buttons, clientX: x, clientY: y, ...mods }));

  T.clickStage = async (pt, mods = {}) => {
    await T.cursorTo(pt[0], pt[1], 650);
    T.ripple();
    fire('pointerdown', pt, mods); await T.wait(60); fire('pointerup', pt, mods, 0);
    await T.wait(250);
  };
  // a point on a part's drawing that really picks that part (not one drawn over it), canvas pixels
  T.grabPoint = (id) => {
    const Tools = S.Tools, b = Tools.artBox(id), w = S.Preview.lastPose[id].world;
    for (const v of [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85]) {
      for (const u of [0.5, 0.35, 0.65]) {
        const p = PT.M.apply(w, b.x + u * b.w, b.y + v * b.h);
        if (Tools.hit(p[0], p[1]) === id) return p;
      }
    }
    return Tools.center(id);
  };
  T.clickPart = async (id, mods = {}) => T.clickStage(T.toClient(T.grabPoint(id)), mods);
  T.hoverPart = async (id) => { const p = T.toClient(T.grabPoint(id)); await T.cursorTo(p[0], p[1], 800); };

  // drag on the stage along path(u) -> [x, y] (client), or in a straight line from -> to
  T.stageDrag = async (from, to, { ms = 1000, mods = {}, path = null } = {}) => {
    const P = path || ((u) => [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u]);
    await T.cursorTo(from[0], from[1], 600);
    fire('pointerdown', from, mods);
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms), p = P(ease(u));
        cx = p[0]; cy = p[1]; place();
        fire('pointermove', p, mods);
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    await T.wait(120);
    fire('pointerup', [cx, cy], mods, 0);
    await T.wait(200);
  };

  // grab a part and turn it on screen by deg (positive = clockwise) around its pivot
  T.rotatePart = async (id, deg, opts = {}) => {
    const j = T.toClient(S.Tools.joint(id));
    let c = T.toClient(opts.grab ? opts.grab() : T.grabPoint(id));
    let r = Math.hypot(c[0] - j[0], c[1] - j[1]);
    let a0 = Math.atan2(c[1] - j[1], c[0] - j[0]);
    if (r < 45) { r = 45; c = [j[0] + Math.cos(a0) * r, j[1] + Math.sin(a0) * r]; }
    const path = (u) => { const a = a0 + (deg * Math.PI / 180) * u; return [j[0] + Math.cos(a) * r, j[1] + Math.sin(a) * r]; };
    await T.stageDrag(c, path(1), { ms: opts.ms || 1100, mods: opts.mods || {}, path });
  };
  // turn a part so its key at the playhead becomes `target` degrees
  T.rotatePartTo = async (id, target, opts = {}) => {
    const t = Math.round(S.App.playhead()), prop = S.Tools.space === 'free' ? 'angle' : 'rot';
    const now = S.Model.valueAt(S.App.project, id, prop, t), k = S.App.factorAt(t);
    await T.rotatePart(id, (target - now) * (k > 0.15 ? k : 1), opts);
    // land exactly on the number (the idle sway moves the joint a little while dragging)
    S.App.edit((p) => S.App.keyValue(p, id, prop, t, target), { source: 'inspector' });
  };
  // drag a selected part's pivot onto its EasyTuber joint, Ctrl held to snap
  T.dragPivotToJoint = async (id) => {
    const from = T.toClient(S.Tools.joint(id)), to = T.toClient(S.Tools.rigJoint(id));
    await T.stageDrag(from, [to[0] + 4, to[1] + 3], { ms: 1100, mods: { ctrlKey: true } });
  };
  // the input of an Inspector row by its label
  T.field = (card, label) => {
    const row = [...card.querySelectorAll('.f')].find((f) => f.firstElementChild && f.firstElementChild.textContent.trim() === label);
    return row && row.querySelector('input');
  };
  T.dragPart = async (id, dx, dy, opts = {}) => {
    const c = T.toClient(T.grabPoint(id));
    await T.stageDrag(c, [c[0] + dx, c[1] + dy], opts);
  };

  /* ---------- the timeline ---------- */
  const ruler = () => document.querySelector('.tl-head .tl-lane');
  T.timeX = (ms) => ruler().getBoundingClientRect().left + S.Timeline.x(ms);
  T.scrubTo = async (ms, dur = 800) => {
    const r = ruler().getBoundingClientRect(), y = r.top + r.height / 2;
    const x0 = T.timeX(S.App.playhead()), x1 = T.timeX(ms);
    await T.cursorTo(x0, y, 550);
    ruler().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x0, clientY: y }));
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / dur), x = x0 + (x1 - x0) * ease(u);
        cx = x; cy = y; place();
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x1, clientY: y }));
    S.App.seek(ms);   // exactly on the number
    await T.wait(200);
  };
  T.partRow = (id) => [...document.querySelectorAll('.tl-row')].find((r) => !r.classList.contains('sub') && r.querySelector('.name') && r.querySelector('.name').textContent === PT.partName(PT.PART[id]));
  T.rowByName = (name) => [...document.querySelectorAll('.tl-row')].find((r) => r.querySelector('.name') && r.querySelector('.name').textContent === name);
  T.diamond = (id, t) => { const row = T.partRow(id); return row && row.querySelector(`.tl-key[title="${t} ms"]`); };
  T.showRow = (row) => { if (row) row.scrollIntoView({ block: 'center' }); };

  // drag a timeline element sideways by ms
  T.dragTimeline = async (el, dms, ms = 900) => {
    const [x0, y] = T.at(el), x1 = x0 + S.Timeline.x(dms);
    await T.cursorTo(x0, y, 600);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x0, clientY: y }));
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms), x = x0 + (x1 - x0) * ease(u);
        cx = x; place();
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x1, clientY: y }));
    await T.wait(250);
  };
  T.rightClick = async (el) => {
    await T.point(el);
    T.ripple();
    const [x, y] = T.at(el);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: x, clientY: y }));
    await T.wait(350);
  };
  // Shift+drag a box over the timeline from one screen point to another
  T.boxKeys = async (from, to, ms = 900) => {
    await T.cursorTo(from[0], from[1], 600);
    const lane = document.elementFromPoint(from[0], from[1]);
    lane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true, clientX: from[0], clientY: from[1] }));
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms), x = from[0] + (to[0] - from[0]) * ease(u), y = from[1] + (to[1] - from[1]) * ease(u);
        cx = x; cy = y; place();
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: to[0], clientY: to[1] }));
    await T.wait(250);
  };

  /* ---------- telling ---------- */
  T.highlight = (target, label = '', { pad = 6, below = false } = {}) => {
    let r;
    if (Array.isArray(target) && target.length === 4) r = { left: target[0], top: target[1], width: target[2], height: target[3] };
    else r = q(target).getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'hl' + (below ? ' below' : '');
    Object.assign(box.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    if (label) { const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = label; box.append(tag); }
    root.insertBefore(box, cap);
    hl.push(box);
    return box;
  };
  T.unhighlight = () => { while (hl.length) hl.pop().remove(); };
  // a box around a point on the stage (canvas pixels)
  T.highlightPoint = (pt, label, size = 46) => { const [x, y] = T.toClient(pt); return T.highlight([x - size / 2, y - size / 2, size, size], label, { pad: 0 }); };

  T.caption = (text) => { cap.textContent = text || ''; };
  T.chapter = (n, title) => {
    pill.textContent = `${n}. ${title}`;
    pill.style.opacity = 1;
    clearTimeout(T._pill);
    T._pill = setTimeout(() => { pill.style.opacity = 0; }, 3200);
  };
  T.titleCard = (show, h = '', p = '') => {
    let card = root.querySelector('.title');
    if (show) {
      if (!card) { card = document.createElement('div'); card.className = 'title'; root.insertBefore(card, cap); }
      card.innerHTML = `<div class="diamond"></div><h1>${h}</h1><p>${p}</p>`;
      card.style.opacity = 1;
    } else if (card) { card.style.opacity = 0; setTimeout(() => card.remove(), 900); }
  };

  window.T = T;
})();
