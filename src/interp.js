/* Easing and keyframe sampling.

   SOURCE is pasted, as it is, into every action file the studio exports, and the studio's own
   preview evaluates the same text: the motion you see is computed by the exact code you export.

   A track is a list of keys [t, v, ease] sorted by t (ms). `ease` shapes the way from that key to
   the next one. Before the first key the first value holds; after the last key the last one does. */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.Studio = root.Studio || {}).Interp = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const SOURCE = `const EASE = {
    linear: (u) => u,
    inQuad: (u) => u * u,
    outQuad: (u) => 1 - (1 - u) * (1 - u),
    inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
    outBack: (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
    outElastic: (u) => (u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    step: (u) => (u < 1 ? 0 : 1),
  };
  // a track's value at ms: keys = [[t, v, ease], ...] sorted by t
  function sample(keys, ms) {
    const n = keys.length;
    if (ms <= keys[0][0]) return keys[0][1];
    if (ms >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (keys[i + 1][0] <= ms) i++;
    const [t0, v0, e] = keys[i], [t1, v1] = keys[i + 1];
    const u = (ms - t0) / Math.max(1e-6, t1 - t0);
    return v0 + (v1 - v0) * (EASE[e] || EASE.linear)(u);
  }
  // a step track's value at ms (eyes, mouth, expression): the last key at or before ms, or ''
  function held(keys, ms) {
    let v = '';
    for (const [t, x] of keys) { if (t <= ms) v = x; else break; }
    return v;
  }`;

  const lib = new Function(SOURCE + '\nreturn { EASE, sample, held };')();
  lib.SOURCE = SOURCE;
  lib.EASES = Object.keys(lib.EASE);
  return lib;
});
