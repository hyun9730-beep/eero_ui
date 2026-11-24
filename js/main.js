(function () {
  'use strict';
  var VARS = [
    { name: '주도적인 시간', en: 'Autonomy', hex: '#D2F05E', g: ['#A5DA32', '#DDF56E', '#F8F53D'], desc: '시간의 시작과 끝 배치를 내가 조정할 수 있는지 여부를 나타내요.' },
    { name: '선택할 수 있는 시간', en: 'Possibility', hex: '#4FD0CC', g: ['#1FC8C9', '#A6E4DE', '#A9E9C6'], desc: '현재 시간 안에서 내가 원하는 행동을 얼마나 선택할 수 있는가를 나타내요.' },
    { name: '일에서 벗어난 시간', en: 'Detachment', hex: '#B98CFF', g: ['#A27BFF', '#D9A6FF', '#D3BCFF'], desc: '현재 하지 않는 일이나 미래 일정에서 마음을 떼어둘 수 있는가를 나타내요.' },
    { name: '부담 없는 시간', en: 'Permission', hex: '#5FBDFF', g: ['#8C9BFF', '#5FBDFF', '#C3E3FF'], desc: '이 시간을 생산적으로 보내지 않아도 괜찮다고 느낄 수 있는가를 나타내요.' },
    { name: '방해 없는 시간', en: 'Protection', hex: '#F39B4A', g: ['#F4504F', '#F39B4A', '#FCC75E'], desc: '외부 요청에 의해 방해받을 가능성을 신경 쓰지 않아도 되는가를 나타내요.' }
  ];
  var DAYS = ['월', '화', '수', '목', '금', '토', '일'], DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var pills = [];
  var N = 5, MAXC = MODEL.MAXC, TAU = Math.PI * 2, NBMAX = 1024, MAXL = 112, GW = 2560, SHAPE0 = [0, 0, 0, 0, 0];
  var PATTERNS = {
    weekday: { shift: 0, spread: 1, gain: 1, base: 0.06 }, weekend: { shift: 2.2, spread: 1.25, gain: 0.9, base: 0.08 },
    quiet: { shift: 0, spread: 1, gain: 0.42, base: 0.04 }, surge: { shift: -0.8, spread: 1.35, gain: 1.45, base: 0.10 }
  };
  var UI = { lvl: [75, 75, 75, 75, 75], on: [true, true, true, true, true], merge: 14, soft: 55, size: 58, contrast: 70, speed: 35, flow: true, mode: 'line', seed: 0, seedPrev: 0 };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mapMerge(v) { return 2.0 + 4.0 * v / 100; }
  function mapSize(v) { return 0.6 + 0.8 * v / 100; }
  function hexRGB(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function hexToLab(hex) {
    var c = hexRGB(hex);
    function lin(x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }

  /* ---------- Springs ---------- */
  function sp(x, eps, k, z) { return { x: x, v: 0, t: x, eps: eps || 1e-4, k: k || 1, z: z || 0 }; }
  var P = { shift: sp(0), spread: sp(1), gain: sp(1), base: sp(0.06), lvl: UI.lvl.map(function (v) { return sp(v / 60); }),
            merge: sp(mapMerge(UI.merge), 1e-3), soft: sp(UI.soft / 100), size: sp(mapSize(UI.size)), contrast: sp(UI.contrast / 100),
            seedMix: sp(1, 1e-3, 0.8), tilt: sp(0.56, 1e-3, 0.7, 1) };
  var springs = [P.shift, P.spread, P.gain, P.base, P.merge, P.soft, P.size, P.contrast, P.seedMix, P.tilt].concat(P.lvl);
  function simulate(dt) {
    var w = 9 * (reduced ? 1.8 : 1), n = Math.max(1, Math.ceil(dt * 120)), h = dt / n, moving = false;
    for (var q = 0; q < springs.length; q++) {
      var s = springs[q];
      if (s.x === s.t && s.v === 0) continue;
      var wi = w * s.k, z = s.z || (reduced ? 1 : 0.74);
      for (var j = 0; j < n; j++) { var a = -wi * wi * (s.x - s.t) - 2 * z * wi * s.v; s.v += a * h; s.x += s.v * h; }
      if (Math.abs(s.x - s.t) < s.eps && Math.abs(s.v) < s.eps * 10) { s.x = s.t; s.v = 0; } else moving = true;
    }
    return moving;
  }

  /* ---------- Date ---------- */
  var D = new Date(); D.setHours(12, 0, 0, 0);
  function dayNum(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function weekStart(d) { var e = new Date(d); e.setDate(e.getDate() - ((e.getDay() + 6) % 7)); return e; }
  function refreshDate(anim) {
    var label;
    if (UI.mode === 'ring') {
      var a = weekStart(D), b = new Date(a); b.setDate(b.getDate() + 6);
      label = a.getFullYear() + '년 ' + (a.getMonth() + 1) + '월 ' + a.getDate() + '일 – ' + (a.getMonth() === b.getMonth() ? '' : (b.getMonth() + 1) + '월 ') + b.getDate() + '일';
    } else label = D.getFullYear() + '년 ' + (D.getMonth() + 1) + '월 ' + D.getDate() + '일 (' + DOW[D.getDay()] + ')';
    $('date').textContent = label;
    $('pick').value = D.getFullYear() + '-' + pad2(D.getMonth() + 1) + '-' + pad2(D.getDate());
    var key = UI.mode === 'ring' ? Math.floor(dayNum(weekStart(D)) / 7) * 3 + 1 : dayNum(D);
    if (key !== UI.seed) { UI.seedPrev = UI.seed; UI.seed = key; if (anim) { P.seedMix.x = 0; P.seedMix.v = 0; P.seedMix.t = 1; } }
    dirty = true; sigR = '';
  }
  function stepDate(n) {
    if (typeof clearSel === 'function') clearSel(); D.setDate(D.getDate() + n * (UI.mode === 'ring' ? 7 : 1)); refreshDate(true); }
  var dirty = true, sigR = '';
  $('prev').addEventListener('click', function () { stepDate(-1); });
  $('next').addEventListener('click', function () { stepDate(1); });
  $('pick').addEventListener('change', function () { var v = $('pick').value.split('-'); if (v.length === 3) { D = new Date(+v[0], +v[1] - 1, +v[2], 12); refreshDate(true); } });

  /* ---------- Controls ---------- */
  function fill(input) { input.style.setProperty('--pct', ((input.value - input.min) / (input.max - input.min) * 100) + '%'); }
  function slider(host, id, label, val, onChange, fmt, color, dot) {
    var d = document.createElement('div'); d.className = 'ctl'; if (color) d.style.setProperty('--c', color);
    d.innerHTML = '<div class="row"><label for="' + id + '">' + (dot ? '<i style="background:' + dot + '"></i>' : '') + label + '</label><output id="o' + id + '" for="' + id + '">' + val + '</output></div><input type="range" id="' + id + '" min="0" max="100" step="1" value="' + val + '">';
    $(host).appendChild(d);
    var inp = $(id), out = $('o' + id);
    function show() { out.textContent = fmt ? fmt(+inp.value) : inp.value; fill(inp); }
    inp.addEventListener('input', function () { onChange(+inp.value); show(); dirty = true; sigR = ''; });
    show();
  }
  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(32,36,62,.62)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYEOFF = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(32,36,62,.62)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
  VARS.forEach(function (v, k) {
    var b = document.createElement('button'); b.className = 'pill'; b.type = 'button'; b.setAttribute('aria-pressed', 'true');
    b.innerHTML = '<span class="dot" style="background:' + v.hex + '">' + EYE + '</span><span class="pt"><b>' + v.name + '</b><small>' + v.en + '</small></span>';
    b.addEventListener('click', function () { UI.on[k] = !UI.on[k]; b.classList.toggle('off', !UI.on[k]); b.setAttribute('aria-pressed', UI.on[k] ? 'true' : 'false'); b.firstChild.innerHTML = UI.on[k] ? EYE : EYEOFF; dirty = true; sigR = ''; });
    $('legend').appendChild(b); pills.push(b);
    slider('sl-lvl', 'v' + k, v.name, 75, function (x) { UI.lvl[k] = x; P.lvl[k].t = x / 60; }, null, v.hex === '#D2F05E' ? '#A5DA32' : v.hex, v.hex);
  });
  slider('sl-meta', 'merge', '병합 강도', UI.merge, function (x) { UI.merge = x; P.merge.t = mapMerge(x); });
  slider('sl-meta', 'soft', '가장자리 부드러움', UI.soft, function (x) { UI.soft = x; P.soft.t = x / 100; });
  slider('sl-meta', 'size', '블롭 크기', UI.size, function (x) { UI.size = x; P.size.t = mapSize(x); });
  slider('sl-meta', 'contrast', '크기 대비', UI.contrast, function (x) { UI.contrast = x; P.contrast.t = x / 100; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-pattern]'), function (b, _, all) {
    b.addEventListener('click', function () {
      var p = PATTERNS[b.getAttribute('data-pattern')];
      P.shift.t = p.shift; P.spread.t = p.spread; P.gain.t = p.gain; P.base.t = p.base;
      Array.prototype.forEach.call(all, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      dirty = true; sigR = '';
    });
  });
  function setFlow(v) { UI.flow = v; $('flowOn').setAttribute('aria-pressed', v ? 'true' : 'false'); $('flowOff').setAttribute('aria-pressed', v ? 'false' : 'true'); dirty = true; }
  $('flowOn').addEventListener('click', function () { setFlow(true); });
  $('flowOff').addEventListener('click', function () { setFlow(false); });
  $('shuffle').addEventListener('click', function () { UI.seedPrev = UI.seed; UI.seed += 1; P.seedMix.x = 0; P.seedMix.v = 0; P.seedMix.t = 1; dirty = true; sigR = ''; });
  $('gear').addEventListener('click', function () { openThemes(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { clearSel(); $('panel').hidden = true; $('gear').setAttribute('aria-expanded', 'false'); } });
  function setMode(m) {
    if (document.body.classList.contains('pulse')) { document.body.classList.remove('pulse'); pulseOn = false; clearInterval(pTick); cancelAnimationFrame(pRaf); }
    $('mPulse').setAttribute('aria-pressed', 'false');
    UI.mode = m; $('mLine').setAttribute('aria-pressed', m === 'line' ? 'true' : 'false'); $('mRing').setAttribute('aria-pressed', m === 'ring' ? 'true' : 'false');
    clearSel();
    $('panel').classList.toggle('ringfix', m === 'ring');
    $('legend').style.visibility = 'visible'; $('rail').style.visibility = m === 'line' ? 'visible' : 'hidden';
    if (m === 'ring') { try { if (!sessionStorage.getItem(HINT_KEY)) { sessionStorage.setItem(HINT_KEY, '1'); setTimeout(function () { toast('링을 길게 누른 채 끌면(또는 Shift+드래그) 구간을 선택해요'); }, 400); } } catch (_) {} }
    refreshDate(false); dirty = true;
  }
  /* ---------- Toast, Time Pulse placeholder, variable guide ---------- */
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  var helpBtn = document.createElement('button'); helpBtn.className = 'help'; helpBtn.type = 'button'; helpBtn.id = 'help'; helpBtn.textContent = '?'; helpBtn.setAttribute('aria-label', '변수 설명 보기'); helpBtn.setAttribute('aria-haspopup', 'dialog');
  $('legend').appendChild(helpBtn);
  $('vmCards').innerHTML = VARS.map(function (v) {
    return '<article class="card"><b>' + v.name + '</b><small>' + v.en + '</small><div class="sphere" style="background:radial-gradient(46% 30% at 50% 15%,' + v.g[0] + ' 0%,' + v.g[0] + '99 40%,rgba(255,255,255,0) 100%),radial-gradient(75% 62% at 50% 38%,' + v.g[1] + ' 0%,' + v.g[1] + ' 45%,' + v.g[2] + 'AA 100%),linear-gradient(180deg,rgba(255,255,255,0) 55%,rgba(255,255,255,.55) 100%)"></div><p>' + v.desc + '</p></article>';
  }).join('');
  var vm = $('vmodal'), scrim = $('scrim'), lastFocus = null;
  var glyphImgs = null;
  function makeGlyphImgs() {
    if (glyphImgs) return glyphImgs; glyphImgs = [];
    try { VARS.forEach(function (v, k) { var c = document.createElement('canvas'); c.width = 360; c.height = 360; var r = PE.makeDropGL(c); if (!r) throw 0; r([{ k: k, x: 180, y: 180, r: 105, q: 0 }], 3.2, { rx: -0.1, ry: 0.25 }, null); glyphImgs.push(c.toDataURL('image/png')); }); } catch (_) { glyphImgs = []; }
    return glyphImgs;
  }
  function paintGuideSpheres() {
    var gi = theme === 'shape' ? makeGlyphImgs() : [];
    Array.prototype.forEach.call(document.querySelectorAll('#vmCards .sphere'), function (sp, k) {
      var on = !!gi[k]; sp.classList.toggle('gl', on); sp.innerHTML = on ? '<img alt="" src="' + gi[k] + '">' : '';
    });
  }
  function openGuide() { paintGuideSpheres(); lastFocus = document.activeElement; clearSel(); scrim.classList.add('show'); vm.classList.add('show'); vm.setAttribute('aria-hidden', 'false'); helpBtn.setAttribute('aria-expanded', 'true'); setTimeout(function () { $('vmClose').focus(); }, 30); }
  function closeGuide() { if (!vm.classList.contains('show')) return; scrim.classList.remove('show'); vm.classList.remove('show'); vm.setAttribute('aria-hidden', 'true'); helpBtn.setAttribute('aria-expanded', 'false'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  helpBtn.addEventListener('click', openGuide); $('vmClose').addEventListener('click', closeGuide); scrim.addEventListener('click', closeGuide);
  document.addEventListener('keydown', function (e) {
    if (!vm.classList.contains('show')) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeGuide(); }
    else if (e.key === 'Tab') { e.preventDefault(); $('vmClose').focus(); }
  }, true);
  window.__guide = function (o) { if (o) openGuide(); else closeGuide(); };
  $('mLine').addEventListener('click', function () { setMode('line'); });
  $('mRing').addEventListener('click', function () { setMode('ring'); });

  /* ---------- WebGL 2 ---------- */
  var cv = $('cv'), axisCv = $('axis'), actx = axisCv.getContext('2d');
  var VERT = '#version 300 es\nin vec2 aPos;\nvoid main() { gl_Position = vec4(aPos, 0.0, 1.0); }\n';
  var FRAG = [
    '#version 300 es', 'precision highp float;', 'precision highp int;', 'precision highp sampler2D;',
    'uniform sampler2D uB;', 'uniform sampler2D uL;', 'uniform vec2 uRes;', 'uniform float uDpr;', 'uniform float uCS;', 'uniform int uGX;', 'uniform int uGY;',
    'uniform float uK;', 'uniform float uAA;', 'uniform vec3 uLab[5];', 'uniform vec3 uGC[5];', 'uniform vec3 uGM[5];', 'uniform vec3 uGB[5];', 'uniform float uSoftG;',
    'const int MAXL = ' + MAXL + ';', 'out vec4 outColor;', 'const float EPS = 0.001;', 'const vec2 LIGHT = vec2(-0.5547, -0.8321);',
    'vec3 labToLinear(vec3 c) {',
    '  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;', '  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;', '  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;',
    '  float l = l_ * l_ * l_; float m = m_ * m_ * m_; float s = s_ * s_ * s_;',
    '  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);',
    '}',
    'vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); vec3 lo = c * 12.92; vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055; return mix(hi, lo, step(c, vec3(0.0031308))); }',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;',
    '  int cx = clamp(int(p.x / uCS), 0, uGX - 1);', '  int cy = clamp(int(p.y / uCS), 0, uGY - 1);', '  int cell = cy * uGX + cx;',
    '  float Wr = 1.0 - 1.0 / (uK * uK); Wr *= Wr;',
    '  float F = 0.0; vec2 G = vec2(0.0); vec3 labSum = vec3(0.0); float chromaSum = 0.0; float wSum = 0.0; float rSum = 0.0;',
    '  for (int l = 0; l < MAXL; l++) {',
    '    float fid = texelFetch(uL, ivec2(cell, l), 0).r;',
    '    if (fid < -0.5) break;',
    '    int id = int(fid + 0.5);',
    '    vec4 d = texelFetch(uB, ivec2(id, 0), 0);',
    '    float r = d.z; int k = int(d.w + 0.5);',
    '    vec2 v = p - d.xy;',
    '    float d2 = dot(v, v) + EPS;',
    '    float Rc = r * uK;',
    '    float q = 1.0 - d2 / (Rc * Rc);',
    '    if (q <= 0.0) continue;',
    '    float f = (r * r / d2) * q * q / Wr;',
    '    F += f;',
    '    G -= ((r * r / Wr) * (2.0 * q * q / (d2 * d2) + 4.0 * q / (d2 * Rc * Rc))) * v;',
    '    float w = pow(f, 0.7);',
    '    vec2 u = v / r;',
    '    float yb = smoothstep(-0.1, 0.95, u.y);',
    '    vec3 g = mix(uGM[k], uGB[k], yb);',
    '    vec2 hq = (u - vec2(0.0, -0.5)) * vec2(0.78, 1.0);',
    '    float hs = 1.0 - smoothstep(0.0, 0.95, length(hq));',
    '    g = mix(g, uGC[k], hs * hs * (3.0 - 2.0 * hs));',
    '    labSum += w * g; chromaSum += w * length(g.yz); wSum += w; rSum += w * r;',
    '  }',
    '  if (wSum <= 0.0) { outColor = vec4(0.0); return; }',
    '  vec3 labOut = labSum / wSum;',
    '  float c0 = length(labOut.yz); float cT = chromaSum / wSum;',
    '  if (c0 > 0.0001) { labOut.yz *= mix(1.0, clamp(cT / c0, 1.0, 1.8), 0.7); }',
    '  vec3 rgb = toSRGB(labToLinear(labOut));',
    '  float Fs = max(F, 0.00000001); float h = inversesqrt(Fs);',
    '  float gh = 0.5 * length(G) / (Fs * sqrt(Fs));',
    '  float sdIn = (1.0 - h) / max(gh, 0.0001);',
    '  float sdOut = (F - 1.0) / max(length(G), 0.0001);',
    '  float sd = mix(sdOut, sdIn, step(1.0, F));',
    '  float aaE = max(uAA, uSoftG * rSum / wSum);',
    '  float a = smoothstep(-aaE, aaE, sd);',
    '  a = a * a * (3.0 - 2.0 * a);',
    '  outColor = vec4(rgb * a, a);',
    '}'
  ].join('\n');
  var gl = null, prog = null, loc = {}, texB, texL;
  var Tb = new Float32Array(NBMAX * 4), Tl = new Float32Array(GW * MAXL);
  var labBuf = new Float32Array(15), gcBuf = new Float32Array(15), gmBuf = new Float32Array(15), gbBuf = new Float32Array(15);
  VARS.forEach(function (v, q) { labBuf.set(hexToLab(v.hex), q * 3); gcBuf.set(hexToLab(v.g[0]), q * 3); gmBuf.set(hexToLab(v.g[1]), q * 3); gbBuf.set(hexToLab(v.g[2]), q * 3); });
  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); throw new Error('Shader compile failed'); }
    return s;
  }
  function mkTex(w, h, ifmt, fmt) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.FLOAT, null);
    return t;
  }
  function initGL() {
    gl = cv.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) return false;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return false; }
    } catch (e) { return false; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    ['uB', 'uL', 'uRes', 'uDpr', 'uCS', 'uGX', 'uGY', 'uK', 'uAA', 'uLab', 'uGC', 'uGM', 'uGB', 'uSoftG'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0); texB = mkTex(NBMAX, 1, gl.RGBA32F, gl.RGBA);
    gl.activeTexture(gl.TEXTURE1); texL = mkTex(GW, MAXL, gl.R32F, gl.RED);
    gl.uniform1i(loc.uB, 0); gl.uniform1i(loc.uL, 1);
    gl.uniform3fv(loc.uLab, labBuf); gl.uniform3fv(loc.uGC, gcBuf); gl.uniform3fv(loc.uGM, gmBuf); gl.uniform3fv(loc.uGB, gbBuf);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }
  var cw = 0, ch = 0, dpr = 1, orbs = [], cnt = null;
  function render(unitPx, mergeV, softV) {
    if (!gl || gl.isContextLost()) return;
    if (theme !== 'metaball') { gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    var K = Math.max(mergeV === undefined ? P.merge.x : mergeV, 1.6), cs = Math.max(24, Math.ceil(Math.sqrt(cw * ch / 1900))), GX = Math.ceil(cw / cs), GY = Math.ceil(ch / cs);
    if (!cnt || cnt.length < GX * GY) cnt = new Int32Array(GX * GY); else cnt.fill(0, 0, GX * GY);
    Tl.fill(-1);
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      Tb[i * 4] = o[0]; Tb[i * 4 + 1] = o[1]; Tb[i * 4 + 2] = o[2]; Tb[i * 4 + 3] = o[3];
      var Rc = o[2] * K + 1;
      if (o[0] + Rc < 0 || o[0] - Rc > cw || o[1] + Rc < 0 || o[1] - Rc > ch) continue;
      var gx0 = clamp(Math.floor((o[0] - Rc) / cs), 0, GX - 1), gx1 = clamp(Math.floor((o[0] + Rc) / cs), 0, GX - 1);
      var gy0 = clamp(Math.floor((o[1] - Rc) / cs), 0, GY - 1), gy1 = clamp(Math.floor((o[1] + Rc) / cs), 0, GY - 1);
      for (var gy = gy0; gy <= gy1; gy++) for (var gx = gx0; gx <= gx1; gx++) {
        var cell = gy * GX + gx;
        if (cell < GW && cnt[cell] < MAXL) { Tl[cnt[cell] * GW + cell] = i; cnt[cell]++; }
      }
    }
    gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texB); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NBMAX, 1, gl.RGBA, gl.FLOAT, Tb);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texL); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, MAXL, gl.RED, gl.FLOAT, Tl);
    gl.uniform2f(loc.uRes, cv.width, cv.height); gl.uniform1f(loc.uDpr, dpr);
    gl.uniform1f(loc.uCS, cs); gl.uniform1i(loc.uGX, GX); gl.uniform1i(loc.uGY, GY); gl.uniform1f(loc.uK, K);
    var soft = clamp(softV === undefined ? P.soft.x : softV, 0, 1);
    gl.uniform1f(loc.uSoftG, 0.06 + 0.9 * Math.pow(soft, 1.3));
    gl.uniform1f(loc.uAA, Math.max(0.8, unitPx * (0.02 + 0.28 * Math.pow(soft, 1.5))));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- Model state ---------- */
  var data = new Float32Array(MAXC * 5 * 3);
  function fillS(S) {
    S.shift = P.shift.x; S.spread = P.spread.x; S.gain = P.gain.x; S.base = P.base.x;
    for (var k = 0; k < N; k++) S.lvl[k] = P.lvl[k].x * (UI.on[k] ? 1 : 0);
    S.size = P.size.x; S.contrast = clamp(P.contrast.x, 0, 1);
    S.seed = UI.seed; S.seedPrev = UI.seedPrev; S.seedMix = clamp(P.seedMix.x, 0, 1); S.nOff = (UI.seed % 211) * 2.93;
  }
  var HOURS = 5.8, T0 = 9.45, LL = { x0: 0, plotW: 1, u: 1, g: 1, yC: 0, axisTop: 0 };
  var S1 = { shift: 0, spread: 1, gain: 1, base: 0.06, lvl: [1, 1, 1, 1, 1], size: 1, dens: 111, drift: 0, t0: 0, scatter: 1, warp: 0, contrast: 0.7, seed: 0, seedPrev: 0, seedMix: 1, span: 24, ring: false, week: false, rows: 9, amp: 1, nOff: 0, pull: 0.004 };
  var UNIT = 10, DAYW = 18 * UNIT, WEEK = 7 * DAYW, LR = { x0: 0, plotW: WEEK, u: UNIT, g: 1, yC: 60, axisTop: 114 };
  var S2 = { shift: 0, spread: 1, gain: 1, base: 0.06, lvl: [1, 1, 1, 1, 1], size: 1, dens: 50, drift: 0, t0: 0, scatter: 1, warp: 0.6, contrast: 0.7, seed: 0, seedPrev: 0, seedMix: 1, span: 168, ring: true, week: true, nOff: 0 };
  var curR = null;
  /* Fixed values for Time Ring (demo prototype). Slider values use the same scale as the Lab. */
  var RF = { lvl: [66, 67, 82, 70, 76], shift: 0, spread: 1, gain: 0.42, base: 0.04, size: mapSize(100), contrast: 0.91, thick: 1.0, merge: mapMerge(26), soft: 0.47, dens: 12 * 7 + 1 };
  /* Fixed flow speed (hours per second on the line, radians per second on the ring), a notch slower than speed 0. */
  var FLOW_LINE = 0.02, FLOW_RING = 0.0105;


  /* ---------- Themes: Metaball (WebGL) / Shape / Flower (canvas 2D) ---------- */
  var theme = 'metaball';
  var TCOL = {
    shape: [
      { hex: '#D9F57A', g: ['#A5DA32', '#D9F57A', '#F8F53D'], sh: 0 },
      { hex: '#5FD6CF', g: ['#1FC8C9', '#5FD6CF', '#B2EBCB'], sh: 1 },
      { hex: '#B592FF', g: ['#9A7BFF', '#B592FF', '#F2B6FF'], sh: 2 },
      { hex: '#5FBDFF', g: ['#8F9CFF', '#5FBDFF', '#C4E3FF'], sh: 3 },
      { hex: '#F3A04B', g: ['#F4504F', '#F3A04B', '#FCC75E'], sh: 4 }
    ],
    flower: [
      { hex: '#E9F66F', g: ['#C7DC3A', '#E9F66F', '#F4FAB6'], fk: 'A' },
      { hex: '#8EE4E2', g: ['#5CCFCB', '#8EE4E2', '#C7F1F0'], fk: 'B' },
      { hex: '#D9B5FB', g: ['#BE92EE', '#D9B5FB', '#EBD9FC'], fk: 'D' },
      { hex: '#A9C9F5', g: ['#7FA9EC', '#A9C9F5', '#D2E2F9'], fk: 'E' },
      { hex: '#FEC6AC', g: ['#F79B76', '#FEC6AC', '#FEE0D2'], fk: 'C' }
    ]
  };
  function colorsOf(k) { return theme === 'metaball' ? VARS[k] : TCOL[theme][k]; }
  function applyThemeUI() {
    VARS.forEach(function (v, k) {
      var c = colorsOf(k);
      pills[k].firstChild.style.background = c.hex;
      var dotI = document.querySelector('#sl-lvl .ctl:nth-child(' + (k + 1) + ') label i');
      if (dotI) dotI.style.background = c.hex;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-theme') === theme ? 'true' : 'false'); });
  }

  /* Default control values per theme (order: lime, teal, purple, blue, orange). */
  var PRESETS = {
    metaball: { lvl: [100, 100, 100, 100, 100], merge: 10, soft: 0, size: 86, contrast: 96, pattern: 'quiet' },
    shape:    { lvl: [60, 36, 42, 63, 72], size: 57, contrast: 100, pattern: 'weekday' },
    flower:   { lvl: [99, 100, 100, 100, 100], size: 76, contrast: 100, pattern: 'quiet' }
  };
  function setSlider(id, v) { var inp = $(id); if (!inp) return; inp.value = v; inp.dispatchEvent(new Event('input')); }
  function applyPreset(name, instant) {
    var p = PRESETS[name];
    p.lvl.forEach(function (v, k) { setSlider('v' + k, v); });
    setSlider('size', p.size); setSlider('contrast', p.contrast);
    if (p.merge !== undefined) { setSlider('merge', p.merge); setSlider('soft', p.soft); }
    var pb = document.querySelector('[data-pattern=' + p.pattern + ']'); if (pb) pb.click();
    if (instant) springs.forEach(function (q) { q.x = q.t; q.v = 0; });
  }

  function setTheme(t) {
    theme = t; applyPreset(t, false);
    applyThemeUI(); dirty = true; sigR = '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme]'), function (b) { b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme')); }); });

  var BASES = {};
  function roundPoly(Pt, rad) {
    var out = [], n = Pt.length, i, t;
    for (i = 0; i < n; i++) {
      var p0 = Pt[(i + n - 1) % n], p1 = Pt[i], p2 = Pt[(i + 1) % n];
      var ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
      var la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
      var turn = Math.abs(Math.atan2((ax * by - ay * bx) / (la * lb), (ax * bx + ay * by) / (la * lb)));
      if (turn < 0.05) { out.push(p1); continue; }
      var c = Math.min(rad * Math.tan(turn / 2), la * 0.5, lb * 0.5);
      var s = [p1[0] - ax / la * c, p1[1] - ay / la * c], e = [p1[0] + bx / lb * c, p1[1] + by / lb * c];
      for (t = 0; t <= 6; t++) { var u = t / 6, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; out.push([w0 * s[0] + w1 * p1[0] + w2 * e[0], w0 * s[1] + w1 * p1[1] + w2 * e[1]]); }
    }
    return out;
  }
  function baseShape(i) {
    if (BASES[i]) return BASES[i];
    var Pt = [], j, a;
    if (i === 0) Pt = roundPoly([[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]], 0.34);
    else if (i === 1) { for (j = 0; j < 96; j++) { a = j * Math.PI / 48; var rad = 0.82 + 0.18 * Math.cos(4 * a), b = a + Math.PI / 4; Pt.push([rad * Math.cos(b), rad * Math.sin(b)]); } }
    else if (i === 2) { var S0 = []; for (j = 0; j < 24; j++) { a = (-90 + j * 15) * Math.PI / 180; var q = j % 2 ? 0.8 : 1; S0.push([q * Math.cos(a), q * Math.sin(a)]); } Pt = roundPoly(S0, 0.05); }
    else if (i === 3) Pt = roundPoly([[-0.46, -1], [0.46, -1], [0.46, -0.46], [1, -0.46], [1, 0.46], [0.46, 0.46], [0.46, 1], [-0.46, 1], [-0.46, 0.46], [-1, 0.46], [-1, -0.46], [-0.46, -0.46]], 0.15);
    else { var H = []; for (j = 0; j < 6; j++) { a = (-90 + j * 60) * Math.PI / 180; H.push([Math.cos(a), Math.sin(a)]); } Pt = roundPoly(H, 0.16); }
    BASES[i] = Pt; return Pt;
  }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function paintShape(pts, k) {
    var n = pts.length, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, q;
    actx.beginPath();
    for (q = 0; q < n; q++) {
      var px = pts[q][0], py = pts[q][1];
      if (q) actx.lineTo(px, py); else actx.moveTo(px, py);
      if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    actx.closePath();
    var h = maxY - minY, w = maxX - minX, G = TCOL.shape[k].g;
    if (h < 3) { actx.fillStyle = G[1]; actx.fill(); return; }
    var cx = (minX + maxX) / 2, g1 = actx.createLinearGradient(cx, minY, cx, maxY);
    g1.addColorStop(0, G[1]); g1.addColorStop(1, G[2]); actx.fillStyle = g1; actx.fill();
    var hy = minY + 0.26 * h, hr = 0.3 * Math.max(w, h), g2 = actx.createRadialGradient(cx, hy, 0, cx, hy, hr);
    g2.addColorStop(0, rgba(G[0], 0.95)); g2.addColorStop(0.5, rgba(G[0], 0.38)); g2.addColorStop(1, rgba(G[0], 0));
    actx.fillStyle = g2; actx.fill();
  }
  var ocv = document.createElement('canvas'), octx = ocv.getContext('2d');
  function halo(its, unitPx) {
    if (!its.length) return;
    if (ocv.width !== axisCv.width || ocv.height !== axisCv.height) { ocv.width = axisCv.width; ocv.height = axisCv.height; }
    var paths = its.map(function (it) {
      var B = baseShape(TCOL.shape[it.k].sh), pp = new Path2D();
      for (var q = 0; q < B.length; q++) { var X = it.x + B[q][0] * it.r, Y = it.y + B[q][1] * it.r; if (q) pp.lineTo(X, Y); else pp.moveTo(X, Y); }
      pp.closePath(); return pp;
    });
    var bands = [[0.62 * unitPx, 0.05], [0.31 * unitPx, 0.07]];
    for (var bi = 0; bi < bands.length; bi++) {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, cw, ch);
      octx.fillStyle = octx.strokeStyle = '#16161D'; octx.lineJoin = 'round'; octx.lineWidth = 2 * bands[bi][0];
      for (var pi = 0; pi < paths.length; pi++) { octx.stroke(paths[pi]); octx.fill(paths[pi]); }
      actx.save(); actx.setTransform(1, 0, 0, 1, 0, 0); actx.globalAlpha = bands[bi][1]; actx.drawImage(ocv, 0, 0); actx.restore();
    }
  }
  /* flower sprites, loaded the first time the theme is chosen */
  var FL = [], SP = [], flLoaded = 0, flStarted = false, NF = 0, FSTEM = 40, FBLOOM = 50, FFADE = 46;
  function bakeSprites() {
    if (flLoaded < N * NF) return;
    var frac = 0.08 + 0.92 * FSTEM / 100;
    for (var k = 0; k < N; k++) {
      SP[k] = [];
      for (var i = 0; i < NF; i++) {
        var m = FL[k][i].m, keep = Math.max(4, Math.round(m.hb + (m.h - m.hb) * frac));
        var c = document.createElement('canvas'); c.width = m.w; c.height = keep;
        var g = c.getContext('2d');
        g.drawImage(FL[k][i].img, 0, 0, m.w, keep, 0, 0, m.w, keep);
        var y0 = m.hb + 0.3 * (keep - m.hb);
        if (keep - y0 > 2) {
          var gr = g.createLinearGradient(0, y0, 0, keep);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, m.w, keep);
        }
        SP[k][i] = { c: c, w: m.w, h: keep, cx: m.cx, cy: m.cy, hw: m.hw };
      }
    }
    dirty = true;
  }
  function loadFlowers() {
    if (flStarted || typeof FLOWERS === 'undefined') return;
    flStarted = true; NF = FLOWERS.data.A.length;
    for (var fk = 0; fk < N; fk++) {
      FL[fk] = [];
      for (var fi = 0; fi < NF; fi++) {
        var fim = new Image();
        fim.onload = function () { flLoaded++; if (flLoaded === N * NF) bakeSprites(); };
        fim.src = FLOWERS.data[TCOL.flower[fk].fk][fi];
        FL[fk][fi] = { img: fim, m: FLOWERS.man[TCOL.flower[fk].fk][fi] };
      }
    }
  }
  function stageOf(v) { var t = clamp((v / 100 - 0.03) / 0.9, 0, 1), g = Math.pow(2, (50 - FBLOOM) / 50 * 1.3); return (NF - 1) * Math.pow(t, g); }
  function opacityOf(v) { var t = clamp(v / 60, 0, 1), minOp = 1 - 0.95 * FFADE / 100; t = t * t * (3 - 2 * t); return minOp + (1 - minOp) * t; }
  function putSprite(s, x, y, wd, alpha) { var sc = wd / s.hw; actx.globalAlpha = alpha; actx.drawImage(s.c, x - s.cx * sc, y - s.cy * sc, s.w * sc, s.h * sc); }
  function drawFlower(it) {
    if (!SP[it.k]) return;
    var k = it.k, op = opacityOf(it.v), s = stageOf(it.v), i0 = Math.min(NF - 2, Math.floor(s)), f = s - i0;
    var a = SP[k][i0], b = SP[k][i0 + 1], hwI = a.hw + (b.hw - a.hw) * f;
    var wd = 2 * it.r * 1.1 * Math.sqrt(hwI / SP[k][NF - 1].hw);
    if (wd < 2.4) { actx.globalAlpha = op; actx.fillStyle = TCOL.flower[k].hex; actx.beginPath(); actx.arc(it.x, it.y, Math.max(0.8, wd / 2), 0, 6.2832); actx.fill(); actx.globalAlpha = 1; return; }
    if (f < 0.999) putSprite(a, it.x, it.y, wd, (1 - f) * op);
    if (f > 0.001) putSprite(b, it.x, it.y, wd, f * op);
    actx.globalAlpha = 1;
  }
  /* orbs are [x, y, r, k, depth, value]; the axis canvas is already cleared and scaled */
  var GLYPH_SQUASH = 0.58, dropGL = null, SH3VIEW = { rx: -0.1, ry: 0.25 }, DR = null, shFX = {}, lastParts3 = [], SH3T = 2.2, seenK = {}, seenOK = false, snapBusy = false, lastShDraw = 0;
  /* Glyph: tap a 3D shape on the timeline / ring and it squishes */
  function tryPoke(e) {
    if (theme !== 'shape' || !lastParts3.length || !window.EeroCard) return;
    var x = e.clientX * dpr, y = e.clientY * dpr, hit = null, best = 1e9;
    lastParts3.forEach(function (q) { var d = Math.hypot(x - q.x, y - q.y) / (q.r * DR[q.k]); if (d < 1.1 && d < best) { best = d; hit = q; } });
    if (!hit) return;
    shFX[hit.key] = { hit: window.EeroCard.dropLocalHit(hit, x, y, SH3T, SH3VIEW, null), hitT: 0, amp: 1, sq: 1, sqT: 0 }; dirty = true;
  }
  function stepFX(dt) {
    var any = false; for (var key in shFX) { var f = shFX[key]; f.hitT += dt; f.sqT += dt; if (f.sqT > 3) delete shFX[key]; else any = true; }
    return any;
  }
  function drawThemed(unitPx) {
    if (!DR && window.EeroCard) DR = [0, 1, 2, 3, 4].map(function (k) { return window.EeroCard.dropRadius(k) || 1; });
    var yK = UI.mode === 'line' ? GLYPH_SQUASH : 1;
    var its = orbs.map(function (o) { return { x: o[0], y: yK === 1 ? o[1] : LL.yC + (o[1] - LL.yC) * yK, r: o[2] * (yK === 1 ? 1 : 1.12), k: o[3], v: o[5], j: o[6] }; });
    if (theme === 'flower') {
      actx.globalCompositeOperation = 'multiply';
      for (var m = 0; m < its.length; m++) drawFlower(its[m]);
      actx.globalCompositeOperation = 'source-over';
    } else {
      var dc = $('cvDrop'), PE3 = window.EeroCard;
      if (dropGL === null) dropGL = (PE3 && PE3.makeDropGL(dc)) || false;
      var parts3 = [];
      for (var m2 = 0; m2 < its.length; m2++) {
        var it = its[m2];
        if (dropGL && it.r >= 3.5) { var key3 = it.k * 100000 + (it.j || 0);
          parts3.push({ k: it.k, x: it.x * dpr, y: it.y * dpr, r: it.r * dpr / DR[it.k], q: 0, lod: it.r * dpr < 36, fx: shFX[key3] || null, key: key3, ph: (key3 * 0.37) % 6.283 }); continue; }
        var B2 = baseShape(TCOL.shape[it.k].sh), pts = new Array(B2.length);
        for (var q = 0; q < B2.length; q++) pts[q] = [it.x + B2[q][0] * it.r, it.y + B2[q][1] * it.r];
        paintShape(pts, it.k);
      }
      lastParts3 = parts3;
      SH3T = (reduced || snapBusy) ? 2.2 : (performance.now() / 1000) % 600;
      /* newly arriving shapes (time flows in from the right) wobble as they appear */
      if (UI.mode === 'line' && !snapBusy) {
        var curK = {}, fresh = [];
        parts3.forEach(function (q) { curK[q.key] = 1; if (!seenK[q.key]) fresh.push(q); });
        if (seenOK && fresh.length <= 6) fresh.forEach(function (q) {
          if (q.x / dpr > cw * 0.55 && q.r * DR[q.k] >= 4 * dpr) { var f0 = { hit: [(Math.random() - 0.5) * 0.9, 0.2 + Math.random() * 0.5, 0.5], hitT: 0, amp: 0.95, sq: 0.95, sqT: 0 }; shFX[q.key] = f0; q.fx = f0; }
        });
        seenK = curK; seenOK = true;
      } else { seenOK = false; seenK = {}; }
      if (dropGL) {
        var shc = $('cvSh'), sx = shc.getContext('2d'); shc.style.display = 'block'; sx.clearRect(0, 0, shc.width, shc.height);
        window.EeroCard.drawDropShadows(sx, parts3.filter(function (q) { return q.r * DR[q.k] >= 6 * dpr; }), SH3T, SH3VIEW, null);
        dc.style.display = 'block'; dropGL(parts3, SH3T, SH3VIEW, null);
      }
    }
    actx.globalAlpha = 1;
  }

  function drawLine() {
    var sS = Math.min(cw / 936, ch / 526), hourPx = cw / HOURS;
    LL.u = 11 * sS; LL.plotW = 24 * hourPx; LL.x0 = 0; LL.yC = ch * 0.452; LL.axisTop = ch;
    fillS(S1); S1.amp = 8 * LL.u; S1.t0 = T0 - 1.6;
    var EDGE = cw * 0.17;
    var b = MODEL.build(S1, LL, SHAPE0, data), off = b.xAt(T0);
    orbs.length = 0;
    for (var k = 0; k < N; k++) {
      if (!UI.on[k]) continue;
      for (var j = 0; j < b.nc; j++) {
        var idx = (k * MAXC + j) * 3, r = data[idx + 1];
        if (r < 0.3) continue;
        var x = b.px[k * MAXC + j] - off;
        if (x < -90 || x > cw + 90 || orbs.length >= NBMAX) continue;
        var eg = clamp(Math.min(x, cw - x) / EDGE, 0, 1);
        r *= eg * eg * (3 - 2 * eg);
        if (r < 0.3) continue;
        orbs.push([x, data[idx], r, k, 0, data[idx + 2], (b.s0 || 0) + j]);
      }
    }
    render(LL.u);
    actx.setTransform(dpr, 0, 0, dpr, 0, 0); actx.clearRect(0, 0, cw, ch);
    if (theme !== 'metaball') drawThemed(LL.u * 0.4);
    actx.font = '400 ' + (8.7 * sS).toFixed(1) + 'px "articulat-cf","Asta Sans",system-ui,sans-serif'; actx.textAlign = 'center'; actx.textBaseline = 'middle'; actx.fillStyle = '#70757E';
    for (var h = snapBusy ? 1e9 : Math.ceil(T0 - 0.6); h <= T0 + HOURS + 0.6; h++) {
      var xx = b.xAt(h) - off, hh = ((h % 24) + 24) % 24;
      if (xx < 20 || xx > cw - 20) continue;
      actx.fillText(pad2(hh) + ':00', xx, ch * 0.74);
    }
    // scroll thumb
    updateSel(b, off);
    var w = HOURS / 24, f = (((T0 % 24) + 24) % 24) / 24;
    $('thumb').style.width = (w * 100) + '%'; $('thumb').style.left = (f * (1 - w) * 100) + '%';
  }

  var VIEW = { spin: -1.1, vel: 0, roll: -0.22 };
  function drawRing() {
    var thick = RF.thick, R0 = WEEK / TAU, PERSP = 0.30 / R0, elev = clamp(P.tilt.x, 0.15, 1.4), sinE = Math.sin(elev), cosE = Math.cos(elev), sinR = Math.sin(VIEW.roll), cosR = Math.cos(VIEW.roll);
    var key = [P.seedMix.x, UI.seed, UI.seedPrev, UI.on.join()].join(',');
    if (key !== sigR || !curR) {
      sigR = key;
      S2.shift = RF.shift; S2.spread = RF.spread; S2.gain = RF.gain; S2.base = RF.base;
      for (var kk = 0; kk < N; kk++) S2.lvl[kk] = RF.lvl[kk] / 60 * (UI.on[kk] ? 1 : 0);
      S2.size = RF.size; S2.contrast = RF.contrast; S2.dens = RF.dens; S2.warp = 0.6;
      S2.seed = UI.seed; S2.seedPrev = UI.seedPrev; S2.seedMix = clamp(P.seedMix.x, 0, 1); S2.nOff = (UI.seed % 211) * 2.93;
      curR = MODEL.build(S2, LR, SHAPE0, data);
    }
    var b = curR, extent = R0 + 46 * thick + 24;
    var sc = Math.min(cw * 0.40 / (extent * 1.1), ch * 0.255 / (extent * sinE * 1.12 + 26)), cx = cw / 2, cy = ch * 0.43;
    function proj(theta, rho) {
      var X = rho * Math.cos(theta), Z = rho * Math.sin(theta), sy = Z * sinE, dep = Z * cosE;
      var xr = X * cosR - sy * sinR, yr = X * sinR + sy * cosR, pf = 1 / (1 - dep * PERSP);
      return [cx + xr * pf * sc, cy + yr * pf * sc, pf, dep];
    }
    RING.proj = proj; RING.R0 = R0; RING.thick = thick;
    orbs.length = 0;
    for (var k = 0; k < N; k++) {
      if (!UI.on[k]) continue;
      for (var j = 0; j < b.nc; j++) {
        var ts = (b.s0 + j) * b.step;
        if (ts < -1e-6 || ts >= S2.span - 1e-6) continue;
        var idx = (k * MAXC + j) * 3, r = data[idx + 1];
        if (r < 0.4 || orbs.length >= NBMAX) continue;
        var p = proj(TAU * b.px[k * MAXC + j] / WEEK + VIEW.spin, R0 + (data[idx] - LR.yC) * thick);
        orbs.push([p[0], p[1], r * sc * p[2], k, p[3], data[idx + 2], (b.s0 || 0) + j]);
      }
    }
    render(UNIT * sc, RF.merge, RF.soft);
    actx.setTransform(dpr, 0, 0, dpr, 0, 0); actx.clearRect(0, 0, cw, ch);
    if (theme !== 'metaball') { orbs.sort(function (a, c2) { return a[4] - c2[4]; }); drawThemed(UNIT * sc); }
    var fs = 8.7 * Math.min(cw / 936, ch / 526);
    actx.font = '400 ' + fs.toFixed(1) + 'px "articulat-cf","Asta Sans",system-ui,sans-serif'; actx.textAlign = 'center'; actx.textBaseline = 'middle';
    var depthMax = R0 * cosE || 1, ws = weekStart(D);
    function dateOf(i) { var e = new Date(ws); e.setDate(e.getDate() + i); return e.getDate(); }
    for (var d = 0; d < 7; d++) {
      var t0 = TAU * d / 7 + VIEW.spin, a0 = proj(t0, R0 - 46 * thick - 8), a1 = proj(t0, R0 + 46 * thick + 8);
      actx.strokeStyle = 'rgba(60,70,90,0.13)'; actx.lineWidth = 1; actx.beginPath(); actx.moveTo(a0[0], a0[1]); actx.lineTo(a1[0], a1[1]); actx.stroke();
      var pl = proj(TAU * (d + 0.5) / 7 + VIEW.spin, R0 + 62 * thick + 12);
      actx.globalAlpha = clamp(0.45 + 0.55 * (pl[3] / depthMax * 0.5 + 0.5), 0.35, 1); actx.fillStyle = '#70757E'; actx.fillText(DAYS[d] + '요일 ' + dateOf(d) + '일', pl[0], pl[1]);
    }
    actx.globalAlpha = 0.9; actx.font = '500 ' + (fs * 1.5).toFixed(1) + 'px "articulat-cf","Asta Sans",system-ui,sans-serif'; actx.fillStyle = '#4A4E57';
    var front = ((Math.PI / 2 - VIEW.spin) / TAU % 1 + 1) % 1, di = Math.floor(front * 7) % 7, cc = proj(0, 0);
    actx.fillText(DAYS[di] + '요일 ' + dateOf(di) + '일', cc[0], cc[1]); actx.globalAlpha = 1;
    if (rsel) {
      var q0 = Math.min(rsel.a, rsel.b), q1 = Math.max(rsel.a, rsel.b), nn = Math.max(2, Math.ceil((q1 - q0) / 0.04)), inn = [], out = [], ii, ph;
      for (ii = 0; ii <= nn; ii++) { ph = q0 + (q1 - q0) * ii / nn + VIEW.spin; inn.push(proj(ph, R0 - 46 * thick - 8)); out.push(proj(ph, R0 + 46 * thick + 8)); }
      actx.beginPath(); actx.moveTo(inn[0][0], inn[0][1]);
      for (ii = 1; ii <= nn; ii++) actx.lineTo(inn[ii][0], inn[ii][1]);
      for (ii = nn; ii >= 0; ii--) actx.lineTo(out[ii][0], out[ii][1]);
      actx.closePath(); actx.fillStyle = 'rgba(120,126,138,.17)'; actx.fill(); actx.strokeStyle = 'rgba(110,116,128,.55)'; actx.lineWidth = 1.2; actx.stroke();
      var mp = proj((q0 + q1) / 2 + VIEW.spin, R0); rsel.mx = mp[0]; rsel.my = mp[1];
      if (rsel.done) placeRingPop();
    }
  }
  function draw() { if (!cw) return; if (theme === 'metaball') { $('cvDrop').style.display = 'none'; $('cvSh').style.display = 'none'; } if (UI.mode === 'ring') drawRing(); else drawLine(); }


  /* ---------- Range selection (Time Line): drag over a span to get a summary popup ---------- */
  var sel = null, sdrag = null, selEl = $('sel'), popEl = $('pop');
  var RING = { proj: null, R0: 1, thick: 1 }, rsel = null, rhold = 0;
  var HINT_KEY = 'eeroRingHint';
  /* local ring angle (spin removed) closest to a screen point, measured on the ring's centre line */
  function ringAngleAt(x, y) {
    if (!RING.proj) return 0;
    var best = 0, bd = 1e18;
    for (var i = 0; i < 720; i++) { var th = TAU * i / 720, p = RING.proj(th + VIEW.spin, RING.R0), dx = p[0] - x, dy = p[1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = th; } }
    return best;
  }
  function placeRingPop() {
    var pw = popEl.offsetWidth || 300, ph = popEl.offsetHeight || 260;
    var left = clamp(rsel.mx - pw / 2, 12, cw - pw - 12), top = rsel.my + 40 + ph > ch - 12 ? rsel.my - ph - 40 : rsel.my + 40;
    popEl.style.left = left + 'px'; popEl.style.top = clamp(top, 12, ch - ph - 12) + 'px'; popEl.classList.add('show');
  }
  function ringRange(q0, q1) { var h0 = (((q0 / TAU) % 1) + 1) % 1 * 168, h1 = h0 + (q1 - q0) / TAU * 168; return [h0 % 24, h0 % 24 + Math.min(h1 - h0, 24)]; }
  function beginRingSel(e) {
    drag = null; VIEW.vel = 0; rsel = { id: e.pointerId, a: ringAngleAt(e.clientX, e.clientY), b: 0, done: false, last: 0 };
    rsel.b = rsel.a; rsel.last = rsel.a; popEl.classList.remove('show'); cv.classList.add('drag'); dirty = true;
  }
  var ICON = {
    cal: '<svg viewBox="0 0 16 16" fill="none" stroke="#4F7BEA" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="2.2"/><path d="M2 6.6h12M5.2 1.8v2.6M10.8 1.8v2.6"/></svg>',
    chat: '<svg viewBox="0 0 16 16" fill="none" stroke="#7B5BD6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V11.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/></svg>',
    slack: '<svg viewBox="0 0 16 16" fill="none" stroke-width="1.9" stroke-linecap="round"><path d="M5.6 2.2v4.4" stroke="#36C5F0"/><path d="M9.6 9.4V13.8" stroke="#2EB67D"/><path d="M2.2 9.6h4.4" stroke="#ECB22E"/><path d="M9.4 5.6h4.4" stroke="#E01E5A"/><path d="M10.4 2.2v4.4" stroke="#E01E5A" opacity=".0"/></svg>',
    pin: '<svg viewBox="0 0 16 16" fill="none" stroke="#E0654A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14.2s4.6-4 4.6-7.6a4.6 4.6 0 1 0-9.2 0c0 3.6 4.6 7.6 4.6 7.6z"/><circle cx="8" cy="6.6" r="1.7"/></svg>'
  };
  /* one message per variable that sits lowest in the chosen span: lime, teal, purple, blue, orange */
  var INSIGHTS = [
    { t: '내 시간이지만, 마음대로 쓰기 어려웠어요', d: '하고 싶은 일을 고르기보다 정해진 순서대로 움직인 시간이었어요. 일정 사이의 간격이 짧아 쉬어 갈 틈이 적었을 가능성이 있어요.',
      r: [['cal', '캘린더에 일정이 {n}건 이어져 있었어요.'], ['chat', '일정 사이 간격이 평균 {m}분이었어요.'], ['pin', '이동 없이 한 곳에서 머물렀어요.']] },
    { t: '고를 수 있는 선택지가 많지 않았어요', d: '시간은 비어 있었지만 지금 할 수 있는 일이 한정되어 있었어요. 선택의 폭이 좁아 하고 싶은 일로 이어지기 어려웠을 수 있어요.',
      r: [['cal', '예정된 일정은 {n}건이었어요.'], ['chat', '앱을 {m}회 열었다 닫았어요.'], ['pin', '오늘 대부분 한 장소에서 보냈어요.']] },
    { t: '일정은 비었지만, 편히 쉬지 못했어요', d: '예정된 일정 없이 원하는 활동을 선택할 수 있었지만, 업무 앱을 평소보다 자주 확인했어요. 답변을 기다리는 상황이 현재의 시간에 영향을 주었을 가능성이 있어요.',
      r: [['cal', '구글 캘린더에 등록된 일정이 없었어요.'], ['slack', '업무 알림이 없는 동안에도 슬랙에 {m}회 접속했어요.'], ['pin', '오늘 하루종일 거실에 머물렀어요.']] },
    { t: '쉬는 중에도 성과가 신경 쓰였어요', d: '해야 할 일을 미룰 수는 있었지만 결과에 대한 부담이 따라다녔어요. 쉬는 동안에도 진행 상황을 확인하느라 온전히 비우지 못했을 수 있어요.',
      r: [['cal', '마감이 {n}건 남아 있었어요.'], ['chat', '진행 상황을 {m}번 다시 확인했어요.'], ['pin', '작업 공간 근처에서 머물렀어요.']] },
    { t: '중간중간 바깥의 연락이 끼어들었어요', d: '스스로 정한 흐름이 있었지만 외부 요청이 이어져 집중이 자주 끊겼어요. 응답해야 한다는 생각이 시간의 주도권을 흔들었을 수 있어요.',
      r: [['cal', '예정에 없던 요청이 {n}건 있었어요.'], ['chat', '알림을 {m}회 받았어요.'], ['pin', '오늘 하루종일 집에 머물렀어요.']] }
  ];
  function rnd(seed, n) { var x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); }
  var lastPop = null;
  function insightFor(a, b) {
    var low = 0, lowV = 1e9, k, i;
    for (k = 0; k < N; k++) {
      var sum = 0, cnt = 12;
      for (i = 0; i < cnt; i++) sum += MODEL.value(k, a + (b - a) * (i + 0.5) / cnt, S1);
      if (sum / cnt < lowV) { lowV = sum / cnt; low = k; }
    }
    var seed = Math.round(a * 60) + UI.seed, n = 1 + Math.floor(rnd(seed, 1) * 4), m = 3 + Math.floor(rnd(seed, 2) * 9);
    return { ins: INSIGHTS[low], f: function (t) { return t.replace('{n}', n).replace('{m}', m); } };
  }
  function buildPop(a, b) {
    var low = 0, lowV = 1e9, k, i;
    for (k = 0; k < N; k++) {
      var sum = 0, cnt = 12;
      for (i = 0; i < cnt; i++) sum += MODEL.value(k, a + (b - a) * (i + 0.5) / cnt, S1);
      if (sum / cnt < lowV) { lowV = sum / cnt; low = k; }
    }
    var P0 = insightFor(a, b), ins = P0.ins, f = P0.f; lastPop = { a: a, b: b, ins: ins, f: f };
    popEl.innerHTML = '<h2>' + ins.t + '</h2><div class="obs"><b>주요 관찰 데이터</b>' +
      ins.r.map(function (r) { return '<div>' + ICON[r[0]] + '<span>' + f(r[1]) + '</span></div>'; }).join('') + '</div><button class="go" type="button">자세히 보기</button>';
    popEl.querySelector('.go').addEventListener('click', function () { if (lastPop) { var lp = lastPop; clearSel(); openDetail({ a: lp.a, b: lp.b, ins: lp.ins, f: lp.f }); } });
  }
  function clearSel() { sel = null; sdrag = null; rsel = null; clearTimeout(rhold); selEl.hidden = true; popEl.classList.remove('show'); dirty = true; }
  function tAtX(x) { return T0 + x / (cw / HOURS); }
  function updateSel(b, off) {
    if (!sel || UI.mode !== 'line') { selEl.hidden = true; popEl.classList.remove('show'); return; }
    var a = Math.min(sel.a, sel.b), c = Math.max(sel.a, sel.b);
    var x0 = b.xAt(a) - off, x1 = b.xAt(c) - off, top = ch * 0.26, bot = ch * 0.64;
    selEl.hidden = false;
    selEl.style.left = x0 + 'px'; selEl.style.top = top + 'px'; selEl.style.width = Math.max(2, x1 - x0) + 'px'; selEl.style.height = (bot - top) + 'px';
    if (sel.done) {
      var pw = popEl.offsetWidth || 300, left = clamp(x0 + cw * 0.038, 12, cw - pw - 12);
      popEl.style.left = left + 'px'; popEl.style.top = ch * 0.15 + 'px'; popEl.classList.add('show');
    } else popEl.classList.remove('show');
  }
  cv.addEventListener('wheel', function (e) {
    if (UI.mode !== 'line') return;
    e.preventDefault();
    T0 += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / (cw / HOURS); dirty = true;
  }, { passive: false });

  /* ---------- Pointer ---------- */
  var drag = null, vT = 0;
  cv.addEventListener('pointerdown', function (e) {
    if (UI.mode === 'line') {
      var t = tAtX(e.clientX); sdrag = { id: e.pointerId, x: e.clientX }; sel = { a: t, b: t, done: false };
      popEl.classList.remove('show'); try { cv.setPointerCapture(e.pointerId); } catch (_) {} cv.classList.add('drag'); dirty = true; return;
    }
    if (UI.mode === 'ring') {
      popEl.classList.remove('show'); rsel = null; clearTimeout(rhold);
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      if (e.shiftKey) { beginRingSel(e); return; }
      var ev0 = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), v: 0 }; cv.classList.add('drag'); VIEW.vel = 0;
      rhold = setTimeout(function () { if (drag && drag.id === ev0.pointerId && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 7) beginRingSel(ev0); }, 380);
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), v: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} cv.classList.add('drag'); vT = 0; VIEW.vel = 0; });
  cv.addEventListener('pointermove', function (e) {
    if (sdrag && e.pointerId === sdrag.id) { sel.b = tAtX(e.clientX); dirty = true; return; }
    if (rsel && e.pointerId === rsel.id && !rsel.done) {
      var an = ringAngleAt(e.clientX, e.clientY), dl = an - rsel.last; if (dl > Math.PI) dl -= TAU; if (dl < -Math.PI) dl += TAU;
      rsel.last = an; rsel.b = clamp(rsel.b + dl, rsel.a - TAU * 0.98, rsel.a + TAU * 0.98); dirty = true; return;
    }
    if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) clearTimeout(rhold);
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
    if (UI.mode === 'ring') { VIEW.spin += dx * 0.008; drag.v = drag.v * 0.6 + (dx * 0.008 / dt) * 0.4; P.tilt.x = clamp(P.tilt.x - dy * 0.006, 0.2, 1.35); P.tilt.t = P.tilt.x; P.tilt.v = 0; }
    else { var hp = cw / HOURS; T0 -= dx / hp; drag.v = drag.v * 0.6 + (-dx / hp / dt) * 0.4; }
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now; dirty = true;
  });
  function endDrag(e) {
    if (sdrag && e.pointerId === sdrag.id) {
      var moved = Math.abs(e.clientX - sdrag.x); sdrag = null; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved < 8) { tryPoke(e); clearSel(); return; }
      var lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b); sel.a = lo; sel.b = hi; sel.done = true; buildPop(lo, hi); dirty = true; return;
    }
    if (rsel && e.pointerId === rsel.id && !rsel.done) {
      cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      var q0 = Math.min(rsel.a, rsel.b), q1 = Math.max(rsel.a, rsel.b);
      if (q1 - q0 < 0.06) { clearSel(); return; }
      rsel.a = q0; rsel.b = q1; rsel.done = true; var rr = ringRange(q0, q1); rsel.rng = rr; buildPop(rr[0], Math.max(rr[1], rr[0] + 0.5)); dirty = true; return;
    }
    clearTimeout(rhold);
    if (drag && e.pointerId === drag.id && UI.mode === 'ring' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) tryPoke(e);
    if (!drag || e.pointerId !== drag.id) return;
    if (UI.mode === 'ring') VIEW.vel = clamp(drag.v, -6, 6) * 0.85; else vT = clamp(drag.v, -4, 4);
    drag = null; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  var tdrag = null;
  $('thumb').addEventListener('pointerdown', function (e) { var r = $('rail').getBoundingClientRect(), t = $('thumb').getBoundingClientRect(); tdrag = { id: e.pointerId, off: e.clientX - t.left }; $('thumb').setPointerCapture(e.pointerId); vT = 0; e.preventDefault(); });
  $('thumb').addEventListener('pointermove', function (e) {
    if (!tdrag) return;
    var r = $('rail').getBoundingClientRect(), tw = $('thumb').getBoundingClientRect().width, f = clamp((e.clientX - tdrag.off - r.left) / Math.max(1, r.width - tw), 0, 1);
    T0 = Math.floor(T0 / 24) * 24 + f * 24; dirty = true;
  });
  $('thumb').addEventListener('pointerup', function () { tdrag = null; });
  $('thumb').addEventListener('pointercancel', function () { tdrag = null; });

  function resize() {
    cw = window.innerWidth; ch = window.innerHeight;
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.2e6 / (cw * ch))));
    cv.width = axisCv.width = $('cvDrop').width = $('cvSh').width = Math.round(cw * dpr); cv.height = axisCv.height = $('cvDrop').height = $('cvSh').height = Math.round(ch * dpr);
    sigR = ''; draw(); dirty = false;
  }
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    if (pulseOn || $('detail').classList.contains('show')) return;
    var moving = dt > 0 ? simulate(dt) : false, anim = false;
    if (stepFX(dt)) anim = true;
    if (theme === 'shape' && !reduced && now - lastShDraw > 33) { anim = true; lastShDraw = now; }
    if (UI.mode === 'line') {
      if (!drag && !tdrag && !sdrag) {
        if (Math.abs(vT) > 0.02) { T0 += vT * dt; vT *= Math.pow(0.05, dt); anim = true; }
        else if (UI.flow && !reduced && !sel) { T0 += FLOW_LINE * dt; anim = true; }
      }
    } else if (!drag && !rsel) {
      if (Math.abs(VIEW.vel) > 0.02) { VIEW.spin += VIEW.vel * dt; VIEW.vel *= Math.pow(0.04, dt); anim = true; }
      else if (UI.flow && !reduced) { VIEW.spin += FLOW_RING * dt; anim = true; }
    }
    if (moving || dirty || anim) { draw(); dirty = false; }
  }
  window.addEventListener('resize', resize);
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
  cv.addEventListener('webglcontextrestored', function () { if (initGL()) { dirty = true; } });
  /* ---------- Metaball blob renderer for the detail strip, layers and the Pulse graphic (CPU, small canvases) ---------- */
  function hx(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  var VRGB = VARS.map(function (v) { return { c: hx(v.hex), m: hx(v.g[1]), h: hx(v.g[2]) }; });
  /* blobs: [x, y, r, k] in canvas pixels. Sum of smooth kernels; colour is the kernel-weighted mix, lighter toward each core. */
  function mbPaint(cvs, blobs, thr) {
    var w = cvs.width, h = cvs.height, c2 = cvs.getContext('2d'), F = new Float32Array(w * h), Wt = new Float32Array(w * h), R = new Float32Array(w * h), G = new Float32Array(w * h), B = new Float32Array(w * h), i, x, y;
    thr = thr || 0.22;
    for (i = 0; i < blobs.length; i++) {
      var b = blobs[i], Rr = b[2] * 1.4, x0 = Math.max(0, Math.floor(b[0] - Rr)), x1 = Math.min(w - 1, Math.ceil(b[0] + Rr)), y0 = Math.max(0, Math.floor(b[1] - Rr)), y1 = Math.min(h - 1, Math.ceil(b[1] + Rr)), col = VRGB[b[3]];
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
        var dx = x - b[0], dy = y - b[1], d2 = (dx * dx + dy * dy) / (Rr * Rr); if (d2 >= 1) continue;
        var q = 1 - d2, f = q * q, core = Math.pow(1 - Math.sqrt(d2), 2) * 0.9, hot = Math.max(0, 0.9 - Math.sqrt(d2) * 2.2), p = y * w + x;
        var cr = col.c[0] + (col.h[0] - col.c[0]) * core, cg = col.c[1] + (col.h[1] - col.c[1]) * core, cb = col.c[2] + (col.h[2] - col.c[2]) * core;
        cr += (255 - cr) * hot * 0.25; cg += (255 - cg) * hot * 0.25; cb += (255 - cb) * hot * 0.25;
        var wt = f * f; F[p] += f; R[p] += cr * wt; G[p] += cg * wt; B[p] += cb * wt; Wt[p] += wt;
      }
    }
    var img = c2.createImageData(w, h), W = Wt, o;
    for (i = 0; i < w * h; i++) {
      if (F[i] <= 0.0001) continue;
      var a = (F[i] - thr) / 0.09; a = a < 0 ? 0 : a > 1 ? 1 : a * a * (3 - 2 * a); if (a <= 0) continue;
      o = i * 4; var ww = W[i] || 1; img.data[o] = R[i] / ww; img.data[o + 1] = G[i] / ww; img.data[o + 2] = B[i] / ww; img.data[o + 3] = a * 235;
    }
    c2.clearRect(0, 0, w, h); c2.putImageData(img, 0, 0);
  }
  function hash2(a, b) { return rnd(a * 1.37 + 5.1, b * 3.91 + 2.3); }
  /* blobs for variable k over [tL,tR] hours, laid out in a w×h pixel box */
  function spanBlobs(k, tL, tR, w, h, sc, dens) {
    var out = [], step = 0.045, n = Math.round((tR - tL) / step), i;
    for (i = 0; i < n; i++) {
      var t = tL + i * step, v = MODEL.value(k, t, S1) / 100, key = Math.round(t * 1000) + k * 977 + UI.seed;
      if (hash2(key, 1) > (0.05 + v * 0.9) * dens) continue;
      var big = hash2(key, 4) < v * 0.55, r = (big ? (0.5 + v * 1.1) : (0.12 + 0.3 * hash2(key, 5))) * sc * (0.7 + 0.6 * hash2(key, 6));
      out.push([(t - tL) / (tR - tL) * w, (0.1 + 0.8 * hash2(key, 2)) * h, r, k]);
    }
    return out;
  }

  /* ---------- Detail view ---------- */
  var dSel = null, dHidden = [0, 0, 0, 0, 0], PLANE_ORDER = [4, 3, 0, 1, 2];
  function fmtT(t) { t = ((t % 24) + 24) % 24; var m = Math.round(t * 6) * 10, hh = Math.floor(m / 60) % 24; return pad2(hh) + ':' + pad2(m % 60); }
  var CARD_T = { cal: '캘린더', chat: '메시지·알림', slack: '업무 앱 확인', pin: '위치' };
  /* Re-run the real Timeline renderer off-screen: the strip (all variables) and one layer per variable come from the same drawing code, so they follow the chosen theme. */
  function snapMany(a, hrs, list) {
    var sv = { T0: T0, HOURS: HOURS, on: UI.on.slice(), sel: sel }, dc = $('cvDrop'), outs = [];
    snapBusy = true; seenOK = false; sel = null;
    cw = window.innerWidth; ch = Math.round(window.innerHeight * 0.45); dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    cv.width = axisCv.width = dc.width = $('cvSh').width = Math.round(cw * dpr); cv.height = axisCv.height = dc.height = $('cvSh').height = Math.round(ch * dpr);
    HOURS = hrs; T0 = a; var savedMode = UI.mode; UI.mode = 'line';
    list.forEach(function (only) {
      UI.on = sv.on.map(function (v, k) { return only === null ? v : (k === only ? 1 : 0); });
      dc.style.display = 'none'; sigR = ''; drawLine();
      var o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; var c2 = o.getContext('2d');
      if (theme === 'metaball') c2.drawImage(cv, 0, 0); else if (dc.style.display !== 'none') { c2.drawImage($('cvSh'), 0, 0); c2.drawImage(dc, 0, 0); }
      c2.drawImage(axisCv, 0, 0); outs.push(o);
    });
    UI.on = sv.on; UI.mode = savedMode; T0 = sv.T0; HOURS = sv.HOURS; sel = sv.sel; snapBusy = false; seenOK = false;
    resize();
    return outs;
  }
  var LV = { rx: 62, rz: -38 };
  function applyLV() { var st = $('dStack'); if (st) st.style.transform = 'rotateX(' + LV.rx + 'deg) rotateZ(' + LV.rz + 'deg)'; }
  var dView = { tL: 0, HR: 9.39, outs: null };
  /* unfold: planes start stacked flat on top of each other, then tilt and spread into layers */
  var unfT = 0;
  function planeZ(idx, open) { return 'translateZ(calc(' + (open ? (2 - idx) * 14 : 0) + ' * var(--u)))'; }
  function unfold() {
    var lay = $('dLayers'), st = $('dStack'), pls = st.querySelectorAll('.pl'); clearTimeout(unfT);
    lay.classList.remove('unf'); st.style.transform = 'rotateX(0deg) rotateZ(0deg)';
    pls.forEach(function (p) { p.style.transform = planeZ(0, false); });
    void st.offsetWidth; lay.classList.add('unf');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      applyLV(); pls.forEach(function (p, i) { p.style.transform = planeZ(i, true); });
    }); });
    unfT = setTimeout(function () { lay.classList.remove('unf'); }, 1100);
  }
  function paintDetail() {
    if (!dSel) return;
    dView.tL = dSel.a - 0.4925 * dView.HR;
    $('dDate').textContent = D.getFullYear() + '년 ' + (D.getMonth() + 1) + '월 ' + D.getDate() + '일 (' + DOW[D.getDay()] + ')';
    $('dPick').value = D.getFullYear() + '-' + pad2(D.getMonth() + 1) + '-' + pad2(D.getDate());
    dView.outs = snapMany(dView.tL, dView.HR, [null].concat(PLANE_ORDER));
    var sc = $('dStrip'), o0 = dView.outs[0]; sc.width = o0.width; sc.height = o0.height; sc.getContext('2d').drawImage(o0, 0, 0);
    var tL = dView.tL, HR = dView.HR, lab = ''; for (var hh = Math.ceil(tL); hh <= tL + HR; hh++) lab += '<span style="left:' + ((hh - tL) / HR * 100) + '%">' + pad2(((hh % 24) + 24) % 24) + ':00</span>';
    $('dLabels').innerHTML = lab;
    var stack = $('dStack'); stack.innerHTML = '';
    PLANE_ORDER.forEach(function (kk, idx) {
      var pl = document.createElement('div'); pl.className = 'pl'; pl.dataset.k = kk;
      pl.style.cssText = 'background:linear-gradient(135deg,' + VARS[kk].g[1] + '22,' + VARS[kk].g[2] + '14);transform:' + planeZ(idx, true) + ';opacity:' + (dHidden[kk] ? 0 : 1);
      var c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; pl.appendChild(c); stack.appendChild(pl);
    });
    applyLV();
    $('dLegend').querySelectorAll('.pill').forEach(function (p, kk) { p.classList.toggle('off', !!dHidden[kk]); p.firstChild.innerHTML = dHidden[kk] ? EYEOFF : EYE; });
    updateSelection();
  }
  /* the part that changes when the selection changes: range label, window box, layers (cropped), insight */
  function updateSelection() {
    if (!dSel || !dView.outs) return;
    var a = Math.min(dSel.a, dSel.b), b = Math.max(dSel.a, dSel.b); if (b - a < 0.25) b = a + 0.25;
    var tL = dView.tL, HR = dView.HR;
    $('dRange').textContent = fmtT(a) + '-' + fmtT(b);
    var win = $('dWin'); win.style.left = ((a - tL) / HR * 100) + '%'; win.style.width = Math.max(0.4, (b - a) / HR * 100) + '%';
    PLANE_ORDER.forEach(function (kk, idx) {
      var o = dView.outs[idx + 1], pl = $('dStack').querySelector('[data-k="' + kk + '"]'); if (!pl) return;
      var sx = Math.max(0, Math.round((a - tL) / HR * o.width)), sw = Math.max(16, Math.round((b - a) / HR * o.width)), sy = Math.round(o.height * 0.18), sh = Math.round(o.height * 0.535);
      sw = Math.min(sw, o.width - sx); if (sw < 4) return;
      var c = pl.firstChild; c.width = sw; c.height = sh; var cx = c.getContext('2d'); cx.clearRect(0, 0, sw, sh); cx.drawImage(o, sx, sy, sw, sh, 0, 0, sw, sh);
      var ar = sw / sh, wp = ar >= 1 ? 100 : 100 * ar, hp = ar >= 1 ? 100 / ar : 100;
      pl.style.width = wp + '%'; pl.style.height = hp + '%'; pl.style.left = ((100 - wp) / 2) + '%'; pl.style.top = ((100 - hp) / 2) + '%';
    });
    var P1 = insightFor(a, b); dSel.ins = P1.ins; dSel.f = P1.f;
    $('dText').textContent = P1.ins.d;
    $('dCards').innerHTML = P1.ins.r.map(function (r) { return '<div class="dc">' + ICON[r[0]] + '<b>' + CARD_T[r[0]] + '</b><small>' + P1.f(r[1]) + '</small></div>'; }).join('');
  }
  /* drag on the strip to pick a new range */
  (function () {
    var hit = $('dHit'), dg = null, raf = 0;
    function tAt(e) { var r = $('dStrip').getBoundingClientRect(); return Math.max(dView.tL, Math.min(dView.tL + dView.HR, dView.tL + (e.clientX - r.left) / r.width * dView.HR)); }
    function sched() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; updateSelection(); }); }
    hit.addEventListener('pointerdown', function (e) { dg = { id: e.pointerId, x: e.clientX, prev: { a: dSel.a, b: dSel.b }, moved: false }; var t = tAt(e); dSel.a = t; dSel.b = t; try { hit.setPointerCapture(e.pointerId); } catch (_) {} });
    hit.addEventListener('pointermove', function (e) { if (!dg || e.pointerId !== dg.id) return; if (Math.abs(e.clientX - dg.x) > 4) dg.moved = true; dSel.b = tAt(e); if (dg.moved) sched(); });
    function up(e) { if (!dg || e.pointerId !== dg.id) return; if (!dg.moved) { dSel.a = dg.prev.a; dSel.b = dg.prev.b; } else { var lo = Math.min(dSel.a, dSel.b), hi = Math.max(dSel.a, dSel.b); dSel.a = lo; dSel.b = Math.max(hi, lo + 0.25); } var mv = dg.moved; dg = null; updateSelection(); if (mv) unfold(); }
    hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
  })();
  /* drag the layers to change the viewing angle */
  (function () {
    var host = $('dLeft'), lay = $('dLayers'), dg = null;
    host.addEventListener('pointerdown', function (e) { if (e.target.closest('.pill')) return; dg = { id: e.pointerId, x: e.clientX, y: e.clientY }; lay.classList.add('grab'); try { host.setPointerCapture(e.pointerId); } catch (_) {} });
    host.addEventListener('pointermove', function (e) { if (!dg || e.pointerId !== dg.id) return; LV.rz += (e.clientX - dg.x) * 0.45; LV.rx = Math.max(8, Math.min(88, LV.rx - (e.clientY - dg.y) * 0.35)); dg.x = e.clientX; dg.y = e.clientY; applyLV(); });
    function up(e) { if (dg && e.pointerId === dg.id) { dg = null; lay.classList.remove('grab'); } }
    host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
    host.addEventListener('dblclick', function () { LV.rx = 62; LV.rz = -38; applyLV(); });
  })();
  function openDetail(info) {
    dSel = info; var d = $('detail');
    if (!$('dLegend').firstChild) VARS.forEach(function (v, k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pill';
      b.innerHTML = '<span class="dot" style="background:' + v.hex + '">' + EYE + '</span><span class="pt"><b>' + v.name + '</b><small>' + v.en + '</small></span>';
      b.addEventListener('click', function () { dHidden[k] = dHidden[k] ? 0 : 1; var pl = $('dStack').querySelector('[data-k="' + k + '"]'); if (pl) pl.style.opacity = dHidden[k] ? 0 : 1; b.classList.toggle('off', !!dHidden[k]); b.firstChild.innerHTML = dHidden[k] ? EYEOFF : EYE; });
      $('dLegend').appendChild(b);
    });
    d.classList.add('show'); void d.offsetWidth; d.classList.add('in'); paintDetail(); unfold();
  }
  function closeDetail() { var d = $('detail'); d.classList.remove('in'); setTimeout(function () { d.classList.remove('show'); dirty = true; }, 250); }
  function shiftDay(n) { D.setDate(D.getDate() + n); refreshDate(false); dirty = true; if (dSel) paintDetail(); }
  $('dMain').addEventListener('click', closeDetail);
  $('dPrev').addEventListener('click', function () { shiftDay(-1); });
  $('dNext').addEventListener('click', function () { shiftDay(1); });
  $('dPick').addEventListener('change', function (e) { var p = e.target.value.split('-'); if (p.length === 3) { D = new Date(+p[0], +p[1] - 1, +p[2], 12); refreshDate(false); dirty = true; paintDetail(); } });
  window.addEventListener('resize', function () { if ($('detail').classList.contains('show')) paintDetail(); });

  /* ---------- Record modal ---------- */
  function openRec() { $('scrim2').classList.add('show'); $('rec').classList.add('show'); try { $('recText').value = localStorage.getItem('eeroNote') || ''; } catch (_) {} setTimeout(function () { $('recText').focus(); }, 120); }
  function closeRec() { $('scrim2').classList.remove('show'); $('rec').classList.remove('show'); }
  $('dRec').addEventListener('click', openRec);
  $('scrim2').addEventListener('click', closeRec);
  $('recDone').addEventListener('click', function () {
    var v = $('recText').value.trim(); try { localStorage.setItem('eeroNote', v); } catch (_) {}
    closeRec(); toast(v ? '기록을 남겼어요. 고마워요!' : '입력된 내용이 없어요');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if ($('rec').classList.contains('show')) closeRec(); else if ($('detail').classList.contains('show')) closeDetail(); } });

  /* ---------- Time Pulse: live clock + a Time Ownership graphic breathing with the values right now ---------- */
  var PSTATE = [
    ['지금은 내가 이끄는 시간', '하고 싶은 일을 내 순서대로 정할 수 있는 때예요. 지금 가장 먼저 하고 싶은 일은 무엇인가요?'],
    ['지금은 고를 수 있는 시간', '지금 할 수 있는 일이 여러 가지 열려 있어요. 어떤 시간을 보내고 싶나요?'],
    ['지금은 잠시 쉬는 시간', '업무가 끝나고 저녁 약속까지 잠시 시간이 비어있어요! 지금 어떻게 시간을 보낼지 고민되나요?'],
    ['지금은 부담 없는 시간', '이 시간을 꼭 생산적으로 보내지 않아도 괜찮아요. 편하게 흘려보내도 좋아요.'],
    ['지금은 방해받지 않는 시간', '외부 연락 걱정 없이 한 가지에 집중할 수 있는 시간이에요.']
  ];
  var pulseOn = false, pRaf = 0, pTick = 0, pCur = -1, pVals = [0, 0, 0, 0, 0];
  function nowH() { var n = new Date(); return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600; }
  function pulseText() {
    var n = new Date(); $('pClock').textContent = pad2(n.getHours()) + ':' + pad2(n.getMinutes());
    $('pDate').textContent = n.getFullYear() + '. ' + pad2(n.getMonth() + 1) + '. ' + pad2(n.getDate()) + '. ' + ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][n.getDay()];
    var t = nowH(), best = 0, k; for (k = 0; k < N; k++) { pVals[k] = MODEL.value(k, t, S1); if (pVals[k] > pVals[best]) best = k; }
    if (best !== pCur) { pCur = best; $('pTitle').textContent = PSTATE[best][0]; $('pDesc').textContent = PSTATE[best][1]; }
  }
  var PE = window.EeroCard, pBase = PE.buildBase(4242), pSt = PE.newState(4242), pMetaR = null, pDropR = null, pSh = null, pView = { rx: -0.1, ry: 0.25 }, pPrev = 0;
  var pJIG = {}, pFX = [null, null, null, null, null], pParts = [], pScale = 1, pGeo = { ox: 0, oy: 0, Wc: 1 }, pdrag = null;
  PE.CARD.SOFT = 0;  /* edge softness 0 */
  pSt.q = [50, 50, 50, 50, 50];
  function pJig(k, now) { var j = pJIG[k]; if (!j) return 0; var tt = (now - j.t) / 1000; if (tt > 4) { delete pJIG[k]; return 0; } if (tt < 0) return 0; return j.a * 0.3 * PE.CARD.SQUISH * Math.exp(-tt * 3) * Math.sin(tt * 15); }
  function pPokeMeta(hit, now) { var reach = Math.max(hit.r * 5, 90 * pScale); pParts.forEach(function (o) { var d = Math.hypot(o.x - hit.x, o.y - hit.y); if (d > reach) return; pJIG[o.k] = { t: now + (o === hit ? 0 : d / pScale * 1.4), a: o === hit ? 1 : 0.55 * (1 - d / reach) }; }); }
  function pPokeDrop(k, local, str) { pFX[k] = { hit: local, hitT: 0, amp: str, sq: str, sqT: 0 }; }
  function pPokeAll() { for (var k = 0; k < N; k++) (function (kk) { setTimeout(function () { pPokeDrop(kk, [(Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, 0.45], 0.8); }, kk * 110); })(k); }
  function pXY(e) { var r = $('pStage').getBoundingClientRect(); return [(e.clientX - r.left) * ($('pDrop').width / r.width), (e.clientY - r.top) * ($('pDrop').height / r.height)]; }
  function pHit(x, y) { var hit = null, best = 1e9, shape = theme === 'shape'; pParts.forEach(function (p) { var R = p.r * (shape ? PE.dropRadius(p.k) : 1), d = Math.hypot(x - p.x, y - p.y) / R; if (d < 1.05 && d < best) { best = d; hit = p; } }); return hit; }
  (function () {
    var st = $('pStage');
    st.addEventListener('pointerdown', function (e) { var xy = pXY(e), hit = pHit(xy[0], xy[1]); pdrag = { id: e.pointerId, lx: e.clientX, ly: e.clientY, hit: hit, moved: 0, grab: hit ? [xy[0] - hit.x, xy[1] - hit.y] : null, cx: xy[0], cy: xy[1] }; try { st.setPointerCapture(e.pointerId); } catch (_) {} });
    st.addEventListener('pointermove', function (e) {
      if (!pdrag || e.pointerId !== pdrag.id) return;
      var dx = e.clientX - pdrag.lx, dy = e.clientY - pdrag.ly; pdrag.moved += Math.abs(dx) + Math.abs(dy);
      if (pdrag.moved > 6) {
        st.classList.add('grabbing');
        if (!pdrag.hit && theme === 'shape') { pSt.yaw += dx * 0.01; pSt.pitch = clamp(pSt.pitch + dy * 0.01, -1.3, 1.3); }
        else if (pdrag.hit) { var xy = pXY(e), k = pdrag.hit.k, home = PE.homeOf(pSt, pBase[k], k, (performance.now() / 1000) % 600); pSt.off[k] = [clamp((xy[0] - pdrag.grab[0] - pGeo.ox) / pGeo.Wc - home[0], -0.6, 0.6), clamp((xy[1] - pdrag.grab[1] - pGeo.oy) / pGeo.Wc - home[1], -0.6, 0.6)]; }
      }
      pdrag.lx = e.clientX; pdrag.ly = e.clientY;
    });
    function end(e) {
      if (!pdrag || e.pointerId !== pdrag.id) return;
      if (pdrag.moved <= 6) {
        if (theme === 'shape') { if (pdrag.hit) pPokeDrop(pdrag.hit.k, PE.dropLocalHit(pdrag.hit, pdrag.cx, pdrag.cy, (performance.now() / 1000) % 600, pView, pFX[pdrag.hit.k]), 1.0); else pPokeAll(); }
        else if (pdrag.hit) pPokeMeta(pdrag.hit, performance.now());
      }
      pdrag = null; st.classList.remove('grabbing'); try { st.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  })();
  function pulseGfx(ts) {
    if (!pulseOn) return; pRaf = requestAnimationFrame(pulseGfx);
    var st = $('pStage'), cm = $('pMeta'), cd = $('pDrop'), csh = $('pShadow'), rr = st.getBoundingClientRect(); if (rr.width < 10) return;
    var shape = theme === 'shape', dt = Math.min(0.05, Math.max(0, (ts - pPrev) / 1000)); pPrev = ts;
    if (pSh === null) { pSh = csh.getContext('2d'); pMetaR = PE.makeMetaGL(cm) || false; pDropR = PE.makeDropGL(cd) || false; }
    var dpr2 = Math.min(window.devicePixelRatio || 1, 2), Wp = Math.round(rr.width * dpr2), Hp = Math.round(rr.height * dpr2);
    if (cd.width !== Wp || cd.height !== Hp) { cd.width = cm.width = csh.width = Wp; cd.height = cm.height = csh.height = Hp; }
    cm.style.display = !shape && pMetaR ? 'block' : 'none'; cd.style.display = shape && pDropR ? 'block' : 'none';
    var t = (ts / 1000) % 600, k;
    for (k = 0; k < N; k++) pSt.q[k] += (pVals[k] - pSt.q[k]) * 0.04;
    var Wc = Math.min(Wp * 0.86, Hp * 1.38), ox = Math.min(Wp * 0.6, Wp - Wc * 0.56) - Wc * 0.5, oy = Hp * 0.5 - Wc * 0.79; pGeo.ox = ox; pGeo.oy = oy; pGeo.Wc = Wc; pScale = dpr2;
    var parts = PE.particles(pSt, pBase, t, Wc, function (kk) { return pJig(kk, ts); });
    parts.forEach(function (q) { q.x += ox; q.y += oy; }); pParts = parts;
    pSh.clearRect(0, 0, Wp, Hp);
    if (!shape) { if (pMetaR) pMetaR(parts); else PE.drawMetaFallback(pSh, parts); }
    else {
      pView.rx += (pSt.pitch - pView.rx) * 0.12; pView.ry += (pSt.yaw - pView.ry) * 0.12;
      pFX.forEach(function (f) { if (f) { f.hitT += dt; f.sqT += dt; } });
      PE.drawDropShadows(pSh, parts, t, pView, pFX);
      if (pDropR) pDropR(parts, t, pView, pFX); else PE.drawShapesFlat(pSh, parts);
    }
  }
  /* ---------- Theme picker (Fluid = metaball, Glyph = shape) ---------- */
  var thPending = 'metaball', glyphMade = false;
  function makeGlyphPreview() {
    if (glyphMade) return; glyphMade = true;
    try {
      var c = document.createElement('canvas'); c.width = 900; c.height = 300; var r = PE.makeDropGL(c); if (!r) return;
      var sc = 88, parts = [0, 1, 2, 3, 4].map(function (k) { return { k: k, x: 120 + k * 165 + (k === 4 ? 10 : 0), y: 150, r: sc, q: 0 }; });
      r(parts, 3.2, { rx: -0.1, ry: 0.25 }, null);
      $('glyphPv').src = c.toDataURL('image/png');
    } catch (_) {}
  }
  function paintThemes() {
    Array.prototype.forEach.call(document.querySelectorAll('.thcard'), function (b) {
      var id = b.getAttribute('data-th'), cur = id === theme, sel = id === thPending;
      b.classList.toggle('cur', cur); b.classList.toggle('chosen', sel);
      b.querySelector('.bd').innerHTML = sel ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.5 3.2 3.2L13 5"/></svg>선택 중' : (cur ? '현재 테마' : '');
    });
  }
  function openThemes() { clearSel(); thPending = null; makeGlyphPreview(); paintThemes(); var d = $('themeScr'); d.classList.add('show'); void d.offsetWidth; d.classList.add('in'); }
  function closeThemes() { var d = $('themeScr'); d.classList.remove('in'); setTimeout(function () { d.classList.remove('show'); }, 250); }
  Array.prototype.forEach.call(document.querySelectorAll('.thcard'), function (b) { b.addEventListener('click', function () { thPending = b.getAttribute('data-th'); paintThemes(); }); });
  $('thDone').addEventListener('click', function () { if (thPending && thPending !== theme) { setTheme(thPending); toast((thPending === 'shape' ? 'Glyph' : 'Fluid') + ' 테마를 적용했어요'); } closeThemes(); });
  $('thGear').addEventListener('click', closeThemes);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('themeScr').classList.contains('show')) closeThemes(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { dirty = true; sigR = ''; });

  function setPulse(on) {
    pulseOn = on; document.body.classList.toggle('pulse', on);
    ['mPulse', 'mLine', 'mRing'].forEach(function (id) { $(id).setAttribute('aria-pressed', 'false'); });
    if (on) { clearSel(); $('mPulse').setAttribute('aria-pressed', 'true'); pCur = -1; pulseText(); clearInterval(pTick); pTick = setInterval(pulseText, 1000); cancelAnimationFrame(pRaf); pRaf = requestAnimationFrame(pulseGfx); }
    else { clearInterval(pTick); cancelAnimationFrame(pRaf); }
  }
  $('mPulse').addEventListener('click', function () { setPulse(true); });
  $('pCta').addEventListener('click', function () { toast('회복 시도하기는 준비 중이에요'); });

  applyPreset('metaball', true);
  refreshDate(false); UI.seedPrev = UI.seed;
  if (!initGL()) { $('nogl').hidden = false; cv.style.display = 'none'; return; }
  resize();
  requestAnimationFrame(frame);
})();
