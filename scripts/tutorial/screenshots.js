/* Takes the README screenshots: runs the tutorial's steps (scripts/tutorial/script.js) in the real
   studio without narration or captions, and saves a picture at chosen moments into docs/images/.

     npm run screenshots

   Needs ffmpeg on PATH. Chapter 12 (your own avatar) is skipped, so no personal avatar ends up in the
   pictures. Work files go in tutorial/shots/. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WORK = path.join(ROOT, 'tutorial', 'shots');
const OUT = path.join(ROOT, 'docs', 'images');
const WIDTH = 1600;

// step id (c<chapter>_<step>) -> picture. `at`: ms after the step starts, or 'end': once the step's
// actions are done. The page asks for each picture ("[shot] name"), and electron/main.js saves the
// frame it painted last.
const SHOTS = [
  ['c2_1', 'end', 'screen'],
  ['c2_3', 1300, 'posing-tools'],
  ['c2_4', 1300, 'action-fields'],
  ['c2_6', 1300, 'timeline'],
  ['c2_7', 1300, 'inspector'],
  ['c3_3', 'end', 'pivot'],
  ['c3_5', 'end', 'pivot-on-joint'],
  ['c4_1', 'end', 'move-tool'],
  ['c5_3', 'end', 'new-action'],
  ['c5_7', 2100, 'children-follow'],
  ['c5_9', 'end', 'arm-up'],
  ['c5_10', 1500, 'rest-keys'],
  ['c5_15', 'end', 'wave-keys'],
  ['c6_2', 'end', 'part-rows'],
  ['c6_4', 1300, 'easing-menu'],
  ['c6_6', 3300, 'box-select-keys'],
  ['c7_4', 'end', 'group-rotate'],
  ['c8_2', 'end', 'face'],
  ['c9_4', 'end', 'effect'],
  ['c11_5', 1500, 'held-loop'],
  ['c13_1', 'end', 'code'],
  ['c13_2', 2100, 'export'],
  ['c14_1', 2200, 'shortcuts'],
].map(([step, at, name], i) => ({ step, at, file: `${String(i + 1).padStart(2, '0')}-${name}` }));
const SKIP = [11];   // chapter indexes (0-based): 12 "Preview on your own avatar"
const STEP_MS = 1600;

function main() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^\d\d-.*\.jpg$/.test(f)) fs.rmSync(path.join(OUT, f));

  const runner = `
(async () => {
  const SKIP = ${JSON.stringify(SKIP)}, SHOTS = ${JSON.stringify(SHOTS)};
  const shot = (s) => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { console.log('[shot] ' + s.file); setTimeout(r, 100); })));
  T.init();
  Studio.Preview.fit();
  await T.wait(500);
  console.log('[t0]');
  const done = [];
  for (let ci = 0; ci < TUTORIAL.length; ci++) {
    if (SKIP.includes(ci)) continue;
    const ch = TUTORIAL[ci];
    for (let si = 0; si < ch.steps.length; si++) {
      const st = ch.steps[si], id = 'c' + (ci + 1) + '_' + (si + 1);
      const mine = SHOTS.filter((s) => s.step === id);
      const timed = mine.filter((s) => s.at !== 'end').map((s) => T.wait(s.at).then(() => shot(s)).then(() => done.push(s.file)));
      const act = st.do ? st.do(T).catch((e) => console.log('[step error] ' + id + ': ' + e.message)) : null;
      await Promise.all([T.wait(st.say ? ${STEP_MS} : 0), act, ...timed]);
      for (const s of mine.filter((s) => s.at === 'end')) { await T.wait(150); await shot(s); done.push(s.file); }
      await T.wait(st.pause ?? 350);
    }
    T.unhighlight();
    await T.wait(400);
  }
  await T.wait(500);
  return done;
})()`;
  const runFile = path.join(WORK, 'run.js');
  fs.writeFileSync(runFile, [fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8'), fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'), runner].join('\n;\n'));

  const framesDir = path.join(WORK, 'frames');
  console.log('Running the studio…');
  const electron = require(path.join(ROOT, 'node_modules', 'electron'));
  const rec = spawnSync(electron, ['.'], { cwd: ROOT, env: { ...process.env, STUDIO_RECORD: framesDir, STUDIO_EVAL: runFile, STUDIO_NOFRAMES: '1' }, stdio: 'inherit' });
  if (rec.status !== 0) console.warn('electron exited with', rec.status);

  let missing = 0;
  for (const s of SHOTS) {
    const src = path.join(framesDir, 'shots', s.file + '.png');
    if (!fs.existsSync(src)) { console.warn(`${s.file}: not taken (step ${s.step})`); missing++; continue; }
    const ff = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vf', `scale=${WIDTH}:-2:flags=lanczos`, '-q:v', '3', path.join(OUT, s.file + '.jpg')], { stdio: 'inherit' });
    if (ff.status !== 0) { console.error('ffmpeg failed on ' + s.file); process.exit(1); }
  }
  console.log(`Done: ${SHOTS.length - missing} pictures in ${path.relative(ROOT, OUT)}`);
  if (missing) process.exit(1);
}

main();
