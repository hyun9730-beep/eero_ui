var MODEL = (function () {
  'use strict';
  var MAXC = 192, TAU = 6.283185307, PAD = 3, NCUM = 288;
  var PROFILES = [
    [[7.5, 2.2, 0.85], [21.5, 2.6, 0.90]],
    [[5.5, 1.8, 0.70], [11.5, 2.0, 0.95], [19.5, 2.2, 0.55]],
    [[9.0, 2.4, 0.80], [12.5, 1.6, 0.50], [22.0, 2.0, 0.75]],
    [[5.0, 1.6, 0.90], [8.5, 1.5, 0.85], [21.0, 1.6, 0.90]],
    [[10.5, 2.8, 0.55], [15.0, 2.0, 0.40], [23.0, 1.8, 0.60]]
  ];
  var PHASE = [0.13, 0.41, 0.67, 0.29, 0.83];
  var CF = [1.0, 1.0, 1.0, 1.1, 1.0];
  function circDiff(t, mu) { var d = (t - mu) % 24; if (d > 12) d -= 24; if (d < -12) d += 24; return d; }
  function noiseF(k, t) {
    var f = PHASE[k];
    var n = 0.5 + 0.25 * Math.sin(TAU * (t * 0.91 + f)) + 0.15 * Math.sin(TAU * (t * 1.73 + 2.1 * f)) + 0.10 * Math.sin(TAU * (t * 2.9 + 3.3 * f));
    return 0.55 + 0.9 * n;
  }
  // Value 0..100. With S.week the weekend (days 6 and 7) shifts later and softer, and every day gets its own strength.
  function value(k, t, S) {
    var pk = PROFILES[k], sh = S.shift, spr = S.spread, g = S.gain;
    if (S.week) {
      var dd = Math.floor(t / 24), dow = ((dd % 7) + 7) % 7;
      g *= 0.82 + 0.34 * h3(dd, k, 77);
      if (dow >= 5) { sh += 2.2; spr *= 1.25; g *= 0.9; }
    }
    var prof = S.base;
    for (var i = 0; i < pk.length; i++) {
      var d = circDiff(t, pk[i][0] + sh) / (pk[i][1] * spr);
      prof += pk[i][2] * Math.exp(-0.5 * d * d);
    }
    var v = g * prof * noiseF(k, t + (S.nOff || 0)) * S.lvl[k];
    return 100 * Math.pow(Math.max(0, Math.min(1, v)), 1.45);
  }
  function radiusOf(v, L, c) {
    var x = Math.max(0, Math.min(1, v / 100));
    var a0 = 0.09 * L.u, b0 = 1.05 * L.u;
    var r0 = Math.sqrt(a0 * a0 + (b0 * b0 - a0 * a0) * x);
    var kk = 1 + 3.2 * c;
    var xs = Math.pow(x, kk) / (Math.pow(x, kk) + Math.pow(1 - x, kk));
    var a1 = (0.09 - 0.055 * c) * L.u, b1 = (1.3 + 0.75 * c) * L.u;
    var r1 = a1 + (b1 - a1) * xs;
    return r0 + (r1 - r0) * c;
  }
  function h3(a, b, c) {
    var h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  var xs = new Float32Array(MAXC), px = new Float32Array(MAXC * 5), hx = new Float32Array(MAXC * 5), rr = new Float32Array(MAXC * 5), yy = new Float32Array(MAXC * 5), cf = new Float32Array(MAXC * 5);
  var cum = new Float32Array(NCUM + 1), mday = new Float32Array(NCUM), cumKey = '';
  var MAXP = 40000, pA = new Int16Array(MAXP), pB = new Int16Array(MAXP), pReq = new Float32Array(MAXP), pWa = new Float32Array(MAXP);
  function pairGap(ra, rb) { return 1.5 + 0.12 * Math.min(ra, rb); }

  // S.span is the number of hours laid out along the strip (168 for a week), S.ring wraps the random jitter so the ends meet.
  function build(S, L, shapeOf, out) {
    var span = S.span || 24, step = span / (S.dens - 1), sc = S.scatter, i, j, k, ka, kb, ja, jb, it;
    var dtau = 24 / NCUM, mean = 0, acc = 0;
    var wkey = [S.week ? 1 : 0, S.span, S.nOff || 0, S.shift, S.spread, S.gain, S.base, S.contrast, S.size, S.warp, L.u, S.lvl.join(',')].join('|');
    if (wkey !== cumKey) {
      for (i = 0; i < NCUM; i++) {
        var u = (i + 0.5) * dtau, m = 0;
        for (k = 0; k < 5; k++) m += radiusOf(value(k, u, S), L, S.contrast);
        m = m / 5 * S.size + 0.35 * L.u;
        mday[i] = m; mean += m;
      }
      mean /= NCUM;
      cum[0] = 0;
      for (i = 0; i < NCUM; i++) { acc += Math.max(0.2, 1 + S.warp * (mday[i] / mean - 1)); cum[i + 1] = acc; }
      cumKey = wkey;
    }
    var tot = cum[NCUM], dayW = L.plotW / (span / 24), k0 = dayW / tot;
    function C(tau) {
      var d = Math.floor(tau / 24), f = (tau - d * 24) / dtau, i0 = Math.min(NCUM - 1, Math.floor(f));
      return (d * tot + cum[i0] + (cum[i0 + 1] - cum[i0]) * (f - i0)) * k0;
    }
    var c0 = C(S.t0);
    function xAt(tau) { return L.x0 + C(tau) - c0; }
    var s0 = Math.floor(S.t0 / step) - 1 - PAD;
    var nc = Math.min(MAXC, Math.ceil(span / step) + 3 + 2 * PAD);
    var x0 = L.x0, x1 = L.x0 + L.plotW, dxAvg = L.plotW * step / span;
    var rmax = (1.3 + 0.75 * S.contrast) * L.u * S.size, yC = L.yC;
    var rows = S.rows || 0;
    var ymin = 16, ymax = L.axisTop - 10, mix = S.seedMix, ampl = S.amp || 0.9 * rmax;
    var ncyc = Math.max(1, Math.round(span / step));
    for (j = 0; j < nc; j++) {
      var ts = (s0 + j) * step;
      xs[j] = xAt(ts);
      var jj = s0 + j;
      if (S.ring) jj = ((jj % ncyc) + ncyc) % ncyc;
      for (k = 0; k < 5; k++) {
        var p = k * MAXC + j, v = value(k, ts, S);
        out[p * 3 + 2] = v;
        rr[p] = radiusOf(v, L, S.contrast) * S.size;
        cf[p] = CF[shapeOf[k]];
        hx[p] = px[p] = xs[j];
        var hA = h3(jj, k, S.seed), hB = mix < 1 ? h3(jj, k, S.seedPrev) : hA;
        var hh = hB + (hA - hB) * mix; if (rows > 1) hh = Math.round(hh * (rows - 1)) / (rows - 1);
        yy[p] = yC + (hh * 2 - 1) * ampl;
      }
    }
    var maxShift = Math.max(0.5 * dxAvg, 0.22 * rmax), reachX = 2.4 * rmax + 8 + 2 * maxShift, IT = 24, np = 0;
    for (ja = 0; ja < nc; ja++) {
      for (ka = 0; ka < 5; ka++) {
        var pa = ka * MAXC + ja, ra = rr[pa] * cf[pa];
        if (ra < 0.3) continue;
        for (jb = ja; jb < nc && np < MAXP; jb++) {
          var ddx = xs[jb] - xs[ja];
          if (ddx > reachX) break;
          for (kb = (jb === ja ? ka + 1 : 0); kb < 5; kb++) {
            var pb = kb * MAXC + jb, rb = rr[pb] * cf[pb];
            if (rb < 0.3) continue;
            var D = ra + rb + pairGap(ra, rb);
            if (ddx >= D + 2 * maxShift) continue;
            pA[np] = pa; pB[np] = pb; pReq[np] = D; pWa[np] = rb * rb / (ra * ra + rb * rb);
            np++;
          }
        }
      }
    }
    for (it = 0; it < IT; it++) {
      if (it < IT - 6) {
        for (ja = 0; ja < nc; ja++) for (ka = 0; ka < 5; ka++) {
          var pg = ka * MAXC + ja;
          yy[pg] += (yC - yy[pg]) * (S.pull === undefined ? 0.1 : S.pull); px[pg] += (hx[pg] - px[pg]) * 0.04;
        }
      }
      for (var q = 0; q < np; q++) {
        var qa = pA[q], qb = pB[q], ex = px[qb] - px[qa], ey = yy[qb] - yy[qa], Dq = pReq[q];
        var d2 = ex * ex + ey * ey;
        if (d2 >= Dq * Dq) continue;
        var dist = Math.sqrt(d2);
        if (dist < 1e-3) { ex = ((qa + qb) & 1) ? 0.01 : -0.01; ey = ((qa * 7 + qb) & 1) ? 0.01 : -0.01; dist = 0.0142; }
        var push = (Dq - dist) / dist, wa = pWa[q];
        px[qa] -= ex * push * wa; yy[qa] -= ey * push * wa;
        px[qb] += ex * push * (1 - wa); yy[qb] += ey * push * (1 - wa);
      }
      for (ja = 0; ja < nc; ja++) for (ka = 0; ka < 5; ka++) {
        var pq = ka * MAXC + ja, rq = rr[pq] * cf[pq];
        yy[pq] = Math.min(Math.max(yy[pq], ymin + rq), Math.max(ymin + rq, ymax - rq));
        px[pq] = Math.min(Math.max(px[pq], hx[pq] - maxShift), hx[pq] + maxShift);
      }
    }
    for (j = 0; j < nc; j++) {
      var taper = 1;
      if (!S.ring) {
        var outside = Math.max(x0 - xs[j], xs[j] - x1, 0), tt = Math.min(1, outside / (0.9 * dxAvg));
        taper = 1 - tt * tt * (3 - 2 * tt);
      }
      for (k = 0; k < 5; k++) {
        var idx = (k * MAXC + j) * 3, pj = k * MAXC + j;
        out[idx] = yy[pj];
        out[idx + 1] = rr[pj] * taper;
      }
    }
    for (var pass = 0; pass < 2; pass++) {
      for (ja = 0; ja < nc; ja++) {
        for (ka = 0; ka < 5; ka++) {
          var ia = (ka * MAXC + ja) * 3;
          if (out[ia + 1] < 0.3) continue;
          for (jb = ja; jb < nc; jb++) {
            if (xs[jb] - xs[ja] > reachX) break;
            for (kb = (jb === ja ? ka + 1 : 0); kb < 5; kb++) {
              var ib = (kb * MAXC + jb) * 3;
              if (out[ib + 1] < 0.3) continue;
              var dxx = px[kb * MAXC + jb] - px[ka * MAXC + ja], ddy = out[ib] - out[ia], d = Math.sqrt(dxx * dxx + ddy * ddy);
              var fa = CF[shapeOf[ka]], fb = CF[shapeOf[kb]];
              var rA = out[ia + 1] * fa, rB = out[ib + 1] * fb;
              var need = rA + rB + pairGap(rA, rB) - d;
              if (need <= 0) continue;
              var aBig = rA >= rB, rl = aBig ? rA : rB, rs = aBig ? rB : rA;
              var cut = Math.min(need, rl * 0.3);
              rl -= cut; need -= cut;
              if (need > 0) rs = Math.max(rs * 0.25, rs - need);
              if (aBig) { out[ia + 1] = rl / fa; out[ib + 1] = rs / fb; }
              else { out[ib + 1] = rl / fb; out[ia + 1] = rs / fa; }
            }
          }
        }
      }
    }
    return { nc: nc, s0: s0, step: step, xs: xs, px: px, xAt: xAt, span: span };
  }
  return { MAXC: MAXC, value: value, build: build };
})();
