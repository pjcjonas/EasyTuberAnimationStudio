/* Effect presets: drawings on the canvas in front of or behind the avatar while an action plays.

   Each preset is pasted into the exported action as two small functions, only if the action uses it:
     init_<id>(a, o)                         once when the action starts: random choices, made with
                                             a.random() so the editor, stage window and OBS agree
     draw_<id>(a, g, o, p, x, y, size, st)   every frame while the effect is on
   o = the effect's settings, p = 0..1 through the effect's time span, (x, y) = its anchor point on
   the avatar in stage units, size = the face's drawn width (so effects scale with the avatar),
   st = what init returned. globalAlpha is set by the caller to the held-action fade; multiply it. */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.Studio = root.Studio || {}).Effects = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

  const PRESETS = [
    {
      id: 'sparkles', label: 'Sparkles', anchor: { part: 'face', u: 0.5, v: 0.4 },
      params: [
        { key: 'count', label: 'Count', type: 'range', min: 3, max: 40, step: 1, default: 12 },
        { key: 'color', label: 'Colour', type: 'color', default: '#ffe066' },
        { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
        { key: 'spread', label: 'Spread', type: 'range', min: 0.2, max: 4, step: 0.1, default: 1.2 },
      ],
      init: `function init_sparkles(a, o) {
    return Array.from({ length: o.count }, () => ({
      ang: a.random() * Math.PI * 2, dist: 0.5 + a.random() * 0.5, delay: a.random() * 0.4,
      spin: a.random() * 2 - 1, s: 0.6 + a.random() * 0.6,
    }));
  }`,
      draw: `function draw_sparkles(a, g, o, p, x, y, size, st) {
    const base = g.globalAlpha;
    g.fillStyle = o.color;
    for (const k of st) {
      const q = (p - k.delay) / 0.6;
      if (q <= 0 || q >= 1) continue;
      const r = size * o.spread * k.dist * (1 - (1 - q) * (1 - q));
      const px = x + Math.cos(k.ang) * r, py = y + Math.sin(k.ang) * r;
      const R = size * 0.08 * o.size * k.s, rot = k.spin * q * Math.PI;
      g.globalAlpha = base * (1 - q) * Math.min(1, q * 6);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = rot + i * Math.PI / 4, rr = i % 2 ? R * 0.28 : R;
        g.lineTo(px + Math.cos(ang) * rr, py + Math.sin(ang) * rr);
      }
      g.closePath();
      g.fill();
    }
    g.globalAlpha = base;
  }`,
    },
    {
      id: 'notes', label: 'Music notes', anchor: { part: 'face', u: 0.5, v: 0.3 },
      params: [
        { key: 'count', label: 'Count', type: 'range', min: 1, max: 20, step: 1, default: 7 },
        { key: 'colorA', label: 'Colour 1', type: 'color', default: '#ff7ac8' },
        { key: 'colorB', label: 'Colour 2', type: 'color', default: '#7ad7ff' },
        { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
        { key: 'rise', label: 'Rise', type: 'range', min: 0.2, max: 3, step: 0.1, default: 0.9 },
      ],
      init: `function init_notes(a, o) {
    return Array.from({ length: o.count }, (_, i) => ({
      t0: o.count > 1 ? i / o.count * 0.7 : 0, side: i % 2 ? 1 : -1, glyph: i % 2 ? '\\u266B' : '\\u266A', drift: (a.random() - 0.5) * 0.4,
    }));
  }`,
      draw: `function draw_notes(a, g, o, p, x, y, size, st) {
    const base = g.globalAlpha;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold ' + Math.round(size * 0.35 * o.size) + 'px "Segoe UI Symbol", "Noto Music", sans-serif';
    for (const n of st) {
      const q = (p - n.t0) / 0.3;
      if (q <= 0 || q >= 1) continue;
      g.globalAlpha = base * Math.min(1, 4 * q) * (1 - q);
      g.fillStyle = n.side > 0 ? o.colorA : o.colorB;
      g.fillText(n.glyph, x + n.side * size * 0.6 + (n.side * 0.15 + n.drift) * size * q, y - o.rise * size * q);
    }
    g.globalAlpha = base;
  }`,
    },
    {
      id: 'marks', label: 'Motion marks', anchor: { part: 'armRLower', u: 0.5, v: 0.8 },
      params: [
        { key: 'color', label: 'Colour', type: 'color', default: '#ffffff' },
        { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
        { key: 'rate', label: 'Pulses', type: 'range', min: 1, max: 12, step: 1, default: 3 },
        { key: 'sides', label: 'Sides', type: 'select', options: ['both', 'left', 'right'], default: 'both' },
      ],
      init: '',
      draw: `function draw_marks(a, g, o, p, x, y, size, st) {
    const base = g.globalAlpha, s = Math.sin(2 * Math.PI * o.rate * p), alpha = 0.7 * Math.abs(s);
    if (alpha <= 0.02) return;
    g.lineCap = 'round';
    const sides = o.sides === 'left' ? [-1] : o.sides === 'right' ? [1] : [-1, 1];
    for (const [color, width] of [['rgba(0, 0, 0, 0.3)', 0.05], [o.color, 0.025]]) {
      g.strokeStyle = color;
      g.lineWidth = size * width * o.size;
      g.globalAlpha = base * alpha;
      for (const side of sides) {
        for (let i = 0; i < 2; i++) {
          const r = size * o.size * (0.32 + i * 0.12), mid = side > 0 ? 0 : Math.PI;
          g.beginPath();
          g.arc(x, y, r, mid - 0.45, mid + 0.45);
          g.stroke();
        }
      }
    }
    g.globalAlpha = base;
  }`,
    },
    {
      id: 'burst', label: 'Emoji burst', anchor: { part: 'face', u: 0.5, v: 0.2 },
      params: [
        { key: 'text', label: 'Emoji / text', type: 'text', default: '🎉' },
        { key: 'count', label: 'Count', type: 'range', min: 1, max: 40, step: 1, default: 10 },
        { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
        { key: 'spread', label: 'Spread', type: 'range', min: 0.2, max: 4, step: 0.1, default: 1.5 },
        { key: 'gravity', label: 'Gravity', type: 'range', min: 0, max: 3, step: 0.1, default: 1.2 },
      ],
      init: `function init_burst(a, o) {
    return Array.from({ length: o.count }, () => ({
      vx: (a.random() - 0.5) * 2, vy: -(0.6 + a.random() * 0.8), delay: a.random() * 0.3, spin: (a.random() - 0.5) * 2,
    }));
  }`,
      draw: `function draw_burst(a, g, o, p, x, y, size, st) {
    const base = g.globalAlpha;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = Math.round(size * 0.3 * o.size) + 'px ${EMOJI_FONT.replace(/"/g, '\\"')}';
    for (const k of st) {
      const q = (p - k.delay) / (1 - k.delay);
      if (q <= 0 || q >= 1) continue;
      const px = x + k.vx * o.spread * size * q, py = y + (k.vy * q + o.gravity * q * q) * size * o.spread;
      g.globalAlpha = base * (1 - q * q * q);
      g.save();
      g.translate(px, py);
      g.rotate(k.spin * q * Math.PI);
      g.fillText(o.text, 0, 0);
      g.restore();
    }
    g.globalAlpha = base;
  }`,
    },
    {
      id: 'caption', label: 'Caption', anchor: { part: 'face', u: 0.5, v: -0.15 },
      params: [
        { key: 'text', label: 'Text ({user} = a Streamer.bot value)', type: 'text', default: 'Thanks {user|everyone}!' },
        { key: 'color', label: 'Colour', type: 'color', default: '#ffffff' },
        { key: 'outline', label: 'Outline', type: 'color', default: '#2b2340' },
        { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
        { key: 'rise', label: 'Rise', type: 'range', min: 0, max: 2, step: 0.05, default: 0.2 },
      ],
      init: '',
      draw: `function draw_caption(a, g, o, p, x, y, size, st) {
    // {name} or {name|fallback} is replaced by that value from the Streamer.bot URL (shown as text only)
    const text = String(o.text).replace(/\\{([\\w-]{1,40})(?:\\|([^}]*))?\\}/g, (m, k, d) => (a.args[k] != null ? a.args[k] : d || ''));
    const pop = Math.min(1, p / 0.12), u = pop - 1, k = 1 + 2.70158 * u * u * u + 1.70158 * u * u;
    const base = g.globalAlpha;
    g.globalAlpha = base * Math.min(1, p / 0.08, (1 - p) / 0.15);
    g.save();
    g.translate(x, y - o.rise * size * p);
    g.scale(k, k);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold ' + Math.round(size * 0.22 * o.size) + 'px "Segoe UI", sans-serif';
    g.lineJoin = 'round';
    g.lineWidth = size * 0.05 * o.size;
    g.strokeStyle = o.outline;
    g.strokeText(text, 0, 0);
    g.fillStyle = o.color;
    g.fillText(text, 0, 0);
    g.restore();
    g.globalAlpha = base;
  }`,
    },
    {
      id: 'image', label: 'Picture', anchor: { part: 'face', u: 0.5, v: 0.5 },
      params: [
        { key: 'file', label: 'Picture', type: 'file', kind: 'image', default: '' },
        { key: 'size', label: 'Size', type: 'range', min: 0.1, max: 5, step: 0.05, default: 1 },
        { key: 'scaleFrom', label: 'Scale at start', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { key: 'scaleTo', label: 'Scale at end', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { key: 'spin', label: 'Spin (degrees)', type: 'range', min: -1080, max: 1080, step: 15, default: 0 },
        { key: 'rise', label: 'Rise', type: 'range', min: -2, max: 2, step: 0.05, default: 0 },
        { key: 'fadeIn', label: 'Fade in', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.1 },
        { key: 'fadeOut', label: 'Fade out', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.2 },
      ],
      init: '',
      draw: `function draw_image(a, g, o, p, x, y, size, st) {
    const img = o.src && a.image(o.src);
    if (!img || !img.width) return;
    const w = size * o.size * (o.scaleFrom + (o.scaleTo - o.scaleFrom) * p), h = w * img.height / img.width;
    const fade = Math.min(1, o.fadeIn > 0 ? p / o.fadeIn : 1, o.fadeOut > 0 ? (1 - p) / o.fadeOut : 1);
    if (fade <= 0 || w <= 0) return;
    const base = g.globalAlpha;
    g.globalAlpha = base * fade;
    g.save();
    g.translate(x, y - o.rise * size * p);
    g.rotate(o.spin * p * Math.PI / 180);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
    g.globalAlpha = base;
  }`,
    },
  ];

  const BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

  // an effect's settings with every missing or out-of-range value replaced by the default
  function cleanParams(preset, params) {
    const out = {};
    for (const s of preset.params) {
      const v = params ? params[s.key] : undefined;
      if (s.type === 'range') out[s.key] = Number.isFinite(+v) && v !== '' && v !== null ? Math.max(s.min, Math.min(s.max, +v)) : s.default;
      else if (s.type === 'color') out[s.key] = /^#[0-9a-f]{6}$/i.test(v) ? v : s.default;
      else if (s.type === 'select') out[s.key] = s.options.includes(v) ? v : s.default;
      else out[s.key] = typeof v === 'string' ? v.slice(0, 200) : s.default;
    }
    return out;
  }

  function defaults(preset) { return cleanParams(preset, {}); }

  return { PRESETS, BY_ID, cleanParams, defaults };
});
