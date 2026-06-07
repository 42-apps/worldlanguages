/* ============================================================================
   WorldLanguages — a 3D globe coloured by each country's PRIMARY (native) language,
   dragged across time (3000 BC -> today). Data: data/languages.js +
   data/language-data.js. Engine: globe.gl (bundled, MV3-CSP-safe).
   ========================================================================== */
'use strict';

const LANGUAGES = window.LANGUAGES || {};
const SLICES    = window.TIME_SLICES || [];
const DATA      = window.LANGUAGE_DATA || {};
const PHYLA     = window.PHYLA || {};                       // top-level families (Family view)
const FAMILY_TO_PHYLUM = window.FAMILY_TO_PHYLUM || {};
const SLICE_INDEX = {}; SLICES.forEach((s, i) => (SLICE_INDEX[s.id] = i));

const yr = id => parseInt(id, 10);
const TODAY_YEAR = 2025;                       // the present-day snapshot (the last data anchor)
// Display slider stops: coarse in antiquity, ~100-yr through the CE era, then the modern anchors.
// Values BETWEEN data anchors are linear interpolations (honest estimates), not new data.
const eraOf = y => (y <= 1 ? 'ancient' : y < 1900 ? 'historical' : 'documented');
const fmtYear = y => (y === TODAY_YEAR ? 'Today' : y < 0 ? (-y) + ' BC' : y <= 1500 ? y + ' CE' : '' + y);
const _sy = [-3000, -2000, -1000, -500, 1];
for (let y = 100; y <= 1800; y += 100) _sy.push(y);        // ~100-yr stops through the CE era
[1850, 1900, 1950, 2000, TODAY_YEAR].forEach(y => _sy.push(y));
const STEP_YEARS = [...new Set(_sy)].sort((a, b) => a - b);
const ANCHOR_SET = new Set(SLICES.map(s => yr(s.id)));
const STEPS = STEP_YEARS.map(y => ({ year: y, era: eraOf(y), label: fmtYear(y), anchor: ANCHOR_SET.has(y) }));
const curYear = () => STEPS[state.stepIdx].year;
function nearestStep(year) { let bi = 0, bd = Infinity; STEPS.forEach((s, i) => { const d = Math.abs(s.year - year); if (d < bd) { bd = d; bi = i; } }); return bi; }

const NEUTRAL = 'rgba(70, 80, 105, 0.16)';   // no data / uninhabited that era
const ERA_BADGE = { ancient: 'antiquity', historical: 'history', documented: 'recorded' };

// Natural Earth tags a few features ISO_A2="-99"; resolve via ADM0_A3.
const A3_TO_A2 = { FRA: 'FR', NOR: 'NO', CYN: 'CY', SOL: 'SO' };

const state = {
  stepIdx: Math.max(0, STEPS.findIndex(s => s.year === TODAY_YEAR)),  // open on "Today"
  hovered: null,
  selected: null,
  playing: false,
  playDir: 1,     // +1 = forward in time, -1 = backward
  focus: null,    // when set to a language key, the globe shows that language's SHARE per country
  view: 'shade',  // fill: 'shade' (default) | 'bands' (proportional strips, glitchy on globe) | 'dots' | 'solid'
  flat: false,    // flat 2D map view (vs the globe)
  byFamily: false,// Family view: roll every language up to its top-level phylum (Indo-European, …)
  lens: null,     // map lens: null (languages) | 'diversity' | 'change' | 'classical' | 'confidence'
};
let playTimer = null;
let spinOn = true;

/* ---------- Family view: roll languages up to their top-level phylum ---------- */
const phylumOf = k => FAMILY_TO_PHYLUM[(LANGUAGES[k] || {}).family] || 'Other';
function aggregateToPhylum(comp) {                 // {langKey: pct} -> {phylumKey: pct}
  const out = {};
  for (const k in comp) { const p = phylumOf(k); out[p] = (out[p] || 0) + comp[k]; }
  return out;
}
// Wrap a raw composition: aggregate to phylum when Family view is on, else pass through.
const aggIf = comp => (state.byFamily && comp) ? aggregateToPhylum(comp) : comp;
// Stable stacking/iteration order for the active view (languages, or phyla in Family view).
const orderKeys = () => state.byFamily ? Object.keys(PHYLA) : orderKeys();

/* ----------------------------- data helpers ----------------------------- */
function isoOf(props) {
  const a2 = props.ISO_A2;
  if (a2 && a2 !== '-99') return a2;
  return A3_TO_A2[props.ADM0_A3] || null;
}
// Composition at a target slice: carry forward the last known slice;
// null before a territory's earliest data (uninhabited / unknown).
function compositionAt(rec, sliceId) { return aggIf(compositionAtRaw(rec, sliceId)); }
function compositionAtRaw(rec, sliceId) {
  if (!rec || !rec.s) return null;
  const target = SLICE_INDEX[sliceId];
  const avail = Object.keys(rec.s).map(k => SLICE_INDEX[k]).filter(n => n != null).sort((a, b) => a - b);
  if (!avail.length || target < avail[0]) return null;
  let pick = avail[0];
  for (const a of avail) { if (a <= target) pick = a; else break; }
  return rec.s[SLICES[pick].id];
}
// Composition at any YEAR — linear interpolation between a country's known anchors (smooth growth/shrink).
function compAtYear(rec, year) { return aggIf(compAtYearRaw(rec, year)); }
function compAtYearRaw(rec, year) {
  if (!rec || !rec.s) return null;
  const av = Object.keys(rec.s).map(id => ({ y: yr(id), c: rec.s[id] })).sort((a, b) => a.y - b.y);
  if (!av.length || year < av[0].y) return null;
  if (year >= av[av.length - 1].y) return av[av.length - 1].c;
  let lo = av[0], hi = av[av.length - 1];
  for (let i = 0; i < av.length - 1; i++) { if (av[i].y <= year && year <= av[i + 1].y) { lo = av[i]; hi = av[i + 1]; break; } }
  if (year === lo.y) return lo.c;
  if (year === hi.y) return hi.c;
  const t = (year - lo.y) / (hi.y - lo.y), out = {};
  for (const k of new Set([...Object.keys(lo.c), ...Object.keys(hi.c)])) {
    const v = (lo.c[k] || 0) + ((hi.c[k] || 0) - (lo.c[k] || 0)) * t;
    if (v > 0.05) out[k] = v;
  }
  return out;
}
// Map a year to a fractional index within SLICES (anchors) — for the trend-chart marker.
function anchorXFrac(year) {
  const ys = SLICES.map(s => yr(s.id));
  if (year <= ys[0]) return 0;
  if (year >= ys[ys.length - 1]) return ys.length - 1;
  for (let i = 0; i < ys.length - 1; i++) if (ys[i] <= year && year <= ys[i + 1]) return i + (year - ys[i]) / (ys[i + 1] - ys[i]);
  return ys.length - 1;
}
function majorityOf(comp) {
  let bk = null, bv = -1;
  for (const k in comp) if (comp[k] > bv) { bv = comp[k]; bk = k; }
  return bk ? { key: bk, pct: bv } : null;
}
function sortedParts(comp) {
  return Object.entries(comp).map(([k, v]) => ({ key: k, pct: v })).sort((a, b) => b.pct - a.pct);
}
const langColor = k => (LANGUAGES[k] && LANGUAGES[k].color) || (PHYLA[k] && PHYLA[k].color) || '#888';
const langLabel = k => (LANGUAGES[k] && LANGUAGES[k].label) || (PHYLA[k] && PHYLA[k].label) || k;
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
// Proportional blend: weighted average of the language colours by share (the "shade" fill).
function blendColor(comp, a) {
  const t = Object.values(comp).reduce((s, v) => s + v, 0) || 1;
  let r = 0, g = 0, b = 0;
  for (const k in comp) {
    const n = parseInt(langColor(k).slice(1), 16), w = (comp[k] || 0) / t;
    r += ((n >> 16) & 255) * w; g += ((n >> 8) & 255) * w; b += (n & 255) * w;
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/* ------------------------------ map lenses ------------------------------ */
/* Choropleths computed straight from the existing data: colour each country by a
   single metric instead of its language mix. Orthogonal to Family view (always
   language-level). state.lens ∈ null | diversity | change | classical | confidence. */
const CLASSICAL = ['latin', 'aramaic', 'mesopotamian', 'sanskrit', 'egyptian']; // classical / extinct tongues
const LENS_META = {
  diversity:  { label: 'Diversity',  lo: 'One language', hi: 'Many languages', stops: ['#2b3a5e', '#1f9e89', '#f4e04d'], note: 'Linguistic diversity this era — 1 − Σ(share²).' },
  change:     { label: 'Change',     lo: 'Stable',       hi: 'Upheaval',       stops: ['#2c3e66', '#e67e22', '#c0392b'], note: 'How much the language mix shifted since the previous era.' },
  classical:  { label: 'Classical',  lo: 'None',         hi: 'Classical core', stops: ['#222a3f', '#9a7d0a', '#f1c40f'], note: 'Share of classical / extinct tongues — Latin, Aramaic, Sumerian-Akkadian, Sanskrit, Egyptian.' },
  confidence: { label: 'Confidence', lo: 'Estimated',    hi: 'Well attested',  stops: ['#a8631c', '#c9a24a', '#2f9e8a'], note: 'How firmly attested this era is — deep antiquity is estimated.' },
};
function lerpHex(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  return [16, 8, 0].map(sh => Math.round(((na >> sh) & 255) + (((nb >> sh) & 255) - ((na >> sh) & 255)) * t));
}
function rampRGB(lens, t) {                          // t∈[0,1] → [r,g,b] across the lens's stops
  const stops = (LENS_META[lens] || {}).stops || ['#444444', '#cccccc'];
  t = Math.max(0, Math.min(1, t));
  const seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg));
  return lerpHex(stops[i], stops[i + 1], seg - i);
}
const ANCHOR_YEARS = SLICES.map(s => yr(s.id)).sort((a, b) => a - b);
function prevAnchorYear(year) { let p = ANCHOR_YEARS[0]; for (const y of ANCHOR_YEARS) { if (y < year) p = y; else break; } return p; }
function compDistance(c0, c1) {                      // total reallocation 0..100 between two comps
  const n0 = Object.values(c0).reduce((a, b) => a + b, 0) || 1, n1 = Object.values(c1).reduce((a, b) => a + b, 0) || 1;
  let d = 0; for (const k of new Set([...Object.keys(c0), ...Object.keys(c1)])) d += Math.abs((c0[k] || 0) / n0 - (c1[k] || 0) / n1);
  return d / 2 * 100;
}
function confidenceScore(rec, year) {                // era tier, penalised by distance to this country's nearest data anchor
  const base = year <= 1 ? 0.36 : year < 1500 ? 0.6 : year < 1900 ? 0.78 : 0.93;
  if (!rec || !rec.s) return base;
  let gap = Infinity; for (const id in rec.s) gap = Math.min(gap, Math.abs(yr(id) - year));
  return Math.max(0.08, Math.min(0.98, base - Math.min(0.28, gap / 4000)));
}
// Metric in [0,1] (+ a readable label) for the active lens, or null where there's no data.
function lensMetric(iso, year) {
  const rec = DATA[iso], comp = compAtYearRaw(rec, year);   // language-level, independent of Family view
  if (!comp) return null;
  const tot = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
  if (state.lens === 'diversity') { let s = 0; for (const k in comp) { const p = comp[k] / tot; s += p * p; } const d = 1 - s; return { t: Math.min(1, d / 0.82), label: d.toFixed(2) }; }
  if (state.lens === 'classical') { let s = 0; for (const k of CLASSICAL) s += (comp[k] || 0); const f = s / tot; return { t: Math.min(1, f), label: Math.round(f * 100) + '%' }; }
  if (state.lens === 'change')    { const c0 = compAtYearRaw(rec, prevAnchorYear(year)); const ch = c0 ? compDistance(c0, comp) : 0; return { t: Math.min(1, ch / 55), label: c0 ? Math.round(ch) + '%' : 'new' }; }
  if (state.lens === 'confidence'){ const c = confidenceScore(rec, year); return { t: c, label: c >= 0.8 ? 'well attested' : c >= 0.6 ? 'good' : c >= 0.4 ? 'fair' : 'estimated' }; }
  return null;
}
function lensColor(iso, year, sel, hov) {
  const m = lensMetric(iso, year);
  if (!m) return null;
  const [r, g, b] = rampRGB(state.lens, m.t);
  return `rgba(${r}, ${g}, ${b}, ${sel ? 0.98 : hov ? 0.9 : 0.82})`;
}
function lensLegendHTML() {
  const meta = LENS_META[state.lens]; if (!meta) return '';
  return `<div class="ll-grad" style="background:linear-gradient(90deg, ${meta.stops.join(', ')})"></div>` +
    `<div class="ll-ends"><span>${meta.lo}</span><span>${meta.hi}</span></div><div class="ll-note">${meta.note}</div>`;
}
function syncLensChips() {
  document.querySelectorAll('#lensChips .lens-chip').forEach(c => c.classList.toggle('on', (c.dataset.lens || '') === (state.lens || '')));
}
function setLens(lens) {
  state.lens = lens || null;
  if (state.lens && state.focus) { state.focus = null; document.body.classList.remove('focus-on'); document.getElementById('focusBanner').classList.add('hidden'); }
  syncLensChips();
  applySlice();
  refreshPies();
}

