/*
 * Floor avatars, round 6: nasir the owl, baashe the fox, faris the beaver and qasim the cat,
 * drawn by one signed-distance fragment shader. Pair it with rig.js, which computes every
 * face channel from time alone.
 *
 * The shading (egg head, smooth union, softbox, lacquer, rim, eyes, lids, brows, mouth, gold wire)
 * is adapted from Hex Meetings (site/public/meetings, wgsl HEADS at 96d8ed3,
 * https://anoma.ly/hex/meetings/), ported from WGSL to GLSL ES 3.00, recoloured for skins and
 * extended with per-animal heads, bodies and props:
 *
 * MIT License
 *
 * Copyright (c) 2026 Christopher Langton
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Use: FRAGMENT is GLSL ES 3.00 without its #version line. In three.js, use it with VERTEX_THREE
 * in a RawShaderMaterial with glslVersion THREE.GLSL3, transparent, premultipliedAlpha and
 * toneMapped false, on a plane sized by layout(). The shader applies its own tone curve and gamma.
 * Each frame, copy uniformValues(...) into the material's uniforms.
 */

export const KINDS = { nasir: 0, baashe: 1, faris: 2, qasim: 3 };

export const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uR;
uniform vec2 uCtr;
uniform int uKind;
uniform float uSmall;
uniform vec3 uBase, uBelly, uMark, uAccent;
uniform vec2 uGaze;
uniform vec4 uLid;
uniform vec4 uBrow;
uniform float uArch;
uniform vec4 uMouth;
uniform float uSmirk;
uniform vec4 uHead;
uniform vec4 uBody;
uniform float uPupil;
uniform float uTail;
uniform float uArm;
in vec2 vUv;
out vec4 outColor;

const vec3 KEY = vec3(-0.50, -0.60, 0.62);
const vec3 FILL = vec3(-0.42, -0.55, 0.72);
const vec3 IVORY = vec3(0.955, 0.95, 0.925);
const vec3 KEYCOL = vec3(0.95, 0.975, 1.0);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sq(float x) { return x * x; }
float cov(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / max(k, 1e-3); return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdEllipse(vec2 p, vec2 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-4); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + vec2(r); return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r; }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * k); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float browAtD(vec2 p, vec2 bc, vec2 X, vec2 Y, float L, float arch, float T, out float across) {
  vec2 d = p - bc;
  float bx = dot(d, X) / L;
  float by = dot(d, Y);
  float cx = clamp(bx, -1.0, 1.0);
  float yc = -arch * L * (1.0 - cx * cx);
  float slope = 2.0 * arch * cx;
  float th = T * mix(1.0, 0.62, smoothstep(-0.3, 1.0, cx));
  float perp = (by - yc) / sqrt(1.0 + slope * slope);
  float over = max(abs(bx) - 1.0, 0.0) * L;
  across = perp / th;
  return length(vec2(over, perp)) - th;
}
vec3 softbox(vec2 nw) {
  float rad = length(nw);
  vec2 c1 = vec2(-0.664, -0.748);
  float ang1 = atan(c1.x * nw.y - c1.y * nw.x, dot(c1, nw));
  float sd1 = sdBox(vec2(rad - 0.80, ang1 * 0.80 - 0.02), vec2(0.050, 0.205), 0.050);
  float win = (1.0 - smoothstep(-0.034, 0.016, sd1)) * (0.80 + 0.30 * smoothstep(0.25, -0.2, ang1));
  float halo = exp(-max(sd1, 0.0) / 0.075);
  float sd2 = sdEllipse(nw - vec2(0.50, -0.66), vec2(0.075, 0.040));
  return vec3(win, halo, 1.0 - smoothstep(-0.03, 0.02, sd2));
}

float dome(vec2 p, vec2 r) { vec2 q = p / r; return sqrt(max(1.0 - dot(q, q), 0.0)); }
float pillow(float d, float w) { float k = clamp(-d / w, 0.0, 1.0); return sqrt(k * (2.0 - k)); }
const vec3 BEAK = vec3(0.80, 0.42, 0.08);
const vec3 HAT = vec3(0.86, 0.56, 0.12);
const vec3 STEEL = vec3(0.40, 0.42, 0.46);
const vec3 GOLD = vec3(0.95, 0.62, 0.18);

vec3 eggR() {
  if (uKind == 0) return vec3(1.04, 0.92, 0.06);
  if (uKind == 2) return vec3(1.00, 0.90, 0.08);
  if (uKind == 3) return vec3(0.96, 0.84, 0.10);
  return vec3(0.98, 0.86, 0.10);
}
vec4 eyeP() {
  float s = 1.0 + 0.26 * uSmall;
  if (uKind == 0) return vec4(1.22 * s, 0.37 + 0.02 * uSmall, -0.10, 0.0);
  if (uKind == 2) return vec4(0.94 * s, 0.36 + 0.03 * uSmall, -0.10, 0.0);
  if (uKind == 3) return vec4(1.02 * s, 0.38 + 0.03 * uSmall, -0.14, 0.0);
  return vec4(1.0 * s, 0.39 + 0.03 * uSmall, -0.13, 0.0);
}
vec3 mouthP() {
  float s = 1.0 + 0.30 * uSmall;
  if (uKind == 2) return vec3(0.50 - 0.04 * uSmall, 0.80 * (1.0 + 0.10 * uSmall), 0.80 * (1.0 + 0.60 * uSmall));
  if (uKind == 3) return vec3(0.53 - 0.05 * uSmall, 0.64 * (1.0 + 0.15 * uSmall), 0.64 * (1.0 + 0.75 * uSmall));
  return vec3(0.565, 0.74 * s, 0.74 * s);
}

