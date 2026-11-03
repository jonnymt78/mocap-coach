// Mocap Coach: a hands-free motion-capture session on one phone. The back camera records one continuous video, the coach
// calls each move out loud, MediaPipe Pose and Hand Landmarker (running on the phone) track the body and both hands, each
// take is checked, and the session saves as one video plus a take list (start/end of every take, verdict, and the tracked
// body and hand landmarks) for cutting on the PC.
import { PoseLandmarker, HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { SESSIONS, SHOTS, KEY_SIDE } from "./shots.js";
import { framing, facingOk, judge } from "./checks.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSION = "1.4";

// ------------------------------------------------------------------ body tracking
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let landmarker = null, handLandmarker = null;
async function loadTracker() {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  for (const delegate of ["GPU", "CPU"]) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1 });
      try { // the hand tracker is a bonus: the session still runs without it
        handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: "IMAGE", numHands: 1, minHandDetectionConfidence: 0.3, minHandPresenceConfidence: 0.3 });
      } catch (e) { console.warn("hands", delegate, e); }
      return delegate + (handLandmarker ? ", hands on" : ", hands off");
    } catch (e) { console.warn("tracker", delegate, e); }
  }
  throw new Error("The body tracker would not start on this phone.");
}

// Hands: at 3-4 m a hand is only a few dozen pixels, too small for the hand tracker on the whole frame. So each frame one
// hand (left and right in turn) is cut out around the body tracker's wrist, index and pinky points, scaled up to 256 px,
// tracked, and its 21 points mapped back to the full frame. A hand's last result is kept for 200 ms.
const HAND_CROP = 256, handCanvas = document.createElement("canvas");
handCanvas.width = handCanvas.height = HAND_CROP;
const handCtx = handCanvas.getContext("2d", { willReadFrequently: true });
const hands = { L: null, R: null };   // { t, lm: 21 x {x,y,z} full-frame normalised, wl: 21 x {x,y,z} metres }
let handTurn = 0;
function trackHand(lm, now) {
  if (!handLandmarker) return;
  const side = handTurn++ % 2 ? "R" : "L";
  const [wr, pk, ix] = side === "L" ? [15, 17, 19] : [16, 18, 20];
  const W = videoEl.videoWidth, H = videoEl.videoHeight;
  if ((lm[wr].visibility ?? 1) < 0.3) { hands[side] = null; return; }
  const cx = (lm[wr].x + (lm[pk].x + lm[ix].x) / 2) / 2 * W, cy = (lm[wr].y + (lm[pk].y + lm[ix].y) / 2) / 2 * H;
  const sh = Math.hypot((lm[11].x - lm[12].x) * W, (lm[11].y - lm[12].y) * H);
  const size = Math.max(64, Math.min(H, sh * 1.1)); // a hand is about half a shoulder width; leave room for spread fingers
  const sx = cx - size / 2, sy = cy - size / 2;
  handCtx.fillStyle = "#000"; handCtx.fillRect(0, 0, HAND_CROP, HAND_CROP);
  handCtx.drawImage(videoEl, sx, sy, size, size, 0, 0, HAND_CROP, HAND_CROP);
  let r = null;
  try { r = handLandmarker.detect(handCanvas); } catch (e) { /* a dropped frame */ }
  const h = r && r.landmarks && r.landmarks[0];
  if (!h) { if (hands[side] && now - hands[side].t > 200) hands[side] = null; return; }
  hands[side] = { t: now, lm: h.map((p) => ({ x: (sx + p.x * size) / W, y: (sy + p.y * size) / H, z: p.z })), wl: r.worldLandmarks && r.worldLandmarks[0] };
}
const HAND_BONES = HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]);

// Landmark indices (MediaPipe Pose).
// Every one of the tracker's 33 points is drawn and recorded: face, shoulders, elbows, wrists, three points per hand,
// hips, knees, ankles, heels and toes.
const BONES = PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]);

let latest = null;            // { t, lm, wl } the newest tracked pose, or null when nobody is seen
let lastSeen = 0;             // performance.now() when a body was last seen
let takeFrames = null;        // frames collected for the take being recorded
let takeTries = 0;            // tracker runs during the take, with or without a body found
let videoEl = null, overlayEl = null;

