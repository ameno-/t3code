/*
 * Floor avatars, round 6: the face rig shared by nasir, baashe, faris and qasim.
 *
 * Every channel is a function of time alone, so any frame can be drawn cold.
 *
 * blinkAt, drift, seat, smooth, hash, bell and visemeOf are adapted from Hex Meetings
 * (site/public/meetings/cast.js at 96d8ed3, https://anoma.ly/hex/meetings/):
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
 */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => {
  k = clamp(k);
  return k * k * (3 - 2 * k);
};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const bell = (x) => {
  const k = clamp(1 - Math.abs(x));
  return k * k * (3 - 2 * k);
};
const blinkAt = (u, w = 1) =>
  u <= 0 ? 0 : u < 0.06 * w ? smooth(u / (0.06 * w)) : 1 - smooth((u - 0.06 * w) / (0.13 * w));
const drift = (t, every, seed) => {
  const f = t / every + seed,
    i = Math.floor(f),
    k = smooth((f - i - 0.55) / 0.45);
  return lerp(hash(i * 1.37 + seed), hash((i + 1) * 1.37 + seed), k) * 2 - 1;
};
function visemeOf(word) {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = (w.match(/[aeiouy]+/) ?? ["a"])[0];
  let o = 0.9,
    wide = 0.55,
    round = 0;
  if (/^(o|u)/.test(v) || /^w/.test(w)) {
    round = 0.85;
    wide = 0.1;
    o = 0.8;
  } else if (/^(e|i|y)/.test(v)) {
    wide = 1;
    o = 0.62;
  } else {
    wide = 0.75;
    o = 1;
  }
  return { o, wide, round, shut: /^[mbp]/.test(w) };
}

const SEED = 3.7;
const LINE = "found it the cache key was missing the branch so both runs shared one build".split(
  " ",
);
const WORD = 0.27;

const REST = {
  gx: 0,
  gy: 0,
  lu: 0.3,
  ll: 0.12,
  bu: 0,
  ba: 0.18,
  arch: 0.18,
  open: 0,
  wide: 0.3,
  round: 0,
  smile: 0.22,
  smirk: 0.35,
  roll: 0,
  fx: 0,
  fy: 0,
  lean: 0,
  earL: 0,
  earR: 0,
  pupil: 0.55,
  arm: 0,
};

function idle(t) {
  return {
    ...REST,
    gx: 0.55 * drift(t, 2.6, SEED),
    gy: 0.25 * drift(t, 3.3, SEED + 2),
    roll: 0.035 * drift(t, 4.1, SEED + 5),
    fx: 0.05 * drift(t, 3.7, SEED + 7),
    earL: 0.5 * bell(((t % 6.3) - 4.9) / 0.16),
  };
}

function talking(t) {
  const i = Math.floor(t / WORD);
  const u = t / WORD - i;
  const word = LINE[((i % LINE.length) + LINE.length) % LINE.length];
  const v = visemeOf(word);
  const jaw = v.shut
    ? 0.15 * bell((u - 0.6) / 0.4)
    : smooth(clamp(u / 0.22)) *
      smooth(clamp((0.97 - u) / 0.3)) *
      (0.78 + 0.22 * Math.sin(Math.PI * u));
  const env = v.shut ? 0.15 * bell((u - 0.6) / 0.4) : Math.sin(Math.PI * clamp(u * 1.15)) ** 0.8;
  const stress = word.length > 4 ? 1 : 0.35;
  return {
    ...REST,
    gx: 0.25 * drift(t, 1.4, SEED + 11) - 0.15,
    gy: -0.1,
    lu: 0.18 - 0.08 * stress * env,
    bu: 0.28 * stress * env + 0.1,
    ba: 0.05,
    arch: 0.3,
    open: v.o * jaw,
    wide: v.wide,
    round: v.round,
    smile: 0.3,
    smirk: 0.15,
    arm: 0.1 * stress * env,
    roll: 0.03 * Math.sin(t * 2.1),
    fx: 0.04 * Math.sin(t * 1.3),
    fy: 0.03 * stress * env,
    pupil: 0.62,
  };
}

function listening(t) {
  const nod = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 1.6);
  return {
    ...REST,
    gx: -0.6 + 0.1 * drift(t, 2.2, SEED + 13),
    gy: -0.05,
    lu: 0.14,
    ll: 0.08,
    bu: 0.32,
    ba: -0.12,
    arch: 0.32,
    smile: 0.4,
    smirk: 0.0,
    roll: -0.16,
    fx: -0.1,
    fy: 0.035 * nod,
    lean: -0.06,
    earR: 0.7 * bell(((t % 3.4) - 1.2) / 0.18),
    pupil: 0.78,
  };
}