vec2 earLocal(vec2 p, float side, float tw) {
  vec2 pivot = vec2(side * 0.55, -0.62);
  return pivot + rot(side * tw * 0.35) * (p - pivot);
}
float earTw(float side) { return side < 0.0 ? uBody.z : uBody.w; }
float dEar1(vec2 p, float side) {
  vec2 q = earLocal(p, side, earTw(side));
  if (uKind == 0) return sdTri(q, vec2(side * 0.40, -0.66), vec2(side * 0.98, -1.20), vec2(side * 0.98, -0.50)) - 0.05;
  if (uKind == 2) return length(q - vec2(side * 0.84, -0.40)) - 0.17;
  if (uKind == 3) return sdTri(q, vec2(side * 0.24, -0.58), vec2(side * 0.84, -1.42), vec2(side * 0.98, -0.30)) - 0.07;
  return sdTri(q, vec2(side * 0.20, -0.50), vec2(side * 0.98, -1.66), vec2(side * 1.02, -0.30)) - 0.07;
}
float dEar(vec2 p) { return min(dEar1(p, -1.0), dEar1(p, 1.0)); }
float dEarIn1(vec2 p, float side) {
  vec2 q = earLocal(p, side, earTw(side));
  if (uKind == 0) return 1e3;
  if (uKind == 2) return length(q - vec2(side * 0.84, -0.40)) - 0.085;
  if (uKind == 3) return sdTri(q, vec2(side * 0.40, -0.64), vec2(side * 0.82, -1.24), vec2(side * 0.88, -0.48)) - 0.02;
  return sdTri(q, vec2(side * 0.40, -0.62), vec2(side * 0.94, -1.38), vec2(side * 0.92, -0.50)) - 0.02;
}
float earTip(vec2 p) {
  float tip = 0.0;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec2 q = earLocal(p, side, earTw(side));
    if (uKind == 1) tip = max(tip, smoothstep(-1.20, -1.25, q.y) * step(0.3, abs(q.x)));
    if (uKind == 0) tip = max(tip, smoothstep(-0.92, -0.98, q.y) * step(0.3, abs(q.x)));
  }
  return tip;
}
float dTuft(vec2 p) {
  float d = 1e3;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    if (uKind == 1) d = min(d, sdTri(p, vec2(side * 0.62, -0.10), vec2(side * 1.22, 0.44), vec2(side * 0.40, 0.62)) - 0.05);
    if (uKind == 3) d = min(d, sdTri(p, vec2(side * 0.66, 0.00), vec2(side * 1.10, 0.28), vec2(side * 0.52, 0.50)) - 0.04);
  }
  return d;
}
float eggD(vec2 p, out float k0) {
  vec3 e = eggR();
  float rx = e.x * (1.0 - e.z * clamp(p.y, -1.0, 1.0));
  vec2 pe = vec2(p.x / rx, p.y / e.y);
  k0 = length(pe);
  return k0 * (k0 - 1.0) / max(length(pe / vec2(rx, e.y)), 1e-4);
}
float dSnout(vec2 p) {
  if (uKind == 1) return sdEllipse(p - vec2(0.0, 0.60), vec2(0.30, 0.25));
  if (uKind == 2) return sdEllipse(p - vec2(0.0, 0.46), vec2(0.46, 0.30));
  if (uKind == 3) return sdEllipse(p - vec2(0.0, 0.50), vec2(0.24, 0.17));
  return 1e3;
}

float headD(vec2 p) {
  float k0;
  float d = eggD(p, k0);
  d = smin(d, dSnout(p), 0.30);
  d = smin(d, dTuft(p), 0.20);
  d = smin(d, dEar(p), uKind == 2 ? 0.10 : 0.22);
  return d;
}
float headH(vec2 p, vec2 face) {
  float k0;
  eggD(p, k0);
  float h = sqrt(max(1.0 - k0 * k0, 0.0));
  h = smax(h, 0.42 * pillow(dEar(p), 0.26), 0.25);
  h = smax(h, 0.55 * pillow(dTuft(p), 0.30), 0.25);
  h = smax(h, (uKind == 2 ? 0.62 : 0.70) * pillow(dSnout(p), 0.28), 0.30);
  vec2 f = p - face;
  if (uKind != 0) h += 0.20 * exp(-sq(f.x / 0.30) - sq((f.y - 0.40) / 0.26));
  else h -= 0.07 * exp(-sq((abs(f.x) - 0.34) / 0.30) - sq((f.y + 0.08) / 0.30));
  h += 0.05 * exp(-sq((abs(f.x) - 0.40) / 0.24) - sq((f.y + 0.40) / 0.10));
  h += 0.04 * exp(-sq((abs(f.x) - 0.48) / 0.20) - sq((f.y - 0.16) / 0.16)) * (1.0 + max(uMouth.w, 0.0));
  return h * smoothstep(0.0, -0.04, headD(p));
}
float faceBelly(vec2 pf, float aa) {
  if (uKind == 1) {
    float yb = 0.02 + 0.80 * max(0.40 - abs(pf.x), 0.0) + 0.10 * abs(pf.x);
    return smoothstep(-0.025, 0.025, pf.y - yb);
  }
  if (uKind == 0) {
    float disc = smin(length(pf - vec2(-0.34, -0.10)) - 0.37, length(pf - vec2(0.34, -0.10)) - 0.37, 0.12);
    disc = smin(disc, sdEllipse(pf - vec2(0.0, 0.26), vec2(0.22, 0.24)), 0.10);
    return cov(disc, aa);
  }
  if (uKind == 2) return cov(sdEllipse(pf - vec2(0.0, 0.48), vec2(0.40, 0.27)), aa);
  float m = smin(sdEllipse(pf - vec2(-0.10, 0.50), vec2(0.17, 0.14)), sdEllipse(pf - vec2(0.10, 0.50), vec2(0.17, 0.14)), 0.06);
  return cov(m, aa);
}

vec2 armLocal(vec2 b, float side) {
  vec2 sh = vec2(side * 0.60, 1.30);
  float ang = -side * (side < 0.0 ? uArm : 0.30 * uArm);
  return (b - sh) * rot(ang) + sh;
}
float wingD(vec2 b, float side) { return sdEllipse(rot(side * 0.18) * (armLocal(b, side) - vec2(side * 0.74, 1.74)), vec2(0.20, 0.50)); }
float armD(vec2 b) {
  if (uKind == 0) return min(wingD(b, -1.0), wingD(b, 1.0));
  return min(sdSegment(armLocal(b, -1.0), vec2(-0.60, 1.30), vec2(-0.78, 1.98)), sdSegment(armLocal(b, 1.0), vec2(0.60, 1.30), vec2(0.78, 1.98))) - 0.16;
}
float pawD(vec2 b) { return min(length(armLocal(b, -1.0) - vec2(-0.80, 2.02)), length(armLocal(b, 1.0) - vec2(0.80, 2.02))) - 0.15; }
float bodyW() { return uKind == 0 ? 0.78 : uKind == 2 ? 0.80 : uKind == 3 ? 0.64 : 0.70; }
float feetD(vec2 b) {
  vec2 r = uKind == 0 ? vec2(0.18, 0.10) : vec2(0.25, 0.14);
  return min(sdEllipse(b - vec2(-0.30, 2.60), r), sdEllipse(b - vec2(0.30, 2.60), r));
}
float bodyD(vec2 b) {
  float w = bodyW();
  float d = sdEllipse(b - vec2(0.0, 1.80), vec2(w * (1.0 + 0.10 * clamp(b.y - 1.6, -1.0, 1.0)), 0.80));
  d = smin(d, armD(b), 0.12);
  d = smin(d, feetD(b), 0.10);
  return d;
}
float bodyH(vec2 b) {
  float h = 0.70 * dome(b - vec2(0.0, 1.80), vec2(bodyW(), 0.80));
  float arms = armD(b);
  h = mix(h, max(h, 0.42 + 0.30 * pillow(arms, 0.16)), cov(arms, 0.012));
  h = smax(h, 0.55 * pillow(feetD(b), 0.20), 0.1);
  return h * smoothstep(0.0, -0.03, bodyD(b));
}

