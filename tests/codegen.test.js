/* The exported action file, run in EasyTuber's own action engine (the vendored runtime, in a sandbox
   the way EasyTuber's tests load it). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../src/model');
const Codegen = require('../src/codegen');
const Interp = require('../src/interp');

const RUNTIME = path.join(__dirname, '..', 'runtime', 'easytuber');

function loadPT() {
  const ctx = { window: {}, navigator: { platform: 'Win32' }, structuredClone, console, performance };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'defs.js', 'actions.js']) {
    vm.runInContext(fs.readFileSync(path.join(RUNTIME, f), 'utf8'), ctx, { filename: f });
  }
  return { PT: ctx.PT, ctx };
}

// run an exported file and play the action; returns a function: ms -> { deltas, states } at that time
function run(project, { settings = null, args = null } = {}) {
  const { PT, ctx } = loadPT();
  const src = Codegen.generate(project);
  vm.runInContext(src, ctx, { filename: project.id + '.js' });
  const def = PT.Actions.get(project.id);
  assert.ok(def, 'the file defines the action');
  const proj = { actions: settings ? { [project.id]: { settings } } : {}, stage: { actionSound: 'off' } };
  const sounds = [];
  PT.Actions.makeAudio = (s) => { sounds.push(s); return { play() {}, pause() {} }; };
  PT.Actions.play(project.id, { seed: 7, args }, proj, 0);
  return { PT, def, src, sounds, at: (ms) => PT.Actions.update(ms, proj) };
}

function waveProject() {
  const p = Model.newProject();
  p.id = 'wave2'; p.label = 'Wave 2'; p.duration = 2000;
  Model.setKey(p, 'armRUpper', 'rot', 0, 0, 'linear');
  Model.setKey(p, 'armRUpper', 'rot', 1000, -90, 'linear');
  Model.setKey(p, 'armRUpper', 'rot', 2000, 0, 'linear');
  Model.setKey(p, 'face', 'sy', 0, 1, 'linear');
  Model.setKey(p, 'face', 'sy', 1000, 1.2, 'linear');
  return p;
}

test('sample and held follow the keys', () => {
  const k = [[0, 0, 'linear'], [100, 10, 'step'], [200, 20, 'linear']];
  assert.equal(Interp.sample(k, -5), 0);
  assert.equal(Interp.sample(k, 50), 5);
  assert.equal(Interp.sample(k, 150), 10);     // step holds until the next key
  assert.equal(Interp.sample(k, 999), 20);
  assert.equal(Interp.held([[100, 'closed'], [300, '']], 50), '');
  assert.equal(Interp.held([[100, 'closed'], [300, '']], 200), 'closed');
  assert.equal(Interp.held([[100, 'closed'], [300, '']], 300), '');
  for (const e of Interp.EASES) { assert.ok(Math.abs(Interp.EASE[e](0)) < 1e-9, e); assert.ok(Math.abs(Interp.EASE[e](1) - 1) < 1e-9, e); }
});

test('the exported file defines a valid action', () => {
  const { def, src } = run(waveProject());
  assert.equal(def.label, 'Wave 2');
  assert.equal(def.duration, 2000);
  assert.equal(def.hold, false);
  assert.deepEqual([...def.settings.map((s) => s.key)], ['strength']);
  assert.match(src, /PT\.Actions\.define\(/);
});

test('pose follows the keys, blended in and out and scaled by strength', () => {
  const p = waveProject();
  p.blend = { in: 0, out: 0 };
  let r = run(p);
  assert.ok(Math.abs(r.at(500).deltas.armRUpper.rot - -45) < 1e-9);
  assert.ok(Math.abs(r.at(1000).deltas.face.sy - 1.2) < 1e-9);
  assert.ok(Math.abs(r.at(1500).deltas.face.sy - 1.2) < 1e-9);   // holds after the last key

  r = run(p, { settings: { strength: 50 } });
  assert.ok(Math.abs(r.at(1000).deltas.armRUpper.rot - -45) < 1e-9);
  assert.ok(Math.abs(r.at(1000).deltas.face.sy - 1.1) < 1e-9);    // scales blend towards 1

  r = run(p, { settings: { strength: 0 } });
  assert.equal(r.at(1000).deltas.armRUpper.rot, 0);

  p.blend = { in: 400, out: 400 };
  r = run(p);
  assert.ok(Math.abs(r.at(200).deltas.armRUpper.rot - -18 * 0.5) < 1e-9);   // half way into the blend-in
});

test('strength off leaves no setting and full motion', () => {
  const p = waveProject();
  p.strength.on = false; p.blend = { in: 0, out: 0 };
  const r = run(p);
  assert.equal(r.def.settings.length, 0);
  assert.ok(Math.abs(r.at(1000).deltas.armRUpper.rot - -90) < 1e-9);
});

test('held actions loop and release', () => {
  const p = waveProject();
  p.hold = true; p.release = 99999; p.loop = { from: 1000, to: 2000 }; p.blend = { in: 0, out: 0 };
  const n = Model.normalize(p);
  assert.equal(n.release, Model.MAX_RELEASE);
  p.release = 500;
  const r = run(p);
  assert.equal(r.def.hold, true);
  assert.equal(r.def.release, 500);
  assert.ok(Math.abs(r.at(500).deltas.armRUpper.rot - -45) < 1e-9);
  // 2500 ms wraps to 1500 ms
  assert.ok(Math.abs(r.at(2500).deltas.armRUpper.rot - -45) < 1e-9);
  assert.ok(Math.abs(r.at(4100).deltas.armRUpper.rot - -81) < 1e-9);
  assert.ok(r.PT.Actions.active, 'still on after its timeline length');
  r.PT.Actions.release('wave2', 5000);
  assert.ok(r.at(5250).deltas.armRUpper.rot !== 0, 'blending out');
  assert.equal(r.at(5600), null, 'gone after the release');
});

test('eyes, mouth, expression and inFront follow their tracks', () => {
  const p = waveProject();
  Model.setStateKey(p, 'eyes', 200, 'closed');
  Model.setStateKey(p, 'eyes', 800, '');
  Model.setStateKey(p, 'mouth', 0, 'open');
  Model.setStateKey(p, 'expression', 500, 'happy');
  p.inFront = [{ from: 300, to: 1200, parts: ['armRUpper', 'armRLower'] }];
  const r = run(p);
  assert.deepEqual({ ...r.at(100).states }, { mouth: 'open' });
  assert.deepEqual({ ...r.at(600).states }, { eyes: 'closed', mouth: 'open', expression: 'happy' });
  assert.deepEqual({ ...r.at(900).states }, { mouth: 'open', expression: 'happy' });
  const order = ['torso', 'armRUpper', 'armRLower', 'face'];
  r.at(100);
  assert.deepEqual([...r.PT.Actions.drawOrder(order)], order);
  r.at(500);
  assert.deepEqual([...r.PT.Actions.drawOrder(order)], ['torso', 'face', 'armRUpper', 'armRLower']);
});

test('sounds start once, at their time, from the action folder', () => {
  const p = waveProject();
  p.sounds = [{ t: 500, file: 'whoosh.mp3', volume: 0.5, loop: false }];
  const { PT, ctx } = loadPT();
  vm.runInContext(Codegen.generate(p), ctx);
  const played = [];
  PT.Actions.makeAudio = (s) => { const a = { play() { played.push(s); }, pause() {} }; return a; };
  const proj = { actions: {}, stage: { actionSound: 'editor', actionVolume: 100 } };
  PT.Actions.play('wave2', { seed: 1 }, proj, 0);
  PT.Actions.update(100, proj);
  assert.deepEqual(played, []);
  PT.Actions.update(600, proj);
  PT.Actions.update(700, proj);
  assert.deepEqual(played, ['user-actions/wave2/whoosh.mp3']);
});

test('effects draw on their layer within their time, and can be switched off', () => {
  const p = waveProject();
  p.effects = [
    { id: 'sparkles', preset: 'sparkles', label: 'Sparkles', layer: 'front', from: 200, to: 1200, anchor: { part: 'face', u: 0.5, v: 0.4 }, params: {}, toggle: true },
    { id: 'caption', preset: 'caption', label: 'Caption', layer: 'behind', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0 }, params: { text: 'Hi {user|you}' }, toggle: true },
    { id: 'pic', preset: 'image', label: 'Pic', layer: 'front', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0.5 }, params: { file: 'star.png' }, toggle: false },
    { id: 'notes', preset: 'notes', label: 'Notes', layer: 'front', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0.5 }, params: {}, toggle: true },
    { id: 'marks', preset: 'marks', label: 'Marks', layer: 'front', from: 0, to: 2000, anchor: { part: 'armRLower', u: 0.5, v: 1 }, params: {}, toggle: true },
    { id: 'burst', preset: 'burst', label: 'Burst', layer: 'front', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0.5 }, params: {}, toggle: true },
  ];
  const r = run(p, { args: { user: 'Bob' } });
  assert.deepEqual([...r.def.settings.map((s) => s.key)], ['strength', 'sparkles', 'caption', 'notes', 'marks', 'burst']);
  assert.match(r.src, /"user-actions\/wave2\/star\.png"/);

  // a canvas that records what is drawn
  const calls = [];
  const g = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); return { width: 0 }; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const renderer = { ctx: g, view: () => [1, 0, 0, 1, 0, 0] };
  r.at(100);
  r.PT.Actions.draw('front', renderer);
  r.PT.Actions.draw('behind', renderer);
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'Hi Bob'), 'caption uses the Streamer.bot value');
  calls.length = 0;
  r.at(700);
  r.PT.Actions.draw('front', renderer);
  assert.ok(calls.some((c) => c[0] === 'fill'), 'sparkles drawn');
  assert.ok(calls.some((c) => c[0] === 'arc'), 'motion marks drawn');

  // switched off in the Actions tab
  const off = run(p, { settings: { sparkles: false, caption: false, notes: false, marks: false, burst: false } });
  calls.length = 0;
  off.at(700);
  off.PT.Actions.draw('front', renderer);
  off.PT.Actions.draw('behind', renderer);
  assert.ok(!calls.some((c) => c[0] === 'fill' || c[0] === 'fillText' || c[0] === 'arc'));
});

test('the project round-trips through the exported file, without local paths', () => {
  const p = Model.normalize(waveProject());
  p.assets = { 'whoosh.mp3': 'C:\\Users\\me\\whoosh.mp3' };
  p.sounds = [{ t: 0, file: 'whoosh.mp3', volume: 1, loop: false }];
  p.effects = [{ id: 'cap', preset: 'caption', label: 'Sneaky */ label', layer: 'front', from: 0, to: 2000, anchor: { part: 'face', u: 0.5, v: 0 }, params: { text: '*/ alert(1) /*' }, toggle: true }];
  const src = Codegen.generate(p);
  assert.doesNotMatch(src, /Users\\\\me/);
  const back = Codegen.extractProject(src);
  assert.deepEqual(back, Model.normalize({ ...p, assets: {} }));
  // the file still runs: the */ in the text didn't end a comment
  run(p);
});

