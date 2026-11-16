/* The studio's project: one action being made. Saved as <name>.etaction.json, and embedded in every
   exported action file so the file can be opened again for editing.

   Times are in ms from the start of the action. A part moves two ways:
     free   x / y (stage pixels on the 1920x1080 stage), angle (degrees, clockwise), size (1 = as
            drawn) and opacity (0..1), around a pivot of your own: pivots[part] = { u, v } (0..1
            across and down the part's drawing, or beyond it), or { joint: true } (the joint the
            playing avatar gives the part, so it fits any avatar); the middle if not set. Every part
            moves on its own; follow[part] === true makes the parts hanging from it go with it.
     joint  EasyTuber's own rig motion around the joint the avatar gives the part: rot (degrees),
            ox / oy (rig units) are added, sx / sy multiply. Children always follow.

   Groups (groups[]: { id: 'g_…', name, members: [part or group ids], pivot: { x, y } }) move their
   members together, like a group in Flash: free motion only (x, y, angle, size, opacity), kept in
   tracks[groupId], around the middle of the group's parts moved by pivot (stage pixels). A part or
   group is in at most one group; a group inside another goes with it.

   Frames: the timeline is a grid of frames at fps frames a second. Times stay in ms (the exported
   file and EasyTuber run in ms); frame f is at round(f * 1000 / fps) ms, frame 0 at 0 ms and the
   last frame at the end (duration). The timeline shows frames 1-based, as Flash does. */