vec2 tailLocal(vec2 b) {
  vec2 pivot = uKind == 2 ? vec2(0.30, 2.55) : vec2(0.55, 2.25);
  return rot(-uTail * (uKind == 2 ? 0.4 : 1.0)) * (b - pivot) + pivot;
}
float tailD(vec2 b) {
  vec2 q = tailLocal(b);
  if (uKind == 0) return 1e3;
  if (uKind == 2) return sdEllipse(rot(0.30) * (q - vec2(0.78, 2.50)), vec2(0.46, 0.15));
  if (uKind == 3) return min(sdSegment(q, vec2(0.45, 2.30), vec2(0.98, 2.02)), sdSegment(q, vec2(0.98, 2.02), vec2(1.06, 1.22))) - 0.085;
  return sdEllipse(rot(-0.45) * (q - vec2(0.98, 1.62)), vec2(0.30, 0.62));
}
float tailH(vec2 b) { return 0.30 * pillow(tailD(b), uKind == 3 ? 0.085 : 0.26); }
vec3 tailAlb(vec2 b, float aa) {
  vec2 q = tailLocal(b);
  if (uKind == 1) return mix(uBase, uBelly, smoothstep(-0.30, -0.42, (rot(-0.45) * (q - vec2(0.98, 1.62))).y));
  if (uKind == 3) return mix(uBase, uMark, smoothstep(1.42, 1.34, q.y));
  vec2 t = rot(0.30) * (q - vec2(0.78, 2.50));
  float hatch = min(abs(fract((t.x + t.y * 1.6) * 7.0) - 0.5), abs(fract((t.x - t.y * 1.6) * 7.0) - 0.5));
  return mix(uMark, uBase, 0.45) * mix(0.78, 1.12, smoothstep(0.06, 0.14, hatch));
}

float hatD(vec2 p) {
  if (uKind != 2) return 1e3;
  float dome_ = max(sdEllipse(p - vec2(0.0, -0.56), vec2(0.86, 0.60)), p.y + 0.50);
  float brim = sdBox(p - vec2(0.0, -0.50), vec2(1.06, 0.06), 0.05);
  return min(dome_, brim);
}
float hatH(vec2 p) {
  float h = 0.75 * pillow(hatD(p), 0.40);
  h = max(h, 0.50 * pillow(sdSegment(p, vec2(0.0, -1.10), vec2(0.0, -0.58)) - 0.07, 0.07) + 0.40 * step(hatD(p), 0.0));
  return h;
}
float antennaD(vec2 p) {
  if (uKind != 0) return 1e3;
  float stem = sdSegment(p, vec2(0.0, -0.86), vec2(0.0, -1.32)) - (0.032 + 0.02 * uSmall);
  return min(stem, length(p - vec2(0.0, -1.40)) - (0.09 + 0.02 * uSmall));
}

float propScale() { return 1.0 + 0.22 * uSmall; }
vec2 propLocal(vec2 b) {
  vec2 q = armLocal(b, -1.0) - (uKind == 0 ? vec2(-0.82, 2.10) : vec2(-0.80, 2.02));
  return q / propScale();
}
float propPartD(vec2 q, int part) {
  float t = 0.022 * uSmall;
  if (uKind == 0) {
    if (part == 0) return sdSegment(q, vec2(0.02, 0.12), vec2(-0.16, -0.70)) - 0.045 - t;
    if (part == 1) return length(q - vec2(-0.18, -0.78)) - 0.10 - t;
    return sdSegment(q, vec2(0.03, 0.16), vec2(-0.02, -0.08)) - 0.065 - t;
  }
  if (uKind == 1) {
    vec2 c = vec2(-0.12, -0.64);
    if (part == 0) return sdSegment(q, vec2(0.02, 0.14), vec2(-0.06, -0.38)) - 0.055 - t;
    if (part == 1) return abs(length(q - c) - 0.235) - 0.050 - t;
    return length(q - c) - 0.235;
  }
  if (uKind == 2) {
    vec2 c = vec2(-0.12, -0.62);
    if (part == 0) return sdSegment(q, vec2(0.03, 0.14), vec2(-0.09, -0.48)) - 0.060 - t;
    float jaw = max(length(q - c) - 0.17 - t, -sdBox(rot(0.25) * (q - c - vec2(-0.03, -0.12)), vec2(0.065 - 0.02 * uSmall, 0.12), 0.01));
    if (part == 1) return jaw;
    return 1e3;
  }
  vec2 r = rot(0.12) * (q - vec2(-0.12, -0.40));
  if (part == 0) return sdBox(r, vec2(0.25, 0.32), 0.04);
  if (part == 1) return sdBox(r - vec2(0.0, 0.03), vec2(0.19, 0.24), 0.02);
  return sdBox(r - vec2(0.0, -0.31), vec2(0.09, 0.05), 0.02);
}
float propD(vec2 b) {
  vec2 q = propLocal(b);
  return min(min(propPartD(q, 0), propPartD(q, 1)), uKind == 2 ? 1e3 : propPartD(q, 2)) * propScale();
}
float propH(vec2 b) {
  vec2 q = propLocal(b);
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    if (uKind == 1 && i == 2) continue;
    float w = uKind == 3 ? (i == 0 ? 0.10 : 0.04) : 0.06;
    h = max(h, (uKind == 3 && i == 1 ? 0.55 : 0.45) * pillow(propPartD(q, i), w));
  }
  return h;
}
vec3 propAlb(vec2 b, float aa) {
  vec2 q = propLocal(b);
  float a = aa / propScale();
  if (uKind == 0) {
    vec3 c = mix(uBelly, uMark, cov(propPartD(q, 2), a));
    return mix(c, uAccent, cov(propPartD(q, 1), a));
  }
  if (uKind == 1) return mix(uMark, uAccent, cov(propPartD(q, 1), a));
  if (uKind == 2) return mix(uBelly, uMark, smoothstep(-0.10, 0.06, q.y));
  vec3 c = mix(uMark, uBelly, cov(propPartD(q, 1), a));
  c = mix(c, uAccent, cov(propPartD(q, 2), a));
  vec2 r = rot(0.12) * (q - vec2(-0.12, -0.40));
  float tk = 0.026 + 0.03 * uSmall;
  float chk = min(sdSegment(r, vec2(-0.11, 0.02), vec2(-0.03, 0.11)), sdSegment(r, vec2(-0.03, 0.11), vec2(0.12, -0.10))) - tk;
  c = mix(c, uAccent, cov(chk, a) * cov(propPartD(q, 1), a));
  return c;
}
float lensOf(vec2 b) {
  if (uKind != 1) return 0.0;
  vec2 q = propLocal(b);
  return step(propPartD(q, 2), 0.0) * step(0.0, propPartD(q, 1));
}

