/* Records the tutorial video: narration with a Windows voice, the real studio driven step by step,
   captions, then an MP4 and an .srt.

     npm run tutorial                         every chapter, voice Mark (else David)
     node scripts/tutorial/build.js --chapters 3-5 --voice George --out tutorial/test.mp4

   Needs Windows (for the voice) and ffmpeg on PATH. Work files go in tutorial/work/. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WORK = path.join(ROOT, 'tutorial', 'work');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const VOICE = args.voice || 'Mark,David';
const RATE = args.rate || '1.0';
const OUT = path.resolve(ROOT, args.out || 'tutorial/EasyTuberStudio-tutorial.mp4');
const CHAPTERS = require('./script.js');

function chapterList() {
  if (!args.chapters) return CHAPTERS.map((_, i) => i);
  const [a, b] = String(args.chapters).split('-').map(Number);
  return CHAPTERS.map((_, i) => i).filter((i) => i + 1 >= a && i + 1 <= (b || a));
}

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error(`${file}: expected 16-bit PCM WAV`);
  // as mono samples
  const n = data.length / 2 / fmt.channels, samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2);
    samples[i] = Math.round(s / fmt.channels);
  }
  return { rate: fmt.rate, samples, ms: (n / fmt.rate) * 1000 };
}

function writeWav(file, rate, samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(file, b);
}

const srtTime = (ms) => {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`;
};

function main() {
  const only = chapterList();
  fs.mkdirSync(WORK, { recursive: true });

  // 1. the narration, one WAV per line (lines whose text and voice haven't changed are kept)
  const clips = [];
  only.forEach((ci) => CHAPTERS[ci].steps.forEach((st, si) => { if (st.say) clips.push({ id: `c${ci + 1}_${si + 1}`, text: st.say }); }));
  const audioDir = path.join(WORK, 'audio');
  const manifestFile = path.join(WORK, 'audio.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) { /* first run */ }
  if (manifest.voice !== VOICE || manifest.rate !== RATE) manifest = { voice: VOICE, rate: RATE, texts: {} };
  const todo = clips.filter((c) => manifest.texts[c.id] !== c.text || !fs.existsSync(path.join(audioDir, c.id + '.wav')));
  if (todo.length) {
    console.log(`Speaking ${todo.length} lines…`);
    const list = path.join(WORK, 'clips.json');
    fs.writeFileSync(list, JSON.stringify(todo));
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tts.ps1'), '-Clips', list, '-Out', audioDir, '-Voice', VOICE, '-Rate', RATE], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    console.log((r.stdout.match(/VOICE .*/) || ['VOICE ?'])[0].trim());
    for (const c of todo) manifest.texts[c.id] = c.text;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  }
  const audio = Object.fromEntries(clips.map((c) => [c.id, readWav(path.join(audioDir, c.id + '.wav'))]));
  const rate = audio[clips[0].id].rate;
  const durations = Object.fromEntries(Object.entries(audio).map(([id, a]) => [id, Math.round(a.ms)]));
  const total = Object.values(durations).reduce((a, b) => a + b, 0);
  console.log(`Narration: ${clips.length} lines, ${(total / 60000).toFixed(1)} min`);

  // 2. the page script: helpers, chapters, and a runner that keeps the steps in time with the voice
  const runner = `
(async () => {
  const DUR = ${JSON.stringify(durations)};
  const ONLY = ${JSON.stringify(only)};
  T.init();
  Studio.Preview.fit();
  await T.wait(500);
  console.log('[t0]');
  const t0 = performance.now(), marks = [];
  for (const ci of ONLY) {
    const ch = TUTORIAL[ci];
    T.chapter(ci + 1, ch.title);
    for (let si = 0; si < ch.steps.length; si++) {
      const st = ch.steps[si], id = 'c' + (ci + 1) + '_' + (si + 1);
      if (st.say) { marks.push({ id, t: performance.now() - t0 }); T.caption(st.say); }
      const act = st.do ? st.do(T).catch((e) => console.log('[step error] ' + id + ': ' + e.message)) : null;
      await Promise.all([T.wait(st.say ? DUR[id] : 0), act]);
      await T.wait(st.pause ?? 350);
    }
    T.unhighlight();
    await T.wait(500);
  }
  T.caption('');
  await T.wait(2000);
  return marks;
})()`;
  const runFile = path.join(WORK, 'run.js');
  fs.writeFileSync(runFile, [fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8'), fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'), runner].join('\n;\n'));

  // 3. record the studio running it
  const framesDir = path.join(WORK, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log('Recording…');
  const electron = require(path.join(ROOT, 'node_modules', 'electron'));
  const rec = spawnSync(electron, ['.'], { cwd: ROOT, env: { ...process.env, STUDIO_RECORD: framesDir, STUDIO_EVAL: runFile }, stdio: 'inherit' });
  if (rec.status !== 0) console.warn('electron exited with', rec.status);
  const meta = JSON.parse(fs.readFileSync(path.join(framesDir, 'meta.json'), 'utf8'));
  if (!meta.frames.length || meta.t0 == null || !Array.isArray(meta.result)) { console.error('The recording failed (no frames or no marks).'); process.exit(1); }
  const start = meta.frames[0].t;            // the video starts at the first frame
  const shift = start - meta.t0;             // page clock -> video clock
  const lengthMs = meta.frames[meta.frames.length - 1].t - start + 500;

  // 4. the soundtrack: each line placed where the page said it started
  const mix = new Int16Array(Math.ceil((lengthMs / 1000) * rate));
  for (const m of meta.result) {
    const a = audio[m.id], at = Math.round(((m.t - shift) / 1000) * rate);
    for (let i = 0; i < a.samples.length && at + i < mix.length; i++) if (at + i >= 0) mix[at + i] = Math.max(-32768, Math.min(32767, mix[at + i] + a.samples[i]));
  }
  const wav = path.join(WORK, 'narration.wav');
  writeWav(wav, rate, mix);

  // 5. subtitles
  const text = Object.fromEntries(clips.map((c) => [c.id, c.text]));
  const srt = meta.result.map((m, i) => `${i + 1}\n${srtTime(m.t - shift)} --> ${srtTime(m.t - shift + durations[m.id])}\n${text[m.id]}\n`).join('\n');

  // 6. the video: frames at their real times, made constant 30 fps, with the soundtrack
  const list = ['ffconcat version 1.0'];
  meta.frames.forEach((f, i) => {
    const next = meta.frames[i + 1];
    list.push(`file '${path.join(framesDir, f.file).replace(/\\/g, '/')}'`, `duration ${((next ? next.t - f.t : 33) / 1000).toFixed(4)}`);
  });
  list.push(`file '${path.join(framesDir, meta.frames[meta.frames.length - 1].file).replace(/\\/g, '/')}'`);
  const listFile = path.join(WORK, 'frames.ffconcat');
  fs.writeFileSync(listFile, list.join('\n'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log('Encoding…');
  const ff = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', wav,
    '-map', '0:v', '-map', '1:a', '-vf', 'fps=30,format=nv12', '-c:v', 'h264_mf', '-b:v', '8M', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  if (ff.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }
  fs.writeFileSync(OUT.replace(/\.mp4$/i, '.srt'), srt);
  console.log(`Done: ${OUT} (${(lengthMs / 60000).toFixed(1)} min, ${meta.frames.length} frames) and its .srt`);
}

main();
