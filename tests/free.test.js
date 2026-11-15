/* Free motion: parts moved, turned, scaled and faded anywhere on the stage around pivots of the
   user's own, run in EasyTuber's action engine (vendored runtime). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../src/model');
const Codegen = require('../src/codegen');

const RUNTIME = path.join(__dirname, '..', 'runtime', 'easytuber');
// where each part's drawing is on the stage before any motion: x, y, w, h (stage pixels)
const BOXES = { torso: [100, 300, 200, 100], armRUpper: [380, 300, 40, 40], face: [150, 100, 100, 100] };

function run(project, opts = {}, rig = null) {
  const ctx = { window: {}, navigator: { platform: 'Win32' }, structuredClone, console, performance };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'defs.js', 'actions.js']) vm.runInContext(fs.readFileSync(path.join(RUNTIME, f), 'utf8'), ctx, { filename: f });
  const PT = ctx.PT;
  PT.Actions.partPoint = (id, u, v) => { const b = BOXES[id]; return b ? [b[0] + u * b[2], b[1] + v * b[3]] : [960, 540]; };
  if (rig) PT.Assets = { primary: (id) => (rig[id] ? { w: rig[id].w, h: rig[id].h } : null) };
  vm.runInContext(Codegen.generate(project), ctx);
  const proj = { actions: {}, stage: { actionSound: 'off' }, parts: rig || undefined };
  PT.Actions.play(project.id, { seed: 1, args: opts.args }, proj, 0);
  return {
    PT,
    fx(ms, id) {
      PT.Actions.update(ms, proj);
      const run = PT.Actions.running[0];
      if (run) run.state.free = null;   // a new frame
      return PT.Actions.partFx(id);
    },
  };
}

function project(edit) {
  const p = Model.newProject();
  p.id = 'free'; p.blend = { in: 0, out: 0 }; p.strength.on = false;
  edit(p);
  return p;
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

test('a part moves anywhere and turns around its middle by default', () => {
  const r = run(project((p) => {
    Model.setKey(p, 'torso', 'x', 0, 10);
    Model.setKey(p, 'torso', 'angle', 0, 90);
  }));
  const f = r.fx(500, 'torso');
  near(f.dx, 10, 'dx'); near(f.dy, 0, 'dy'); near(f.rot, 90, 'rot'); near(f.scale, 1, 'scale');
});

test('a pivot of your own: the part turns around that point', () => {
  const r = run(project((p) => {
    p.pivots.torso = { u: 0, v: 0 };            // the top-left corner, (100, 300)
    Model.setKey(p, 'torso', 'angle', 0, 90);
    Model.setKey(p, 'torso', 'x', 0, 10);
  }));
  // the middle (200, 350) turns a quarter clockwise around (100, 300) to (50, 400), then moves 10 right
  const f = r.fx(500, 'torso');
  near(f.dx, -140, 'dx'); near(f.dy, 50, 'dy'); near(f.rot, 90, 'rot');
});

test('size scales around the pivot', () => {
  const r = run(project((p) => { p.pivots.torso = { u: 0, v: 0 }; Model.setKey(p, 'torso', 'size', 0, 2); }));
  const f = r.fx(500, 'torso');
  // the middle (200, 350) is twice as far from (100, 300): (300, 400)
  near(f.dx, 100, 'dx'); near(f.dy, 50, 'dy'); near(f.scale, 2, 'scale');
});

test('every part moves on its own: moving the torso leaves the arms and head where they are', () => {
  const p = project((q) => { q.pivots.torso = { u: 0, v: 0 }; Model.setKey(q, 'torso', 'angle', 0, 90); Model.setKey(q, 'torso', 'x', 0, 500); });
  const r = run(p);
  assert.equal(r.fx(500, 'armRUpper'), null, 'the arm stays put');
  assert.equal(r.fx(500, 'face'), null, 'the face stays put');
});

test('a part can be linked so the parts hanging from it go with it', () => {
  const p = project((q) => { q.pivots.torso = { u: 0, v: 0 }; Model.setKey(q, 'torso', 'angle', 0, 90); q.follow.torso = true; q.follow.neck = true; });
  const r = run(p);
  // the arm's middle (400, 320) turns around (100, 300) to (80, 600)
  const f = r.fx(500, 'armRUpper');
  near(f.dx, -320, 'dx'); near(f.dy, 280, 'dy'); near(f.rot, 90, 'rot');
  // through the neck (also linked) to the face
  near(r.fx(500, 'face').rot, 90, 'face turns with the torso');
});

test('a linked child\'s own motion adds to its parent\'s', () => {
  const r = run(project((p) => {
    p.follow.torso = true;
    Model.setKey(p, 'torso', 'x', 0, 50);
    Model.setKey(p, 'armRUpper', 'y', 0, -20);
    Model.setKey(p, 'armRUpper', 'angle', 0, 30);
  }));
  const f = r.fx(500, 'armRUpper');
  near(f.dx, 50, 'dx'); near(f.dy, -20, 'dy'); near(f.rot, 30, 'rot');
});

test('keys are interpolated and blended like the rest of the action', () => {
  const p = project((q) => { Model.setKey(q, 'torso', 'x', 0, 0, 'linear'); Model.setKey(q, 'torso', 'x', 1000, 100, 'linear'); });
  let f = run(p).fx(250, 'torso');
  near(f.dx, 25, 'quarter of the way');
  p.strength.on = true;
  const r = run(p);
  r.PT.Actions.running[0].settings.strength = 50;
  f = r.fx(1000, 'torso');
  near(f.dx, 50, 'half strength');
});

test('opacity fades a part, and 0 hides it', () => {
  const r = run(project((p) => { Model.setKey(p, 'face', 'opacity', 0, 1, 'linear'); Model.setKey(p, 'face', 'opacity', 1000, 0, 'linear'); }));
  near(r.fx(500, 'face').alpha, 0.5, 'half');
  assert.equal(r.fx(1000, 'face').hide, true);
});

test('an effect on a freely moved part goes with it', () => {
  const p = project((q) => {
    Model.setKey(q, 'face', 'x', 0, 300);
    q.effects = [{ id: 'cap', preset: 'caption', label: 'Cap', layer: 'front', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0.5 }, params: { text: 'hi' }, toggle: false }];
  });
  const r = run(p);
  r.fx(500, 'face');
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; return true; } });
  r.PT.Actions.draw('front', { ctx: g, view: () => [1, 0, 0, 1, 0, 0] });
  const tr = calls.find((c) => c[0] === 'translate');
  near(tr[1], 200 + 300, 'caption x follows the face');
});

test('free and joint motion live side by side, and survive a round trip', () => {
  const p = project((q) => {
    Model.setKey(q, 'torso', 'x', 0, 40);
    Model.setKey(q, 'armRUpper', 'rot', 0, -90);
    q.pivots.armRUpper = { u: 0.5, v: 0.1 };
    q.follow.face = true;
  });
  const src = Codegen.generate(p);
  assert.match(src, /const KEYS = /);
  assert.match(src, /const FREE = /);
  assert.match(src, /parts\(a, id\)/);
  const back = Codegen.extractProject(src);
  assert.deepEqual(back.pivots, { armRUpper: { u: 0.5, v: 0.1 } });
  assert.deepEqual(back.follow, { face: true });
  // a joint-only action has no free code at all
  assert.doesNotMatch(Codegen.generate(project((q) => Model.setKey(q, 'face', 'rot', 0, 5))), /parts\(a, id\)/);
});

test('mirroring copies free keys and the pivot across', () => {
  const p = Model.newProject();
  Model.setKey(p, 'armLUpper', 'angle', 0, 30);
  Model.setKey(p, 'armLUpper', 'x', 0, 12);
  p.pivots.armLUpper = { u: 0.2, v: 0.1 };
  Model.mirror(p, { armLUpper: 'armRUpper' }, true);
  assert.equal(p.tracks.armRUpper.angle[0].v, -30);
  assert.equal(p.tracks.armRUpper.x[0].v, -12);
  assert.deepEqual(p.pivots.armRUpper, { u: 0.8, v: 0.1 });
});

test('a pivot on the joint is found on whichever avatar plays the action', () => {
  const p = project((q) => { q.pivots.torso = { joint: true }; Model.setKey(q, 'torso', 'angle', 0, 90); });
  // this avatar's torso image is 200 x 100 and its joint is at its top-left corner
  const r = run(p, {}, { torso: { w: 200, h: 100, px: 0, py: 0 } });
  const f = r.fx(500, 'torso');
  near(f.dx, -150, 'dx'); near(f.dy, 50, 'dy');   // the middle turns around (100, 300), like the corner pivot test
  assert.match(Codegen.generate(p), /"torso":"joint"/);
  assert.deepEqual(Model.normalize(p).pivots, { torso: { joint: true } });
});