vec3 mouthAt(vec3 fc0, vec2 m, vec4 mo, float smirk, float aa) {
  float dark = uKind >= 2 ? uSmall : 0.0;
  float open = mo.x, wide = mo.y, rnd = mo.z, smile = mo.w;
  float o1 = min(open, 1.0);
  float W = (0.215 + 0.08 * wide + 0.115 * o1 * (0.4 + 0.6 * wide) + 0.03 * max(smile, 0.0)) * (1.0 - 0.46 * rnd);
  float hU = (0.010 + 0.05 * rnd) * o1;
  float hL = 0.47 * o1 * (1.0 + 0.1 * rnd);
  float lift = 0.115 * abs(smile) + 0.08 * abs(smirk) + 0.06;
  if (abs(m.x) > W + 0.15 || m.y < -hU - lift - 0.04 || m.y > hL + lift + 0.05) return fc0;
  float t = clamp(m.x / W, -1.0, 1.0);
  float rem = max(1.0 - t * t, 0.0);
  float yC = -smile * 0.105 * t * t - smirk * 0.075 * t * (0.55 + 0.45 * abs(t));
  float pL = mix(0.86, 0.62, rnd);
  float yU = yC - hU * pow(rem, 0.6);
  float yL = yC + hL * pow(rem, pL);
  float H = hU + hL;
  float openK = smoothstep(0.02, 0.07, H);
  float sL = min(hL * pL * pow(max(rem, 0.02), pL - 1.0) * 2.0 * abs(t) / W, 5.0);
  float dLow = (m.y - yL) / sqrt(1.0 + sL * sL);
  float dUp = yU - m.y;
  float dX = abs(m.x) - W;
  float dM = dX > 0.0 ? length(vec2(dX, m.y - yC)) : max(dUp, dLow);
  vec3 ic = vec3(0.012, 0.006, 0.006);
  float tw = W * (0.52 - 0.12 * rnd);
  float tH = max(hL * 0.55, 0.02);
  float cyT = hL - tH * 0.26;
  vec2 lob = vec2(tw * 0.62, tH);
  float d1 = sdEllipse(m - vec2(-tw * 0.40, cyT), lob);
  float d2 = sdEllipse(m - vec2(tw * 0.40, cyT), lob);
  float kT = 0.05;
  float hT = clamp(0.5 + 0.5 * (d2 - d1) / kT, 0.0, 1.0);
  float dT = mix(d2, d1, hT) - kT * hT * (1.0 - hT);
  float up = clamp((cyT - m.y) / tH * 0.55 + 0.5, 0.0, 1.0);
  vec3 tc = mix(vec3(0.74, 0.17, 0.22), vec3(1.0, 0.44, 0.41), up);
  tc *= 1.0 - 0.35 * smoothstep(-0.03, 0.0, dT);
  ic = mix(ic, tc * 0.9, cov(dT, aa) * smoothstep(0.15, 0.30, hL) * (1.0 - 0.7 * rnd) * (1.0 - 0.8 * dark));
  float arch = pow(rem, 0.30);
  float thk = min(0.07 + 0.05 * o1, H * 0.45) * arch;
  float dTe = m.y - yU - thk;
  vec3 white = vec3(0.99, 0.99, 0.975) * mix(0.74, 1.0, smoothstep(0.0, thk * 0.5, m.y - yU)) * (1.0 - 0.11 * t * t);
  white = mix(white, vec3(0.74, 0.78, 0.86), 0.55 * smoothstep(-0.022, 0.0, dTe));
  ic = mix(ic, white * 0.94, cov(dTe, aa) * smoothstep(0.03, 0.08, H) * (1.0 - dark));
  ic *= (0.55 - 0.25 * dark) + (0.45 - 0.15 * dark) * smoothstep(0.0, -0.035, dM);
  vec3 fc = fc0;
  float low = smoothstep(-0.2, 0.55, (m.y - yC) / max(hL, 0.03));
  float rimL = exp(-sq((dM - 0.017) / 0.011));
  fc += vec3(0.36, 0.37, 0.40) * rimL * (1.0 - 0.7 * dark) * openK * (0.14 + 0.86 * low);
  fc *= 1.0 - 0.6 * exp(-sq((dM - 0.036) / 0.016)) * openK * low * (0.6 + 0.4 * dark);
  fc = mix(fc, ic, cov(dM, aa) * openK);
  float capX = cov(dX + 0.012, aa * 1.5) * (0.35 + 0.65 * pow(rem, 0.5));
  float shut = (1.0 - openK) * capX;
  float dLine = abs(m.y - yC);
  fc *= 1.0 - (0.85 + 0.1 * dark) * cov(dLine - 0.020 - 0.022 * dark, aa) * shut;
  fc += vec3(0.50, 0.51, 0.54) * 0.6 * (1.0 - 0.85 * dark) * cov(abs(m.y - yC - 0.021) - 0.0065, aa * 1.6) * shut;
  return fc;
}