/* -------------------------------- globe -------------------------------- */
let globe, countries = [];
const elViz = document.getElementById('globeViz');

function capColor(feat) {
  if (feat.properties.rel) {                           // a proportional band-fill strip
    const biso = feat.properties.ISO_A2;
    const hl = (state.selected === biso) || (state.hovered === biso);
    return hexA(langColor(feat.properties.rel), hl ? 0.98 : 0.86);
  }
  const iso = isoOf(feat.properties);
  const comp = compAtYear(iso && DATA[iso], curYear());
  const sel = state.selected && iso === state.selected;
  const hov = state.hovered && iso === state.hovered;
  if (state.focus) {                                   // single-language "heat" mode: ramp by that language's share
    if (!comp) return NEUTRAL;
    let a = 0.05 + 0.93 * ((comp[state.focus] || 0) / 100);
    if (sel || hov) a = Math.min(0.99, a + 0.07);
    return hexA(langColor(state.focus), a);
  }
  if (!comp) return (sel || hov) ? 'rgba(120,130,160,0.4)' : NEUTRAL;
  if (state.lens) return lensColor(iso, curYear(), sel, hov) || NEUTRAL;
  if (state.view === 'shade') return blendColor(comp, sel ? 0.97 : hov ? 0.92 : 0.85);
  if (state.view === 'dots') return (sel || hov) ? 'rgba(120,132,160,0.34)' : 'rgba(58,70,98,0.22)';  // dim base so dots pop
  const maj = majorityOf(comp);
  return hexA(langColor(maj.key), sel ? 0.97 : hov ? 0.92 : 0.82);
}
function altOf(feat) {
  const p = feat.properties;
  if (p.rel !== undefined) {                  // band strip: step each band's altitude so they can't z-fight
    const a = 0.02 + (p.bi || 0) * 0.0022;
    return a + (state.selected === p.ISO_A2 ? 0.03 : state.hovered === p.ISO_A2 ? 0.018 : 0);
  }
  const iso = isoOf(p);
  if (state.selected && iso === state.selected) return 0.06;
  if (state.hovered && iso === state.hovered) return 0.04;
  return 0.01;
}

function initGlobe(geo) {
  countries = geo.features.filter(f => (f.properties.ADMIN || f.properties.NAME) !== 'Antarctica');
  buildPopMap();
  globe = Globe()(elViz)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true).atmosphereColor('#8fb7ff').atmosphereAltitude(0.16)
    .polygonsData(countries)
    .polygonCapColor(capColor)
    .polygonSideColor(() => 'rgba(20, 30, 55, 0.7)')
    .polygonStrokeColor(() => 'rgba(8, 12, 24, 0.85)')
    .polygonAltitude(altOf)
    .polygonsTransitionDuration(300)
    .onPolygonHover(onHover)
    .onPolygonClick(onClick);

  const mat = globe.globeMaterial();
  mat.color.set('#0a1626'); mat.emissive.set('#06101f'); mat.emissiveIntensity = 0.9; mat.shininess = 5;

  const c = globe.controls();
  c.autoRotate = true; c.autoRotateSpeed = 0.5; c.enableDamping = true; c.dampingFactor = 0.12;
  c.minDistance = 108; c.maxDistance = 600;   // lower min = zoom in much closer

  globe.pointOfView({ lat: 20, lng: 10, altitude: 2.3 }, 0);
  window.globe = globe;

  buildDotData();
  globe.pointsData([])
    .pointLat(d => d.lat).pointLng(d => d.lng)
    .pointColor(d => d.__color || '#ffffff')
    .pointAltitude(0.014).pointRadius(0.24).pointsMerge(true);
  refreshDots();
  updateGlobalBox();
  rebuildBands();
  sizeGlobe();
  requestAnimationFrame(sizeGlobe);
  if (window.ResizeObserver) new ResizeObserver(sizeGlobe).observe(elViz);
  requestAnimationFrame(() => {
    const cv = elViz.querySelector('canvas');
    if (cv) cv.addEventListener('webglcontextlost', e => { e.preventDefault(); showGlobeError(); });
  });
}
function sizeGlobe() {
  if (!globe) return;
  globe.width(elViz.clientWidth || window.innerWidth).height(elViz.clientHeight || (window.innerHeight - 58));
}
function refreshGlobe() { if (globe) globe.polygonCapColor(capColor).polygonAltitude(altOf); }
// If the GPU drops the WebGL context (common after a tab has been open/refreshed a lot),
// show a helpful overlay instead of a blank/broken canvas — with a flat-map escape hatch.
function showGlobeError() {
  if (document.getElementById('glLost')) return;
  const ov = document.createElement('div');
  ov.id = 'glLost';
  ov.style.cssText = 'position:absolute; inset:0; z-index:6; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; text-align:center; padding:24px; background:rgba(6,14,28,.74); backdrop-filter:blur(2px)';
  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:15px; max-width:380px; line-height:1.55; color:#dfe8f5';
  msg.textContent = 'The 3D globe lost its graphics context — this can happen after a browser tab has been open and refreshed many times. Reload to restore it, or switch to the flat map (it needs no 3D).';
  const row = document.createElement('div'); row.style.cssText = 'display:flex; gap:10px';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'padding:9px 16px; border-radius:9px; cursor:pointer; font-size:13px; font-weight:600; background:#2f6fe0; color:#fff; border:1px solid #6fb3ff'; b.addEventListener('click', fn); return b; };
  row.appendChild(mk('↻ Reload', () => location.reload()));
  row.appendChild(mk('🗺 Use flat map', () => { ov.remove(); if (!state.flat) setFlat(true); }));
  ov.appendChild(msg); ov.appendChild(row); elViz.appendChild(ov);
}