function trackLoop() {
  let lastTime = -1;
  const step = () => {
    if (landmarker && videoEl && videoEl.readyState >= 2 && videoEl.currentTime !== lastTime) {
      lastTime = videoEl.currentTime;
      const now = performance.now();
      if (takeFrames) takeTries++;
      let res = null;
      try { res = landmarker.detectForVideo(videoEl, now); } catch (e) { /* a dropped frame */ }
      const lm = res && res.landmarks && res.landmarks[0];
      if (lm) {
        trackHand(lm, now);
        latest = { t: now, lm, wl: res.worldLandmarks && res.worldLandmarks[0], hL: hands.L, hR: hands.R };
        lastSeen = now;
        if (takeFrames) takeFrames.push(latest);
      } else latest = null;
      drawOverlay();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function drawOverlay() {
  if (!overlayEl || !videoEl) return;
  const w = overlayEl.clientWidth, h = overlayEl.clientHeight;
  if (overlayEl.width !== w * devicePixelRatio) { overlayEl.width = w * devicePixelRatio; overlayEl.height = h * devicePixelRatio; }
  const g = overlayEl.getContext("2d");
  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!latest || !videoEl.videoWidth) return;
  // object-fit: contain mapping
  const s = Math.min(w / videoEl.videoWidth, h / videoEl.videoHeight);
  const vw = videoEl.videoWidth * s, vh = videoEl.videoHeight * s, ox = (w - vw) / 2, oy = (h - vh) / 2;
  const P = (i) => [ox + latest.lm[i].x * vw, oy + latest.lm[i].y * vh];
  const ok = framing(latest.lm).ok;
  g.lineWidth = 4; g.strokeStyle = ok ? "rgba(63,191,111,.9)" : "rgba(224,87,74,.9)";
  for (const [a, b] of BONES) { const [x1, y1] = P(a), [x2, y2] = P(b); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  g.fillStyle = "#fff";
  for (let i = 0; i < latest.lm.length; i++) { const [x, y] = P(i); g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 2; g.strokeStyle = "rgba(80,200,255,.95)"; g.fillStyle = "rgba(80,200,255,.95)";
  for (const hd of [latest.hL, latest.hR]) {
    if (!hd) continue;
    const Q = (i) => [ox + hd.lm[i].x * vw, oy + hd.lm[i].y * vh];
    for (const [a, b] of HAND_BONES) { const [x1, y1] = Q(a), [x2, y2] = Q(b); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    for (let i = 0; i < 21; i++) { const [x, y] = Q(i); g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
  }
}

// ------------------------------------------------------------------ voice
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en[-_](GB|US)/i.test(v.lang) && /Daniel|Samantha|Karen|Moira|Arthur|Serena/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}
speechSynthesis.onvoiceschanged = pickVoice; pickVoice();
function speak(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.0;
    let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 1500 + text.length * 90); // iOS sometimes never fires onend
    speechSynthesis.speak(u);
  });
}

// ------------------------------------------------------------------ storage (chunks and take data go to IndexedDB, not memory)
let db = null;
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("mocap-coach", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("chunks", { autoIncrement: true }); r.result.createObjectStore("takes", { autoIncrement: true }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
function idbPut(store, value) { return new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).add(value); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
function idbAll(store) { return new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
function idbClear() { return new Promise((res) => { const tx = db.transaction(["chunks", "takes"], "readwrite"); tx.objectStore("chunks").clear(); tx.objectStore("takes").clear(); tx.oncomplete = res; }); }

// ------------------------------------------------------------------ camera and recorder
let stream = null, recorder = null, recStart = 0, mime = "";
async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
  for (const v of [$("preview"), $("live")]) { v.srcObject = stream; v.play().catch(() => {}); }
}
// Local testing only: a still image, drawn into a canvas, stands in for the camera.
async function startTestStream(src) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
  const g = c.getContext("2d");
  const draw = () => { g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height); const s = Math.min(c.width / img.width, c.height / img.height); g.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s); requestAnimationFrame(draw); };
  draw();
  stream = c.captureStream(30);
  for (const v of [$("preview"), $("live")]) { v.srcObject = stream; v.play().catch(() => {}); }
}
function startRecorder(sessionId) {
  mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  let seq = 0;
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) idbPut("chunks", { sessionId, seq: seq++, blob: e.data }); };
  return new Promise((resolve) => { recorder.onstart = () => { recStart = performance.now(); resolve(); }; recorder.start(1000); });
}
const recTime = (t = performance.now()) => +((t - recStart) / 1000).toFixed(3);
function stopRecorder() { return new Promise((resolve) => { if (!recorder || recorder.state === "inactive") return resolve(); recorder.onstop = () => setTimeout(resolve, 400); recorder.stop(); }); }

