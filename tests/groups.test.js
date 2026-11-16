/* Groups (parts moved together, like a group in Flash) and the frame grid of the timeline: run in
   EasyTuber's action engine (vendored runtime) where they reach the exported file. */
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

function run(project) {
  const ctx = { window: {}, navigator: { platform: 'Win32' }, structuredClone, console, performance };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'defs.js', 'actions.js']) vm.runInContext(fs.readFileSync(path.join(RUNTIME, f), 'utf8'), ctx, { filename: f });
  const PT = ctx.PT;
  PT.Actions.partPoint = (id, u, v) => { const b = BOXES[id]; return b ? [b[0] + u * b[2], b[1] + v * b[3]] : [960, 540]; };
  vm.runInContext(Codegen.generate(project), ctx);
  const proj = { actions: {}, stage: { actionSound: 'off' } };
  PT.Actions.play(project.id, { seed: 1 }, proj, 0);
  return {
    PT,
    fx(ms, id) {
      PT.Actions.update(ms, proj);
      const r = PT.Actions.running[0];
      if (r) r.state.free = null;   // a new frame
      return PT.Actions.partFx(id);
    },
    free() { return PT.Actions.running[0].state.free; },
  };
}

function project(edit) {
  const p = Model.newProject();
  p.id = 'groups'; p.blend = { in: 0, out: 0 }; p.strength.on = false;
  edit(p);
  return Model.normalize(p);
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

test('a group turns its parts as one piece around the middle of its parts', () => {
  let g;
  const r = run(project((p) => { g = Model.makeGroup(p, ['torso', 'armRUpper']); Model.setKey(p, g, 'angle', 0, 90); }));
  // the group's middle: between the torso's (200, 350) and the arm's (400, 320) = (300, 335)
  // the torso's middle swings a quarter turn clockwise round it to (285, 235)
  const t = r.fx(500, 'torso');
  near(t.dx, 85, 'torso dx'); near(t.dy, -115, 'torso dy'); near(t.rot, 90, 'torso rot');
  const a = r.fx(500, 'armRUpper');
  near(a.dx, -85, 'arm dx'); near(a.dy, 115, 'arm dy'); near(a.rot, 90, 'arm rot');
  assert.equal(r.fx(500, 'face'), null, 'a part outside the group stays put');
  assert.deepEqual([...r.free().pivots[g]], [300, 335], 'where the pivot is drawn');
});

test('a part\'s own motion goes inside its group\'s', () => {
  const r = run(project((p) => {
    const g = Model.makeGroup(p, ['torso']);
    Model.setKey(p, 'torso', 'x', 0, 10);
    Model.setKey(p, g, 'x', 0, 50);
    Model.setKey(p, g, 'y', 0, -5);
  }));
  const f = r.fx(500, 'torso');
  near(f.dx, 60, 'dx'); near(f.dy, -5, 'dy');
});

test('a group inside a group goes with it', () => {
  const r = run(project((p) => {
    const inner = Model.makeGroup(p, ['armRUpper']);
    const outer = Model.makeGroup(p, [inner, 'face']);
    Model.setKey(p, outer, 'x', 0, 100);
    Model.setKey(p, inner, 'y', 0, 20);
  }));
  const arm = r.fx(500, 'armRUpper'), face = r.fx(500, 'face');
  near(arm.dx, 100, 'arm dx'); near(arm.dy, 20, 'arm dy');
  near(face.dx, 100, 'face dx'); near(face.dy, 0, 'face dy');
});

test('a group\'s opacity fades its parts on top of their own', () => {
  const r = run(project((p) => {
    const g = Model.makeGroup(p, ['face']);
    Model.setKey(p, g, 'opacity', 0, 0.5);
    Model.setKey(p, 'face', 'opacity', 0, 0.5);
  }));
  near(r.fx(500, 'face').alpha, 0.25, 'alpha');
});

test('a group\'s pivot can be moved off its middle', () => {
  const r = run(project((p) => {
    const g = Model.makeGroup(p, ['torso']);
    p.groups[0].pivot = { x: -100, y: -50 };   // the torso's top-left corner, (100, 300)
    Model.setKey(p, g, 'angle', 0, 90);
  }));
  const f = r.fx(500, 'torso');
  near(f.dx, -150, 'dx'); near(f.dy, 50, 'dy');
});

test('a part linked to its parent goes with the parent\'s group', () => {
  const r = run(project((p) => {
    const g = Model.makeGroup(p, ['torso']);
    p.follow.torso = true;
    Model.setKey(p, g, 'x', 0, 30);
  }));
  near(r.fx(500, 'armRUpper').dx, 30, 'the arm hangs from the torso');
});

test('groups survive a round trip; ungrouping takes the group\'s motion with it', () => {
  let inner, outer;
  const p = project((q) => {
    inner = Model.makeGroup(q, ['armRUpper', 'armRLower']);
    outer = Model.makeGroup(q, [inner, 'face'], 'Head and arm');
    Model.setKey(q, inner, 'angle', 0, 15);
  });
  const back = Codegen.extractProject(Codegen.generate(p));
  assert.deepEqual(back.groups, p.groups);
  assert.equal(back.tracks[inner].angle[0].v, 15);
  assert.equal(Model.groupOf(back, inner), outer);
  Model.ungroup(back, inner);
  assert.deepEqual(back.groups, [{ id: outer, name: 'Head and arm', members: ['armRUpper', 'armRLower', 'face'], pivot: { x: 0, y: 0 } }]);
  assert.equal(back.tracks[inner], undefined);
});

test('bad groups from a file are cleaned up', () => {
  const p = Model.normalize({
    groups: [
      { id: 'g_1', members: ['face', 'g_2'] },
      { id: 'g_2', members: ['g_1', 'torso', 'face'] },   // a loop, and face is already in g_1
      { id: 'g_3', members: [] },                          // empty
      { id: 'bad id', members: ['neck'] },
    ],
    tracks: { g_1: { angle: [{ t: 0, v: 5 }], rot: [{ t: 0, v: 9 }] }, g_3: { x: [{ t: 0, v: 1 }] } },
  });
  assert.deepEqual(p.groups.map((g) => [g.id, g.members]), [['g_1', ['face', 'g_2']], ['g_2', ['torso']]]);
  assert.deepEqual(Object.keys(p.tracks), ['g_1'], 'tracks of groups that are gone go too');
  assert.deepEqual(Object.keys(p.tracks.g_1), ['angle'], 'groups only move freely');
});

/* ---------- frames ---------- */
test('frames: times sit on a grid of frames at the frame rate', () => {
  const p = Model.newProject();
  assert.equal(p.fps, 24);
  assert.equal(Model.frameCount(p), 49, '2 s at 24 fps: frames 1 to 49');
  assert.equal(Model.toMs(p, 12), 500);
  assert.equal(Model.toFrame(p, 510), 12);
  assert.equal(Model.snapMs(p, 30), 42);
});

test('insert frames (F5) moves later keys right and makes the action longer', () => {
  const p = Model.newProject();
  Model.setKey(p, 'face', 'x', Model.toMs(p, 4), 1);
  Model.setKey(p, 'face', 'x', Model.toMs(p, 10), 2);
  Model.setKey(p, 'torso', 'x', Model.toMs(p, 10), 3);
  p.effects = [{ id: 'fx', from: Model.toMs(p, 2), to: Model.toMs(p, 8) }];
  Model.insertFrames(p, ['face', 'fx:fx'], 6, 3);
  assert.deepEqual(p.tracks.face.x.map((k) => Model.toFrame(p, k.t)), [4, 13]);
  assert.equal(Model.toFrame(p, p.tracks.torso.x[0].t), 10, 'a layer not picked is left alone');
  assert.deepEqual([Model.toFrame(p, p.effects[0].from), Model.toFrame(p, p.effects[0].to)], [2, 11], 'a span through the frame gets longer');
  assert.equal(Model.frameCount(p), 52);
});

test('remove frames (Shift+F5) deletes their keys and moves later ones left', () => {
  const p = Model.newProject();
  for (const f of [2, 5, 9]) Model.setKey(p, 'face', 'angle', Model.toMs(p, f), f);
  p.states.eyes = [{ t: Model.toMs(p, 9), v: 'closed' }];
  Model.removeFrames(p, ['face', 'state:eyes'], 4, 6, true);
  assert.deepEqual(p.tracks.face.angle.map((k) => [Model.toFrame(p, k.t), k.v]), [[2, 2], [6, 9]]);
  assert.equal(Model.toFrame(p, p.states.eyes[0].t), 6);
  assert.equal(Model.frameCount(p), 46, 'every layer picked: the action is shorter');
});

test('reverse frames plays a stretch backwards, eases turned round', () => {
  const p = Model.newProject();
  Model.setKey(p, 'face', 'angle', Model.toMs(p, 0), 0, 'inQuad');
  Model.setKey(p, 'face', 'angle', Model.toMs(p, 6), 10, 'linear');
  Model.setKey(p, 'face', 'angle', Model.toMs(p, 8), 20, 'step');
  Model.reverseFrames(p, ['face'], 0, 8);
  assert.deepEqual(p.tracks.face.angle.map((k) => [Model.toFrame(p, k.t), k.v, k.ease]), [[0, 20, 'linear'], [2, 10, 'outQuad'], [8, 0, 'inQuad']]);
});

test('a new frame rate keeps the frames (Flash), or the timing', () => {
  const p = Model.newProject();
  Model.setKey(p, 'face', 'x', Model.toMs(p, 12), 5);
  const q = JSON.parse(JSON.stringify(p));
  Model.setFps(p, 12);
  assert.equal(Model.toFrame(p, p.tracks.face.x[0].t), 12, 'still on frame 12');
  assert.equal(p.tracks.face.x[0].t, 1000, 'which comes later at 12 fps');
  assert.equal(Model.frameCount(p), 49);
  Model.setFps(q, 12, true);
  assert.equal(q.tracks.face.x[0].t, 500, 'keeping the timing');
  assert.equal(q.duration, 2000);
});