/* ---------- proportional band fill: country ∩ latitude strips (robust polygon clipping) ---------- */
const geomOf = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
let bandFeats = [];
function buildBandsForEra() {
  const feats = [], year = curYear(), PC = window.polygonClipping;
  for (const f of countries) {
    const iso = isoOf(f.properties);
    const comp = compAtYear(iso && DATA[iso], year);
    if (!comp) continue;
    const parts = orderKeys().filter(k => (comp[k] || 0) > 0);   // fixed order = stable south→north stack
    const total = parts.reduce((s, k) => s + comp[k], 0) || 1;
    const geom = geomOf(f);
    if (parts.length <= 1 || !PC) {                       // homogeneous → whole country, one colour (no clipping)
      const rel = parts[0] || (majorityOf(comp) || {}).key;
      for (const poly of geom) feats.push({ type: 'Feature', properties: { ISO_A2: iso, rel, bi: 0 }, geometry: { type: 'Polygon', coordinates: poly } });
      continue;
    }
    const bb = featBBox(f), lo = bb[1], range = (bb[3] - bb[1]) || 0.001, west = bb[0] - 1, east = bb[2] + 1;
    let cum = 0, bi = 0;
    for (const k of parts) {
      const yLo = lo + (cum / total) * range, yHi = lo + ((cum + comp[k]) / total) * range;
      cum += comp[k];
      const strip = [[[[west, yLo], [east, yLo], [east, yHi], [west, yHi], [west, yLo]]]];
      let clip; try { clip = PC.intersection(geom, strip); } catch (e) { clip = null; }
      if (clip) for (const poly of clip) feats.push({ type: 'Feature', properties: { ISO_A2: iso, rel: k, bi }, geometry: { type: 'Polygon', coordinates: poly } });
      bi++;
    }
  }
  return feats;
}
function rebuildBands() {
  if (!globe) return;
  const useBands = state.view === 'bands' && !state.focus && !state.lens;
  bandFeats = useBands ? buildBandsForEra() : [];
  globe.polygonsTransitionDuration(useBands ? 0 : 300).polygonsData(useBands ? bandFeats : countries);
  refreshGlobe();
}

/* ------------------------------ pie glyphs ------------------------------ */
/* A conic-gradient donut per country at its centroid, showing the full
   proportional mix. Sized by country extent. globe.gl auto-hides far-side ones. */
const PIE_MIN = 16;   // on-globe pies only for countries at least this big; smaller → hover popup
let pieData = [];
function buildPieData() {
  pieData = [];
  for (const f of countries) {
    const iso = isoOf(f.properties);
    if (!iso || !DATA[iso]) continue;
    const b = featBBox(f);
    const lat = (b[1] + b[3]) / 2;
    let lng = (b[0] + b[2]) / 2;
    if (b[2] - b[0] > 180) {            // crosses the antimeridian (Russia, Fiji…) — recompute on a 0..360 frame
      let mn = 360, mx = -360;
      const walk = c => { if (typeof c[0] === 'number') { const x = c[0] < 0 ? c[0] + 360 : c[0]; mn = Math.min(mn, x); mx = Math.max(mx, x); } else c.forEach(walk); };
      walk(f.geometry.coordinates);
      lng = (mn + mx) / 2; if (lng > 180) lng -= 360;
    }
    const lonExt = Math.min(b[2] - b[0], 180);                          // cap so antimeridian spans don't blow up
    const size = Math.max(11, Math.min(30, 7 + Math.sqrt(Math.max(0.1, (b[3] - b[1]) * lonExt)) * 1.25));  // scale by area extent
    pieData.push({ iso, lat, lng, size });
  }
}
function pieGradient(comp) {
  const parts = sortedParts(comp);
  const total = parts.reduce((s, p) => s + p.pct, 0) || 1;
  let acc = 0; const stops = [];
  for (const p of parts) {
    const a = (acc / total * 360).toFixed(1), bdeg = ((acc + p.pct) / total * 360).toFixed(1);
    stops.push(`${langColor(p.key)} ${a}deg ${bdeg}deg`); acc += p.pct;
  }
  return `conic-gradient(${stops.join(',')})`;
}
function makePie(d) {
  const el = document.createElement('div');
  el.className = 'pie';
  el.style.width = el.style.height = d.size + 'px';
  const comp = compAtYear(DATA[d.iso], curYear());     // compute fill at creation (no stale/empty rings)
  el.style.background = comp ? pieGradient(comp) : 'transparent';
  d.__el = el; return el;
}
// Pies live in the htmlElements layer ONLY in 'pies' mode — we toggle the whole data
// array, because globe.gl manages each element's display for occlusion and would
// otherwise override a per-element hide (that's what left empty circles in shade mode).
function refreshPies() {
  if (!globe) return;
  if (!state.pies || state.focus || state.lens) { globe.htmlElementsData([]); return; }
  const shown = [];
  for (const d of pieData) {
    if (d.size < PIE_MIN) continue;            // tiny countries → hover popup instead
    const comp = compAtYear(DATA[d.iso], curYear());
    if (!comp) continue;
    d.__bg = pieGradient(comp);
    if (d.__el) d.__el.style.background = d.__bg;
    shown.push(d);
  }
  globe.htmlElementsData(shown);
}

/* ---------------------- proportional dot-density ---------------------- */
/* Fill each country with coloured dots in proportion to its language mix, so you
   watch proportions grow/shrink IN PLACE as you scroll time. (globe.gl points.) */
let dotData = [];
function polyPieces(feat) {
  const g = feat.geometry;
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }
function pointInRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function buildDotData() {
  dotData = [];
  for (const f of countries) {
    const iso = isoOf(f.properties);
    if (!iso || !DATA[iso]) continue;
    const pieces = polyPieces(f).map(rings => ({ rings, area: ringArea(rings[0]) }));
    const total = pieces.reduce((s, p) => s + p.area, 0) || 1e-4;
    const K = Math.max(4, Math.min(40, Math.round(total * 0.42)));   // dot budget by area
    const mine = [];
    for (const pc of pieces) {
      let want = Math.round(K * pc.area / total);
      if (want < 1 && pc.area / total > 0.12) want = 1;
      if (want < 1) continue;
      const ring = pc.rings[0];
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      let placed = 0, tries = 0;
      while (placed < want && tries < want * 60) {
        tries++;
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
        if (!pointInRing(x, y, ring)) continue;
        let hole = false; for (let h = 1; h < pc.rings.length; h++) if (pointInRing(x, y, pc.rings[h])) { hole = true; break; }
        if (hole) continue;
        const d = { iso, lat: y, lng: x, q: 0 }; dotData.push(d); mine.push(d); placed++;
      }
    }
    mine.forEach((d, i) => (d.q = (i + 0.5) / (mine.length || 1)));   // even quantiles → stable color transitions
  }
}
function refreshDots() {
  if (!globe) return;
  if (state.view !== 'dots' || state.focus || state.lens) { globe.pointsData([]); return; }
  const year = curYear();
  const bands = {};
  for (const d of dotData) {
    if (d.iso in bands) continue;
    const comp = compAtYear(DATA[d.iso], year);
    if (!comp) { bands[d.iso] = null; continue; }
    const t = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
    let acc = 0; const b = [];
    for (const k of orderKeys()) { const v = comp[k] || 0; if (v > 0) { b.push({ key: k, c1: (acc + v) / t }); acc += v; } }
    bands[d.iso] = b;
  }
  const shown = [];
  for (const d of dotData) {
    const b = bands[d.iso];
    if (!b || !b.length) continue;
    let key = b[b.length - 1].key;
    for (const seg of b) if (d.q < seg.c1) { key = seg.key; break; }
    d.__color = langColor(key);
    shown.push(d);
  }
  globe.pointsData(shown);
}