function working(t) {
  const beat = Math.sin((t * 2 * Math.PI) / 0.9);
  return {
    ...REST,
    gx: -0.3 + 0.15 * drift(t, 1.9, SEED + 17),
    gy: 0.45,
    lu: 0.4,
    ll: 0.18,
    bu: -0.1,
    ba: 0.3,
    arch: 0.08,
    smile: 0.08,
    smirk: 0.3,
    roll: 0.05 + 0.025 * Math.sin((t * 2 * Math.PI) / 1.8),
    fx: -0.04,
    fy: 0.035 * Math.max(beat, 0),
    lean: -0.03,
    pupil: 0.45,
    arm: 0.17 + 0.21 * beat,
  };
}

const STATES = { idle, talking, listening, working };
const LAG = {
  gx: 0.035,
  gy: 0.035,
  lu: 0.035,
  ll: 0.035,
  pupil: 0.035,
  open: 0.075,
  wide: 0.075,
  round: 0.075,
  smile: 0.075,
  smirk: 0.075,
};

const CYCLE = [
  ["idle", 0, 3.2],
  ["talking", 3.2, 7.6],
  ["listening", 7.6, 11.4],
  ["idle", 11.4, 12.0],
];
const CYCLE_LEN = 12.0;
const BLINKS_CYCLE = [
  [1.9, 1],
  [5.05, 1],
  [8.3, 1.6],
  [10.4, 1.6],
];

function weightsAt(t) {
  const w = { idle: 0, talking: 0, listening: 0 };
  const fade = 0.35;
  for (const [name, a, b] of CYCLE) {
    const k = smooth((t - a + fade) / (2 * fade)) * (1 - smooth((t - b + fade) / (2 * fade)));
    w[name] += k;
  }
  w.idle += 1 - smooth((t + fade) / (2 * fade));
  return w;
}

function poseAt(state, t) {
  if (state !== "cycle") {
    const p = {};
    for (const k of Object.keys(REST)) p[k] = STATES[state](t - (LAG[k] ?? 0))[k];
    return p;
  }
  const p = {};
  for (const k of Object.keys(REST)) {
    const tk = t - (LAG[k] ?? 0);
    const w = weightsAt(tk);
    let s = 0,
      n = 0;
    const loopTk = tk > CYCLE.at(-1)[1] - 1 ? tk - CYCLE_LEN : tk;
    for (const name of Object.keys(STATES))
      if (w[name] > 0) {
        s += w[name] * STATES[name](name === "idle" ? loopTk : tk)[k];
        n += w[name];
      }
    p[k] = n > 0 ? s / n : REST[k];
  }
  return p;
}

function blinkOf(state, t) {
  if (state === "blink") return [blinkAt(t, 1.4), blinkAt(t - 0.016, 1.4)];
  if (state === "cycle") {
    let l = 0,
      r = 0;
    for (const [tb, w] of BLINKS_CYCLE) {
      l = Math.max(l, blinkAt(t - tb, w));
      r = Math.max(r, blinkAt(t - tb - 0.016, w));
    }
    return [l, r];
  }
  const every = state === "listening" ? 4.2 : state === "working" ? 3.7 : 3.1;
  const slot = Math.floor(t / every);
  const tb = slot * every + 0.6 + 1.2 * hash(slot + SEED);
  const w = state === "listening" ? 1.6 : 1;
  return [blinkAt(t - tb, w), blinkAt(t - tb - 0.016, w)];
}

function rigAt(state, t) {
  const base = state === "blink" ? "idle" : state;
  const tc = state === "cycle" ? ((t % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN : t;
  const p = poseAt(base, state === "blink" ? 0.4 : tc);
  const [bl, br] = blinkOf(state, tc);
  const breathe = Math.sin((tc * 2 * Math.PI) / 3.6);
  const wag = Math.sin((tc * 2 * Math.PI) / 2.4) * (state === "listening" ? 0.6 : 1);
  return {
    gaze: [p.gx * (1 - 0.6 * Math.max(bl, br)), p.gy],
    lid: [lerp(p.lu, 1, bl), lerp(p.lu, 1, br), clamp(p.ll + 0.3 * bl), clamp(p.ll + 0.3 * br)],
    brow: [p.bu - 0.08 * bl, p.bu - 0.08 * br, p.ba, p.ba, p.arch],
    mouth: [p.open, p.wide, p.round, p.smile],
    smirk: p.smirk,
    head: [p.roll, 1 + 0.012 * breathe, p.fx, p.fy],
    body: [p.lean, 0.012 * breathe, p.earL, p.earR],
    pupil: p.pupil,
    tail: 0.22 * wag,
    arm: p.arm + 0.03 * breathe,
  };
}

export { rigAt };
