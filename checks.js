export const NOSE = 0, LSH = 11, RSH = 12, LWR = 15, RWR = 16, LHIP = 23, RHIP = 24, LANK = 27, RANK = 28;
// Pure checks on MediaPipe Pose landmarks (normalised image coordinates). No browser APIs, so Node can test them.
// Each part and its points: the head, both hands (wrists) and both feet (ankle, heel, toe).
const PARTS = { head: [[NOSE]], hands: [[LWR], [RWR]], feet: [[LANK, LANK + 2, LANK + 4], [RANK, RANK + 2, RANK + 4]] };
const MARGIN = 0.015;
const inside = (p) => p.x >= MARGIN && p.x <= 1 - MARGIN && p.y >= MARGIN && p.y <= 1 - MARGIN;
// A part is missing when any of its points lies past the edge of the picture (the tracker still places points it can't
// see), or when none of it can be seen at all. A hand or foot hidden behind the body, as in a side-on take, is fine as
// long as the other one shows.
export function framing(lm) {
  const missing = new Set();
  for (const [part, groups] of Object.entries(PARTS)) {
    const bar = part === "feet" ? 0.3 : 0.5; // bare feet on a pale floor read faintly
    let seen = false, out = false;
    for (const g of groups) {
      if (!inside(lm[g[0]])) out = true;
      if (Math.max(...g.map((i) => lm[i].visibility ?? 1)) >= bar) seen = true;
    }
    if (out || !seen) missing.add(part);
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
// Shoulder width over torso length on screen: large facing the camera, small side-on. Used only without world landmarks.
export function facingRatio(lm, aspect) { return Math.hypot((lm[LSH].x - lm[RSH].x) * aspect, lm[LSH].y - lm[RSH].y) / torso(lm, aspect); }
// How square the shoulders are to the camera, from the tracker's 3D world landmarks: 1 facing it, 0 side-on. Uses depth,
// so it holds with the phone upright or sideways and on any lens.
export function frontness(wl) {
  const x = wl[RSH].x - wl[LSH].x, y = wl[RSH].y - wl[LSH].y, z = wl[RSH].z - wl[LSH].z;
  return Math.hypot(x, y) / (Math.hypot(x, y, z) || 1e-6);
}
// Which side is nearer the camera when side-on: the tracker's depth (z, smaller = nearer) of the two shoulders and hips.
export function nearSide(lm) { return lm[LSH].z + lm[LHIP].z < lm[RSH].z + lm[RHIP].z ? "L" : "R"; }
// facing: "front", "sideL" (left side to the camera) or "sideR"; plain "side" accepts either side.
// wl: the frame's world landmarks when the tracker gave them (it always does on the phone).
export function facingOk(lm, aspect, facing, wl) {
  const front = wl ? frontness(wl) > 0.55 : facingRatio(lm, aspect) > 0.4;
  if (facing === "front") return front;
  const side = wl ? frontness(wl) < 0.7 : facingRatio(lm, aspect) < 0.42;
  if (!side) return false;
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
    // Facing is only a loose guide: a fighting stance turns the body (staggered feet, an open chest), so a take is redone
    // only when it was clearly filmed the wrong way round, and never for a strike, fall or kneel.
    const square = frames.filter((f) => facingOk(f.lm, aspect, "front", f.wl)).length / frames.length;
    metrics.facingFront = square;
    const loose = shot.kind === "still" || shot.kind === "loop";
    const wantSide = facing === "sideR" ? "R" : facing === "sideL" ? "L" : null;
    if (loose && facing === "front" && square < 0.1) return { good: false, reason: "Face the camera for this one.", metrics };
    if (loose && facing !== "front" && square > 0.95) return { good: false, reason: `Turn side-on, ${wantSide === "R" ? "right" : "left"} side to the camera.`, metrics };
    if (wantSide && facing !== "front" && square < 0.5) {
      const near = frames.filter((f) => nearSide(f.lm) === wantSide).length / frames.length;
      metrics.nearSide = near;
      if (near < 0.15) return { good: false, reason: `Wrong side. Turn your ${wantSide === "R" ? "right" : "left"} side to the camera.`, metrics };
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