vec3 lacquer(vec3 alb, vec3 N, float gloss, float dSil, vec2 nd, float rimK) {
  float wrapK = pow(clamp(0.5 + 0.5 * dot(N, normalize(KEY)), 0.0, 1.0), 1.6);
  float lift = pow(clamp(0.5 + 0.5 * dot(N, normalize(FILL)), 0.0, 1.0), 2.2);
  vec3 c = alb * (0.045 + 1.05 * wrapK) + alb * vec3(0.20, 0.22, 0.27) * lift;
  vec3 sb = softbox(N.xy);
  c += KEYCOL * (sb.x * 0.55 + sb.y * 0.06 + sb.z * 0.20) * gloss;
  float hk = max(dot(N, normalize(normalize(KEY) + vec3(0.0, 0.0, 1.0))), 0.0);
  c += vec3(1.0, 0.96, 0.92) * (pow(hk, 64.0) * 0.30 + pow(hk, 9.0) * 0.03) * gloss;
  vec2 rimDir = normalize(vec2(0.55, -0.35));
  float facing = clamp(0.5 + 0.5 * dot(nd, rimDir), 0.0, 1.0);
  float wrap = pow(facing, 1.7);
  float band = exp(dSil / (0.030 + 0.070 * wrap));
  float line = exp(dSil / 0.011);
  vec3 rimC = mix(uAccent, vec3(1.0), 0.35) * 1.15;
  c += rimC * (wrap * (band * 0.45 + line * 1.0) + 0.03 * line) * rimK;
  c += vec3(0.42, 0.52, 0.70) * 0.12 * pow(1.0 - facing, 2.0) * (exp(dSil / 0.05) * 0.6 + line * 0.5) * rimK;
  float lumA = dot(alb, vec3(0.299, 0.587, 0.114));
  c += vec3(0.50, 0.53, 0.60) * 0.40 * exp(dSil * uR / 1.3) * (1.0 - smoothstep(0.03, 0.18, lumA));
  return c;
}