/* ----------------------------- hover / detail ----------------------------- */
const tooltip = document.getElementById('tooltip');
const nameOf = (iso, feat) => (DATA[iso] && DATA[iso].n) || (feat && (feat.properties.ADMIN || feat.properties.NAME)) || iso;
function flagEmoji(iso) {
  if (!iso || iso.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function breakdownHTML(comp) {
  const parts = sortedParts(comp);
  const total = parts.reduce((s, p) => s + p.pct, 0) || 1;
  const bar = parts.map(p => `<span style="width:${(p.pct / total * 100).toFixed(1)}%;background:${langColor(p.key)}"></span>`).join('');
  const rows = parts.filter(p => p.pct >= 1).map(p =>
    `<div class="bk-row"><span class="bk-dot" style="background:${langColor(p.key)}"></span>` +
    `<span class="bk-l">${langLabel(p.key)}</span><span class="bk-v">${Math.round(p.pct)}%</span></div>`).join('');
  return `<div class="bk-bar">${bar}</div><div class="bk-rows">${rows}</div>`;
}
// Hover body: a real PIE chart + the rows (so tiny countries get their pie on hover).
function hoverBodyHTML(comp) {
  const rows = sortedParts(comp).filter(p => p.pct >= 1).map(p =>
    `<div class="bk-row"><span class="bk-dot" style="background:${langColor(p.key)}"></span>` +
    `<span class="bk-l">${langLabel(p.key)}</span><span class="bk-v">${Math.round(p.pct)}%</span></div>`).join('');
  return `<div class="tt-body"><div class="tt-pie" style="background:${pieGradient(comp)}"></div><div class="tt-rows">${rows}</div></div>`;
}

/* Stacked-area chart of a country's composition across ALL eras (the trend view). */
function trendChartSVG(rec) {
  const W = 252, H = 116, padT = 6, padB = 15;
  const n = SLICES.length;
  const xAt = i => (i / (n - 1)) * W;
  const yAt = v => padT + (1 - v / 100) * (H - padT - padB);
  const cols = SLICES.map(s => {
    const c = compositionAt(rec, s.id);
    if (!c) return null;
    const t = Object.values(c).reduce((a, b) => a + b, 0) || 1;
    const o = {}; for (const k in c) o[k] = c[k] / t * 100; return o;
  });
  const cum = SLICES.map(() => 0);
  let bands = '';
  for (const k of orderKeys()) {                 // fixed language order → stable bands
    let any = false; const tops = []; const bots = [];
    for (let i = 0; i < n; i++) {
      const v = cols[i] ? (cols[i][k] || 0) : 0;
      if (v > 0) any = true;
      tops.push(`${xAt(i).toFixed(1)},${yAt(cum[i] + v).toFixed(1)}`);
      bots.push([i, cum[i]]);
      cum[i] += v;
    }
    if (!any) continue;
    const bot = bots.reverse().map(p => `${xAt(p[0]).toFixed(1)},${yAt(p[1]).toFixed(1)}`);
    bands += `<polygon points="${tops.concat(bot).join(' ')}" fill="${langColor(k)}" opacity="0.9"/>`;
  }
  const mx = xAt(anchorXFrac(curYear())).toFixed(1);
  const marker = `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${H - padB}" stroke="#fff" stroke-width="1.5"/>`;
  const seen = {};
  const lbls = [0, SLICE_INDEX['1'], SLICE_INDEX['1500'], SLICE_INDEX['2020'], n - 1]
    .filter(i => i != null && !seen[i] && (seen[i] = 1))
    .map(i => `<text x="${Math.max(10, Math.min(W - 10, xAt(i)))}" y="${H - 4}" font-size="8" fill="#7e8aa3" text-anchor="middle">${SLICES[i].label}</text>`).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${bands}${marker}${lbls}</svg>`;
}

function onHover(feat) {
  const iso = feat ? isoOf(feat.properties) : null;
  state.hovered = iso;
  refreshGlobe();
  if (globe) globe.controls().autoRotate = !feat && spinOn && !state.playing;
  if (!feat) { tooltip.classList.add('hidden'); return; }
  const comp = compAtYear(iso && DATA[iso], curYear());
  const head = `<div class="tt-head"><span class="tt-flag">${flagEmoji(iso)}</span><span class="tt-name">${nameOf(iso, feat)}</span><span class="tt-era">${STEPS[state.stepIdx].label}</span></div>`;
  if (!comp) { tooltip.innerHTML = head + `<div class="tt-nd">No data for this era</div>`; tooltip.classList.remove('hidden'); return; }
  const maj = majorityOf(comp);
  tooltip.innerHTML = head +
    `<div class="tt-maj"><span class="tt-dot" style="background:${langColor(maj.key)}"></span>${langLabel(maj.key)} · ${Math.round(maj.pct)}%</div>` +
    hoverBodyHTML(comp);
  tooltip.classList.remove('hidden');
}
elViz.addEventListener('mousemove', e => {
  if (tooltip.classList.contains('hidden')) return;
  const r = elViz.getBoundingClientRect();
  tooltip.style.left = (e.clientX - r.left) + 'px';
  tooltip.style.top = (e.clientY - r.top) + 'px';
});

function featBBox(feat) {
  let mnx = 180, mny = 90, mxx = -180, mxy = -90;
  const walk = c => {
    if (typeof c[0] === 'number') { mnx = Math.min(mnx, c[0]); mxx = Math.max(mxx, c[0]); mny = Math.min(mny, c[1]); mxy = Math.max(mxy, c[1]); }
    else c.forEach(walk);
  };
  walk(feat.geometry.coordinates);
  return [mnx, mny, mxx, mxy];
}
function polyCentroid(feat) { const b = featBBox(feat); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }

function onClick(feat) {
  if (!feat) return;
  const iso = isoOf(feat.properties);
  state.selected = iso;
  refreshGlobe();
  showDetail(iso, feat);
  const [lng, lat] = polyCentroid(feat);
  if (globe) { globe.controls().autoRotate = false; globe.pointOfView({ lat, lng, altitude: 1.7 }, 800); }
  spinOn = false; syncSpin();
}

const detailCard = document.getElementById('detailCard');
function showDetail(iso, feat) {
  const rec = iso && DATA[iso];
  document.getElementById('detailFlag').textContent = flagEmoji(iso);
  document.getElementById('detailName').textContent = nameOf(iso, feat);
  document.getElementById('detailEra').textContent = STEPS[state.stepIdx].label;
  const comp = compAtYear(rec, curYear());
  let bk = comp ? breakdownHTML(comp) : `<div class="tt-nd">No data for this era.</div>`;
  if (state.lens && comp) { const m = lensMetric(iso, curYear()); if (m) bk = `<div class="detail-lens"><span class="dl-k">${LENS_META[state.lens].label}</span><span class="dl-v">${m.label}</span></div>` + bk; }
  document.getElementById('detailBreakdown').innerHTML = bk;
  document.getElementById('detailTrend').innerHTML = rec ? trendChartSVG(rec) : '';
  const noteEl = document.getElementById('detailNote');
  noteEl.textContent = (rec && rec.note) ? rec.note : '';
  noteEl.style.display = (rec && rec.note) ? '' : 'none';
  detailCard.classList.remove('hidden');
}
function closeDetail() { detailCard.classList.add('hidden'); state.selected = null; refreshGlobe(); if (state.flat) syncFlatSelection(); }
document.getElementById('detailClose').addEventListener('click', closeDetail);

/* -------------------- global (world) breakdown box -------------------- */
/* Population-weighted share of world speakers per language at the active year.
   Weights use each country's population (Natural Earth POP_EST); for pre-modern
   eras that's a present-day-population proxy — the dataset is illustrative. */
const popMap = {};
function buildPopMap() {
  for (const f of countries) {
    const iso = isoOf(f.properties);
    if (!iso) continue;
    popMap[iso] = (popMap[iso] || 0) + (Number(f.properties.POP_EST) || 0);
  }
}
function globalBreakdown(year) {
  const tot = {}; let total = 0;
  for (const iso in DATA) {
    const comp = compAtYear(DATA[iso], year);
    if (!comp) continue;
    const pop = popMap[iso] || 0;
    if (pop <= 0) continue;
    const s = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
    for (const k in comp) { const adh = pop * (comp[k] / s); tot[k] = (tot[k] || 0) + adh; total += adh; }
  }
  if (total <= 0) return [];
  return Object.entries(tot).map(([k, v]) => ({ key: k, pct: v / total * 100 })).sort((a, b) => b.pct - a.pct);
}
function updateGlobalBox() {
  const yEl = document.getElementById('gbYear'); if (!yEl) return;
  yEl.textContent = STEPS[state.stepIdx].label;
  const gbBar = document.getElementById('gbBar'), gbRows = document.getElementById('gbRows'), lensLeg = document.getElementById('lensLegend');
  if (state.lens) {                                  // lens active → gradient legend instead of the language list
    gbBar.classList.add('hidden'); gbRows.classList.add('hidden');
    if (lensLeg) { lensLeg.classList.remove('hidden'); lensLeg.innerHTML = lensLegendHTML(); }
    return;
  }
  if (lensLeg) lensLeg.classList.add('hidden');
  gbBar.classList.remove('hidden'); gbRows.classList.remove('hidden');
  const bd = globalBreakdown(curYear()).filter(r => r.pct >= 0.1);
  document.getElementById('gbBar').innerHTML = bd.map(r => `<span style="width:${r.pct.toFixed(2)}%;background:${langColor(r.key)}"></span>`).join('');
  document.getElementById('gbRows').innerHTML = bd.map(r =>
    `<div class="gb-row${r.key === state.focus ? ' active' : ''}" data-key="${r.key}" title="Highlight ${langLabel(r.key)} on the map">` +
    `<span class="gb-sw" style="background:${langColor(r.key)}"></span>` +
    `<span class="gb-l">${langLabel(r.key)}</span><span class="gb-v">${r.pct.toFixed(1)}%</span></div>`).join('');
}

/* ============================ flat 2D map ============================ */
/* Equirectangular SVG map: each country fills proportionally with crisp stacked
   bands (a stacked bar clipped to its shape) — the clean medium for "fill from
   the bottom". Toggled with the globe via the 🗺 button. */
const FW = 2000, FH = 1000;
const fpx = lng => (lng + 180) / 360 * FW;
const fpy = lat => (90 - lat) / 180 * FH;
function flatPathD(f) {
  let d = '';
  for (const poly of geomOf(f)) for (const ring of poly) d += 'M' + ring.map(p => fpx(p[0]).toFixed(1) + ',' + fpy(p[1]).toFixed(1)).join('L') + 'Z';
  return d;
}
let flatBuilt = false;
const flatMeta = {};
function buildFlatMap() {
  if (flatBuilt) return;
  const svg = document.getElementById('flatViz');
  svg.setAttribute('viewBox', '0 0 ' + FW + ' ' + FH);
  let defs = '<defs>', fills = '', hits = '';
  for (const f of countries) {
    const iso = isoOf(f.properties);
    if (!iso || !DATA[iso] || flatMeta[iso]) continue;
    const d = flatPathD(f), bb = featBBox(f);
    flatMeta[iso] = { x0: fpx(bb[0]), x1: fpx(bb[2]), yTop: fpy(bb[3]), yBot: fpy(bb[1]) };
    defs += '<clipPath id="fcp-' + iso + '"><path d="' + d + '"/></clipPath>';
    fills += '<g class="fcell" data-iso="' + iso + '" clip-path="url(#fcp-' + iso + ')"></g>';
    hits += '<path class="flat-hit" data-iso="' + iso + '" d="' + d + '"/>';
  }
  svg.innerHTML = defs + '</defs><rect class="flat-ocean" width="' + FW + '" height="' + FH + '"/><g>' + fills + '</g><g>' + hits + '</g>';
  svg.querySelectorAll('.flat-hit').forEach(el => {
    const iso = el.dataset.iso;
    el.addEventListener('mousemove', e => flatHover(iso, e));
    el.addEventListener('mouseleave', () => { state.hovered = null; tooltip.classList.add('hidden'); });
    el.addEventListener('click', () => { if (flatPanned) return; state.selected = iso; showDetail(iso, countries.find(c => isoOf(c.properties) === iso)); syncFlatSelection(); });
  });
  initFlatInteract();
  flatBuilt = true;
}
function updateFlatBands() {
  if (!flatBuilt) return;
  const year = curYear();
  for (const iso in flatMeta) {
    const g = document.querySelector('.fcell[data-iso="' + iso + '"]');
    if (!g) continue;
    const comp = compAtYear(DATA[iso], year), m = flatMeta[iso], W = m.x1 - m.x0, H = m.yBot - m.yTop;
    if (!comp) { g.innerHTML = ''; continue; }
    if (state.lens) {
      const col = lensColor(iso, year, iso === state.selected, false);
      g.innerHTML = col ? '<rect x="' + m.x0 + '" y="' + m.yTop + '" width="' + W + '" height="' + H + '" fill="' + col + '"/>' : '';
      continue;
    }
    if (state.focus) {
      const col = hexA(langColor(state.focus), 0.08 + 0.9 * ((comp[state.focus] || 0) / 100));
      g.innerHTML = '<rect x="' + m.x0 + '" y="' + m.yTop + '" width="' + W + '" height="' + H + '" fill="' + col + '"/>';
      continue;
    }
    const parts = orderKeys().filter(k => (comp[k] || 0) > 0);
    const total = parts.reduce((s, k) => s + comp[k], 0) || 1;
    let cum = 0, rects = '';
    for (const k of parts) {                       // stack from the bottom (south) up
      const h = comp[k] / total * H;
      rects += '<rect x="' + m.x0.toFixed(1) + '" y="' + (m.yBot - cum - h).toFixed(1) + '" width="' + W.toFixed(1) + '" height="' + (h + 0.6).toFixed(1) + '" fill="' + langColor(k) + '"/>';
      cum += h;
    }
    g.innerHTML = rects;
  }
  syncFlatSelection();
}
// Outline the selected country on the flat map (so search / click shows where you landed).
function syncFlatSelection() {
  if (!flatBuilt) return;
  document.querySelectorAll('.flat-hit').forEach(el => el.classList.toggle('sel', el.dataset.iso === state.selected));
}
function flatHover(iso, e) {
  if (flatDragging) return;
  state.hovered = iso;
  const feat = countries.find(c => isoOf(c.properties) === iso), comp = compAtYear(DATA[iso], curYear());
  const head = '<div class="tt-head"><span class="tt-flag">' + flagEmoji(iso) + '</span><span class="tt-name">' + nameOf(iso, feat) + '</span><span class="tt-era">' + STEPS[state.stepIdx].label + '</span></div>';
  if (!comp) tooltip.innerHTML = head + '<div class="tt-nd">No data for this era</div>';
  else { const maj = majorityOf(comp); tooltip.innerHTML = head + '<div class="tt-maj"><span class="tt-dot" style="background:' + langColor(maj.key) + '"></span>' + langLabel(maj.key) + ' · ' + Math.round(maj.pct) + '%</div>' + hoverBodyHTML(comp); }
  tooltip.classList.remove('hidden');
  tooltip.style.left = e.clientX + 'px'; tooltip.style.top = e.clientY + 'px';
}

/* ---- flat-map zoom + pan (SVG viewBox) ---- */
const flatView = { x: 0, y: 0, w: FW, h: FH };
let flatDragging = false, flatPanned = false;
function applyFlatView() {
  const svg = document.getElementById('flatViz');
  if (svg) svg.setAttribute('viewBox', flatView.x.toFixed(1) + ' ' + flatView.y.toFixed(1) + ' ' + flatView.w.toFixed(1) + ' ' + flatView.h.toFixed(1));
}
function clampFlatView() {
  flatView.w = Math.max(FW / 16, Math.min(FW, flatView.w));   // up to 16× zoom
  flatView.h = flatView.w * (FH / FW);                        // lock the 2:1 aspect
  flatView.x = Math.max(0, Math.min(FW - flatView.w, flatView.x));
  flatView.y = Math.max(0, Math.min(FH - flatView.h, flatView.y));
}
function resetFlatView() { flatView.x = 0; flatView.y = 0; flatView.w = FW; flatView.h = FH; applyFlatView(); }
function flatClientToSvg(cx, cy) {
  const svg = document.getElementById('flatViz'), r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / flatView.w, r.height / flatView.h);   // preserveAspectRatio=meet
  return { x: flatView.x + (cx - r.left - (r.width - flatView.w * scale) / 2) / scale,
           y: flatView.y + (cy - r.top - (r.height - flatView.h * scale) / 2) / scale };
}
let flatInteractBound = false;
function initFlatInteract() {
  if (flatInteractBound) return;
  const svg = document.getElementById('flatViz');
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = flatClientToSvg(e.clientX, e.clientY);
    const nw = Math.max(FW / 16, Math.min(FW, flatView.w * (e.deltaY < 0 ? 0.84 : 1 / 0.84))), k = nw / flatView.w;
    flatView.x = p.x - (p.x - flatView.x) * k;
    flatView.y = p.y - (p.y - flatView.y) * k;
    flatView.w = nw;
    clampFlatView(); applyFlatView();
  }, { passive: false });
  svg.addEventListener('mousedown', e => {
    flatDragging = true; flatPanned = false;
    svg.style.cursor = 'grabbing'; tooltip.classList.add('hidden');
    const r = svg.getBoundingClientRect(), scale = Math.min(r.width / flatView.w, r.height / flatView.h);
    const sx = e.clientX, sy = e.clientY, ox = flatView.x, oy = flatView.y;
    const move = ev => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) flatPanned = true;
      flatView.x = ox - (ev.clientX - sx) / scale; flatView.y = oy - (ev.clientY - sy) / scale;
      clampFlatView(); applyFlatView();
    };
    const up = () => {
      flatDragging = false; svg.style.cursor = '';
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      setTimeout(() => { flatPanned = false; }, 30);   // let the country click handler see flatPanned first
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });
  flatInteractBound = true;
}

/* ------------------------------ time slider ------------------------------ */
const slider = document.getElementById('timeSlider');
const eraLabel = document.getElementById('eraLabel');
const eraBadge = document.getElementById('eraBadge');
function applySlice() {
  const s = STEPS[state.stepIdx];
  slider.value = state.stepIdx;
  eraLabel.textContent = s.label;
  eraBadge.textContent = ERA_BADGE[s.era] || s.era;
  eraBadge.className = 'era-badge era-' + s.era;
  document.body.classList.toggle('is-future', s.era === 'future');
  if (state.flat) updateFlatBands(); else { rebuildBands(); refreshDots(); }
  updateGlobalBox();
  if (state.selected) { const f = countries.find(c => isoOf(c.properties) === state.selected); showDetail(state.selected, f); }
}
slider.min = 0; slider.max = Math.max(0, STEPS.length - 1); slider.step = 1;
slider.addEventListener('input', () => { state.stepIdx = +slider.value; stopPlay(); applySlice(); });
document.getElementById('prevEra').addEventListener('click', () => { state.stepIdx = Math.max(0, state.stepIdx - 1); stopPlay(); applySlice(); });
document.getElementById('nextEra').addEventListener('click', () => { state.stepIdx = Math.min(STEPS.length - 1, state.stepIdx + 1); stopPlay(); applySlice(); });
document.getElementById('nowBtn').addEventListener('click', () => { state.stepIdx = nearestStep(TODAY_YEAR); stopPlay(); applySlice(); });

const playBtn = document.getElementById('playBtn');
const playRevBtn = document.getElementById('playRevBtn');
function syncPlayBtns() {
  const fwd = state.playing && state.playDir > 0, rev = state.playing && state.playDir < 0;
  playBtn.textContent = fwd ? '⏸' : '▶'; playBtn.classList.toggle('on', fwd);
  playRevBtn.textContent = rev ? '⏸' : '◀'; playRevBtn.classList.toggle('on', rev);
}
function stopPlay() {
  state.playing = false;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  syncPlayBtns();
  if (globe) globe.controls().autoRotate = spinOn;
}
function startPlay(dir) {
  state.playDir = dir;
  if (dir > 0 && state.stepIdx >= STEPS.length - 1) state.stepIdx = 0;        // forward → wrap to the start
  if (dir < 0 && state.stepIdx <= 0) state.stepIdx = STEPS.length - 1;        // backward → wrap to the end
  state.playing = true; syncPlayBtns();
  if (globe) globe.controls().autoRotate = false;
  applySlice();
  playTimer = setInterval(() => {
    const next = state.stepIdx + state.playDir;
    if (next < 0 || next >= STEPS.length) { stopPlay(); return; }
    state.stepIdx = next; applySlice();
  }, 700);
}
playBtn.addEventListener('click', () => { if (state.playing && state.playDir > 0) stopPlay(); else { stopPlay(); startPlay(1); } });
playRevBtn.addEventListener('click', () => { if (state.playing && state.playDir < 0) stopPlay(); else { stopPlay(); startPlay(-1); } });

/* -------------------------------- legend -------------------------------- */
// World-panel rows are the population-weighted language breakdown, rebuilt per-year in
// updateGlobalBox(). Clicking a row highlights that language on the map (focus mode).
function initWorldBox() {
  document.getElementById('gbRows').addEventListener('click', e => {
    const row = e.target.closest('.gb-row');
    if (row && row.dataset.key) setFocus(row.dataset.key);
  });
}
function setFocus(key) {
  if (state.lens) { state.lens = null; syncLensChips(); }     // language focus and a lens are mutually exclusive
  state.focus = (state.focus === key) ? null : key;
  document.body.classList.toggle('focus-on', !!state.focus);
  const fb = document.getElementById('focusBanner');
  if (state.focus) { fb.innerHTML = `Showing share of <b style="color:${langColor(state.focus)}">${langLabel(state.focus)}</b> &nbsp;·&nbsp; <span class="fb-x">clear ✕</span>`; fb.classList.remove('hidden'); }
  else fb.classList.add('hidden');
  updateGlobalBox();
  if (state.flat) updateFlatBands(); else { rebuildBands(); refreshDots(); }
}

/* ------------------------------- menu (burger) ------------------------------- */
const VIEW_ORDER = ['shade', 'dots', 'solid'];   // 'bands' lives on the flat map (it greys-out on the 3D globe)
const VIEW_LABEL = { shade: 'Shade', dots: 'Dots', solid: 'Solid' };
function setView(v) {
  state.view = v;
  const t = document.querySelector('#miFill .mi-tx'); if (t) t.textContent = 'Fill: ' + VIEW_LABEL[v];
  rebuildBands(); refreshDots();
}
// Globe <-> flat map. Globe-only menu items (fill, auto-rotate) hide in flat mode.
function setFlat(flat) {
  state.flat = flat;
  document.getElementById('flatViz').classList.toggle('hidden', !flat);
  elViz.classList.toggle('hidden', flat);
  const mv = document.getElementById('miView');
  mv.querySelector('.mi-ic').textContent = flat ? '🌐' : '🗺';
  mv.querySelector('.mi-tx').textContent = flat ? 'Globe view' : 'Flat map';
  document.querySelectorAll('.mi-globe').forEach(el => el.classList.toggle('hidden', flat));
  if (flat) {
    buildFlatMap(); updateFlatBands();
    try { if (!localStorage.getItem('wre_seen_flat_tip') && document.getElementById('tutorial').classList.contains('hidden')) showFlatTip(); } catch (e) {}
  } else { rebuildBands(); refreshDots(); }
}
// Family view: roll languages up to their phylum (Indo-European, Afroasiatic, …) and back.
function setFamily(on) {
  state.byFamily = on;
  if (state.focus) {                              // a language/phylum focus won't exist across views — clear it
    state.focus = null;
    document.body.classList.remove('focus-on');
    document.getElementById('focusBanner').classList.add('hidden');
  }
  const mf = document.getElementById('miFamily');
  if (mf) { mf.classList.toggle('on', on); const st = mf.querySelector('.mi-state'); if (st) st.textContent = on ? 'On' : 'Off'; }
  const note = document.querySelector('#legendBox .gb-note');
  if (note) note.innerHTML = on
    ? 'Click a family to highlight it &middot; % of world speakers by family'
    : 'Click a language to highlight it &middot; % of world native speakers (approx.)';
  applySlice();
  refreshPies();
}

const menu = document.getElementById('menu'), menuBtn = document.getElementById('menuBtn');
const closeMenu = () => menu.classList.add('hidden');
menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
document.addEventListener('click', e => { if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });

document.getElementById('miView').addEventListener('click', () => { setFlat(!state.flat); closeMenu(); });
document.getElementById('miFamily').addEventListener('click', () => { setFamily(!state.byFamily); closeMenu(); });
document.getElementById('lensChips').addEventListener('click', e => { const c = e.target.closest('.lens-chip'); if (c) setLens(c.dataset.lens); });
document.getElementById('miFill').addEventListener('click', () => { const i = VIEW_ORDER.indexOf(state.view); setView(VIEW_ORDER[(i + 1) % VIEW_ORDER.length]); });
setView(state.view);

const miSpin = document.getElementById('miSpin');
function syncSpin() { const s = miSpin.querySelector('.mi-state'); if (s) s.textContent = spinOn ? 'On' : 'Off'; miSpin.classList.toggle('on', spinOn); }
miSpin.addEventListener('click', () => { spinOn = !spinOn; if (globe && !state.playing) globe.controls().autoRotate = spinOn; syncSpin(); });
syncSpin();

document.getElementById('miReset').addEventListener('click', () => {
  closeDetail();
  if (state.flat) resetFlatView();
  if (globe) globe.pointOfView({ lat: 20, lng: 10, altitude: 2.3 }, 700);
  closeMenu();
});
document.getElementById('miFull').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen();
  closeMenu();
});
document.getElementById('miHelp').addEventListener('click', () => { closeMenu(); if (state.flat) showFlatTip(); else showTutorial(); });

const aboutOverlay = document.getElementById('aboutOverlay');
document.getElementById('miAbout').addEventListener('click', () => { closeMenu(); aboutOverlay.classList.remove('hidden'); });
document.getElementById('aboutClose').addEventListener('click', () => aboutOverlay.classList.add('hidden'));
aboutOverlay.addEventListener('click', e => { if (e.target === aboutOverlay) aboutOverlay.classList.add('hidden'); });

document.getElementById('focusBanner').addEventListener('click', () => { if (state.focus) setFocus(state.focus); });
document.getElementById('detailTrend').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect(); if (!r.width) return;
  const ai = Math.max(0, Math.min(SLICES.length - 1, Math.round(((e.clientX - r.left) / r.width) * (SLICES.length - 1))));
  state.stepIdx = nearestStep(yr(SLICES[ai].id)); stopPlay(); applySlice();
});

/* ----------------------------- first-run tutorial ----------------------------- */
function showTutorial() { const t = document.getElementById('tutorial'); if (t) t.classList.remove('hidden'); }
function closeTutorial() {
  const t = document.getElementById('tutorial'); if (!t || t.classList.contains('hidden')) return;
  t.classList.add('hidden'); try { localStorage.setItem('wre_seen_tutorial', '1'); } catch (e) {}
}
document.getElementById('tutStart').addEventListener('click', closeTutorial);
document.getElementById('tutorial').addEventListener('click', e => { if (e.target.id === 'tutorial') closeTutorial(); });
function showFlatTip() { const t = document.getElementById('flatTip'); if (t) t.classList.remove('hidden'); }
function closeFlatTip() { const t = document.getElementById('flatTip'); if (!t || t.classList.contains('hidden')) return; t.classList.add('hidden'); try { localStorage.setItem('wre_seen_flat_tip', '1'); } catch (e) {} }
document.getElementById('ftStart').addEventListener('click', closeFlatTip);
document.getElementById('flatTip').addEventListener('click', e => { if (e.target.id === 'flatTip') closeFlatTip(); });

/* ------------------------------- search + share ------------------------------- */
function gotoCountry(iso) {
  const f = countries.find(c => isoOf(c.properties) === iso);
  if (!f) return;
  if (state.flat) {
    state.selected = iso; showDetail(iso, f); syncFlatSelection();
    const m = flatMeta[iso];
    if (m) {
      const cx = (m.x0 + m.x1) / 2, cy = (m.yTop + m.yBot) / 2;
      flatView.w = Math.max(FW / 11, Math.min(FW, (m.x1 - m.x0) * 3 + 50));
      flatView.h = flatView.w * (FH / FW);
      flatView.x = cx - flatView.w / 2; flatView.y = cy - flatView.h / 2;
      clampFlatView(); applyFlatView();
    }
  } else { onClick(f); }
}
const searchEl = document.getElementById('search'), searchRes = document.getElementById('searchResults');
let searchHits = [];
function runSearch() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { searchRes.classList.add('hidden'); searchHits = []; return; }
  searchHits = Object.keys(DATA).map(iso => ({ iso, n: DATA[iso].n }))
    .filter(c => c.n.toLowerCase().includes(q))
    .sort((a, b) => a.n.toLowerCase().indexOf(q) - b.n.toLowerCase().indexOf(q) || a.n.localeCompare(b.n))
    .slice(0, 8);
  if (!searchHits.length) { searchRes.innerHTML = '<div class="sr-none">No match</div>'; searchRes.classList.remove('hidden'); return; }
  searchRes.innerHTML = searchHits.map((c, i) =>
    `<div class="sr-item${i === 0 ? ' sel' : ''}" data-iso="${c.iso}"><span class="sr-flag">${flagEmoji(c.iso)}</span>${c.n}</div>`).join('');
  searchRes.classList.remove('hidden');
}
function pickSearch(iso) {
  if (!iso && searchHits.length) iso = searchHits[0].iso;
  if (!iso) return;
  gotoCountry(iso);
  searchEl.value = ''; searchRes.classList.add('hidden'); searchHits = []; searchEl.blur();
}
searchEl.addEventListener('input', runSearch);
searchEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); pickSearch(); }
  else if (e.key === 'Escape') { searchEl.value = ''; searchRes.classList.add('hidden'); searchEl.blur(); }
});
searchRes.addEventListener('click', e => { const it = e.target.closest('.sr-item'); if (it) pickSearch(it.dataset.iso); });
document.addEventListener('click', e => { if (!document.getElementById('searchWrap').contains(e.target)) searchRes.classList.add('hidden'); });

function buildShareURL() {
  const seg = [curYear(), state.focus || '', state.selected || ''];
  if (state.byFamily) seg.push('family');
  if (state.lens) seg.push('lens=' + state.lens);
  if (state.flat) seg.push('flat');
  while (seg.length > 1 && seg[seg.length - 1] === '') seg.pop();
  return location.origin + location.pathname + '#' + seg.join(',');
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); cb(); } catch (e) {} document.body.removeChild(ta);
}
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1900);
}
document.getElementById('miShare').addEventListener('click', () => {
  closeMenu();
  const url = buildShareURL(), done = () => showToast('🔗 Link to this view copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  else fallbackCopy(url, done);
});
// "Share this view" emits chrome-extension:// links inside the packaged extension (only
// installed users can open them) — hide it there. It stays on the standalone web build
// (42-apps.github.io/worldlanguages/app/…), where buildShareURL() makes public https links.
if (location.protocol === 'chrome-extension:') {
  const sh = document.getElementById('miShare'); if (sh) sh.remove();
}

/* ------------------------------- world trend chart ------------------------------- */
function worldTrendSVG() {
  const W = 760, H = 320, padT = 8, padB = 26, n = SLICES.length;
  const xAt = i => (i / (n - 1)) * W;
  const yAt = v => padT + (1 - v / 100) * (H - padT - padB);
  const cols = SLICES.map(s => { const o = {}; for (const r of globalBreakdown(yr(s.id))) o[r.key] = r.pct; return o; });
  const cum = SLICES.map(() => 0);
  let bands = '';
  for (const k of orderKeys()) {                 // fixed language order → stable stacked bands
    let any = false; const tops = [], bots = [];
    for (let i = 0; i < n; i++) {
      const v = cols[i][k] || 0; if (v > 0.05) any = true;
      tops.push(`${xAt(i).toFixed(1)},${yAt(cum[i] + v).toFixed(1)}`);
      bots.push([i, cum[i]]); cum[i] += v;
    }
    if (!any) continue;
    const bot = bots.reverse().map(p => `${xAt(p[0]).toFixed(1)},${yAt(p[1]).toFixed(1)}`);
    bands += `<polygon points="${tops.concat(bot).join(' ')}" fill="${langColor(k)}" opacity="0.92"/>`;
  }
  const labs = ['-3000', '1', '1000', '1500', '1900', '2020', '2100'].map(id => {
    const i = SLICE_INDEX[id]; if (i == null) return '';
    const x = xAt(i), anc = x < 40 ? 'start' : x > W - 40 ? 'end' : 'middle', tx = anc === 'start' ? 3 : anc === 'end' ? W - 3 : x;
    return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${H - padB}" stroke="rgba(255,255,255,.07)"/>` +
      `<text x="${tx.toFixed(1)}" y="${H - 8}" font-size="11" fill="#9aa7c0" text-anchor="${anc}">${SLICES[i].label}</text>`;
  }).join('');
  const mx = xAt(anchorXFrac(curYear()));
  const marker = `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${H - padB}" stroke="#fff" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="wt-svg">${bands}${labs}${marker}</svg>`;
}
function worldTrendLegend() {
  const present = new Set();
  for (const s of SLICES) for (const r of globalBreakdown(yr(s.id))) if (r.pct > 0.3) present.add(r.key);
  return orderKeys().filter(k => present.has(k)).map(k =>
    `<span class="wt-li"><span class="wt-sw" style="background:${langColor(k)}"></span>${langLabel(k)}</span>`).join('');
}
function showWorldTrend() {
  document.getElementById('wtChart').innerHTML = worldTrendSVG();
  document.getElementById('wtLegend').innerHTML = worldTrendLegend();
  document.getElementById('worldTrend').classList.remove('hidden');
}
function closeWorldTrend() { document.getElementById('worldTrend').classList.add('hidden'); }
document.getElementById('miTrend').addEventListener('click', () => { closeMenu(); showWorldTrend(); });
document.getElementById('wtClose').addEventListener('click', closeWorldTrend);
document.getElementById('worldTrend').addEventListener('click', e => { if (e.target.id === 'worldTrend') closeWorldTrend(); });
document.getElementById('wtChart').addEventListener('click', e => {
  const svg = e.currentTarget.querySelector('svg'); if (!svg) return;
  const r = svg.getBoundingClientRect(); if (!r.width) return;
  const i = Math.max(0, Math.min(SLICES.length - 1, Math.round(((e.clientX - r.left) / r.width) * (SLICES.length - 1))));
  state.stepIdx = nearestStep(yr(SLICES[i].id)); stopPlay(); applySlice(); showWorldTrend();
});

