/* Studio project -> an EasyTuber action file (js/actions/README.md in the EasyTuber repo).

   The file is self-contained: keyframes as data, the sampling code from interp.js, the effect
   presets it uses, and one PT.Actions.define() call. It ends with the studio project as a comment,
   so the studio can open the file again. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const lib = node
    ? factory(require('./interp'), require('./model'), require('./effects'))
    : factory(root.Studio.Interp, root.Studio.Model, root.Studio.Effects);
  if (node) module.exports = lib;
  else root.Studio.Codegen = lib;
})(typeof self !== 'undefined' ? self : this, function (Interp, Model, Effects) {
  const MARK = '@studio-project';
  const J = (v) => JSON.stringify(v);
  const comment = (s) => String(s).replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');

  function mediaPath(p, file) { return `${p.mediaPrefix}/${p.id}/${file}`; }

  // every media file the action uses (sounds and pictures), by file name
  function mediaFiles(p) {
    const s = new Set(p.sounds.map((x) => x.file));
    for (const e of p.effects) if (e.preset === 'image' && e.params.file) s.add(e.params.file);
    return [...s];
  }

  /* Problems that stop an export (error) or that are worth knowing about (warn). */
  function validate(p) {
    const out = [];
    const err = (msg) => out.push({ level: 'error', msg }), warn = (msg) => out.push({ level: 'warn', msg });
    if (!Model.ID.test(p.id)) err('The id must be 1-40 letters, digits, - or _.');
    if (!p.hold && !(p.duration >= Model.MIN_MS && p.duration <= Model.MAX_MS)) err(`The length must be ${Model.MIN_MS} to ${Model.MAX_MS} ms.`);
    if (p.hold && !(p.release >= 0 && p.release <= Model.MAX_RELEASE)) err(`The release must be 0 to ${Model.MAX_RELEASE} ms.`);
    const keys = new Set(p.strength.on ? ['strength'] : []);
    for (const e of p.effects) {
      if (!Effects.BY_ID[e.preset]) err(`Effect "${e.label}" uses an unknown preset (${e.preset}).`);
      if (e.toggle) { if (keys.has(e.id)) err(`Two settings are called "${e.id}".`); keys.add(e.id); }
      if (e.preset === 'image' && !e.params.file) warn(`Effect "${e.label}" has no picture yet.`);
    }
    for (const f of mediaFiles(p)) if (!p.assets[f]) warn(`${f} is used but the studio doesn't know where the file is: copy it into the ${p.id}/ folder yourself.`);
    const any = Object.keys(p.tracks).length || Object.values(p.states).some((k) => k.length) || p.effects.length || p.sounds.length;
    if (!any) warn('The action does nothing yet: add some keys.');
    return out;
  }

  /* ---------- the parts of the file ---------- */
  function keysSource(p, props) {
    const lines = [];
    for (const [part, tr] of Object.entries(p.tracks)) {
      const inner = props.filter((prop) => tr[prop] && tr[prop].length)
        .map((prop) => `${prop}: [${tr[prop].map((k) => `[${k.t}, ${k.v}, ${J(k.ease)}]`).join(', ')}]`);
      if (inner.length) lines.push(`    ${J(part)}: { ${inner.join(', ')} },`);
    }
    return lines.length ? `{\n${lines.join('\n')}\n  }` : null;
  }

  // the free motion: per part, a map of the stage (rotate + scale + move) built once a frame, children
  // going with their parent and groups carrying their parts; parts() hands the renderer each part's
  // share of it
  function freeSource(p, free, env, strength) {
    const pivots = {};
    for (const [part, pv] of Object.entries(p.pivots)) pivots[part] = pv.joint ? 'joint' : [pv.u, pv.v];
    const linked = Object.keys(p.follow).filter((k) => p.follow[k] === true);
    const groups = {}, groupOf = {};
    for (const g of p.groups) {
      groups[g.id] = { up: Model.groupOf(p, g.id), parts: Model.groupParts(p, g.id), pivot: [g.pivot.x, g.pivot.y] };
      for (const m of g.members) groupOf[m] = g.id;
    }
    const groupCode = p.groups.length ? `
  // groups: their parts (and the groups inside them) move, turn, size and fade together around the
  // middle of the group's parts, moved by pivot (stage pixels); up = the group this one is in
  const GROUPS = ${J(groups)};
  // the group each part or group is in
  const GROUP_OF = ${J(groupOf)};
  // a group's map of the stage (with the groups around it), and where its pivot is drawn
  function groupMaps(a, ms, k) {
    const maps = {}, alpha = {}, pivot = {};
    const make = (g) => {
      if (maps[g]) return maps[g];
      const G = GROUPS[g], f = FREE[g] || {}, up = G.up ? make(G.up) : null;
      const val = (prop, rest) => (f[prop] ? rest + (sample(f[prop], ms) - rest) * k : rest);
      let px = 0, py = 0, n = 0;
      for (const id of G.parts) if (PT.PART[id]) { const q = a.atArt(id, 0.5, 0.5); px += q[0]; py += q[1]; n++; }
      px = px / Math.max(1, n) + G.pivot[0]; py = py / Math.max(1, n) + G.pivot[1];
      const turn = val('angle', 0) * Math.PI / 180, size = Math.max(0, val('size', 1));
      const c = size * Math.cos(turn), s = size * Math.sin(turn), x = val('x', 0), y = val('y', 0);
      const own = [c, s, px + x - (c * px - s * py), py + y - (s * px + c * py)];
      maps[g] = up ? mapThen(up, own) : own;
      alpha[g] = (G.up ? alpha[G.up] : 1) * (f.opacity ? Math.max(0, Math.min(1, val('opacity', 1))) : 1);
      pivot[g] = up ? mapPoint(up, px + x, py + y) : [px + x, py + y];
      return maps[g];
    };
    for (const g of Object.keys(GROUPS)) make(g);
    return { maps, alpha, pivot };
  }` : '';
    const groupApply = p.groups.length ? `
    // a part in a group goes with it (a part linked to its parent goes with its parent's group)
    const groups = groupMaps(a, ms, k), inGroup = {};
    for (const d of PT.PARTS) {
      const g = GROUP_OF[d.id] || (d.parent && LINKED.includes(d.parent) ? inGroup[d.parent] : null);
      if (!g) continue;
      inGroup[d.id] = g;
      maps[d.id] = maps[d.id] ? mapThen(groups.maps[g], maps[d.id]) : groups.maps[g];
      if (groups.alpha[g] !== 1) alpha[d.id] = (alpha[d.id] ?? 1) * groups.alpha[g];
    }
    return (st.free = { t: now, maps, alpha, groups: groups.maps, pivots: groups.pivot });` : `
    return (st.free = { t: now, maps, alpha });`;
    return `
  // free motion on the 1920x1080 stage: [ms, value, ease to the next key]. x / y in stage pixels,
  // angle in degrees (clockwise), size 1 = as drawn, opacity 0..1; around each part's pivot
  const FREE = ${free};
  // pivots: [across, down] the part's drawing (0..1, or beyond it), or 'joint' (the joint the avatar
  // gives the part); the middle when not listed
  const PIVOT = ${J(pivots)};
  // every part moves on its own, except the children of these parts, which go with them
  const LINKED = ${J(linked)};

  // a map of the stage [a, b, tx, ty]: (x, y) -> (a x - b y + tx, b x + a y + ty)
  const mapPoint = (m, x, y) => [m[0] * x - m[1] * y + m[2], m[1] * x + m[0] * y + m[3]];
  const mapThen = (m, n) => [m[0] * n[0] - m[1] * n[1], m[1] * n[0] + m[0] * n[1], ...mapPoint(m, n[2], n[3])];
  // where a part's pivot is on the stage now
  function pivotAt(a, id) {
    const pv = PIVOT[id];
    if (pv === 'joint') {
      const part = a.project && a.project.parts && a.project.parts[id];
      const img = part && PT.Assets && PT.Assets.primary(id, a.project.stage && a.project.stage.placeholders);
      if (img) return a.at(id, part.px / img.w, part.py / img.h);
    }
    const [u, v] = Array.isArray(pv) ? pv : [0.5, 0.5];
    return a.atArt(id, u, v);
  }
  function freeMaps(a) {
    const now = performance.now(), st = a.state;
    if (st.free && now - st.free.t < 4) return st.free;   // once a frame
    const ms = time(a), k = ${env}${strength}, maps = {}, alpha = {};
    for (const d of PT.PARTS) {
      const up = d.parent && LINKED.includes(d.parent) ? maps[d.parent] : null;
      let m = up || null;
      const f = FREE[d.id];
      if (f) {
        const val = (prop, rest) => (f[prop] ? rest + (sample(f[prop], ms) - rest) * k : rest);
        const turn = val('angle', 0) * Math.PI / 180, size = Math.max(0, val('size', 1));
        const [px, py] = pivotAt(a, d.id);
        const c = size * Math.cos(turn), s = size * Math.sin(turn);
        // turn and size around the pivot, then move by x / y
        const own = [c, s, px + val('x', 0) - (c * px - s * py), py + val('y', 0) - (s * px + c * py)];
        m = m ? mapThen(m, own) : own;
        if (f.opacity) alpha[d.id] = Math.max(0, Math.min(1, val('opacity', 1)));
      }
      if (m) maps[d.id] = m;
    }${groupApply}
  }${groupCode}`;
  }

  function statesSource(p) {
    const parts = Model.STATE_TRACKS.filter((n) => p.states[n].length)
      .map((n) => `${n}: [${p.states[n].map((k) => `[${k.t}, ${J(k.v)}]`).join(', ')}]`);
    return parts.length ? `{ ${parts.join(', ')} }` : null;
  }

  function settingsSource(p) {
    const s = [];
    if (p.strength.on) s.push({ key: 'strength', label: 'Strength', type: 'range', min: 0, max: p.strength.max, step: 5, default: p.strength.default, suffix: '%' });
    for (const e of p.effects) if (e.toggle) s.push({ key: e.id, label: e.label, type: 'check', default: true });
    return s.map((x) => `      { ${Object.entries(x).map(([k, v]) => `${k}: ${J(v)}`).join(', ')} },`).join('\n');
  }

  function effectsSource(p) {
    return p.effects.map((e) => {
      const preset = Effects.BY_ID[e.preset];
      const o = Effects.cleanParams(preset, e.params);
      if (e.preset === 'image') o.src = o.file ? mediaPath(p, o.file) : '';
      const fields = [
        `layer: ${J(e.layer)}`, `from: ${e.from}`, `to: ${e.to}`,
        `part: ${J(e.anchor.part)}`, `u: ${e.anchor.u}`, `v: ${e.anchor.v}`,
        `toggle: ${e.toggle ? J(e.id) : 'null'}`,
        `init: ${preset.init ? 'init_' + preset.id : 'null'}`, `draw: draw_${preset.id}`,
        `o: ${J(o)}`,
      ];
      return `    { ${fields.join(', ')} },  // ${comment(e.label)}`;
    }).join('\n');
  }

  function timeSource(p) {
    if (!p.hold) return '  const time = (a) => a.ms;';
    const { from, to } = p.loop;
    return `  // held: plays up to ${to} ms once, then loops ${from}-${to} ms until it is turned off
  const time = (a) => (a.ms < ${to} ? a.ms : ${from} + (a.ms - ${from}) % ${Math.max(1, to - from)});`;
  }

  /* ---------- the whole file ---------- */
  function generate(project) {
    const p = Model.normalize(project);
    p.effects = p.effects.filter((e) => Effects.BY_ID[e.preset]);
    const states = statesSource(p);
    const jointKeys = keysSource(p, Model.JOINT_PROPS), freeKeys = keysSource(p, Model.FREE_PROPS);
    const hasKeys = !!jointKeys;
    const fxLayers = new Set(p.effects.map((e) => e.layer));
    const media = mediaFiles(p);
    const env = p.hold ? `a.envelope(${p.blend.in})` : `a.envelope(${p.blend.in}, ${p.blend.out})`;
    const strength = p.strength.on ? ' * a.settings.strength / 100' : '';

    const head = [
      `/* ${comment(p.label)}: made with EasyTuber Animation Studio.`,
      `   Put this file in the EasyTuber actions folder (Actions tab > Open actions folder), named ${p.id}.js,`,
      `   then press Reload actions.`,
    ];
    if (media.length) {
      const where = p.mediaPrefix === 'user-actions' ? `actions/${p.id}/` : `media/actions/${p.id}/ in the EasyTuber repo`;
      head.push(`   Its pictures and sounds go in ${where}: ${media.map(comment).join(', ')}.`);
    }
    head[head.length - 1] += ' */';

    const body = [];
    body.push('(function () {');
    body.push('  ' + Interp.SOURCE.trim());
    body.push('');
    body.push(timeSource(p));
    if (hasKeys) body.push('', '  // joint motion (EasyTuber\'s rig): [ms, value, ease to the next key]. rot in degrees, ox / oy in rig units, sx / sy multiply', `  const KEYS = ${jointKeys};`);
    if (freeKeys) body.push(freeSource(p, freeKeys, env, strength));
    if (states) body.push('', '  // eyes / mouth / expression from that ms on (\'\' = back to normal)', `  const STATES = ${states};`);
    if (p.inFront.length) body.push('', '  // parts drawn on top of the rest: [from ms, to ms, part ids]', `  const IN_FRONT = [${p.inFront.map((r) => `[${r.from}, ${r.to}, ${J(r.parts)}]`).join(', ')}];`);
    if (p.sounds.length) body.push('', '  // sounds: [from ms, file, volume, loop]', `  const SOUNDS = [${p.sounds.map((s) => `[${s.t}, ${J(mediaPath(p, s.file))}, ${s.volume}${s.loop ? ', true' : ''}]`).join(', ')}];`);
    if (p.effects.length) {
      const used = [...new Set(p.effects.map((e) => e.preset))].map((id) => Effects.BY_ID[id]).filter(Boolean);
      body.push('');
      for (const preset of used) {
        if (preset.init) body.push('  ' + preset.init);
        body.push('  ' + preset.draw);
      }
      body.push('', '  // effects: drawn while the action is between from and to (ms), at a point on a part');
      body.push(`  const EFFECTS = [\n${effectsSource(p)}\n  ];`);
      body.push(`  function drawEffects(a, g, layer) {
    const ms = time(a), size = a.artSize('face').w || 200, fade = a.held ? a.envelope(${p.blend.in}) : 1;
    EFFECTS.forEach((e, i) => {
      if (e.layer !== layer || ms < e.from || ms > e.to || (e.toggle && a.settings[e.toggle] === false)) return;
      let [x, y] = a.atArt(e.part, e.u, e.v);${freeKeys ? `
      const m = freeMaps(a).maps[e.part];   // on a part that moves freely, it goes with it
      if (m) [x, y] = mapPoint(m, x, y);` : ''}
      g.globalAlpha = fade;
      e.draw(a, g, e.o, (ms - e.from) / Math.max(1, e.to - e.from), x, y, size, a.state.fx ? a.state.fx[i] : null);
    });
  }`);
    }

    // define()
    const def = [`    id: ${J(p.id)},`, `    label: ${J(p.label)},`];
    if (p.hold) def.push('    hold: true,', `    release: ${p.release},`);
    else def.push(`    duration: ${p.duration},`);
    if (p.overlap && !p.hold) def.push('    overlap: true,');
    const settings = settingsSource(p);
    if (settings) def.push('    settings: [', settings, '    ],');
    if (p.effects.length) def.push('', '    start(a) { a.state.fx = EFFECTS.map((e) => (e.init ? e.init(a, e.o) : null)); },');
    if (hasKeys || p.sounds.length) {
      const lines = ['', '    pose(a) {'];
      if (p.sounds.length) lines.push('      for (const s of SOUNDS) if (a.ms >= s[0]) a.sound(s[1], { volume: s[2], loop: !!s[3] });');
      if (hasKeys) {
        lines.push(`      const ms = time(a), k = ${env}${strength}, out = {};`,
          '      for (const [part, props] of Object.entries(KEYS)) {',
          '        const d = (out[part] = {});',
          '        for (const [prop, keys] of Object.entries(props)) {',
          '          const v = sample(keys, ms);',
          '          d[prop] = prop === \'sx\' || prop === \'sy\' ? 1 + (v - 1) * k : v * k;',
          '        }',
          '      }',
          '      return out;');
      } else lines.push('      return null;');
      lines.push('    },');
      def.push(...lines);
    }
    if (freeKeys) {
      def.push('', '    // free motion: this part\'s turn, size and move on the stage (around its middle, as the renderer wants it)',
        '    parts(a, id) {',
        '      const { maps, alpha } = freeMaps(a), m = maps[id];',
        '      if (!m && alpha[id] === undefined) return null;',
        '      const out = {};',
        '      if (m) {',
        '        const [cx, cy] = a.atArt(id, 0.5, 0.5), [x, y] = mapPoint(m, cx, cy);',
        '        Object.assign(out, { dx: x - cx, dy: y - cy, rot: Math.atan2(m[1], m[0]) * 180 / Math.PI, scale: Math.hypot(m[0], m[1]) });',
        '      }',
        '      if (alpha[id] !== undefined) { out.alpha = alpha[id]; if (alpha[id] <= 0.001) out.hide = true; }',
        '      return out;',
        '    },');
    }
    if (states) {
      def.push('', '    states(a) {',
        '      const ms = time(a), out = {};',
        '      for (const [name, keys] of Object.entries(STATES)) { const v = held(keys, ms); if (v) out[name] = v; }',
        '      return out;',
        '    },');
    }
    if (p.inFront.length) {
      def.push('', '    inFront(a) {',
        '      const ms = time(a), ids = [];',
        '      for (const [from, to, parts] of IN_FRONT) if (ms >= from && ms <= to) ids.push(...parts);',
        '      return ids.length ? ids : null;',
        '    },');
    }
    if (fxLayers.has('behind')) def.push('', '    behind(a, g) { drawEffects(a, g, \'behind\'); },');
    if (fxLayers.has('front')) def.push('', '    front(a, g) { drawEffects(a, g, \'front\'); },');

    body.push('', '  PT.Actions.define({', ...def, '  });', '})();');

    // the project, for opening the file in the studio again (where the media came from stays private)
    const embed = { ...p, assets: {} };
    const tail = `\n/* ${MARK}\n${J(embed).replace(/\*\//g, '*\\/')}\n@end */\n`;
    return head.join('\n') + '\n' + body.join('\n') + '\n' + tail;
  }

  /* The project embedded in an action file made by the studio, or null. */
  function extractProject(src) {
    const m = new RegExp('/\\* ' + MARK + '\\n([\\s\\S]*?)\\n@end \\*/').exec(String(src));
    if (!m) return null;
    try { return Model.normalize(JSON.parse(m[1])); } catch (e) { return null; }
  }

  return { generate, extractProject, validate, mediaFiles, mediaPath };
});
