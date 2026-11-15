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
  function keysSource(p) {
    const lines = [];
    for (const [part, props] of Object.entries(p.tracks)) {
      const inner = Object.entries(props)
        .filter(([, keys]) => keys.length)
        .map(([prop, keys]) => `${prop}: [${keys.map((k) => `[${k.t}, ${k.v}, ${J(k.ease)}]`).join(', ')}]`);
      if (inner.length) lines.push(`    ${J(part)}: { ${inner.join(', ')} },`);
    }
    return lines.length ? `{\n${lines.join('\n')}\n  }` : '{}';
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
    const hasKeys = Object.keys(p.tracks).length > 0;
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
    if (hasKeys) body.push('', '  // part motion: [ms, value, ease to the next key]. rot in degrees, ox / oy in rig units, sx / sy multiply', `  const KEYS = ${keysSource(p)};`);
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
      const [x, y] = a.atArt(e.part, e.u, e.v);
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
