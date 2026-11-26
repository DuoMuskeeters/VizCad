// Taslak için küçük ortografik çizici: "Pompa grubu" montajı (Z yukarı, mm).
// Ürün kodu değil; yalnızca 12-stüdyo ve 13-montaj ekranlarında seçme, izole, kesit,
// pin ve parça küçük resimlerini aynı modelden tutarlı çizmek için.
window.VZ = (() => {
  const TH = 58 * Math.PI / 180, PH = 26 * Math.PI / 180;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  const D = [Math.cos(PH) * Math.cos(TH), Math.cos(PH) * Math.sin(TH), Math.sin(PH)];
  const R = norm([D[1], -D[0], 0]);
  let U = [D[1] * R[2] - D[2] * R[1], D[2] * R[0] - D[0] * R[2], D[0] * R[1] - D[1] * R[0]];
  if (U[2] < 0) U = U.map((v) => -v);
  const LIGHT = norm([0.15, 0.45, 0.88]);
  const P = (p) => [dot(p, R), -dot(p, U)];

  // Ağaç (yol → ad, parça sayısı). Sayılar yaprak parça sayısıdır.
  const TREE = {
    '0': ['Pompa grubu', 455],
    '0.0': ['Şase kaynaklı', 1],
    '0.1': ['Motor 7,5 kW', 86],
    '0.2': ['Kaplin', 9],
    '0.3': ['Pompa ünitesi', 318],
    '0.3.0': ['Yatak gövdesi', 64],
    '0.3.1': ['Salyangoz gövde', 1],
    '0.3.2': ['Çark', 1],
    '0.3.3': ['Mil', 1],
    '0.3.4': ['Salmastra grubu', 24],
    '0.3.5': ['Emme flanşı DN100', 1],
    '0.3.6': ['Basma flanşı DN80', 1],
    '0.3.7': ['Cıvata ve somunlar', 225],
    '0.4': ['Bağlantı elemanları', 41],
    '0.1.0': ['Gövde ve stator', 42],
    '0.1.1': ['Fan grubu', 12],
    '0.1.2': ['Klemens kutusu', 1],
    '0.1.3': ['Rulmanlar ve keçeler', 31],
  };

  const bolt = (n, x, y, z0, z1, r = 14) => ({ n, t: 'cz', x, y, z0, z1, r, c: '#c3c8cf' });
  // Çizim sırası = boyama sırası (arkadan öne).
  const G = [
    { n: '0.0', t: 'box', a: [0, 0, 0], b: [1000, 360, 40], c: '#5b6470' },
    bolt('0.4', 40, 40, 40, 74), bolt('0.4', 960, 40, 40, 74),
    { n: '0.3.0', t: 'box', a: [600, 92, 40], b: [800, 268, 62], c: '#7d8792' },
    bolt('0.3.7', 624, 112, 62, 84, 10), bolt('0.3.7', 776, 112, 62, 84, 10),
    { n: '0.1', t: 'box', a: [100, 72, 40], b: [400, 288, 84], c: '#3f6ea8' },
    { n: '0.1', t: 'cx', x0: 20, x1: 60, y: 180, z: 205, r: 112, c: '#30353c' },
    { n: '0.1', t: 'cx', x0: 60, x1: 440, y: 180, z: 205, r: 124, c: '#3f6ea8' },
    { n: '0.1', t: 'box', a: [205, 132, 318], b: [315, 228, 372], c: '#3f6ea8' },
    { n: '0.3.3', t: 'cx', x0: 430, x1: 884, y: 180, z: 205, r: 22, c: '#b9c0c8' },
    { n: '0.2', t: 'cx', x0: 450, x1: 530, y: 180, z: 205, r: 66, c: '#c9a227' },
    { n: '0.3.0', t: 'cx', x0: 530, x1: 700, y: 180, z: 205, r: 80, ri: 30, c: '#7d8792' },
    { n: '0.3.4', t: 'cx', x0: 688, x1: 706, y: 180, z: 205, r: 46, ri: 22, c: '#4b5563' },
    { n: '0.3.2', t: 'cx', x0: 728, x1: 772, y: 180, z: 205, r: 128, ri: 22, c: '#b08d57' },
    { n: '0.3.1', t: 'cx', x0: 700, x1: 820, y: 180, z: 205, r: 165, c: '#7d8792' },
    { n: '0.3.5', t: 'cx', x0: 820, x1: 895, y: 180, z: 205, r: 72, ri: 50, c: '#9aa3ad' },
    { n: '0.3.5', t: 'cx', x0: 895, x1: 920, y: 180, z: 205, r: 112, ri: 50, c: '#9aa3ad' },
    { n: '0.3.6', t: 'cz', x: 760, y: 180, z0: 362, z1: 440, r: 58, ri: 40, c: '#9aa3ad' },
    { n: '0.3.6', t: 'cz', x: 760, y: 180, z0: 440, z1: 462, r: 98, ri: 40, c: '#9aa3ad' },
    bolt('0.3.7', 624, 248, 62, 84, 10), bolt('0.3.7', 776, 248, 62, 84, 10),
    bolt('0.4', 40, 320, 40, 74), bolt('0.4', 960, 320, 40, 74),
  ];

  const under = (n, p) => n === p || n.startsWith(p + '.');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb = (c) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(' ')})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const SEL = hex('#22c3e0');
  const N = 44;
  let seq = 0;

  function render(opt = {}) {
    const id = 'vz' + (++seq);
    const sec = opt.section ?? null;
    const out = [];
    const fitPts = [];
    const edge = 'stroke="#0b1017" stroke-opacity=".55" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"';
    const poly = (pts, fill, extra = '') =>
      `<path d="M${pts.map((p) => P(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z" fill="${fill}" ${extra}/>`;
    const line = (a, b) => `<path d="M${P(a).map((v) => v.toFixed(1)).join(' ')}L${P(b).map((v) => v.toFixed(1)).join(' ')}" ${edge}/>`;
    const hatch = `url(#${id}h)`;

    for (const g0 of G) {
      if (opt.only && !under(g0.n, opt.only)) continue;
      if (opt.hidden && opt.hidden.some((h) => under(g0.n, h))) continue;
      const g = { ...g0 };
      let col = hex(g.c);
      if (opt.colors) {
        const k = Object.keys(opt.colors).filter((p) => under(g.n, p)).sort((a, b) => b.length - a.length)[0];
        if (k) col = hex(opt.colors[k]);
      }
      const sel = opt.select && under(g.n, opt.select);
      if (sel) col = mix(col, SEL, 0.55);
      const dim = opt.dim && !under(g.n, opt.dim);
      const op = dim ? ' opacity=".28"' : '';
      const shade = (n) => rgb(col.map((v) => v * (0.35 + 0.65 * Math.max(0, dot(n, LIGHT)))));
      const selEdge = sel ? 'stroke="#7fe3f5" stroke-width="1.6" vector-effect="non-scaling-stroke" fill="none"' : edge;
      let cut = false;

      if (g.t === 'box') {
        const a = [...g.a], b = [...g.b];
        for (const p of [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]], [b[0], a[1], a[2]]]) fitPts.push(P(p));
        if (sec !== null && b[0] > sec) { if (a[0] >= sec) continue; b[0] = sec; cut = true; }
        const parts = [];
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
          const n = [0, 0, 0]; n[k] = s;
          if (dot(n, D) <= 0) continue;
          const [i, j] = [0, 1, 2].filter((q) => q !== k);
          const at = s > 0 ? b[k] : a[k];
          const c = (vi, vj) => { const p = [0, 0, 0]; p[k] = at; p[i] = vi; p[j] = vj; return p; };
          const pts = [c(a[i], a[j]), c(b[i], a[j]), c(b[i], b[j]), c(a[i], b[j])];
          const isCap = cut && k === 0 && s > 0;
          parts.push(poly(pts, isCap ? hatch : shade(n), `stroke="${isCap ? '#3b4350' : '#0b1017'}" stroke-opacity="${isCap ? 1 : .55}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round"`));
          if (sel) parts.push(poly(pts, 'none', selEdge));
        }
        out.push(`<g${op}>${parts.join('')}</g>`);
        continue;
      }

      // Silindir: 'cx' X ekseni boyunca, 'cz' dikey.
      const ring = (h) => Array.from({ length: N + 1 }, (_, i) => {
        const t = (i / N) * Math.PI * 2;
        return g.t === 'cx' ? [h, g.y + g.r * Math.cos(t), g.z + g.r * Math.sin(t)] : [g.x + g.r * Math.cos(t), g.y + g.r * Math.sin(t), h];
      });
      const ringR = (h, rr) => Array.from({ length: N + 1 }, (_, i) => {
        const t = (i / N) * Math.PI * 2;
        return g.t === 'cx' ? [h, g.y + rr * Math.cos(t), g.z + rr * Math.sin(t)] : [g.x + rr * Math.cos(t), g.y + rr * Math.sin(t), h];
      });
      let h0 = g.t === 'cx' ? g.x0 : g.z0, h1 = g.t === 'cx' ? g.x1 : g.z1;
      for (const p of [...ring(h0).filter((_, i) => i % 4 === 0), ...ring(h1).filter((_, i) => i % 4 === 0)]) fitPts.push(P(p));
      if (sec !== null) {
        if (g.t === 'cx' && h1 > sec) { if (h0 >= sec) continue; h1 = sec; cut = true; }
        if (g.t === 'cz' && g.x > sec) continue;
      }
      const r0 = ring(h0), r1 = ring(h1);
      const nrm = (i) => { const t = ((i + 0.5) / N) * Math.PI * 2; return g.t === 'cx' ? [0, Math.cos(t), Math.sin(t)] : [Math.cos(t), Math.sin(t), 0]; };
      const parts = [];
      const vis = [];
      for (let i = 0; i < N; i++) {
        const n = nrm(i); vis.push(dot(n, D) > 0);
        if (!vis[i]) continue;
        const f = shade(n);
        parts.push(poly([r0[i], r0[i + 1], r1[i + 1], r1[i]], f, `stroke="${f}" stroke-width=".8" vector-effect="non-scaling-stroke"`));
      }
      for (let i = 0; i < N; i++) if (vis[i] !== vis[(i + 1) % N]) parts.push(line(r0[i + 1], r1[i + 1]));
      const capN = g.t === 'cx' ? [1, 0, 0] : [0, 0, 1];
      const capPts = r1.slice(0, N);
      if (cut) {
        const inner = g.ri ? ringR(h1, g.ri).slice(0, N) : null;
        const d = `M${capPts.map((p) => P(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z` + (inner ? `M${inner.map((p) => P(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z` : '');
        parts.push(`<path d="${d}" fill="${hatch}" fill-rule="evenodd" stroke="#3b4350" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
      } else if (dot(capN, D) > 0) {
        parts.push(poly(capPts, shade(capN), edge.replace('fill="none"', '')));
        if (g.ri) parts.push(poly(ringR(h1, g.ri).slice(0, N), '#161b22', edge.replace('fill="none"', '')));
      }
      if (sel) parts.push(poly(capPts, 'none', selEdge));
      out.push(`<g${op}>${parts.join('')}</g>`);
    }

    // Sığdırma: kesitten bağımsız (kamera kesitte zıplamaz).
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of fitPts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = Math.max(x1 - x0, y1 - y0) * (opt.pad ?? 0.08);
    const vb = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];

    let plane = '';
    if (sec !== null && opt.plane !== false) {
      const c = [[sec, -70, -40], [sec, 430, -40], [sec, 430, 520], [sec, -70, 520]];
      plane = poly(c, 'rgb(34 195 224 / .10)', 'stroke="#5fe0f5" stroke-opacity=".8" stroke-width="1.2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"');
    }
    const shadow = opt.shadow === false ? '' :
      `<path d="M${[[-30, -30, 0], [1030, -30, 0], [1030, 390, 0], [-30, 390, 0]].map((p) => P(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z" fill="#05080c" opacity=".5" filter="url(#${id}b)"/>`;
    const svg = `<svg class="${opt.cls ?? 'model'}" viewBox="${vb.map((v) => v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${opt.label ?? '3B model'}">
<defs><pattern id="${id}h" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)"><rect width="14" height="14" fill="#c7ccd4"/><path d="M0 0V14" stroke="#4a5260" stroke-width="3"/></pattern>
<filter id="${id}b" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="16"/></filter></defs>
${opt.only ? '' : shadow}${out.join('')}${plane}</svg>`;
    return { svg, vb };
  }

  function mount(el, opt) {
    const { svg } = render(opt);
    el.insertAdjacentHTML('afterbegin', svg);
    const node = el.querySelector('svg');
    return (p) => {
      const m = node.getScreenCTM(); const box = el.getBoundingClientRect();
      const pt = node.createSVGPoint(); [pt.x, pt.y] = P(p);
      const s = pt.matrixTransform(m);
      return [s.x - box.left, s.y - box.top];
    };
  }

  return { render, mount, TREE, under, P };
})();