vec3 eyeAt(vec3 fc, vec2 pf, float side, float aa) {
  vec4 E = eyeP();
  float size = E.x * ((uKind == 3 && side > 0.0) ? 1.12 : 1.0);
  float spacing = E.y;
  float eyeY = E.z;
  vec2 er = vec2(0.150, 0.165) * size;
  vec2 ep = rot(side * 0.16) * (pf - vec2(side * spacing, eyeY));
  vec2 en = ep / er;
  float e2 = dot(en, en);
  float e1 = sqrt(e2);
  float dEye = e1 * (e1 - 1.0) / max(length(en / er), 1e-4);
  bool right = side > 0.0;
  float lidU = right ? uLid.y : uLid.x;
  float lidL = right ? uLid.w : uLid.z;
  if (uKind == 3 && !right) { lidU = mix(lidU, 1.0, 0.42 + 0.3 * uSmall); lidL = mix(lidL, 1.0, 0.25); }
  float browAng = right ? uBrow.w : uBrow.z;
  float xn = en.x * side;
  float yLo = 1.06 - lidL * (0.98 - 0.36 * en.x * en.x);
  float yUp = mix(-1.06, yLo + 0.04, lidU) + mix(0.24, -0.26, lidU) * en.x * en.x - browAng * 0.42 * xn * (1.0 - 0.6 * lidU) + 0.10 * xn;
  float dTop = (yUp - en.y) * er.y;
  float dBot = (en.y - yLo) * er.y;
  float dOpen = max(dEye, max(dTop, dBot));
  float eyeCov = cov(dOpen, aa);
  float inEye = cov(dEye, aa);
  float onLid = inEye * (1.0 - eyeCov);
  float out_ = max(dEye, 0.0);
  fc *= 1.0 - 0.55 * exp(-out_ / 0.030) * (1.0 - inEye);
  vec2 eDir = normalize(ep + vec2(1e-4));
  float wall = clamp(dot(eDir, vec2(0.56, 0.78)), 0.0, 1.0);
  fc += vec3(0.30, 0.31, 0.345) * 0.6 * exp(-sq((dEye - 0.020) / 0.012)) * wall * (1.0 - inEye);
  if (uKind == 0) fc = mix(fc, uMark * 0.8, cov(abs(dEye - 0.03) - 0.018, aa) * (1.0 - inEye));
  if (onLid > 0.001) {
    float dEdge = max(min(dTop, 1.0) * step(0.0, dTop), min(dBot, 1.0) * step(0.0, dBot));
    float margin = (1.0 - smoothstep(0.004, 0.024 + 0.02 * uSmall, dEdge)) * onLid;
    fc = mix(fc, uMark * 0.6 * (0.5 + 0.7 * clamp(0.6 - en.x * 0.5 - en.y * 0.3, 0.0, 1.0)), margin * 0.9);
    fc *= 1.0 - 0.35 * exp(-sq((dEye + 0.012) / 0.012)) * onLid;
  }
  if (eyeCov > 0.001) {
    float ez = sqrt(max(1.0 - e2, 0.0));
    vec3 Ne = normalize(vec3(en * 0.86, ez + 0.22));
    float kd = clamp(dot(Ne, normalize(KEY)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 sc = mix(vec3(0.43, 0.48, 0.60), IVORY, smoothstep(0.0, 0.66, ez)) * (0.70 + 0.44 * kd);
    sc *= 1.0 - (0.30 + 0.34 * smoothstep(0.1, 0.6, lidU)) * exp(-max(en.y - yUp, 0.0) / 0.30);
    sc *= 1.0 - 0.22 * exp(-max(yLo - en.y, 0.0) / 0.16);
    vec2 ip = ep - vec2(uGaze.x * 0.058, uGaze.y * 0.066) * size;
    float ri = (uKind == 0 ? 0.118 : 0.098) * size;
    float rp = ri * (0.40 + 0.30 * uPupil);
    float dI = length(ip);
    float dP = uKind == 3 ? sdEllipse(ip, vec2(rp * 0.42, rp * 1.25)) : dI - rp;
    float irisCov = cov(dI - ri, aa);
    sc *= 1.0 - 0.28 * exp(-max(dI - ri, 0.0) / (0.22 * ri)) * (1.0 - irisCov);
    vec3 irisLo = vec3(0.10, 0.055, 0.020), irisHi = vec3(0.55, 0.30, 0.08);
    if (uKind == 0) { irisLo = vec3(0.35, 0.12, 0.005); irisHi = vec3(0.95, 0.52, 0.04); }
    if (uKind == 2) { irisLo = vec3(0.05, 0.025, 0.012); irisHi = vec3(0.30, 0.16, 0.06); }
    if (uKind == 3) { irisLo = vec3(0.06, 0.16, 0.01); irisHi = vec3(0.42, 0.80, 0.10); }
    vec3 iris = irisLo + irisHi * smoothstep(-0.2, 1.0, ip.y / ri) * smoothstep(rp * 0.9, ri, dI);
    iris *= 1.0 - 0.6 * smoothstep(ri * 0.80, ri, dI);
    vec3 eye = mix(sc, iris, irisCov);
    eye = mix(eye, vec3(0.003), cov(dP, aa));
    vec2 hl = rot(-0.55) * (ip - vec2(-0.36, mix(-0.37, 0.16, smoothstep(0.25, 0.8, lidU))) * ri);
    float c1 = sdBox(hl, vec2(0.215, 0.135) * ri * (1.0 + 0.35 * uSmall), 0.09 * ri);
    float c2 = length(ip - vec2(0.37, 0.40) * ri) - 0.105 * ri;
    eye = mix(eye, vec3(1.55, 1.58, 1.62), cov(c1, aa));
    eye = mix(eye, vec3(0.86, 0.90, 0.96), cov(c2, aa) * 0.8);
    eye *= 1.0 - 0.5 * smoothstep(-0.020, 0.0, dOpen);
    fc = mix(fc, eye, eyeCov);
  }
  return fc;
}

vec3 browOn(vec3 fc, vec2 pf, float side, float aa) {
  vec4 E = eyeP();
  float spacing = E.y;
  float eyeY = E.z;
  bool right = side > 0.0;
  float browUp = right ? uBrow.y : uBrow.x;
  float browAng = (right ? uBrow.w : uBrow.z) + 0.10;
  if (uKind == 3 && !right) browAng += 0.25;
  float a = browAng * 0.62;
  vec2 X = vec2(side * cos(a), -sin(a));
  vec2 Y = vec2(side * sin(a), cos(a));
  vec2 bc = vec2(side * (spacing + 0.02), eyeY - 0.230 * E.x - 0.050 - browUp * 0.12);
  float bL = 0.170 * (1.0 + 0.15 * uSmall), bT = 0.052 * (1.0 + 0.40 * uSmall);
  if (abs(pf.y - bc.y) > 0.30) return fc;
  float across;
  float sh = browAtD(pf - vec2(0.016, 0.040), bc, X, Y, bL, uArch, bT, across);
  fc *= 1.0 - 0.55 * (1.0 - smoothstep(-0.022, 0.034, sh));
  float d = browAtD(pf, bc, X, Y, bL, uArch, bT, across);
  if (d < aa) {
    float ac = clamp(across, -1.0, 1.0);
    vec3 Nb = normalize(vec3(Y * ac * 0.92 + X * 0.06, sqrt(max(1.0 - ac * ac, 0.0)) + 0.16));
    float kd = clamp(dot(Nb, normalize(KEY)), 0.0, 1.0);
    vec3 bcol = uMark * (0.40 + 0.90 * kd);
    bcol += vec3(1.0) * 0.16 * pow(max(dot(Nb, normalize(normalize(KEY) + vec3(0.0, 0.0, 1.0))), 0.0), 24.0);
    fc = mix(fc, bcol, cov(d, aa));
  }
  return fc;
}

vec3 monocle(vec3 fc, vec2 pf, float aa) {
  vec4 E = eyeP();
  vec2 gp = pf - vec2(-E.y, E.z - 0.005);
  float rad = 0.215 * E.x;
  float dLens = length(gp) - rad;
  float wire = 0.024 * (1.0 + 0.7 * uSmall);
  float inLens = step(dLens, 0.0);
  fc += vec3(0.85, 0.92, 1.0) * 0.10 * exp(-sq((gp.x * 0.7 - gp.y - 0.05) / 0.045)) * inLens;
  float ring = abs(dLens) - wire;
  float tube = clamp(dLens / wire, -1.0, 1.0);
  float up = clamp(0.55 - 0.45 * tube * sign(gp.y) - gp.y * 1.9 + gp.x * 0.5, 0.0, 1.0);
  vec3 gold = vec3(0.26, 0.15, 0.035) + vec3(1.0, 0.72, 0.30) * (0.20 + 1.1 * pow(up, 2.0));
  gold += vec3(1.0, 0.95, 0.8) * pow(up, 9.0) * 0.8;
  fc *= 1.0 - 0.45 * cov(abs(length(gp - vec2(0.012, 0.022)) - rad) - wire, aa * 2.0);
  return mix(fc, gold, cov(ring, aa));
}

vec3 noseOn(vec3 fc, vec2 pf, float aa) {
  if (uKind == 0) return fc;
  vec2 c = uKind == 2 ? vec2(0.0, 0.30) : uKind == 3 ? vec2(0.0, 0.40) : vec2(0.0, 0.40);
  vec2 r = uKind == 2 ? vec2(0.16, 0.10) : uKind == 3 ? vec2(0.075, 0.055) : vec2(0.115, 0.080);
  float dNose = uKind == 3 ? sdTri(pf, c + vec2(-0.075, -0.035), c + vec2(0.075, -0.035), c + vec2(0.0, 0.045)) - 0.02 : sdEllipse(pf - c, r);
  if (dNose < 0.2) {
    vec2 nn = (pf - c) / r;
    vec3 Nn = normalize(vec3(nn * 0.8, sqrt(max(1.0 - dot(nn, nn), 0.0)) + 0.2));
    vec3 base = uKind == 3 ? mix(uMark, vec3(0.75, 0.25, 0.28), 0.6) : uMark * 0.35;
    vec3 nc = base * (0.3 + 0.9 * clamp(dot(Nn, normalize(KEY)), 0.0, 1.0));
    nc += vec3(1.0) * 0.9 * pow(max(dot(Nn, normalize(normalize(KEY) + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
    fc *= 1.0 - 0.35 * exp(-max(dNose - 0.02, 0.0) / 0.03) * step(0.0, pf.y - c.y);
    fc = mix(fc, nc, cov(dNose, aa));
  }
  float bridge = sdSegment(pf, c + vec2(0.0, r.y), vec2(0.0, mouthP().x - 0.01)) - 0.006;
  return fc * (1.0 - 0.7 * cov(bridge, aa * 1.5));
}

vec3 beakOn(vec3 fc, vec2 pf, float aa) {
  float open = min(uMouth.x, 1.0);
  float k = 1.0 + 0.25 * uSmall;
  vec2 bp = vec2(pf.x / k, 0.02 + (pf.y - 0.02) / k);
  float o = 0.28 * open * (1.0 + 0.4 * uSmall);
  float dLo = sdTri(bp, vec2(-0.10, 0.22 + o), vec2(0.10, 0.22 + o), vec2(0.0, 0.34 + o)) - 0.02;
  float dUp = sdTri(bp, vec2(-0.12, 0.02), vec2(0.12, 0.02), vec2(0.0, 0.28 - 0.08 * open)) - 0.025;
  float dIn = sdBox(bp - vec2(0.0, 0.20 + 0.5 * o), vec2(0.10, 0.05 + 0.5 * o), 0.04);
  fc *= 1.0 - 0.45 * exp(-max(min(dUp, dLo), 0.0) / 0.03);
  fc = mix(fc, vec3(0.11, 0.014, 0.014), cov(dIn, aa) * smoothstep(0.02, 0.12, open));
  fc = mix(fc, BEAK * 0.62, cov(dLo, aa));
  float sh = clamp(0.7 - pf.x * 3.0 - (pf.y - 0.1) * 1.5, 0.0, 1.0);
  vec3 bc = BEAK * (0.55 + 0.6 * sh) + vec3(1.0, 0.9, 0.7) * 0.5 * pow(sh, 6.0);
  return mix(fc, bc, cov(dUp, aa));
}

vec3 catMarks(vec3 fc, vec2 pf, float aa) {
  float t = 0.032 + 0.02 * uSmall;
  float d = min(min(sdSegment(pf, vec2(-0.17, -0.82), vec2(-0.13, -0.56)), sdSegment(pf, vec2(0.0, -0.86), vec2(0.0, -0.56))), sdSegment(pf, vec2(0.17, -0.82), vec2(0.13, -0.56))) - t;
  fc = mix(fc, uMark * 0.9, cov(d, aa) * 0.9);
  float w = 1e3;
  for (int i = 0; i < 3; i++) {
    float k = float(i) - 1.0;
    w = min(w, sdSegment(vec2(abs(pf.x), pf.y), vec2(0.26, 0.50 + k * 0.045), vec2(0.76, 0.42 + k * 0.11)));
  }
  return mix(fc, IVORY * 0.85, cov(w - 0.007, aa) * 0.55 * (1.0 - uSmall));
}

vec3 teethOn(vec3 fc, vec2 pf, float aa, float my) {
  float d = min(sdBox(pf - vec2(-0.048, my + 0.075), vec2(0.042, 0.075), 0.018), sdBox(pf - vec2(0.048, my + 0.075), vec2(0.042, 0.075), 0.018));
  fc *= 1.0 - 0.5 * cov(d - 0.012, aa);
  vec3 tc = IVORY * (0.85 + 0.2 * clamp(0.5 - (pf.y - my) * 4.0, 0.0, 1.0));
  return mix(fc, tc, cov(d, aa));
}

vec4 over(vec4 acc, vec3 c, float a) { return vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }

vec3 normalOf(vec3 h3, float e) { return normalize(vec3(-(h3.y - h3.x) / e, -(h3.z - h3.x) / e, 1.0)); }

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 w = (px - uCtr) / uR;
  float aa = 0.85 / uR;
  float e = 1.0 / uR;

  float lean = uBody.x;
  vec2 b = w;
  b.x -= lean * (2.70 - b.y);
  b.y -= uBody.y * (2.70 - b.y) * 0.4;

  vec2 hp = w - vec2(lean * 2.4, uBody.y * 1.2 + 0.18);
  hp = rot(-uHead.x) * hp;
  float st = uHead.y;
  hp = vec2(hp.x * sqrt(st), hp.y / st);
  vec2 face = uHead.zw;

  float dH = headD(hp);
  float dBd = bodyD(b);
  float dT = tailD(b);
  float dHat = hatD(hp);
  float dAnt = antennaD(hp);
  float dPr = propD(b);
  float dU = min(min(min(dH, dBd), min(dT, dHat)), min(dAnt, dPr));
  if (dU > aa * 2.0 + 0.05) { outColor = vec4(0.0); return; }

  vec4 acc = vec4(0.0);

  if (dT < aa) {
    vec3 N = normalOf(vec3(tailH(b), tailH(b + vec2(e, 0.0)), tailH(b + vec2(0.0, e))), e);
    vec3 c = lacquer(tailAlb(b, aa), N, 0.40, dT, normalize(N.xy + 1e-4), 0.7);
    c *= 1.0 - 0.45 * smoothstep(0.02, -0.06, dBd - 0.06);
    acc = over(acc, c, cov(dT, aa));
  }

  if (dBd < aa) {
    vec3 N = normalOf(vec3(bodyH(b), bodyH(b + vec2(e, 0.0)), bodyH(b + vec2(0.0, e))), e);
    float shirt = smoothstep(2.30, 2.26, b.y);
    vec3 alb = mix(uBase, uAccent, shirt);
    float vneck = smoothstep(aa, -aa, abs(b.x) - 0.26 * clamp((1.50 - b.y) / 0.50, 0.0, 1.0)) * step(0.9, b.y) * step(b.y, 1.50);
    alb = mix(alb, uBelly, vneck * shirt);
    vec3 footC = uKind == 0 ? BEAK : uKind == 3 ? uBelly : uMark;
    alb = mix(alb, footC, smoothstep(0.03, -0.01, feetD(b)) * step(2.42, b.y));
    float arm = armD(b);
    if (uKind == 0) alb = mix(alb, mix(uBase, uMark, smoothstep(1.85, 2.15, b.x < 0.0 ? armLocal(b, -1.0).y : armLocal(b, 1.0).y)), cov(arm, aa));
    else alb = mix(alb, uKind == 3 ? uBelly : uMark, cov(pawD(b), aa));
    vec3 c = lacquer(alb, N, 0.20, dBd, normalize(N.xy + 1e-4), 0.55);
    c *= 1.0 - 0.55 * exp(-max(dH, 0.0) / 0.09) * step(0.0, dH);
    acc = over(acc, c, cov(dBd, aa));
  }

  if (dAnt < aa) {
    float ball = length(hp - vec2(0.0, -1.40)) - (0.09 + 0.02 * uSmall);
    vec2 bn = (hp - vec2(0.0, -1.40)) / (0.09 + 0.02 * uSmall);
    vec3 N = ball < 0.0 ? normalize(vec3(bn, sqrt(max(1.0 - dot(bn, bn), 0.0)))) : normalize(vec3(sign(hp.x) * min(abs(hp.x) / 0.04, 1.0), 0.0, 1.0));
    vec3 c = lacquer(ball < 0.0 ? GOLD : STEEL, N, 0.9, dAnt, normalize(N.xy + 1e-4), 0.6);
    acc = over(acc, c, cov(dAnt, aa));
  }

  if (dH < aa) {
    vec3 N = normalOf(vec3(headH(hp, face), headH(hp + vec2(e, 0.0), face), headH(hp + vec2(0.0, e), face)), e);
    vec2 pf = hp - face;
    vec2 nd = normalize(rot(uHead.x) * N.xy + 1e-4);
    vec3 Nw = vec3(rot(uHead.x) * N.xy, N.z);

    vec3 alb = mix(uBase, uBelly, faceBelly(pf, aa));
    float dEi = min(dEarIn1(hp, -1.0), dEarIn1(hp, 1.0));
    float tip = earTip(hp);
    alb = mix(alb, uBelly * (uKind == 3 ? vec3(1.0, 0.82, 0.80) : vec3(0.92)), cov(dEi, aa) * (1.0 - tip));
    alb = mix(alb, mix(uMark, uBase, 0.22), tip);

    float gloss = 0.55 * mix(1.0, 0.5, smoothstep(-0.28, -0.62, pf.y));
    vec3 fc = lacquer(alb, Nw, gloss, dH, nd, 1.0);

    if (uKind == 3) fc = catMarks(fc, pf, aa);
    fc = noseOn(fc, pf, aa);
    fc = eyeAt(fc, pf, -1.0, aa);
    fc = eyeAt(fc, pf, 1.0, aa);
    fc = browOn(fc, pf, -1.0, aa);
    fc = browOn(fc, pf, 1.0, aa);
    if (uKind == 1) fc = monocle(fc, pf, aa);
    if (uKind == 0) fc = beakOn(fc, pf, aa);
    else {
      vec3 M = mouthP();
      float my = M.x + 0.03 * min(uMouth.x, 1.0);
      fc = mouthAt(fc, (pf - vec2(0.0, my)) / M.zy, uMouth, uSmirk, aa / M.y);
      if (uKind == 2) fc = teethOn(fc, pf, aa, M.x - 0.005);
    }
    acc = over(acc, fc, cov(dH, aa));
  }

  if (dPr < aa) {
    vec3 N = normalOf(vec3(propH(b), propH(b + vec2(e, 0.0)), propH(b + vec2(0.0, e))), e);
    vec3 c = lacquer(propAlb(b, aa), N, 0.7, dPr, normalize(N.xy + 1e-4), 0.6);
    float lens = lensOf(b);
    vec2 lq = propLocal(b) - vec2(-0.12, -0.64);
    c = mix(c, mix(acc.rgb / max(acc.a, 1e-4), uBelly, 0.25) + vec3(0.9, 0.95, 1.0) * 0.35 * exp(-sq((lq.x * 0.7 + lq.y + 0.08) / 0.05)), lens * step(0.5, acc.a));
    acc = over(acc, c, cov(dPr, aa) * (1.0 - lens * (1.0 - step(0.5, acc.a)) * 0.45));
  }

  if (dHat < aa) {
    vec3 N = normalOf(vec3(hatH(hp), hatH(hp + vec2(e, 0.0)), hatH(hp + vec2(0.0, e))), e);
    vec3 Nw = vec3(rot(uHead.x) * N.xy, N.z);
    vec3 c = lacquer(HAT, Nw, 0.6, dHat, normalize(rot(uHead.x) * N.xy + 1e-4), 0.8);
    acc = over(acc, c, cov(dHat, aa));
  }

  float al = acc.a;
  vec3 col = acc.rgb / max(al, 1e-4);
  float bl = dot(uBase, vec3(0.299, 0.587, 0.114));
  float sat = (max(uBase.r, max(uBase.g, uBase.b)) - min(uBase.r, min(uBase.g, uBase.b))) / max(max(uBase.r, max(uBase.g, uBase.b)), 1e-4);
  float rimW = max(1.0 - smoothstep(0.03, 0.12, bl), (1.0 - smoothstep(0.15, 0.45, sat)) * (1.0 - smoothstep(0.35, 0.60, bl)));
  col += vec3(0.62, 0.66, 0.74) * 0.55 * rimW * exp(dU * uR / 1.4) * step(dU, 0.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(vec3(0.97, 1.0, 0.99), vec3(1.03, 1.0, 0.97), smoothstep(0.0, 0.8, lum));
  col = col / (1.0 + 0.25 * col);
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  outColor = vec4(col * al, al);
}
`;

export const VERTEX_THREE = `in vec3 position;
in vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const srgbToLinear = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
};

export function layout(h, dpr) {
  const width = Math.round(h * 0.8);
  const height = Math.round(h * 1.12);
  const R = (h * dpr) / 4.24;
  const px = [Math.round(width * dpr), Math.round(height * dpr)];
  return {
    width,
    height,
    px,
    R,
    ctr: [px[0] / 2, px[1] - h * dpr * 0.03 - 2.72 * R],
    small: Math.min(Math.max((96 - h) / 32, 0), 1),
  };
}

export function uniformValues({ id, skin, accent, h, dpr }, rig) {
  const L = layout(h, dpr);
  return {
    uKind: KINDS[id],
    uSmall: L.small,
    uRes: L.px,
    uR: L.R,
    uCtr: L.ctr,
    uBase: srgbToLinear(skin[0]),
    uBelly: srgbToLinear(skin[1]),
    uMark: srgbToLinear(skin[2]),
    uAccent: srgbToLinear(accent),
    uGaze: rig.gaze,
    uLid: rig.lid,
    uBrow: rig.brow.slice(0, 4),
    uArch: rig.brow[4],
    uMouth: rig.mouth,
    uSmirk: rig.smirk,
    uHead: rig.head,
    uBody: rig.body,
    uPupil: rig.pupil,
    uTail: rig.tail,
    uArm: rig.arm,
  };
}