// ------------------------------------------------------------------ wake lock
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) { /* not supported */ } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && running) keepAwake(); });

// ------------------------------------------------------------------ the plan
function buildPlan(sessionIdx, sideMode) {
  const plan = [];
  for (const shot of SHOTS.filter((s) => sessionIdx < 0 || s.s === sessionIdx)) {
    const sides = shot.both ? ["sideL", "sideR"] : ["sideL"];
    const facings = shot.sideOnly ? sides : shot.frontOnly ? ["front"]
      : sideMode === "none" ? ["front"] : sideMode === "key" && !KEY_SIDE.has(shot.id) && !shot.both ? ["front"] : ["front", ...sides];
    for (const facing of facings) plan.push({ shot, facing });
  }
  return plan;
}
const facingWords = (f) => (f === "front" ? "facing the camera" : f === "sideR" ? "side-on, right side to the camera" : "side-on, left side to the camera");
const facingTag = (f) => (f === "front" ? "FRONT" : f === "sideR" ? "RIGHT SIDE" : "LEFT SIDE");

// ------------------------------------------------------------------ session
let running = false, paused = false, skip = false, back = false, finishing = false;
let plan = [], idx = 0, log = [], sessionId = "", settings = {};
function show(id) { for (const s of ["setup", "run", "done"]) $(s).classList.toggle("hidden", s !== id); }
function setStatus(text, cls = "") { const el = $("status"); el.textContent = text; el.className = cls; }

async function waitUnpaused() { while (paused && !finishing) await sleep(200); }

// Waits until the person is in frame and facing the right way, saying what to fix every few seconds. Pauses when
// nobody has been seen for 4 s (the owner stepped away) and carries on when they come back.
async function waitReady(item) {
  let okSince = 0, lastHint = performance.now(), awaySaid = false;
  const aspect = videoEl.videoWidth / videoEl.videoHeight || 16 / 9;
  if (!settings.checks) { await waitUnpaused(); await sleep(1500); return !(finishing || skip || back); } // no tracker: just a breath between takes
  while (!finishing && !skip && !back) {
    await waitUnpaused();
    const now = performance.now();
    if (now - lastSeen > 4000) {
      // Before the first take the owner is still walking from the phone to their spot: no "paused", just a gentle reminder.
      if (!log.length) { if (now - lastHint > 15000) { lastHint = now; await speak("Ready when you are. I'll start as soon as I can see all of you."); } okSince = 0; await sleep(250); continue; }
      if (!awaySaid) { setStatus("Paused"); await speak("Paused. Step back into the frame to carry on."); awaySaid = true; }
      okSince = 0; await sleep(250); continue;
    }
    if (awaySaid) { awaySaid = false; setStatus(""); await speak(`Welcome back. ${item.shot.name}, ${facingWords(item.facing)}.`); lastHint = performance.now(); }
    const f = latest && framing(latest.lm);
    const faceOk = latest && (item.shot.kind === "fall" || item.shot.kind === "kneel" || item.shot.sideOnly || facingOk(latest.lm, aspect, item.facing));
    if (f && f.ok && faceOk) { if (!okSince) okSince = now; if (now - okSince > 1200) return true; }
    else {
      okSince = 0;
      if (now - lastHint > 7000) {
        lastHint = now;
        const hint = !latest ? "Step into the frame." : f.missing.size ? `I can't see your ${[...f.missing][0]}.` : !f.centred ? "Move to the middle." : item.facing === "front" ? "Face the camera." : `Turn ${facingWords(item.facing)}.`;
        setStatus(hint, "bad"); await speak(hint); setStatus("");
      }
    }
    await sleep(100);
  }
  return false;
}