/* ------------------------------- guided stories ------------------------------- */
/* Each step is a deep-link hash + a caption; stepping just applies that view state.
   Rides entirely on the existing time / focus / family / lens machinery. */
const STORIES = [
  { id: 'latin', title: 'The fall of Latin', blurb: 'Rome’s tongue and the birth of the Romance languages.', steps: [
    { hash: '1,latin',     text: 'At its height (1 CE), Latin is the everyday language of Rome and its western provinces — Italy, Iberia, Gaul, North Africa.' },
    { hash: '500,latin',   text: 'Rome falls in 476, but spoken Latin lives on across the former empire as ordinary speech.' },
    { hash: '1000,latin',  text: 'By 1000 that spoken Latin has splintered into local “vulgar” dialects — no longer one language.' },
    { hash: '1500,french', text: 'Those dialects are now distinct tongues. Latin’s daughters — French, Spanish, Italian, Portuguese, Romanian — rule its old lands.' },
  ]},
  { id: 'arabic', title: 'Arabic’s expansion', blurb: 'From a corner of Arabia to three continents.', steps: [
    { hash: '500,arabic',  text: '500 CE: Arabic is spoken almost only across the Arabian Peninsula.' },
    { hash: '750,arabic',  text: 'After the early Islamic conquests, Arabic sweeps the Near East and North Africa within a century.' },
    { hash: '1500,arabic', text: 'It is now entrenched as the language of faith, law and trade across the region.' },
    { hash: '2025,arabic', text: 'Today Arabic is the primary language of around a dozen nations.' },
  ]},
  { id: 'colonial', title: 'The colonial tongues', blurb: 'How a few European languages crossed the oceans.', steps: [
    { hash: '1500,spanish', text: '1500: Spanish is confined to a newly-unified Iberia.' },
    { hash: '1800,spanish', text: 'Three centuries of empire plant Spanish across the Americas.' },
    { hash: '1900,english', text: 'Meanwhile English, carried by the British Empire, is becoming a global tongue.' },
    { hash: '2025,english', text: 'Today English is an official or primary language on every inhabited continent.' },
  ]},
  { id: 'indoeuropean', title: 'The Indo-European story', blurb: 'One ancient family, half the world.', steps: [
    { hash: '1,,,family',    text: 'In Family view the deep kinship shows: by 1 CE one family already stretches from Iberia to India.' },
    { hash: '1500,,,family', text: 'Branch by branch — Romance, Germanic, Slavic, Indo-Aryan, Iranian — Indo-European dominates Europe and South Asia.' },
    { hash: '2025,,,family', text: 'Today nearly half of humanity speaks an Indo-European language as its mother tongue.' },
  ]},
  { id: 'ghosts', title: 'Ghosts of antiquity', blurb: 'Where the classical tongues once ruled.', steps: [
    { hash: '1,,,lens=classical',    text: 'The Classical lens at 1 CE: Latin, Aramaic, Sanskrit and the Sumerian-Akkadian sphere blaze across the Old World.' },
    { hash: '500,,,lens=classical',  text: 'By 500 CE the classical tongues are fading as living everyday speech.' },
    { hash: '1500,,,lens=classical', text: 'By 1500 they survive mostly in scripture and scholarship — Latin in the church, Sanskrit in temple and text.' },
  ]},
];
let story = null, storyIdx = 0;
function applyStoryStep(hash) {
  const parts = (hash || '').replace(/^#/, '').split(',').map(s => s.trim());
  const sid = parts[0], foc = parts[1] || '';
  const lm = hash.match(/lens=(\w+)/);
  if (sid) { const y = yr(sid); if (!isNaN(y)) state.stepIdx = nearestStep(y); }
  state.byFamily = /family/i.test(hash);
  state.lens = (lm && LENS_META[lm[1]]) ? lm[1] : null;
  state.focus = (!state.lens && foc && (LANGUAGES[foc] || PHYLA[foc])) ? foc : null;
  if (/flat/i.test(hash)) { if (!state.flat) setFlat(true); } else if (state.flat) setFlat(false);
  // sync the toggles' UI to the freshly-set state
  syncLensChips();
  const mf = document.getElementById('miFamily'); if (mf) { mf.classList.toggle('on', state.byFamily); const s = mf.querySelector('.mi-state'); if (s) s.textContent = state.byFamily ? 'On' : 'Off'; }
  document.body.classList.toggle('focus-on', !!state.focus);
  const fb = document.getElementById('focusBanner');
  if (state.focus) { fb.innerHTML = `Showing share of <b style="color:${langColor(state.focus)}">${langLabel(state.focus)}</b> &nbsp;·&nbsp; <span class="fb-x">clear ✕</span>`; fb.classList.remove('hidden'); } else fb.classList.add('hidden');
  if (globe && !state.flat) { globe.controls().autoRotate = false; spinOn = false; syncSpin(); }
  applySlice(); refreshPies();
}
function openStoryPicker() {
  document.getElementById('storyList').innerHTML = STORIES.map(s =>
    `<button class="story-pick" data-id="${s.id}"><span class="sp-t">${s.title}</span><span class="sp-b">${s.blurb}</span></button>`).join('');
  document.getElementById('storyPicker').classList.remove('hidden');
}
function closeStoryPicker() { document.getElementById('storyPicker').classList.add('hidden'); }
function renderStoryStep() {
  if (!story) return;
  const st = story.steps[storyIdx];
  applyStoryStep(st.hash);
  document.getElementById('storyTitle').textContent = story.title;
  document.getElementById('storyText').textContent = st.text;
  document.getElementById('storyProg').textContent = (storyIdx + 1) + ' / ' + story.steps.length;
  document.getElementById('storyPrev').disabled = storyIdx === 0;
  document.getElementById('storyNext').textContent = storyIdx === story.steps.length - 1 ? 'Done ✓' : 'Next ▶';
}
function startStory(id) {
  story = STORIES.find(s => s.id === id); if (!story) return;
  storyIdx = 0; closeStoryPicker(); closeMenu();
  document.getElementById('storyBar').classList.remove('hidden');
  renderStoryStep();
}
function storyStep(d) {
  if (!story) return;
  if (d > 0 && storyIdx === story.steps.length - 1) { endStory(); return; }
  storyIdx = Math.max(0, Math.min(story.steps.length - 1, storyIdx + d));
  renderStoryStep();
}
function endStory() { story = null; document.getElementById('storyBar').classList.add('hidden'); }
document.getElementById('miStories').addEventListener('click', () => { closeMenu(); openStoryPicker(); });
document.getElementById('storyList').addEventListener('click', e => { const b = e.target.closest('.story-pick'); if (b) startStory(b.dataset.id); });
document.getElementById('storyPickClose').addEventListener('click', closeStoryPicker);
document.getElementById('storyPicker').addEventListener('click', e => { if (e.target.id === 'storyPicker') closeStoryPicker(); });
document.getElementById('storyPrev').addEventListener('click', () => storyStep(-1));
document.getElementById('storyNext').addEventListener('click', () => storyStep(1));
document.getElementById('storyExit').addEventListener('click', endStory);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenu(); closeTutorial(); closeFlatTip(); closeWorldTrend(); closeStoryPicker(); endStory(); aboutOverlay.classList.add('hidden'); if (state.focus) setFocus(state.focus); if (!detailCard.classList.contains('hidden')) closeDetail(); }
  else if (e.target && e.target.tagName === 'INPUT') return;   // don't scrub time while typing in search
  else if (e.key === 'ArrowRight') { state.stepIdx = Math.min(STEPS.length - 1, state.stepIdx + 1); stopPlay(); applySlice(); }
  else if (e.key === 'ArrowLeft') { state.stepIdx = Math.max(0, state.stepIdx - 1); stopPlay(); applySlice(); }
});
window.addEventListener('resize', sizeGlobe);

