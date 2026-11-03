// Unit checks for checks.js on synthetic poses. Run: node test_checks.mjs
import { framing, facingOk, judge } from "./checks.js";

const ASPECT = 16 / 9;
// A standing body centred at x=cx, facing front (shoulder half-width sw) or side (small sw), image coords 0..1.
function pose({ cx = 0.5, sw = 0.05, hipY = 0.55, armSwing = 0, legSwing = 0, low = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, visibility: 0.99 }));
  const set = (i, x, y) => { lm[i] = { x, y, visibility: 0.99 }; };
  const hy = hipY + low;
  set(0, cx, 0.2 + low);                       // nose
  set(11, cx - sw, 0.3 + low); set(12, cx + sw, 0.3 + low);   // shoulders
  set(15, cx - sw - 0.02 + armSwing, 0.5 + low); set(16, cx + sw + 0.02 - armSwing, 0.5 + low); // wrists
  set(23, cx - sw * 0.7, hy); set(24, cx + sw * 0.7, hy);       // hips
  set(27, cx - 0.03 + legSwing, Math.min(0.9, 0.9 + low * 0.2)); set(28, cx + 0.03 - legSwing, Math.min(0.9, 0.9 + low * 0.2)); // ankles
  return lm;
}
const frames = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i * 33, lm: fn(i) }));
let fails = 0;
const expect = (name, cond, extra = "") => { if (!cond) { fails++; console.log("FAIL", name, extra); } else console.log("ok  ", name); };

const front = pose({ sw: 0.06 }), side = pose({ sw: 0.01 });
expect("front body in frame", framing(front).ok);
expect("front facing front", facingOk(front, ASPECT, "front"));
expect("side facing side", facingOk(side, ASPECT, "side"));
expect("front is not side", !facingOk(front, ASPECT, "side"));
const feetOut = pose(); feetOut[27].y = 0.995; feetOut[28].y = 0.995;
expect("feet out detected", framing(feetOut).missing.has("feet"));
expect("off centre detected", !framing(pose({ cx: 0.85 })).centred);

const shot = (kind) => ({ kind, secs: 5 });
let v = judge(frames(150, () => pose({ sw: 0.06 })), shot("still"), "front", 150, ASPECT);
expect("still front passes", v.good, JSON.stringify(v));
v = judge(frames(150, () => pose({ sw: 0.06 })), shot("still"), "side", 150, ASPECT);
expect("still facing wrong fails", !v.good && /side-on/.test(v.reason), v.reason);
v = judge(frames(150, () => pose({ sw: 0.06 })), shot("loop"), "front", 150, ASPECT);
expect("loop with no motion fails", !v.good && /movement/.test(v.reason), v.reason);
v = judge(frames(150, (i) => pose({ sw: 0.06, armSwing: 0.04 * Math.sin(i / 3), legSwing: 0.03 * Math.sin(i / 3) })), shot("loop"), "front", 150, ASPECT);
expect("loop with motion passes", v.good, JSON.stringify(v.metrics));
v = judge(frames(150, (i) => pose({ sw: 0.06, armSwing: i > 60 && i < 70 ? 0.2 * Math.sin((i - 60) / 3) : 0 })), shot("shot"), "front", 150, ASPECT);
expect("shot with a strike passes", v.good, JSON.stringify(v.metrics));
v = judge(frames(150, (i) => pose({ sw: 0.06, low: Math.min(0.3, i / 200) })), shot("fall"), "front", 150, ASPECT);
expect("fall ending low passes", v.good, JSON.stringify(v));
v = judge(frames(150, () => pose({ sw: 0.06 })), shot("fall"), "front", 150, ASPECT);
expect("fall staying up fails", !v.good, v.reason);
v = judge(frames(150, (i) => pose({ sw: 0.06, low: i < 50 ? i / 250 : i < 100 ? 0.2 : Math.max(0, 0.2 - (i - 100) / 250) })), shot("kneel"), "front", 150, ASPECT);
expect("kneel down and up passes", v.good, JSON.stringify(v));
v = judge(frames(40, () => pose({ sw: 0.06 })), shot("still"), "front", 150, ASPECT);
expect("lost sight fails", !v.good && /lost sight/.test(v.reason), v.reason);
const outFrames = frames(150, (i) => { const p = pose({ sw: 0.06 }); if (i % 2) { p[27].y = 0.995; p[28].y = 0.995; } return p; });
v = judge(outFrames, shot("still"), "front", 150, ASPECT);
expect("feet out half the time fails", !v.good && /feet/.test(v.reason), v.reason);
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