async function recordRep(item, rep, reps) {
  const { shot, facing } = item;
  const aspect = videoEl.videoWidth / videoEl.videoHeight || 16 / 9;
  for (let attempt = 1; attempt <= 3 && !finishing; attempt++) {
    if (!(await waitReady(item))) return;
    setStatus("3"); await speak("Three."); setStatus("2"); await speak("Two."); setStatus("1"); await speak("One.");
    setStatus("Go", "good"); speak("Go.");
    const t0 = performance.now(); takeFrames = []; takeTries = 0;
    while (performance.now() - t0 < shot.secs * 1000 && !finishing && !skip && !back) await sleep(50);
    const frames = takeFrames; takeFrames = null; const t1 = performance.now();
    if (skip || back || finishing) return;
    setStatus("Stop"); await speak("And stop.");
    const v = settings.checks ? judge(frames, shot, facing, takeTries, aspect) : { good: true, reason: "", metrics: {} };
    const keepAnyway = !v.good && attempt === 3;
    const entry = { id: shot.id, name: shot.name, facing, rep, attempt, start: recTime(t0), end: recTime(t1), verdict: v.good ? "good" : keepAnyway ? "kept-after-3" : "redo", reason: v.reason, metrics: v.metrics };
    log.push(entry);
    if (v.good || keepAnyway) {
      await idbPut("takes", { sessionId, key: `${shot.id}_${facing}_${rep}`, entry, frames: packFrames(frames) });
      setStatus(v.good ? "Good" : "Kept", "good");
      await speak(v.good ? (rep < reps ? "Good. Again." : "Good.") : "That one still didn't pass. I'll keep it and check it on the PC.");
      setStatus(""); return;
    }
    setStatus(v.reason, "bad"); await speak(`Redo. ${v.reason}`); setStatus("");
  }
}

// Landmarks rounded to keep the take list small: per frame, time (s), then 33 x [x, y, visibility] image landmarks and
// 33 x [x, y, z] world landmarks (metres, hips at the origin), and per hand (hL, hR, or null when not found) 21 x [x, y, z]
// image landmarks (full-frame normalised) and 21 x [x, y, z] world landmarks (metres, hand centre at the origin).
function packFrames(frames) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const hand = (hd) => (hd ? { lm: hd.lm.map((p) => [r(p.x), r(p.y), r(p.z)]), wl: hd.wl ? hd.wl.map((p) => [r(p.x), r(p.y), r(p.z)]) : null } : null);
  return frames.map((f) => ({ t: recTime(f.t), lm: f.lm.map((p) => [r(p.x), r(p.y), r(p.visibility ?? 1)]), wl: f.wl ? f.wl.map((p) => [r(p.x), r(p.y), r(p.z)]) : null, hL: hand(f.hL), hR: hand(f.hR) }));
}

function updateProgress() {
  const item = plan[idx];
  $("progress").textContent = `${idx + 1} / ${plan.length}`;
  if (!item) return;
  $("takeLabel").textContent = `${item.shot.id} · ${item.shot.name} · ${facingTag(item.facing)}`;
  $("takeSay").textContent = `${item.shot.say}  Prop: ${item.shot.prop}.`;
  try { localStorage.setItem("mocap-progress", JSON.stringify({ ...settings, idx })); } catch (e) { /* private mode */ }
}

async function runSession() {
  running = true;
  setStatus("Walk to your spot");
  await speak(`Walk to your spot. I'll begin as soon as I can see all of you. ${plan.length} takes. Step out of the frame any time to pause.`);
  setStatus("");
  while (idx < plan.length && !finishing) {
    updateProgress();
    const item = plan[idx], reps = item.shot.reps || 1;
    skip = back = false;
    await speak(`${item.shot.id}. ${item.shot.name}, ${facingWords(item.facing)}. ${item.shot.say}${reps > 1 ? ` ${reps} times.` : ""}`);
    for (let rep = 1; rep <= reps && !skip && !back && !finishing; rep++) await recordRep(item, rep, reps);
    if (back) { idx = Math.max(0, idx - 1); continue; }
    idx++;
  }
  if (!finishing) await speak("That's the whole session. Great work. Come and save it.");
  await finishSession();
}

async function finishSession() {
  finishing = true; running = false;
  await stopRecorder();
  try { wakeLock?.release(); } catch (e) { /* ignore */ }
  const good = log.filter((l) => l.verdict !== "redo").length, redo = log.filter((l) => l.verdict === "redo").length;
  $("summary").textContent = `${good} takes kept, ${redo} redone. Got through ${Math.min(idx, plan.length)} of ${plan.length} takes.`;
  show("done");
}

