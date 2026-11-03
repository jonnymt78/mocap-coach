// Mocap Coach: a hands-free motion-capture session on one phone. The back camera records one continuous video, the coach
// calls each move out loud, MediaPipe Pose (running on the phone) checks each take, and the session saves as one video
// plus a take list (start/end of every take, verdict, and the tracked body landmarks) for cutting on the PC.
import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { SESSIONS, SHOTS, KEY_SIDE } from "./shots.js";
import { framing, facingOk, judge } from "./checks.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSION = "1.0";

// ------------------------------------------------------------------ body tracking
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
let landmarker = null;
async function loadTracker() {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  for (const delegate of ["GPU", "CPU"]) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1 });
      return delegate;
    } catch (e) { console.warn("tracker", delegate, e); }
  }
  throw new Error("The body tracker would not start on this phone.");
}

// Landmark indices (MediaPipe Pose).
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [0, 11], [0, 12]];

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
        latest = { t: now, lm, wl: res.worldLandmarks && res.worldLandmarks[0] };
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
    const facings = shot.sideOnly ? ["side"] : shot.frontOnly ? ["front"]
      : sideMode === "none" ? ["front"] : sideMode === "key" && !KEY_SIDE.has(shot.id) ? ["front"] : ["front", "side"];
    for (const facing of facings) plan.push({ shot, facing });
  }
  return plan;
}
const facingWords = (f) => (f === "front" ? "facing the camera" : "side-on, left side to the camera");

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
        const hint = !latest ? "Step into the frame." : f.missing.size ? `I can't see your ${[...f.missing][0]}.` : !f.centred ? "Move to the middle." : item.facing === "front" ? "Face the camera." : "Turn side-on, left side to the camera.";
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
// 33 x [x, y, z] world landmarks (metres, hips at the origin).
function packFrames(frames) {
  const r = (v) => Math.round(v * 1000) / 1000;
  return frames.map((f) => ({ t: recTime(f.t), lm: f.lm.map((p) => [r(p.x), r(p.y), r(p.visibility ?? 1)]), wl: f.wl ? f.wl.map((p) => [r(p.x), r(p.y), r(p.z)]) : null }));
}

function updateProgress() {
  const item = plan[idx];
  $("progress").textContent = `${idx + 1} / ${plan.length}`;
  if (!item) return;
  $("takeLabel").textContent = `${item.shot.id} · ${item.shot.name} · ${item.facing === "front" ? "FRONT" : "SIDE"}`;
  $("takeSay").textContent = `${item.shot.say}  Prop: ${item.shot.prop}.`;
  try { localStorage.setItem("mocap-progress", JSON.stringify({ ...settings, idx })); } catch (e) { /* private mode */ }
}

async function runSession() {
  running = true;
  await speak(`Starting. ${plan.length} takes. Step out of the frame any time to pause.`);
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
    p.forEach((it, i) => st.add(new Option(`${i + 1}. ${it.shot.id} ${it.shot.name} (${it.facing})`, i)));
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
