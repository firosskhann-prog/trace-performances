import { DetectionGate, isStrongRecognition } from './trace-logic.mjs';

const W = 480;
const H = 360;
const MAX_SCREEN_POINTS = 500;
const CORNER_POOL = 8000;
const MAX_PATTERN_SIZE = 512;
const MAX_PATTERN_POINTS = 300;
const TRAIN_LEVELS = 4;
const MATCH_THRESHOLD = 48;
const FRAME_INTERVAL_MS = 450;

const $ = (id) => document.getElementById(id);
const traceInput = $('traceInput');
const soundInput = $('soundInput');
const traceLabel = $('traceLabel');
const soundLabel = $('soundLabel');
const startBtn = $('startBtn');
const stopBtn = $('stopBtn');
const statusEl = $('status');
const detailsEl = $('details');
const preview = $('referencePreview');
const video = $('cameraVideo');
const canvas = $('cameraCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraBox = $('cameraBox');
const patternCanvas = $('patternCanvas');
const patternCtx = patternCanvas.getContext('2d', { willReadFrequently: true });

let jsfeat;
let stream = null;
let timer = null;
let processing = false;
let traceReady = false;
let soundReady = false;
let audioBuffer = null;
let audioContext = null;
let currentSource = null;
let trained = false;
let selectedTraceUrl = null;

let imgU8, imgSmooth, screenCorners, screenDescriptors;
let patternCorners = [], patternDescriptors = [];
let matches = [];
let homo3x3, matchMask;
let patternBaseWidth = 0;
let patternBaseHeight = 0;

const gate = new DetectionGate({ hitsToTrigger: 2, missesToRelease: 3 });

function setStatus(text, details = '') {
  statusEl.textContent = text;
  detailsEl.textContent = details;
}

function updateStartButton() {
  startBtn.disabled = !(traceReady && soundReady && jsfeat && trained);
}

function initVision() {
  if (!globalThis.jsfeatNext) {
    setStatus('Recognition library did not load.', 'Check the internet connection and reload this page.');
    return;
  }
  jsfeat = globalThis.jsfeatNext;
  imgU8 = new jsfeat.matrix_t(W, H, jsfeat.U8_t | jsfeat.C1_t);
  imgSmooth = new jsfeat.matrix_t(W, H, jsfeat.U8_t | jsfeat.C1_t);
  screenDescriptors = new jsfeat.matrix_t(32, MAX_SCREEN_POINTS, jsfeat.U8_t | jsfeat.C1_t);
  screenCorners = Array.from({ length: CORNER_POOL }, () => new jsfeat.keypoint_t(0, 0, 0, 0, -1));
  matches = Array.from({ length: MAX_SCREEN_POINTS }, () => ({ screen_idx: 0, pattern_lev: 0, pattern_idx: 0, distance: 0 }));
  homo3x3 = new jsfeat.matrix_t(3, 3, jsfeat.F32C1_t);
  matchMask = new jsfeat.matrix_t(MAX_SCREEN_POINTS, 1, jsfeat.U8C1_t);
  setStatus('Ready. Choose one trace image and one sound.');
  updateStartButton();
}

function detectKeypoints(img, corners, maxAllowed) {
  const yape06 = jsfeat.yape06;
  yape06.laplacian_threshold = 30;
  yape06.min_eigen_value_threshold = 25;
  let count = yape06.detect(img, corners, 20);
  if (count > maxAllowed) {
    jsfeat.math.qsort(corners, 0, count - 1, (a, b) => (b.score < a.score));
    count = maxAllowed;
  }
  for (let i = 0; i < count; i++) {
    corners[i].angle = icAngle(img, corners[i].x, corners[i].y);
  }
  return count;
}

const U_MAX = new Int32Array([15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6, 3, 0]);
function icAngle(img, px, py) {
  const halfK = 15;
  let m01 = 0, m10 = 0;
  const src = img.data;
  const step = img.cols;
  const centerOff = (py * step + px) | 0;
  for (let u = -halfK; u <= halfK; u++) m10 += u * src[centerOff + u];
  for (let v = 1; v <= halfK; v++) {
    let vSum = 0;
    const d = U_MAX[v];
    for (let u = -d; u <= d; u++) {
      const plus = src[centerOff + u + v * step];
      const minus = src[centerOff + u - v * step];
      vSum += plus - minus;
      m10 += u * (plus + minus);
    }
    m01 += v * vSum;
  }
  return Math.atan2(m01, m10);
}

function trainPatternFromCanvas() {
  const sourceW = patternCanvas.width;
  const sourceH = patternCanvas.height;
  const sc0 = Math.min(1, MAX_PATTERN_SIZE / sourceW, MAX_PATTERN_SIZE / sourceH);
  const baseW = Math.max(64, (sourceW * sc0) | 0);
  const baseH = Math.max(64, (sourceH * sc0) | 0);

  const sourceData = patternCtx.getImageData(0, 0, sourceW, sourceH);
  const sourceGray = new jsfeat.matrix_t(sourceW, sourceH, jsfeat.U8_t | jsfeat.C1_t);
  const level0 = new jsfeat.matrix_t(baseW, baseH, jsfeat.U8_t | jsfeat.C1_t);
  const levelImg = new jsfeat.matrix_t(baseW, baseH, jsfeat.U8_t | jsfeat.C1_t);
  jsfeat.imgproc.grayscale(sourceData.data, sourceW, sourceH, sourceGray);
  jsfeat.imgproc.resample(sourceGray, level0, baseW, baseH);

  patternBaseWidth = baseW;
  patternBaseHeight = baseH;
  patternCorners = [];
  patternDescriptors = [];

  let scale = 1.0;
  const scaleStep = Math.sqrt(2.0);
  let totalPoints = 0;

  for (let lev = 0; lev < TRAIN_LEVELS; lev++) {
    const levelW = Math.max(64, (baseW * scale) | 0);
    const levelH = Math.max(64, (baseH * scale) | 0);
    const corners = Array.from({ length: Math.min(CORNER_POOL, Math.max(1500, levelW * levelH >> 4)) }, () => new jsfeat.keypoint_t(0, 0, 0, 0, -1));
    const descriptors = new jsfeat.matrix_t(32, MAX_PATTERN_POINTS, jsfeat.U8_t | jsfeat.C1_t);

    if (lev === 0) {
      jsfeat.imgproc.gaussian_blur(level0, levelImg, 5);
    } else {
      jsfeat.imgproc.resample(level0, levelImg, levelW, levelH);
      jsfeat.imgproc.gaussian_blur(levelImg, levelImg, 5);
    }

    const count = detectKeypoints(levelImg, corners, MAX_PATTERN_POINTS);
    jsfeat.orb.describe(levelImg, corners, count, descriptors);

    if (lev > 0) {
      for (let i = 0; i < count; i++) {
        corners[i].x *= 1 / scale;
        corners[i].y *= 1 / scale;
      }
    }

    patternCorners[lev] = corners;
    patternDescriptors[lev] = descriptors;
    totalPoints += count;
    scale /= scaleStep;
  }

  trained = totalPoints >= 80;
  return totalPoints;
}

traceInput.addEventListener('change', async () => {
  const file = traceInput.files?.[0];
  if (!file) return;
  if (!jsfeat) {
    setStatus('Recognition engine is still loading. Try the trace again in a moment.');
    return;
  }
  if (selectedTraceUrl) URL.revokeObjectURL(selectedTraceUrl);
  selectedTraceUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxInput = 900;
    const scale = Math.min(1, maxInput / img.naturalWidth, maxInput / img.naturalHeight);
    patternCanvas.width = Math.max(64, Math.round(img.naturalWidth * scale));
    patternCanvas.height = Math.max(64, Math.round(img.naturalHeight * scale));
    patternCtx.clearRect(0, 0, patternCanvas.width, patternCanvas.height);
    patternCtx.drawImage(img, 0, 0, patternCanvas.width, patternCanvas.height);
    preview.src = selectedTraceUrl;
    preview.style.display = 'block';

    try {
      const points = trainPatternFromCanvas();
      traceReady = trained;
      traceLabel.classList.toggle('picked', traceReady);
      traceLabel.firstChild.textContent = traceReady ? 'TRACE READY ✓ ' : 'CHOOSE A DIFFERENT TRACE ';
      if (traceReady) {
        setStatus('Trace prepared.', `${points} reference features found.`);
      } else {
        setStatus('This trace is too plain.', 'Choose an image with more edges, texture, lettering or detail.');
      }
    } catch (err) {
      console.error(err);
      traceReady = false;
      setStatus('Could not prepare this trace.', 'Try a smaller or more detailed image.');
    }
    updateStartButton();
  };
  img.onerror = () => setStatus('Could not read that image.');
  img.src = selectedTraceUrl;
});