function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ wiring
async function main() {
  db = await openDb();
  const sp = $("sessionPick");
  SESSIONS.forEach((s, i) => sp.add(new Option(`${s.name}: ${s.note}`, i)));
  sp.add(new Option("Everything, start to finish", -1));
  const fillStart = () => {
    const p = buildPlan(+sp.value, $("sidePick").value), st = $("startPick"); st.innerHTML = "";
    p.forEach((it, i) => st.add(new Option(`${i + 1}. ${it.shot.id} ${it.shot.name} (${facingTag(it.facing).toLowerCase()})`, i)));
  };
  sp.onchange = fillStart; $("sidePick").onchange = fillStart; fillStart();
  try { // resume where the last session stopped
    const saved = JSON.parse(localStorage.getItem("mocap-progress") || "null");
    if (saved) { sp.value = saved.session; $("sidePick").value = saved.side; fillStart(); $("startPick").value = Math.min(saved.idx, $("startPick").options.length - 1); }
  } catch (e) { /* ignore */ }

  videoEl = $("preview"); overlayEl = $("previewOverlay");
  const tracker = loadTracker();
  let camOk = true;
  try {
    const test = new URLSearchParams(location.search).get("test"); // local testing only: a still image stands in for the camera
    if (test && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) await startTestStream(test); else await startCamera();
  } catch (e) { camOk = false; $("frameCheck").textContent = "Camera blocked: allow camera access for this page (Safari: aA › Website Settings › Camera › Allow), then reload."; }
  trackLoop();
  setInterval(() => {
    if (!$("setup").classList.contains("hidden")) {
      const f = latest && framing(latest.lm);
      $("frameCheck").textContent = !latest ? "Step into the frame" : f.ok ? "Whole body in frame ✓" : f.missing.size ? `Can't see your ${[...f.missing].join(", ")}` : "Move to the middle";
    }
  }, 300);
  try { const d = await tracker; $("loadStatus").textContent = `Body tracker ready (${d}). Version ${VERSION}.`; $("startBtn").disabled = !camOk; }
  catch (e) { $("loadStatus").textContent = `${e.message} You can still record without checks.`; $("checksOn").checked = false; $("startBtn").disabled = !camOk; }

  $("startBtn").onclick = async () => {
    settings = { session: +sp.value, side: $("sidePick").value, checks: $("checksOn").checked && !!landmarker };
    plan = buildPlan(settings.session, settings.side); idx = +$("startPick").value; log = []; finishing = false; paused = false;
    sessionId = stamp();
    speechSynthesis.speak(new SpeechSynthesisUtterance("")); // unlock speech on iOS inside the tap
    await idbClear();
    show("run"); videoEl = $("live"); overlayEl = $("liveOverlay");
    await keepAwake();
    await startRecorder(sessionId);
    runSession();
  };
  $("pauseBtn").onclick = () => { paused = !paused; $("pauseBtn").textContent = paused ? "Resume" : "Pause"; setStatus(paused ? "Paused" : ""); };
  $("skipBtn").onclick = () => { skip = true; };
  $("backBtn").onclick = () => { back = true; };
  $("finishBtn").onclick = () => { if (confirm("Finish the session now?")) { finishing = true; } };
  $("saveVideoBtn").onclick = async () => {
    const chunks = (await idbAll("chunks")).filter((c) => c.sessionId === sessionId).sort((a, b) => a.seq - b.seq);
    const type = (mime || "video/mp4").split(";")[0], ext = type.includes("webm") ? "webm" : "mp4";
    await saveBlob(new Blob(chunks.map((c) => c.blob), { type }), `mocap_${sessionId}.${ext}`);
  };
  $("saveListBtn").onclick = async () => {
    const takes = (await idbAll("takes")).filter((t) => t.sessionId === sessionId);
    const vw = $("live").videoWidth, vh = $("live").videoHeight;
    const out = { coach: VERSION, session: sessionId, video: { width: vw, height: vh, mime }, settings, log, takes: takes.map((t) => ({ key: t.key, ...t.entry, frames: t.frames })) };
    await saveBlob(new Blob([JSON.stringify(out)], { type: "application/json" }), `mocap_${sessionId}_takes.json`);
  };
  $("againBtn").onclick = () => location.reload();
}
main();
