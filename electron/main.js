/* EasyTuber Animation Studio: the window, the app:// pages, and file access for the page.

   The page is served as app://studio/… so it can load EasyTuber's runtime unchanged:
     app://studio/api/image/<hash>        a picture of the loaded EasyTuber avatar (its "img:<hash>")
     app://studio/user-actions/<id>/<f>   a picture or sound of the action being made, from wherever
     app://studio/media/actions/<id>/<f>  the user picked it (only files the page registered)
   Everything else is a file of the studio itself. */
const { app, BrowserWindow, protocol, net, ipcMain, dialog, clipboard, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const avatar = require('./avatar');

const ROOT = path.join(__dirname, '..');
const STATIC = ['index.html', 'css', 'src', 'runtime'];   // what the page may load from the studio's folder
const MEDIA = /^\/(user-actions|media\/actions)\/[\w-]{1,40}\/([^/]+)$/;
const MEDIA_FILE = /^[\w][\w .-]{0,80}\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a)$/i;

let win = null;
let dirty = false;
let avatarImages = null;                // images folder of the loaded avatar
let media = new Map();                  // file name -> absolute path, for the action being made

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function notFound() { return new Response('not found', { status: 404 }); }

async function serve(req) {
  const url = new URL(req.url);
  if (url.host !== 'studio') return notFound();
  const p = decodeURIComponent(url.pathname);

  const img = /^\/api\/image\/([0-9a-f]{64})$/.exec(p);
  if (img) {
    const file = avatar.imageFile(avatarImages, img[1]);
    if (!file) return notFound();
    try {
      const buf = await fs.promises.readFile(file);
      return new Response(buf, { headers: { 'Content-Type': avatar.typeOf(buf), 'Cache-Control': 'max-age=31536000, immutable' } });
    } catch (e) { return notFound(); }
  }

  const m = MEDIA.exec(p);
  if (m) {
    const file = media.get(m[2]);
    return file ? net.fetch(pathToFileURL(file).toString(), { headers: req.headers }) : notFound();
  }

  const rel = path.normalize(p === '/' ? 'index.html' : p.slice(1));
  if (!STATIC.some((s) => rel === s || rel.startsWith(s + path.sep))) return notFound();
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return notFound();
  return net.fetch(pathToFileURL(file).toString());
}

/* ---------- the page's file access ---------- */
const FILTERS = {
  project: [{ name: 'Studio project', extensions: ['etaction.json', 'json'] }, { name: 'Action made with the studio', extensions: ['js'] }],
  image: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
  sound: [{ name: 'Sounds', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
  avatar: [{ name: 'EasyTuber avatar', extensions: ['json'] }],
};

// a file name the action file can use: letters, digits, space . - _ and a known extension
function cleanName(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name)).replace(/[^\w .-]+/g, '-').replace(/^[^\w]+/, '').slice(0, 60) || 'file';
  const out = base + ext;
  return MEDIA_FILE.test(out) ? out : null;
}