soundInput.addEventListener('change', async () => {
  const file = soundInput.files?.[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioContext.decodeAudioData(data.slice(0));
    soundReady = true;
    soundLabel.classList.add('picked');
    soundLabel.firstChild.textContent = 'SOUND READY ✓ ';
    setStatus(traceReady ? 'Trace and sound are ready.' : 'Sound prepared. Now choose the trace image.');
  } catch (err) {
    console.error(err);
    soundReady = false;
    setStatus('Could not read that sound file.', 'MP3, M4A or WAV usually work best.');
  }
  updateStartButton();
});

function playSound() {
  if (!audioContext || !audioBuffer) return;
  try { currentSource?.stop(); } catch (_) {}
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start(0);
  currentSource = source;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Camera access is not available.', 'Open this page from an HTTPS address such as GitHub Pages.');
    return;
  }
  try {
    await audioContext.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      }
    });
    video.srcObject = stream;
    await video.play();
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    setStatus('SCANNING…', 'Point the camera at the selected trace.');
    timer = window.setInterval(processFrame, FRAME_INTERVAL_MS);
  } catch (err) {
    console.error(err);
    setStatus('Camera could not start.', 'Allow camera permission, then try again.');
  }
}

function stopCamera() {
  if (timer) window.clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  processing = false;
  cameraBox.classList.remove('found');
  startBtn.style.display = 'block';
  stopBtn.style.display = 'none';
  setStatus('Stopped. Press START when ready.');
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

function drawVideoCover() {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const scale = Math.max(W / vw, H / vh);
  const sw = W / scale;
  const sh = H / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
}

function popcnt32(n) {
  n -= ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function matchPattern() {
  const qCnt = screenDescriptors.rows;
  const queryU32 = screenDescriptors.buffer.i32;
  let qdOff = 0;
  let numMatches = 0;

  for (let qidx = 0; qidx < qCnt; qidx++) {
    let bestDist = 256;
    let bestIdx = -1;
    let bestLev = -1;

    for (let lev = 0; lev < TRAIN_LEVELS; lev++) {
      const desc = patternDescriptors[lev];
      const ldCnt = desc.rows;
      const ldI32 = desc.buffer.i32;
      let ldOff = 0;
      for (let pidx = 0; pidx < ldCnt; pidx++) {
        let curr = 0;
        for (let k = 0; k < 8; k++) curr += popcnt32(queryU32[qdOff + k] ^ ldI32[ldOff + k]);
        if (curr < bestDist) {
          bestDist = curr;
          bestLev = lev;
          bestIdx = pidx;
        }
        ldOff += 8;
      }
    }

    if (bestDist < MATCH_THRESHOLD && numMatches < matches.length) {
      const m = matches[numMatches++];
      m.screen_idx = qidx;
      m.pattern_lev = bestLev;
      m.pattern_idx = bestIdx;
      m.distance = bestDist;
    }
    qdOff += 8;
  }
  return numMatches;
}

function findTransform(count) {
  if (count < 4) return 0;
  const params = new jsfeat.ransac_params_t(4, 3, 0.5, 0.99);
  const patternXY = new Array(count);
  const screenXY = new Array(count);

  for (let i = 0; i < count; i++) {
    const m = matches[i];
    const s = screenCorners[m.screen_idx];
    const p = patternCorners[m.pattern_lev][m.pattern_idx];
    patternXY[i] = { x: p.x, y: p.y };
    screenXY[i] = { x: s.x, y: s.y };
  }

  const ok = jsfeat.motion_estimator.ransac(
    params,
    jsfeat.homography2d,
    patternXY,
    screenXY,
    count,
    homo3x3,
    matchMask,
    700
  );

  if (!ok) {
    jsfeat.matmath.identity_3x3(homo3x3, 1.0);
    return 0;
  }

  let good = 0;
  for (let i = 0; i < count; i++) {
    if (matchMask.data[i]) {
      patternXY[good] = patternXY[i];
      screenXY[good] = screenXY[i];
      good++;
    }
  }
  if (good >= 4) jsfeat.homography2d.run(patternXY, screenXY, homo3x3, good);
  return good;
}

function drawDetectedShape() {
  const M = homo3x3.data;
  const base = [
    { x: 0, y: 0 },
    { x: patternBaseWidth, y: 0 },
    { x: patternBaseWidth, y: patternBaseHeight },
    { x: 0, y: patternBaseHeight }
  ];
  const pts = base.map((pt) => {
    const x = M[0] * pt.x + M[1] * pt.y + M[2];
    const y = M[3] * pt.x + M[4] * pt.y + M[5];
    const z = M[6] * pt.x + M[7] * pt.y + M[8];
    return { x: x / z, y: y / z };
  });
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
  ctx.save();
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function processFrame() {
  if (processing || !stream || video.readyState < 2 || !trained) return;
  processing = true;
  try {
    drawVideoCover();
    const imageData = ctx.getImageData(0, 0, W, H);
    jsfeat.imgproc.grayscale(imageData.data, W, H, imgU8);
    jsfeat.imgproc.gaussian_blur(imgU8, imgSmooth, 5);
    const numCorners = detectKeypoints(imgSmooth, screenCorners, MAX_SCREEN_POINTS);
    jsfeat.orb.describe(imgSmooth, screenCorners, numCorners, screenDescriptors);

    const numMatches = matchPattern();
    const goodMatches = findTransform(numMatches);
    const positive = isStrongRecognition({ numMatches, goodMatches });
    const state = gate.update(positive);

    cameraBox.classList.toggle('found', state.found);
    if (state.found && goodMatches >= 4) drawDetectedShape();
    if (state.trigger) playSound();

    if (state.found) {
      setStatus('TRACE FOUND — SOUND PLAYING', `${goodMatches} geometric matches / ${numMatches} candidate matches`);
    } else {
      setStatus('SCANNING…', `${goodMatches} geometric matches / ${numMatches} candidate matches`);
    }
  } catch (err) {
    console.error(err);
    setStatus('Recognition paused because of an error.', 'Reload the page and try once more.');
    stopCamera();
  } finally {
    processing = false;
  }
}

window.addEventListener('pagehide', stopCamera);
initVision();