/* --------------------------------- boot --------------------------------- */
function boot() {
  // Deep-link: #<sliceId>[,<langKey>][,<ISO2>]  e.g. #1000  ·  #1,latin  ·  #1500,,FR
  const parts = decodeURIComponent((location.hash || '').slice(1)).split(',').map(s => s.trim());
  const sid = parts[0], foc = parts[1], iso = parts[2];
  if (sid) { const y = yr(sid); if (!isNaN(y)) state.stepIdx = nearestStep(y); }
  initWorldBox();
  applySlice();
  try { if (!localStorage.getItem('wre_seen_tutorial')) showTutorial(); } catch (e) {}
  fetch('data/countries.geojson').then(r => r.json()).then(geo => {
    initGlobe(geo);
    if (/family/i.test(location.hash)) setFamily(true);
    const lensM = (location.hash || '').match(/lens=(\w+)/);
    if (lensM && LENS_META[lensM[1]]) setLens(lensM[1]);
    if (foc && (LANGUAGES[foc] || PHYLA[foc])) setFocus(foc);
    if (iso) { const f = countries.find(c => isoOf(c.properties) === iso.toUpperCase()); if (f) onClick(f); }
    if (/flat/i.test(location.hash)) setFlat(true);
    if (/trend/i.test(location.hash)) showWorldTrend();
  }).catch(err => {
    console.error('geojson load failed', err);
    elViz.innerHTML = '<div style="color:#93a0c5;text-align:center;padding-top:40vh">Could not load map data.</div>';
  });
}
document.addEventListener('DOMContentLoaded', boot);