test('bad ids and lengths are refused before export', () => {
  const p = waveProject();
  p.id = '../evil';
  assert.ok(Codegen.validate(p).some((x) => x.level === 'error'));
  const q = waveProject();
  q.duration = 50;
  assert.ok(Codegen.validate(q).some((x) => x.level === 'error'));
  assert.deepEqual(Codegen.validate(waveProject()).filter((x) => x.level === 'error'), []);
  const r = waveProject();
  r.effects = [{ id: 'strength', preset: 'sparkles', label: 'S', layer: 'front', from: 0, to: 100, anchor: {}, params: {}, toggle: true }];
  assert.ok(Codegen.validate(Model.normalize(r)).some((x) => x.level === 'error'));
});

test('keyframe editing', () => {
  const p = Model.newProject();
  Model.setKey(p, 'face', 'rot', 500, 10);
  Model.setKey(p, 'face', 'rot', 100, 5);
  Model.setKey(p, 'face', 'rot', 500, 12);
  assert.deepEqual(p.tracks.face.rot.map((k) => [k.t, k.v]), [[100, 5], [500, 12]]);
  Model.moveKey(p, 'face', 'rot', 100, 500);   // replaces the key there
  assert.deepEqual(p.tracks.face.rot.map((k) => [k.t, k.v]), [[500, 5]]);
  assert.equal(Model.valueAt(p, 'face', 'rot', 0), 5);
  assert.equal(Model.valueAt(p, 'face', 'sx', 0), 1);
  Model.removeKey(p, 'face', 'rot', 500);
  assert.deepEqual(p.tracks, {});

  Model.setKey(p, 'armLUpper', 'rot', 0, 30);
  Model.setKey(p, 'armLLower', 'ox', 0, 4);
  Model.mirror(p, { armLUpper: 'armRUpper', armLLower: 'armRLower', armRUpper: 'armLUpper', armRLower: 'armLLower' }, true);
  assert.equal(p.tracks.armRUpper.rot[0].v, -30);
  assert.equal(p.tracks.armRLower.ox[0].v, -4);
  assert.equal(p.tracks.armLUpper.rot[0].v, 30, 'the source side is unchanged');

  Model.setDuration(p, 1000, true);
  Model.setKey(p, 'face', 'rot', 1000, 1);
  Model.setDuration(p, 4000, true);
  assert.equal(p.tracks.face.rot[0].t, 4000);
});
