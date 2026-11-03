export const NOSE = 0, LSH = 11, RSH = 12, LWR = 15, RWR = 16, LHIP = 23, RHIP = 24, LANK = 27, RANK = 28;
// Pure checks on MediaPipe Pose landmarks (normalised image coordinates). No browser APIs, so Node can test them.
const KEY = [[NOSE, "head"], [LWR, "hands"], [RWR, "hands"], [LANK, "feet"], [RANK, "feet"]];
const MARGIN = 0.015;
export function framing(lm) {
  const missing = new Set();
  for (const [i, part] of KEY) {
    const p = lm[i];
    if ((p.visibility ?? 1) < 0.5 || p.x < MARGIN || p.x > 1 - MARGIN || p.y < MARGIN || p.y > 1 - MARGIN) missing.add(part);
  }
  const hipX = (lm[LHIP].x + lm[RHIP].x) / 2;
  const centred = hipX > 0.22 && hipX < 0.78;
  return { ok: missing.size === 0 && centred, missing, centred };
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function torso(lm, aspect) {
  const s = mid(lm[LSH], lm[RSH]), h = mid(lm[LHIP], lm[RHIP]);
  return Math.hypot((s.x - h.x) * aspect, s.y - h.y) || 1e-3;
}
// Shoulder width over torso length: large facing the camera, small side-on.
export function facingRatio(lm, aspect) { return Math.abs(lm[LSH].x - lm[RSH].x) * aspect / torso(lm, aspect); }
// Which side is nearer the camera when side-on: the tracker's depth (z, smaller = nearer) of the two shoulders and hips.
export function nearSide(lm) { return lm[LSH].z + lm[LHIP].z < lm[RSH].z + lm[RHIP].z ? "L" : "R"; }
// facing: "front", "sideL" (left side to the camera) or "sideR"; plain "side" accepts either side.
export function facingOk(lm, aspect, facing) {
  const r = facingRatio(lm, aspect);
  if (facing === "front") return r > 0.45;
  if (r >= 0.42) return false;
  return facing === "side" || nearSide(lm) === (facing === "sideR" ? "R" : "L");
}
export function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

// Verdict for one recorded take: { good, reason, metrics }.
// tries = how many camera frames the tracker ran on during the take (seen or not).
export function judge(frames, shot, facing, tries, aspect) {
  const metrics = { frames: frames.length };
  metrics.tries = tries;
  if (frames.length < 8 || frames.length < tries * 0.6) return { good: false, reason: "I lost sight of you. Stay in the frame.", metrics };
  // Framing
  const counts = { head: 0, hands: 0, feet: 0 }; let offCentre = 0;
  for (const f of frames) { const r = framing(f.lm); for (const m of r.missing) counts[m]++; if (!r.centred) offCentre++; }
  metrics.out = counts; metrics.offCentre = offCentre / frames.length;
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const outLimit = shot.kind === "fall" ? 0.35 : 0.12; // a fall may tip a hand or foot out briefly
  if (worst[1] / frames.length > outLimit) return { good: false, reason: `Your ${worst[0]} left the frame.`, metrics };
  if (metrics.offCentre > 0.3) return { good: false, reason: "Move back to the middle of the frame.", metrics };
  // Facing (skip for falls and kneels, which turn the body)
  if (shot.kind !== "fall" && shot.kind !== "kneel") {
    const r = median(frames.map((f) => facingRatio(f.lm, aspect)));
    metrics.facing = r;
    if (facing === "front" && r < 0.4) return { good: false, reason: "Face the camera for this one.", metrics };
    const wantSide = facing === "sideR" ? "R" : facing === "sideL" ? "L" : null;
    if (facing !== "front" && r > 0.5) return { good: false, reason: `Turn side-on, ${wantSide === "R" ? "right" : "left"} side to the camera.`, metrics };
    if (wantSide) {
      const near = frames.filter((f) => nearSide(f.lm) === wantSide).length / frames.length;
      metrics.nearSide = near;
      if (near < 0.6) return { good: false, reason: `Wrong side. Turn your ${wantSide === "R" ? "right" : "left"} side to the camera.`, metrics };
    }
  }
  // Motion
  const T = median(frames.map((f) => torso(f.lm, aspect)));
  const speed = (idx) => {
    let sum = 0, peak = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i], dt = (b.t - a.t) / 1000 || 1 / 30;
      let v = 0; for (const j of idx) v += Math.hypot((b.lm[j].x - a.lm[j].x) * aspect, b.lm[j].y - a.lm[j].y);
      v = v / idx.length / T / dt; sum += v; peak = Math.max(peak, v);
    }
    return { mean: sum / Math.max(1, frames.length - 1), peak };
  };
  const limbs = speed([LWR, RWR, LANK, RANK]);
  const hipY = frames.map((f) => (f.lm[LHIP].y + f.lm[RHIP].y) / 2);
  const hipX = frames.map((f) => (f.lm[LHIP].x + f.lm[RHIP].x) / 2 * aspect);
  metrics.limbMean = limbs.mean; metrics.limbPeak = limbs.peak;
  const n = frames.length, head = Math.max(3, Math.round(n * 0.12));
  const avg = (a, from, to) => a.slice(from, to).reduce((s, v) => s + v, 0) / Math.max(1, to - from);
  const startY = avg(hipY, 0, head), endY = avg(hipY, n - head, n), maxY = Math.max(...hipY);
  const travel = (Math.max(...hipX) - Math.min(...hipX)) / T;
  metrics.travel = travel; metrics.drop = (maxY - startY) / T; metrics.endDrop = (endY - startY) / T;
  switch (shot.kind) {
    case "still":
      if (travel > 1.2) return { good: false, reason: "Stay on one spot for this one.", metrics };
      break;
    case "loop":
      if (limbs.mean < 0.35) return { good: false, reason: "I didn't see much movement. Go a bit bigger.", metrics };
      break;
    case "shot":
      if (limbs.peak < 1.2) return { good: false, reason: "I didn't see the move. Go a bit bigger.", metrics };
      break;
    case "fall":
      if (metrics.endDrop < 0.5) return { good: false, reason: "End down on the cushions.", metrics };
      break;
    case "kneel":
      if (metrics.drop < 0.2) return { good: false, reason: "Go lower.", metrics };
      if (Math.abs(metrics.endDrop) > 0.25) return { good: false, reason: "Come back up at the end.", metrics };
      break;
  }
  return { good: true, reason: "", metrics };
}