function handlers() {
  ipcMain.handle('project:open', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open action', filters: FILTERS.project, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const file = r.filePaths[0];
    return { path: file, text: await fs.promises.readFile(file, 'utf8') };
  });

  ipcMain.handle('project:save', async (e, { path: file, text, suggested }) => {
    if (!file) {
      const r = await dialog.showSaveDialog(win, { title: 'Save studio project', defaultPath: (suggested || 'action') + '.etaction.json', filters: FILTERS.project.slice(0, 1) });
      if (r.canceled || !r.filePath) return null;
      file = r.filePath;
    }
    await fs.promises.writeFile(file, text, 'utf8');
    return file;
  });

  // where the media of an opened action file is: the <id>/ folder beside it
  ipcMain.handle('media:locate', async (e, { base, id, files }) => {
    const out = {};
    if (!/^[\w-]{1,40}$/.test(id)) return out;
    for (const f of files || []) {
      if (!MEDIA_FILE.test(f)) continue;
      const file = path.join(path.dirname(base), id, f);
      if (fs.existsSync(file)) out[f] = file;
    }
    return out;
  });

  ipcMain.handle('media:set', (e, map) => {
    media = new Map(Object.entries(map || {}).filter(([f, src]) => MEDIA_FILE.test(f) && typeof src === 'string' && path.isAbsolute(src)));
    return true;
  });

  ipcMain.handle('file:pick', async (e, kind) => {
    const r = await dialog.showOpenDialog(win, { title: kind === 'sound' ? 'Add a sound' : 'Add a picture', filters: FILTERS[kind] || FILTERS.image, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const name = cleanName(path.basename(r.filePaths[0]));
    if (!name) return { error: 'That kind of file can\'t be used in an action.' };
    return { path: r.filePaths[0], name };
  });

  /* Save the action file, and copy its pictures and sounds into an <id>/ folder beside it. */
  ipcMain.handle('action:export', async (e, { id, code, media: files }) => {
    if (!/^[\w-]{1,40}$/.test(id)) return { error: 'bad id' };
    const r = await dialog.showSaveDialog(win, { title: 'Save action as', defaultPath: id + '.js', filters: [{ name: 'EasyTuber action', extensions: ['js'] }] });
    if (r.canceled || !r.filePath) return null;
    await fs.promises.writeFile(r.filePath, code, 'utf8');
    const copied = [], missing = [];
    const entries = Object.entries(files || {});
    if (entries.length) {
      const dir = path.join(path.dirname(r.filePath), id);
      await fs.promises.mkdir(dir, { recursive: true });
      for (const [name, src] of entries) {
        if (!MEDIA_FILE.test(name)) continue;
        const dest = path.join(dir, name);
        try {
          if (path.resolve(src) !== path.resolve(dest)) await fs.promises.copyFile(src, dest);
          copied.push(name);
        } catch (err) { missing.push(name); }
      }
    }
    return { path: r.filePath, folder: entries.length ? path.join(path.dirname(r.filePath), id) : '', copied, missing };
  });

  ipcMain.handle('avatar:load', async (e, pick) => {
    let file = avatar.defaultFile(app.getPath('appData'));
    if (pick) {
      const r = await dialog.showOpenDialog(win, { title: 'Open an EasyTuber avatar', defaultPath: path.dirname(file), filters: FILTERS.avatar, properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return null;
      file = r.filePaths[0];
    }
    try {
      const out = avatar.read(file);
      avatarImages = out.imagesDir;
      return { text: out.text, file: out.file };
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('clipboard:write', (e, text) => { clipboard.writeText(String(text)); return true; });
  ipcMain.handle('shell:show', (e, file) => { if (typeof file === 'string' && path.isAbsolute(file)) shell.showItemInFolder(file); });
  ipcMain.on('state:dirty', (e, v) => { dirty = !!v; });
  ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), electron: process.versions.electron }; });
}

function createWindow() {
  const rec = !!process.env.STUDIO_RECORD;   // development: record a video offscreen (scripts/tutorial)
  win = new BrowserWindow({
    width: rec ? 1920 : 1500, height: rec ? 1080 : 920, useContentSize: rec, minWidth: 1100, minHeight: 680,
    show: !rec, backgroundColor: '#17151f', autoHideMenuBar: true,
    title: 'EasyTuber Animation Studio',
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !process.env.STUDIO_SHOT && !rec, offscreen: rec,
    },
  });
  win.loadURL('app://studio/index.html');
  // Chromium remembers a zoom per site: start at 100% (the video recorder zooms its own window)
  if (!rec) win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));
  if (process.env.STUDIO_SHOT) devShot();
  if (rec) devRecord();
  win.on('close', (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Close without saving', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'The action has unsaved changes.', detail: 'Close the studio anyway?',
    });
    if (choice === 1) e.preventDefault();
  });
  // links open in the browser, never in the studio window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://studio/')) e.preventDefault(); });
}

/* Development: STUDIO_SHOT=<png> runs STUDIO_EVAL (a file of page script, optional), saves a picture
   of the window, prints the page's console, and quits. Used to check the studio from scripts. */
function devShot() {
  win.webContents.on('console-message', (e) => console.log(`[page ${e.level}] ${e.message}`));
  win.webContents.once('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1200);
    try {
      if (process.env.STUDIO_EVAL) {
        const out = await win.webContents.executeJavaScript(fs.readFileSync(process.env.STUDIO_EVAL, 'utf8'));
        if (out !== undefined) console.log('[eval]', typeof out === 'string' ? out : JSON.stringify(out));
      }
    } catch (err) { console.log('[eval error]', err.message); }
    await wait(Number(process.env.STUDIO_WAIT || 600));
    for (let i = 0; i < 5; i++) {
      try { fs.writeFileSync(process.env.STUDIO_SHOT, (await win.webContents.capturePage()).toPNG()); break; } catch (err) { console.log('[capture retry]', err.message); await wait(500); }
    }
    dirty = false;
    app.quit();
  });
}

/* Development: STUDIO_RECORD=<folder> renders the window offscreen at 1920x1080, saves 30 frames a
   second there as JPEGs while STUDIO_EVAL (page script, returning a promise) runs, then writes
   meta.json: each frame's time, when the page said "[t0]" (its clock's zero), and what the script
   returned. scripts/tutorial/build.js turns that into a video. */
function devRecord() {
  const dir = process.env.STUDIO_RECORD;
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let t0 = null, last = 0, recording = false;
  win.webContents.on('console-message', (e) => {
    if (e.message === '[t0]') { t0 = Date.now(); recording = true; return; }
    console.log(`[page ${e.level}] ${e.message}`);
  });
  win.webContents.setFrameRate(30);
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(Number(process.env.STUDIO_ZOOM || 1.25)));   // readable on a 1080p video
  win.webContents.on('paint', (e, dirtyRect, image) => {
    const t = Date.now();
    if (!recording || t - last < 30) return;
    last = t;
    const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), image.toJPEG(90));
    frames.push({ file, t });
  });
  win.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    let result = null;
    try { result = await win.webContents.executeJavaScript(fs.readFileSync(process.env.STUDIO_EVAL, 'utf8')); } catch (err) { console.log('[eval error]', err.message); }
    recording = false;
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ t0, frames, result }));
    console.log(`[record] ${frames.length} frames`);
    dirty = false;
    app.quit();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }])
    : Menu.buildFromTemplate([{ label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }]));
  protocol.handle('app', serve);
  handlers();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