(function (root, factory) {
  const lib = factory(typeof module === 'object' && module.exports ? require('./interp') : root.Studio.Interp);
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.Studio.Model = lib;
})(typeof self !== 'undefined' ? self : this, function (Interp) {
  const FORMAT = 'easytuber-action-studio';
  const ID = /^[\w-]{1,40}$/;
  const PART_ID = /^([a-zA-Z]{1,20}|c_[a-z0-9]{1,16})$/;
  const GROUP_ID = /^g_[a-z0-9]{1,16}$/;
  const MAX_GROUPS = 40;
  const FPS_OPTIONS = [8, 12, 15, 24, 25, 30, 50, 60];
  const DEFAULT_FPS = 24;
  const FREE_PROPS = ['x', 'y', 'angle', 'size', 'opacity'];
  const JOINT_PROPS = ['rot', 'ox', 'oy', 'sx', 'sy'];
  const PROPS = [...FREE_PROPS, ...JOINT_PROPS];
  const REST = { x: 0, y: 0, angle: 0, size: 1, opacity: 1, rot: 0, ox: 0, oy: 0, sx: 1, sy: 1 };
  const PROP_LABEL = {
    x: 'X', y: 'Y', angle: 'Turn', size: 'Size', opacity: 'Opacity',
    rot: 'Joint turn', ox: 'Joint move X', oy: 'Joint move Y', sx: 'Joint scale X', sy: 'Joint scale Y',
  };
  // how a value is shown and typed: percent props are stored as fractions
  const PERCENT = new Set(['size', 'opacity', 'sx', 'sy']);
  const UNIT = { x: 'px', y: 'px', angle: '°', size: '%', opacity: '%', rot: '°', ox: 'rig', oy: 'rig', sx: '%', sy: '%' };
  const STATE_TRACKS = ['eyes', 'mouth', 'expression'];
  const STATE_VALUES = { eyes: ['open', 'half', 'closed'], mouth: ['closed', 'half', 'open'] };
  const MIN_MS = 100, MAX_MS = 60000, MAX_RELEASE = 5000;
  const MEDIA_PREFIXES = ['user-actions', 'media/actions'];
  const FILE = /^[\w][\w .-]{0,80}\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a)$/i;

  const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, k = 1000) => Math.round(v * k) / k;
  const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);

  function newProject() {
    return {
      format: FORMAT, version: 1,
      id: 'my-action', label: 'My action',
      duration: 2000, fps: DEFAULT_FPS, overlap: false,
      hold: false, release: 300, loop: { from: 0, to: 2000 },
      blend: { in: 300, out: 400 },
      strength: { on: true, default: 100, max: 150 },
      tracks: {},
      pivots: {},        // free pivot per part: { u, v } or { joint: true }
      follow: {},        // true: the parts hanging from this one go with its free motion (off by default)
      groups: [],        // parts moved together: { id, name, members, pivot: { x, y } }
      states: { eyes: [], mouth: [], expression: [] },
      inFront: [],
      sounds: [],
      effects: [],
      mediaPrefix: 'user-actions',
      assets: {},
    };
  }

  function cleanKeys(list, dur, values = null) {
    const out = [];
    for (const k of Array.isArray(list) ? list : []) {
      if (!k) continue;
      const t = clamp(Math.round(num(k.t, NaN)), 0, dur);
      if (!Number.isFinite(t)) continue;
      if (values) {
        const v = typeof k.v === 'string' ? k.v : '';
        if (v && values !== true && !values.includes(v)) continue;
        out.push({ t, v: v.slice(0, 40) });
      } else {
        const v = num(k.v, NaN);
        if (!Number.isFinite(v)) continue;
        out.push({ t, v: round(v), ease: Interp.EASES.includes(k.ease) ? k.ease : 'inOut' });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out.filter((k, i) => i === 0 || k.t !== out[i - 1].t);   // one key per time
  }

  /* Groups from a file: valid ids, each part or group in one group at most, no group inside itself,
     no empty groups. */
  function cleanGroups(list) {
    const groups = [], seen = new Set();
    for (const g of Array.isArray(list) ? list : []) {
      if (!g || !GROUP_ID.test(g.id) || seen.has(g.id) || groups.length >= MAX_GROUPS) continue;
      seen.add(g.id);
      const pv = g.pivot || {};
      groups.push({
        id: g.id, name: str(g.name, 40).trim() || g.id,
        members: Array.isArray(g.members) ? g.members.filter((m) => typeof m === 'string') : [],
        pivot: { x: round(clamp(num(pv.x, 0), -5000, 5000), 10), y: round(clamp(num(pv.y, 0), -5000, 5000), 10) },
      });
    }
    const ids = new Set(groups.map((g) => g.id)), owner = {};
    for (const g of groups) {
      g.members = g.members.filter((m) => {
        if (m === g.id || owner[m] || !(PART_ID.test(m) || ids.has(m))) return false;
        owner[m] = g.id;
        return true;
      });
    }
    // a group inside itself (through other groups) is taken out of the group that closes the loop
    for (const g of groups) {
      const path = new Set([g.id]);
      for (let up = owner[g.id]; up; up = owner[up]) {
        if (path.has(up)) { const o = groups.find((x) => x.id === owner[g.id]); o.members = o.members.filter((m) => m !== g.id); delete owner[g.id]; break; }
        path.add(up);
      }
    }
    // empty groups go, and with them their place in the group above
    let out = groups;
    for (let changed = true; changed;) {
      changed = false;
      const keep = new Set(out.filter((g) => g.members.length).map((g) => g.id));
      for (const g of out) {
        const before = g.members.length;
        g.members = g.members.filter((m) => !GROUP_ID.test(m) || keep.has(m));
        if (g.members.length !== before) changed = true;
      }
      if (out.some((g) => !g.members.length)) { out = out.filter((g) => g.members.length); changed = true; }
    }
    return out;
  }

  /* Fill in and check anything loaded from a file. Unknown fields are dropped. */
  function normalize(p) {
    const d = newProject();
    if (!p || typeof p !== 'object') return d;
    const out = { ...d };
    out.id = ID.test(p.id) ? p.id : d.id;
    out.label = str(p.label, 60).trim() || out.id;
    out.hold = p.hold === true;
    out.duration = clamp(Math.round(num(p.duration, d.duration)), MIN_MS, MAX_MS);
    out.fps = FPS_OPTIONS.includes(+p.fps) ? +p.fps : DEFAULT_FPS;
    out.overlap = !out.hold && p.overlap === true;
    out.release = clamp(Math.round(num(p.release, d.release)), 0, MAX_RELEASE);
    const lp = p.loop || {};
    out.loop = { from: clamp(Math.round(num(lp.from, 0)), 0, out.duration), to: clamp(Math.round(num(lp.to, out.duration)), 0, out.duration) };
    if (out.loop.to - out.loop.from < 50) out.loop = { from: 0, to: out.duration };
    const b = p.blend || {};
    out.blend = { in: clamp(Math.round(num(b.in, d.blend.in)), 0, 5000), out: clamp(Math.round(num(b.out, d.blend.out)), 0, 5000) };
    const s = p.strength || {};
    const max = clamp(Math.round(num(s.max, 150)), 100, 300);
    out.strength = { on: s.on !== false, max, default: clamp(Math.round(num(s.default, 100)), 0, max) };
    out.groups = cleanGroups(p.groups);
    const groupIds = new Set(out.groups.map((g) => g.id));
    out.tracks = {};
    for (const [part, props] of Object.entries(p.tracks && typeof p.tracks === 'object' ? p.tracks : {})) {
      const group = groupIds.has(part);
      if (!(PART_ID.test(part) || group) || !props || typeof props !== 'object') continue;
      const tr = {};
      for (const prop of group ? FREE_PROPS : PROPS) {
        const keys = cleanKeys(props[prop], out.duration);
        if (keys.length) tr[prop] = keys;
      }
      if (Object.keys(tr).length) out.tracks[part] = tr;
      for (const k of tr.opacity || []) k.v = clamp(k.v, 0, 1);
      for (const k of tr.size || []) k.v = Math.max(0, k.v);
    }
    out.pivots = {};
    for (const [part, pv] of Object.entries(p.pivots && typeof p.pivots === 'object' ? p.pivots : {})) {
      if (!PART_ID.test(part) || !pv) continue;
      if (pv.joint === true) { out.pivots[part] = { joint: true }; continue; }
      if (!Number.isFinite(+pv.u) || !Number.isFinite(+pv.v)) continue;
      out.pivots[part] = { u: round(clamp(+pv.u, -5, 6)), v: round(clamp(+pv.v, -5, 6)) };
    }
    out.follow = {};
    for (const [part, f] of Object.entries(p.follow && typeof p.follow === 'object' ? p.follow : {})) {
      if (PART_ID.test(part) && f === true) out.follow[part] = true;
    }
    const st = p.states || {};
    out.states = {
      eyes: cleanKeys(st.eyes, out.duration, STATE_VALUES.eyes),
      mouth: cleanKeys(st.mouth, out.duration, STATE_VALUES.mouth),
      expression: cleanKeys(st.expression, out.duration, true).filter((k) => !k.v || /^[a-z0-9][a-z0-9_-]{0,39}$/.test(k.v)),
    };
    out.inFront = (Array.isArray(p.inFront) ? p.inFront : []).map((r) => r && {
      from: clamp(Math.round(num(r.from, 0)), 0, out.duration),
      to: clamp(Math.round(num(r.to, out.duration)), 0, out.duration),
      parts: (Array.isArray(r.parts) ? r.parts : []).filter((x) => typeof x === 'string' && PART_ID.test(x)).slice(0, 40),
    }).filter((r) => r && r.parts.length && r.to > r.from).slice(0, 20);
    out.sounds = (Array.isArray(p.sounds) ? p.sounds : []).map((x) => x && FILE.test(x.file) && {
      t: clamp(Math.round(num(x.t, 0)), 0, out.duration),
      file: x.file,
      volume: clamp(num(x.volume, 1), 0, 1),
      loop: out.hold && x.loop === true,
    }).filter(Boolean).slice(0, 20);
    const fxIds = new Set();
    out.effects = (Array.isArray(p.effects) ? p.effects : []).map((e) => {
      if (!e || typeof e.preset !== 'string' || !ID.test(e.id || '') || fxIds.has(e.id)) return null;
      fxIds.add(e.id);
      const a = e.anchor || {};
      return {
        id: e.id, preset: e.preset, label: str(e.label, 40).trim() || e.id,
        layer: e.layer === 'behind' ? 'behind' : 'front',
        from: clamp(Math.round(num(e.from, 0)), 0, out.duration),
        to: clamp(Math.round(num(e.to, out.duration)), 0, out.duration),
        anchor: { part: PART_ID.test(a.part) ? a.part : 'face', u: round(clamp(num(a.u, 0.5), -2, 3)), v: round(clamp(num(a.v, 0.5), -2, 3)) },
        params: e.params && typeof e.params === 'object' ? { ...e.params } : {},
        toggle: e.toggle !== false,
      };
    }).filter((e) => e && e.to > e.from).slice(0, 20);
    out.mediaPrefix = MEDIA_PREFIXES.includes(p.mediaPrefix) ? p.mediaPrefix : 'user-actions';
    out.assets = {};
    for (const [f, src] of Object.entries(p.assets && typeof p.assets === 'object' ? p.assets : {})) {
      if (FILE.test(f) && typeof src === 'string') out.assets[f] = src;
    }
    return out;
  }

  /* ---------- keyframes ---------- */
  function track(p, part, prop) { return (p.tracks[part] && p.tracks[part][prop]) || []; }

  // the value of one part property at time t (rest value when it has no keys)
  function valueAt(p, part, prop, t) {
    const keys = track(p, part, prop);
    return keys.length ? Interp.sample(keys.map((k) => [k.t, k.v, k.ease]), t) : REST[prop];
  }

  // set (or replace) the key at time t
  function setKey(p, part, prop, t, v, ease) {
    t = clamp(Math.round(t), 0, p.duration);
    const tr = p.tracks[part] || (p.tracks[part] = {});
    const keys = tr[prop] || (tr[prop] = []);
    const old = keys.find((k) => k.t === t);
    if (old) { old.v = round(v); if (ease) old.ease = ease; return old; }
    const k = { t, v: round(v), ease: ease || (keys.length ? keys[keys.length - 1].ease : 'inOut') };
    keys.push(k);
    keys.sort((a, b) => a.t - b.t);
    return k;
  }

  function removeKey(p, part, prop, t) {
    const tr = p.tracks[part];
    if (!tr || !tr[prop]) return;
    tr[prop] = tr[prop].filter((k) => k.t !== t);
    if (!tr[prop].length) delete tr[prop];
    if (!Object.keys(tr).length) delete p.tracks[part];
  }

  // move a key to another time; a key already there is replaced
  function moveKey(p, part, prop, from, to) {
    const keys = track(p, part, prop);
    const k = keys.find((x) => x.t === from);
    if (!k) return null;
    to = clamp(Math.round(to), 0, p.duration);
    if (to === from) return k;
    p.tracks[part][prop] = keys.filter((x) => x === k || x.t !== to);
    k.t = to;
    p.tracks[part][prop].sort((a, b) => a.t - b.t);
    return k;
  }

  // a step key on the eyes / mouth / expression track (v '' = back to normal)
  function setStateKey(p, name, t, v) {
    t = clamp(Math.round(t), 0, p.duration);
    const keys = p.states[name];
    const old = keys.find((k) => k.t === t);
    if (old) old.v = v; else { keys.push({ t, v }); keys.sort((a, b) => a.t - b.t); }
  }
  function stateAt(p, name, t) { return Interp.held(p.states[name].map((k) => [k.t, k.v]), t); }

  // every key time in the project, sorted (for "previous / next key")
  function keyTimes(p) {
    const s = new Set([0, p.duration]);
    for (const tr of Object.values(p.tracks)) for (const keys of Object.values(tr)) for (const k of keys) s.add(k.t);
    for (const keys of Object.values(p.states)) for (const k of keys) s.add(k.t);
    return [...s].sort((a, b) => a - b);
  }

  /* ---------- frames ---------- */
  const toFrame = (p, t) => Math.round((t * p.fps) / 1000);
  const toMs = (p, f) => Math.round((f * 1000) / p.fps);
  const snapMs = (p, t) => toMs(p, toFrame(p, t));
  // the number of frames on the timeline: frame 0 at 0 ms to the last frame at the end
  const frameCount = (p) => toFrame(p, p.duration) + 1;
  // the length (ms) for a number of frames
  const framesToDuration = (p, n) => clamp(toMs(p, Math.max(1, Math.round(n)) - 1), MIN_MS, MAX_MS);
  const minFrames = (p) => Math.ceil((MIN_MS * p.fps) / 1000) + 1;

  /* Put every time in the project on a frame (after the frame rate changed). Two keys landing on
     one frame: the later one is kept. */
  function snapToFrames(p) {
    p.duration = snapMs(p, p.duration);
    if (p.duration < MIN_MS) p.duration = toMs(p, minFrames(p) - 1);
    if (p.duration > MAX_MS) p.duration = toMs(p, Math.floor((MAX_MS * p.fps) / 1000));
    const fix = (t) => clamp(snapMs(p, t), 0, p.duration);
    const dedupe = (keys) => keys.filter((k, i, a) => i === a.length - 1 || k.t !== a[i + 1].t);
    for (const tr of Object.values(p.tracks)) for (const prop of Object.keys(tr)) { tr[prop].forEach((k) => { k.t = fix(k.t); }); tr[prop] = dedupe(tr[prop]); }
    for (const n of STATE_TRACKS) { p.states[n].forEach((k) => { k.t = fix(k.t); }); p.states[n] = dedupe(p.states[n]); }
    for (const r of [...p.inFront, ...p.effects]) { r.from = fix(r.from); r.to = fix(r.to); if (r.to <= r.from) r.to = Math.min(p.duration, r.from + toMs(p, 1)); }
    for (const s of p.sounds) s.t = fix(s.t);
    p.loop = { from: fix(p.loop.from), to: fix(p.loop.to) };
    if (p.loop.to - p.loop.from < 50) p.loop = { from: 0, to: p.duration };
  }

  /* A new frame rate. Like Flash, the frames stay where they are and the action plays faster or
     slower; keepTiming (Flash's "scale spans" turned the other way) keeps every time in ms instead. */
  function setFps(p, fps, keepTiming = false) {
    fps = +fps;
    if (!FPS_OPTIONS.includes(fps) || fps === p.fps) return;
    if (!keepTiming) setDuration(p, ((frameCount(p) - 1) * 1000) / fps, true);
    p.fps = fps;
    snapToFrames(p);
  }

  /* ---------- rows: what timeline commands work on ----------
     A row id is a part or group id (all of its tracks), 'id|prop' (one track), 'state:eyes' (a face
     track), 'sounds', 'front' (parts in front) or 'fx:<effect id>'. keys(list, isState) returns the
     new list; span(bar) and point(sound) change it in place, or return false to remove it. */
  function forRows(p, rows, { keys, span, point }) {
    const done = new Set();
    for (const r of rows) {
      if (r.startsWith('state:')) { const n = r.slice(6); if (p.states[n] && keys) p.states[n] = keys(p.states[n], true); continue; }
      if (r === 'sounds') { if (point) p.sounds = p.sounds.filter((x) => point(x) !== false); continue; }
      if (r === 'front') { if (span) p.inFront = p.inFront.filter((b) => span(b) !== false); continue; }
      if (r.startsWith('fx:')) { if (span) p.effects = p.effects.filter((e) => e.id !== r.slice(3) || span(e) !== false); continue; }
      const [id, prop] = r.split('|'), tr = p.tracks[id];
      if (!tr || !keys) continue;
      for (const pr of prop ? [prop] : Object.keys(tr)) {
        if (!tr[pr] || done.has(id + '|' + pr)) continue;
        done.add(id + '|' + pr);
        tr[pr] = keys(tr[pr], false);
        if (!tr[pr].length) delete tr[pr];
      }
      if (!Object.keys(tr).length) delete p.tracks[id];
    }
  }
  // every row of the project (for commands on the whole timeline)
  function allRows(p) {
    return [...Object.keys(p.tracks), ...STATE_TRACKS.map((n) => 'state:' + n), 'sounds', 'front', ...p.effects.map((e) => 'fx:' + e.id)];
  }
  const oneAFrame = (keys) => keys.sort((a, b) => a.t - b.t).filter((k, i, a) => i === a.length - 1 || k.t !== a[i + 1].t);

  /* F5: n frames inserted after frame f on these rows: what comes later moves right, a span running
     through f gets longer, and the action gets n frames longer. */
  function insertFrames(p, rows, f, n) {
    if (n <= 0) return;
    const old = p.duration;
    p.duration = framesToDuration(p, frameCount(p) + n);
    if (p.loop.to === old) p.loop.to = p.duration;
    const at = (t) => { const k = toFrame(p, t); return k > f ? Math.min(p.duration, toMs(p, k + n)) : t; };
    forRows(p, rows, {
      keys: (list) => oneAFrame(list.map((k) => ({ ...k, t: at(k.t) }))),
      span: (b) => { b.from = at(b.from); b.to = at(b.to); },
      point: (x) => { x.t = at(x.t); },
    });
  }

  /* Shift+F5: frames f0..f1 taken out of these rows: their keys go and what comes later moves left.
     shorten: the action gets that many frames shorter too (every row was picked). */
  function removeFrames(p, rows, f0, f1, shorten = false) {
    const n = f1 - f0 + 1;
    if (n <= 0) return;
    const map = (t) => { const k = toFrame(p, t); return k < f0 ? t : k > f1 ? toMs(p, k - n) : null; };
    forRows(p, rows, {
      keys: (list) => list.filter((k) => map(k.t) !== null).map((k) => ({ ...k, t: map(k.t) })),
      span: (b) => {
        const a = map(b.from) ?? toMs(p, f0), z = map(b.to) ?? toMs(p, Math.max(0, f0 - 1));
        if (z <= a) return false;
        b.from = a; b.to = z;
        return true;
      },
      point: (x) => { const t = map(x.t); if (t === null) return false; x.t = t; return true; },
    });
    if (shorten) {
      const was = p.duration;
      p.duration = framesToDuration(p, Math.max(minFrames(p), frameCount(p) - n));
      if (p.loop.to === was || p.loop.to > p.duration) p.loop.to = p.duration;
      if (p.loop.to - p.loop.from < 50) p.loop = { from: 0, to: p.duration };
    }
  }

  /* Reverse Frames: the keys from frame f0 to f1 in the opposite order; each way between two keys
     keeps its ease, turned round (in becomes out). */
  const FLIP = { inQuad: 'outQuad', outQuad: 'inQuad' };
  function reverseFrames(p, rows, f0, f1) {
    const t0 = toMs(p, f0), t1 = toMs(p, f1);
    forRows(p, rows, {
      keys: (list, state) => {
        const inside = list.filter((k) => k.t >= t0 && k.t <= t1);
        if (inside.length < 2 && !state) return list;
        const rest = list.filter((k) => k.t < t0 || k.t > t1);
        const flipped = inside.map((k, i) => {
          const out = { ...k, t: toMs(p, f0 + f1 - toFrame(p, k.t)) };
          if (!state) {
            // the way into this key (from the one before it) is the way out of it now
            const before = inside[i - 1];
            out.ease = before ? FLIP[before.ease] || before.ease : k.ease;
          }
          return out;
        });
        return oneAFrame([...rest, ...flipped]);
      },
    });
  }

  /* ---------- groups ---------- */
  const isGroup = (id) => GROUP_ID.test(id);
  const groupById = (p, id) => p.groups.find((g) => g.id === id) || null;
  // the group a part or group is in, or null
  function groupOf(p, id) { const g = p.groups.find((x) => x.members.includes(id)); return g ? g.id : null; }
  // the groups around a part or group, innermost first
  function groupChain(p, id) { const out = []; for (let g = groupOf(p, id); g && !out.includes(g); g = groupOf(p, g)) out.push(g); return out; }
  // every part in a group, through the groups inside it
  function groupParts(p, gid, seen = new Set()) {
    const g = groupById(p, gid);
    if (!g || seen.has(gid)) return [];
    seen.add(gid);
    return g.members.flatMap((m) => (isGroup(m) ? groupParts(p, m, seen) : [m]));
  }

  /* Ctrl+G: the ids (parts and groups) become a new group. It goes inside the group they were all in
     (if they shared one). Returns the new group's id. */
  function makeGroup(p, ids, name) {
    ids = [...new Set(ids)].filter((id) => PART_ID.test(id) || groupById(p, id));
    if (!ids.length || p.groups.length >= MAX_GROUPS) return null;
    const ups = new Set(ids.map((id) => groupOf(p, id)));
    const up = ups.size === 1 ? [...ups][0] : null;
    for (const g of p.groups) g.members = g.members.filter((m) => !ids.includes(m));
    let n = 1;
    while (groupById(p, 'g_' + n)) n++;
    const id = 'g_' + n;
    p.groups.push({ id, name: name || `Group ${n}`, members: ids, pivot: { x: 0, y: 0 } });
    if (up && groupById(p, up)) groupById(p, up).members.push(id);
    p.groups = cleanGroups(p.groups);
    for (const gid of Object.keys(p.tracks)) if (isGroup(gid) && !groupById(p, gid)) delete p.tracks[gid];
    return id;
  }

  /* Ctrl+Shift+G: the group goes; its members move up into the group it was in. The group's own
     motion goes with it. */
  function ungroup(p, gid) {
    const g = groupById(p, gid);
    if (!g) return;
    const up = groupOf(p, gid);
    p.groups = p.groups.filter((x) => x.id !== gid);
    if (up) { const u = groupById(p, up); u.members.splice(u.members.indexOf(gid), 1, ...g.members); }
    delete p.tracks[gid];
    p.groups = cleanGroups(p.groups);
  }

  /* Copy one side's arm keys to the other: rot and ox flip sign so the motion mirrors. */
  function mirror(p, mirrorMap, fromLeft) {
    for (const [a, b] of Object.entries(mirrorMap)) {
      const src = a.startsWith(fromLeft ? 'armL' : 'armR');
      if (!src || !p.tracks[a]) continue;
      const copy = {};
      for (const [prop, keys] of Object.entries(p.tracks[a])) {
        copy[prop] = keys.map((k) => ({ ...k, v: ['rot', 'ox', 'angle', 'x'].includes(prop) ? round(-k.v) : k.v }));
      }
      p.tracks[b] = copy;
      // the other arm's drawing is a mirror image: its pivot is mirrored across too
      if (p.pivots[a]) p.pivots[b] = p.pivots[a].joint ? { joint: true } : { u: round(1 - p.pivots[a].u), v: p.pivots[a].v };
      if (p.follow[a] === true) p.follow[b] = true; else delete p.follow[b];
    }
  }

  /* Change the length: keys past the end are pulled in to the end. scale = stretch every key. */
  function setDuration(p, ms, scale = false) {
    const old = p.duration;
    p.duration = clamp(Math.round(ms), MIN_MS, MAX_MS);
    const f = scale ? p.duration / old : 1;
    const fix = (t) => clamp(Math.round(t * f), 0, p.duration);
    for (const tr of Object.values(p.tracks)) for (const prop of Object.keys(tr)) {
      tr[prop].forEach((k) => { k.t = fix(k.t); });
      tr[prop] = tr[prop].filter((k, i, a) => i === a.length - 1 || k.t !== a[i + 1].t);
    }
    for (const n of STATE_TRACKS) {
      p.states[n].forEach((k) => { k.t = fix(k.t); });
      p.states[n] = p.states[n].filter((k, i, a) => i === a.length - 1 || k.t !== a[i + 1].t);
    }
    for (const r of [...p.inFront, ...p.effects]) { r.from = fix(r.from); r.to = fix(r.to); }
    for (const s of p.sounds) s.t = fix(s.t);
    if (scale || p.loop.to === old) p.loop = { from: fix(p.loop.from), to: fix(p.loop.to) };
    p.loop.to = Math.min(p.loop.to, p.duration);
    if (p.loop.to - p.loop.from < 50) p.loop = { from: 0, to: p.duration };
  }

  // a new effect / sound id: "sparkles", "sparkles2"…
  function uniqueId(base, taken) {
    base = String(base).replace(/[^\w-]/g, '').slice(0, 36) || 'fx';
    let id = base;
    for (let n = 2; taken.includes(id); n++) id = base + n;
    return id;
  }

  return {
    FORMAT, ID, PART_ID, GROUP_ID, FILE, PROPS, FREE_PROPS, JOINT_PROPS, REST, PROP_LABEL, PERCENT, UNIT, STATE_TRACKS, STATE_VALUES, MIN_MS, MAX_MS, MAX_RELEASE, MEDIA_PREFIXES,
    FPS_OPTIONS, DEFAULT_FPS,
    newProject, normalize, track, valueAt, setKey, removeKey, moveKey, setStateKey, stateAt, keyTimes, mirror, setDuration, uniqueId,
    toFrame, toMs, snapMs, frameCount, framesToDuration, minFrames, snapToFrames, setFps,
    forRows, allRows, insertFrames, removeFrames, reverseFrames,
    isGroup, groupById, groupOf, groupChain, groupParts, makeGroup, ungroup,
  };
});
