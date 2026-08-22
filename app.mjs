const TRACE_CONFIG = [
  {
    id: 1,
    image: './traces/trace1.jpg',
    sound: './sounds/sound1.mp3',
    threshold: 15
  },
  {
    id: 2,
    image: './traces/trace2.jpg',
    sound: './sounds/sound2.mp3',
    threshold: 15
  },
  {
    id: 3,
    image: './traces/trace3.jpg',
    sound: './sounds/sound3.mp3',
    threshold: 15
  }
];

const W = 480;
const H = 360;

const MAX_SCREEN_POINTS = 520;
const CORNER_POOL = 8000;

const MAX_PATTERN_SIZE = 512;
const MAX_PATTERN_POINTS = 300;

const TRAIN_LEVELS = 4;

const MATCH_THRESHOLD = 50;
const FRAME_INTERVAL_MS = 320;

const PAGE_PARAMS =
  new URLSearchParams(
    window.location.search
  );

const AUDIENCE_MODE =
  PAGE_PARAMS.get('audience') === '1';

for (const cfg of TRACE_CONFIG) {

  const supplied =
    Number(
      PAGE_PARAMS.get(
        `t${cfg.id}`
      )
    );

  if (
    Number.isFinite(supplied) &&
    supplied >= 4 &&
    supplied <= 100
  ) {

    cfg.threshold =
      Math.round(supplied);
  }
}

const $ = (id) =>
  document.getElementById(id);

let jsfeat = null;

let stream = null;
let timer = null;
let processing = false;

let audioContext = null;
let currentSource = null;

let isAudioPlaying = false;

let blockedTraceId = null;
let blockedClearFrames = 0;

let exposure = 0;

let imgU8 = null;
let imgSmooth = null;

let screenCorners = null;
let screenDescriptors = null;

let matchScratch = [];

const traces =
  TRACE_CONFIG.map(
    (cfg) => ({

      ...cfg,

      ready: false,

      imageReady: false,
      soundReady: false,

      featureCount: 0,

      audioBuffer: null,

      patternCorners: [],

      patternDescriptors: [],

      patternBaseWidth: 0,
      patternBaseHeight: 0,

      homo3x3: null,
      matchMask: null,

      lastGoodMatches: 0,
      lastCandidateMatches: 0

    })
  );

function clamp(
  value,
  min,
  max
) {

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {

    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      n
    )
  );
}

function buildUI() {

  const style =
    document.createElement(
      'style'
    );

  style.textContent = `

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #111;
      color: #f3f3f3;

      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    main {

      width:
        min(
          820px,
          100%
        );

      margin:
        0 auto;

      padding:
        14px;
    }

    h1 {

      font-size:
        1.35rem;

      margin:
        0 0 6px;
    }

    .sub {

      margin:
        0 0 14px;

      color:
        #bdbdbd;

      line-height:
        1.4;
    }

    .toolbar {

      display:
        grid;

      grid-template-columns:
        1fr auto;

      gap:
        10px;

      align-items:
        end;

      margin:
        10px 0 12px;
    }

    .exposure {

      border:
        1px solid #444;

      border-radius:
        12px;

      padding:
        10px 12px;

      background:
        #1d1d1d;
    }

    .exposure-top {

      display:
        flex;

      justify-content:
        space-between;

      gap:
        10px;

      margin-bottom:
        6px;
    }

    .exposure label {

      font-weight:
        800;
    }

    .exposure span {

      color:
        #bbb;

      font-variant-numeric:
        tabular-nums;
    }

    .exposure input {

      width:
        100%;

      min-height:
        32px;
    }

    button {

      min-height:
        48px;

      border-radius:
        11px;

      border:
        1px solid #555;

      font-weight:
        800;

      font-size:
        .96rem;

      padding:
        10px 14px;

      cursor:
        pointer;
    }

    #shareBtn {

      background:
        #262626;

      color:
        white;
    }

    #startBtn {

      width:
        100%;

      min-height:
        56px;

      border:
        0;

      background:
        #f0f0f0;

      color:
        #111;

      margin-bottom:
        12px;
    }

    #startBtn:disabled {

      opacity:
        .35;

      cursor:
        not-allowed;
    }

    #cameraBox {

      position:
        relative;

      width:
        100%;

      aspect-ratio:
        4 / 3;

      overflow:
        hidden;

      border:
        6px solid #333;

      border-radius:
        14px;

      background:
        black;

      transition:
        border-color 100ms linear,
        box-shadow 100ms linear;
    }

    #cameraBox.found {

      border-color:
        red;

      box-shadow:
        inset 0 0 0 3px red;
    }

    #cameraCanvas {

      width:
        100%;

      height:
        100%;

      display:
        block;

      background:
        black;
    }

    #foundBadge {

      display:
        none;

      position:
        absolute;

      left:
        50%;

      top:
        16px;

      transform:
        translateX(-50%);

      background:
        red;

      color:
        white;

      font-weight:
        900;

      padding:
        9px 14px;

      border-radius:
        999px;

      white-space:
        nowrap;
    }

    #cameraBox.found
    #foundBadge {

      display:
        block;
    }

    #status {

      margin-top:
        12px;

      min-height:
        24px;

      font-weight:
        750;
    }

    #details {

      margin-top:
        4px;

      color:
        #aaa;

      font-size:
        .9rem;
    }

    #liveReadings {

      margin-top:
        9px;

      padding:
        9px 10px;

      border-radius:
        9px;

      background:
        #1c1c1c;

      color:
        #ccc;

      font-size:
        .86rem;

      line-height:
        1.45;
    }

    #stopBtn {

      display:
        none;

      width:
        100%;

      margin-top:
        12px;

      background:
        transparent;

      color:
        #eee;
    }

    .readyLine {

      margin:
        10px 0;

      color:
        #bbb;

      font-size:
        .88rem;
    }

    .thresholds {

      display:
        grid;

      grid-template-columns:
        repeat(
          3,
          1fr
        );

      gap:
        8px;

      margin:
        10px 0;
    }

    .thresholdBox {

      border:
        1px solid #444;

      border-radius:
        10px;

      padding:
        8px 10px;

      background:
        #1d1d1d;
    }

    .thresholdBox label {

      display:
        block;

      color:
        #aaa;

      font-size:
        .72rem;

      margin-bottom:
        3px;
    }

    .thresholdBox input {

      width:
        100%;

      min-height:
        38px;

      border:
        0;

      border-radius:
        7px;

      background:
        #292929;

      color:
        white;

      font-size:
        1rem;

      font-weight:
        800;

      padding:
        6px 8px;
    }

    @media
    (max-width: 540px) {

      .toolbar {

        grid-template-columns:
          1fr;
      }

      .thresholds {

        grid-template-columns:
          1fr;
      }
    }

  `;

  document.head.appendChild(
    style
  );

  let main =
    document.querySelector(
      'main'
    );

  if (!main) {

    main =
      document.createElement(
        'main'
      );

    document.body.appendChild(
      main
    );
  }

  main.innerHTML = `

    <h1>
      Trace → Sound
    </h1>

    <p class="sub">

      Point the camera at any
      prepared trace.

      Its sound plays.

      When the sound ends,
      move away briefly and
      you can return to that
      trace again any time.

    </p>

    <div class="toolbar">

      <div class="exposure">

        <div class="exposure-top">

          <label
            for="exposureSlider">

            EXPOSURE

          </label>

          <span
            id="exposureValue">

            0

          </span>

        </div>

        <input
          id="exposureSlider"
          type="range"
          min="-30"
          max="30"
          step="1"
          value="0"
          aria-label="Exposure adjustment">

      </div>

      <button
        id="shareBtn"
        type="button">

        SHARE AUDIENCE LINK

      </button>

    </div>

    <div
      id="thresholdPanel"
      class="thresholds">

      ${TRACE_CONFIG.map(
        (cfg) => `

          <div class="thresholdBox">

            <label
              for="threshold${cfg.id}">

              TRACE ${cfg.id}
              TRIGGER

            </label>

            <input
              id="threshold${cfg.id}"
              type="number"
              min="4"
              max="100"
              step="1"
              value="${cfg.threshold}">

          </div>

        `
      ).join('')}

    </div>

    <div
      id="readyLine"
      class="readyLine">

      Loading traces
      and sounds…

    </div>

    <button
      id="startBtn"
      type="button"
      disabled>

      START CAMERA + SOUND

    </button>

    <div id="cameraBox">

      <canvas
        id="cameraCanvas"
        width="480"
        height="360">
      </canvas>

      <div id="foundBadge">

        TRACE FOUND

      </div>

    </div>

    <div
      id="status"
      role="status"
      aria-live="polite">

      Loading recognition
      engine…

    </div>

    <div id="details">
    </div>

    <div id="liveReadings">

      T1 — · T2 — · T3 —

    </div>

    <button
      id="stopBtn"
      type="button">

      STOP CAMERA

    </button>

    <video
      id="cameraVideo"
      playsinline
      muted
      style="display:none">

    </video>

  `;
}

buildUI();

const startBtn =
  $('startBtn');

const stopBtn =
  $('stopBtn');

const shareBtn =
  $('shareBtn');

const statusEl =
  $('status');

const detailsEl =
  $('details');

const readyLineEl =
  $('readyLine');

const liveReadingsEl =
  $('liveReadings');

const video =
  $('cameraVideo');

const canvas =
  $('cameraCanvas');

const ctx =
  canvas.getContext(
    '2d',
    {
      willReadFrequently:
        true
    }
  );

const cameraBox =
  $('cameraBox');

const foundBadge =
  $('foundBadge');

const exposureSlider =
  $('exposureSlider');

const exposureValue =
  $('exposureValue');

const thresholdPanel =
  $('thresholdPanel');

function setStatus(
  text,
  details = ''
) {

  statusEl.textContent =
    text;

  detailsEl.textContent =
    details;
}

function updateExposureLabel() {

  exposureValue.textContent =
    exposure > 0
      ? `+${exposure}`
      : String(exposure);
}

const suppliedExposure =
  Number(
    PAGE_PARAMS.get('e')
  );

if (
  Number.isFinite(
    suppliedExposure
  )
) {

  exposure =
    clamp(
      suppliedExposure,
      -30,
      30
    );

  exposureSlider.value =
    String(exposure);
}

for (
  const trace
  of traces
) {

  const input =
    $(
      `threshold${trace.id}`
    );

  input?.addEventListener(
    'change',
    () => {

      trace.threshold =
        Math.round(
          clamp(
            input.value,
            4,
            100
          )
        );

      input.value =
        String(
          trace.threshold
        );

      updateLiveReadings();
    }
  );
}

exposureSlider.addEventListener(
  'input',
  () => {

    exposure =
      clamp(
        exposureSlider.value,
        -30,
        30
      );

    updateExposureLabel();
  }
);

if (AUDIENCE_MODE) {

  thresholdPanel.style.display =
    'none';

  liveReadingsEl.style.display =
    'none';

  shareBtn.style.display =
    'none';
}

function buildAudienceUrl() {

  const url =
    new URL(
      window.location.href
    );

  url.search = '';

  url.searchParams.set(
    'audience',
    '1'
  );

  for (
    const trace
    of traces
  ) {

    url.searchParams.set(
      `t${trace.id}`,
      String(
        trace.threshold
      )
    );
  }

  url.searchParams.set(
    'e',
    String(exposure)
  );

  return url.toString();
}

async function shareAudienceLink() {

  const url =
    buildAudienceUrl();

  const shareData = {

    title:
      'Trace → Sound',

    text:
      'Open this link and press START CAMERA + SOUND.',

    url
  };

  try {

    if (
      navigator.share
    ) {

      await navigator.share(
        shareData
      );

      setStatus(
        'Audience link ready to share.'
      );

      return;
    }

    if (
      navigator.clipboard
        ?.writeText
    ) {

      await navigator.clipboard
        .writeText(url);

      setStatus(
        'Audience link copied.',
        url
      );

      return;
    }

    window.prompt(
      'Copy this audience link:',
      url
    );

  } catch (err) {

    if (
      err?.name !==
      'AbortError'
    ) {

      console.error(err);

      setStatus(
        'Could not share automatically.',
        url
      );
    }
  }
}

shareBtn.addEventListener(
  'click',
  shareAudienceLink
);

function updateReadyState() {

  const readyCount =
    traces.filter(
      (t) => t.ready
    ).length;

  readyLineEl.textContent =
    `${readyCount}/3 traces ready`;

  startBtn.disabled =
    !(
      jsfeat &&
      readyCount > 0
    );
}

function updateLiveReadings() {

  liveReadingsEl.textContent =
    traces.map(
      (trace) => {

        if (
          !trace.imageReady
        ) {

          return (
            `T${trace.id} —`
          );
        }

        const blocked =
          blockedTraceId ===
          trace.id
            ? ' BLOCKED'
            : '';

        return (

          `T${trace.id} ` +

          `${trace.lastGoodMatches}/` +

          `${trace.lastCandidateMatches} ` +

          `[trigger ${trace.threshold}]` +

          blocked
        );

      }
    ).join(' · ');
}

function initVision() {

  if (
    !globalThis.jsfeatNext
  ) {

    setStatus(
      'Recognition library did not load.',
      'Check the internet connection and reload the page.'
    );

    return;
  }

  jsfeat =
    globalThis.jsfeatNext;

  imgU8 =
    new jsfeat.matrix_t(
      W,
      H,
      jsfeat.U8_t |
      jsfeat.C1_t
    );

  imgSmooth =
    new jsfeat.matrix_t(
      W,
      H,
      jsfeat.U8_t |
      jsfeat.C1_t
    );

  screenDescriptors =
    new jsfeat.matrix_t(
      32,
      MAX_SCREEN_POINTS,
      jsfeat.U8_t |
      jsfeat.C1_t
    );

  screenCorners =
    Array.from(
      {
        length:
          CORNER_POOL
      },

      () =>
        new jsfeat.keypoint_t(
          0,
          0,
          0,
          0,
          -1
        )
    );

  matchScratch =
    Array.from(
      {
        length:
          MAX_SCREEN_POINTS
      },

      () => ({

        screen_idx: 0,

        pattern_lev: 0,

        pattern_idx: 0,

        distance: 0

      })
    );

  for (
    const trace
    of traces
  ) {

    trace.homo3x3 =
      new jsfeat.matrix_t(
        3,
        3,
        jsfeat.F32C1_t
      );

    trace.matchMask =
      new jsfeat.matrix_t(
        MAX_SCREEN_POINTS,
        1,
        jsfeat.U8C1_t
      );
  }

  setStatus(
    'Recognition ready. Loading trace files…'
  );

  updateReadyState();
}

const U_MAX =
  new Int32Array([

    15,15,15,15,

    14,14,14,

    13,13,

    12,11,10,

    9,8,6,3,0

  ]);

function icAngle(
  img,
  px,
  py
) {

  const halfK = 15;

  let m01 = 0;
  let m10 = 0;

  const src =
    img.data;

  const step =
    img.cols;

  const centerOff =
    (
      py *
      step +
      px
    ) | 0;

  for (
    let u = -halfK;
    u <= halfK;
    u++
  ) {

    m10 +=
      u *
      src[
        centerOff +
        u
      ];
  }

  for (
    let v = 1;
    v <= halfK;
    v++
  ) {

    let vSum = 0;

    const d =
      U_MAX[v];

    for (
      let u = -d;
      u <= d;
      u++
    ) {

      const plus =
        src[
          centerOff +
          u +
          v *
          step
        ];

      const minus =
        src[
          centerOff +
          u -
          v *
          step
        ];

      vSum +=
        plus -
        minus;

      m10 +=
        u *
        (
          plus +
          minus
        );
    }

    m01 +=
      v *
      vSum;
  }

  return Math.atan2(
    m01,
    m10
  );
}

function detectKeypoints(
  img,
  corners,
  maxAllowed
) {

  const yape06 =
    jsfeat.yape06;

  yape06.laplacian_threshold =
    25;

  yape06.min_eigen_value_threshold =
    20;

  let count =
    yape06.detect(
      img,
      corners,
      20
    );

  if (
    count >
    maxAllowed
  ) {

    jsfeat.math.qsort(
      corners,
      0,
      count - 1,

      (a, b) =>
        b.score <
        a.score
    );

    count =
      maxAllowed;
  }

  for (
    let i = 0;
    i < count;
    i++
  ) {

    corners[i].angle =
      icAngle(
        img,
        corners[i].x,
        corners[i].y
      );
  }

  return count;
}

async function loadImageElement(
  url
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const img =
        new Image();

      img.onload =
        () =>
          resolve(img);

      img.onerror =
        reject;

      img.src =
        url;
    }
  );
}

function trainTrace(
  trace,
  image
) {

  const maxInput =
    900;

  const inputScale =
    Math.min(

      1,

      maxInput /
      image.naturalWidth,

      maxInput /
      image.naturalHeight

    );

  const sourceW =
    Math.max(

      64,

      Math.round(
        image.naturalWidth *
        inputScale
      )
    );

  const sourceH =
    Math.max(

      64,

      Math.round(
        image.naturalHeight *
        inputScale
      )
    );

  const sourceCanvas =
    document.createElement(
      'canvas'
    );

  sourceCanvas.width =
    sourceW;

  sourceCanvas.height =
    sourceH;

  const sourceCtx =
    sourceCanvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );

  sourceCtx.drawImage(
    image,
    0,
    0,
    sourceW,
    sourceH
  );

  const sc0 =
    Math.min(

      1,

      MAX_PATTERN_SIZE /
      sourceW,

      MAX_PATTERN_SIZE /
      sourceH

    );

  const baseW =
    Math.max(
      64,
      (
        sourceW *
        sc0
      ) | 0
    );

  const baseH =
    Math.max(
      64,
      (
        sourceH *
        sc0
      ) | 0
    );

  const sourceData =
    sourceCtx.getImageData(
      0,
      0,
      sourceW,
      sourceH
    );

  const sourceGray =
    new jsfeat.matrix_t(
      sourceW,
      sourceH,
      jsfeat.U8_t |
      jsfeat.C1_t
    );

  const level0 =
    new jsfeat.matrix_t(
      baseW,
      baseH,
      jsfeat.U8_t |
      jsfeat.C1_t
    );

  jsfeat.imgproc.grayscale(

    sourceData.data,

    sourceW,
    sourceH,

    sourceGray

  );

  jsfeat.imgproc.resample(

    sourceGray,

    level0,

    baseW,
    baseH

  );

  trace.patternCorners =
    [];

  trace.patternDescriptors =
    [];

  trace.patternBaseWidth =
    baseW;

  trace.patternBaseHeight =
    baseH;

  let totalPoints = 0;

  let scale = 1.0;

  const scaleStep =
    Math.sqrt(2.0);

  for (
    let lev = 0;
    lev < TRAIN_LEVELS;
    lev++
  ) {

    const levelW =
      Math.max(

        64,

        (
          baseW *
          scale
        ) | 0
      );

    const levelH =
      Math.max(

        64,

        (
          baseH *
          scale
        ) | 0
      );

    const levelImg =
      new jsfeat.matrix_t(
        levelW,
        levelH,
        jsfeat.U8_t |
        jsfeat.C1_t
      );

    if (
      lev === 0
    ) {

      jsfeat.imgproc
        .gaussian_blur(
          level0,
          levelImg,
          5
        );

    } else {

      jsfeat.imgproc
        .resample(
          level0,
          levelImg,
          levelW,
          levelH
        );

      jsfeat.imgproc
        .gaussian_blur(
          levelImg,
          levelImg,
          5
        );
    }

    const corners =
      Array.from(

        {
          length:
            Math.min(

              CORNER_POOL,

              Math.max(

                1500,

                (
                  levelW *
                  levelH
                ) >> 4
              )
            )
        },

        () =>
          new jsfeat.keypoint_t(
            0,
            0,
            0,
            0,
            -1
          )
      );

    const descriptors =
      new jsfeat.matrix_t(

        32,

        MAX_PATTERN_POINTS,

        jsfeat.U8_t |
        jsfeat.C1_t
      );

    const count =
      detectKeypoints(

        levelImg,

        corners,

        MAX_PATTERN_POINTS
      );

    jsfeat.orb.describe(

      levelImg,

      corners,

      count,

      descriptors
    );

    if (
      lev > 0
    ) {

      for (
        let i = 0;
        i < count;
        i++
      ) {

        corners[i].x *=
          1 /
          scale;

        corners[i].y *=
          1 /
          scale;
      }
    }

    trace.patternCorners[
      lev
    ] = corners;

    trace.patternDescriptors[
      lev
    ] = descriptors;

    totalPoints +=
      count;

    scale /=
      scaleStep;
  }

  trace.featureCount =
    totalPoints;

  trace.imageReady =
    totalPoints >= 40;
}

async function loadTraceAssets(
  trace
) {

  try {

    const image =
      await loadImageElement(
        trace.image
      );

    trainTrace(
      trace,
      image
    );

  } catch (err) {

    console.error(
      `Trace ${trace.id} image failed`,
      err
    );

    trace.imageReady =
      false;
  }

  try {

    audioContext ||=
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    const response =
      await fetch(

        trace.sound,

        {
          cache:
            'no-store'
        }
      );

    if (
      !response.ok
    ) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response
        .arrayBuffer();

    trace.audioBuffer =
      await audioContext
        .decodeAudioData(
          data.slice(0)
        );

    trace.soundReady =
      true;

  } catch (err) {

    console.error(
      `Trace ${trace.id} sound failed`,
      err
    );

    trace.soundReady =
      false;
  }

  trace.ready =
    trace.imageReady &&
    trace.soundReady;

  updateReadyState();

  updateLiveReadings();
}

async function loadAllAssets() {

  await Promise.all(
    traces.map(
      loadTraceAssets
    )
  );

  const readyCount =
    traces.filter(
      (t) => t.ready
    ).length;

  if (
    readyCount > 0
  ) {

    setStatus(

      `${readyCount}/3 traces loaded.`,

      'Press START CAMERA + SOUND.'

    );

  } else {

    setStatus(

      'No traces loaded.',

      'Check the traces/ and sounds/ folders and filenames.'

    );
  }
}

function drawVideoCover() {

  const vw =
    video.videoWidth ||
    W;

  const vh =
    video.videoHeight ||
    H;

  const scale =
    Math.max(
      W / vw,
      H / vh
    );

  const sw =
    W /
    scale;

  const sh =
    H /
    scale;

  const sx =
    (
      vw -
      sw
    ) / 2;

  const sy =
    (
      vh -
      sh
    ) / 2;

  const brightness =
    100 +
    exposure;

  ctx.save();

  ctx.filter =
    `brightness(${brightness}%)`;

  ctx.drawImage(

    video,

    sx,
    sy,
    sw,
    sh,

    0,
    0,
    W,
    H

  );

  ctx.restore();
}

function popcnt32(n) {

  n -=
    (
      n >> 1
    ) &
    0x55555555;

  n =
    (
      n &
      0x33333333
    ) +

    (
      (
        n >> 2
      ) &
      0x33333333
    );

  return (

    (
      (
        (
          n +
          (
            n >> 4
          )
        ) &
        0x0F0F0F0F
      ) *

      0x01010101

    ) >> 24
  );
}

function matchPattern(
  trace
) {

  const qCnt =
    screenDescriptors.rows;

  const queryU32 =
    screenDescriptors
      .buffer.i32;

  let qdOff = 0;

  let numMatches = 0;

  for (
    let qidx = 0;
    qidx < qCnt;
    qidx++
  ) {

    let bestDist =
      256;

    let bestIdx =
      -1;

    let bestLev =
      -1;

    for (
      let lev = 0;
      lev < TRAIN_LEVELS;
      lev++
    ) {

      const desc =
        trace
          .patternDescriptors[
            lev
          ];

      if (!desc) {
        continue;
      }

      const ldCnt =
        desc.rows;

      const ldI32 =
        desc.buffer.i32;

      let ldOff = 0;

      for (
        let pidx = 0;
        pidx < ldCnt;
        pidx++
      ) {

        let curr = 0;

        for (
          let k = 0;
          k < 8;
          k++
        ) {

          curr +=
            popcnt32(

              queryU32[
                qdOff +
                k
              ] ^

              ldI32[
                ldOff +
                k
              ]
            );
        }

        if (
          curr <
          bestDist
        ) {

          bestDist =
            curr;

          bestLev =
            lev;

          bestIdx =
            pidx;
        }

        ldOff += 8;
      }
    }

    if (

      bestDist <
        MATCH_THRESHOLD &&

      numMatches <
        matchScratch.length

    ) {

      const match =
        matchScratch[
          numMatches++
        ];

      match.screen_idx =
        qidx;

      match.pattern_lev =
        bestLev;

      match.pattern_idx =
        bestIdx;

      match.distance =
        bestDist;
    }

    qdOff += 8;
  }

  return numMatches;
}

function findTransform(
  trace,
  count
) {

  if (
    count < 4
  ) {

    return 0;
  }

  const params =
    new jsfeat
      .ransac_params_t(
        4,
        3,
        0.5,
        0.99
      );

  const patternXY =
    new Array(
      count
    );

  const screenXY =
    new Array(
      count
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const match =
      matchScratch[i];

    const screenPoint =
      screenCorners[
        match.screen_idx
      ];

    const patternPoint =
      trace.patternCorners[
        match.pattern_lev
      ][
        match.pattern_idx
      ];

    patternXY[i] = {

      x:
        patternPoint.x,

      y:
        patternPoint.y
    };

    screenXY[i] = {

      x:
        screenPoint.x,

      y:
        screenPoint.y
    };
  }

  const ok =
    jsfeat
      .motion_estimator
      .ransac(

        params,

        jsfeat.homography2d,

        patternXY,

        screenXY,

        count,

        trace.homo3x3,

        trace.matchMask,

        700

      );

  if (!ok) {

    jsfeat.matmath
      .identity_3x3(

        trace.homo3x3,

        1.0

      );

    return 0;
  }

  let good = 0;

  for (
    let i = 0;
    i < count;
    i++
  ) {

    if (
      trace.matchMask
        .data[i]
    ) {

      patternXY[
        good
      ] =
        patternXY[i];

      screenXY[
        good
      ] =
        screenXY[i];

      good++;
    }
  }

  if (
    good >= 4
  ) {

    jsfeat
      .homography2d
      .run(

        patternXY,

        screenXY,

        trace.homo3x3,

        good
      );
  }

  return good;
}

function chooseWinner(
  readings
) {

  const eligible =
    readings.filter(
      (r) =>

        r.trace.ready &&

        r.trace.id !==
          blockedTraceId &&

        r.goodMatches >=
          r.trace.threshold
    );

  if (
    !eligible.length
  ) {

    return null;
  }

  eligible.sort(
    (a, b) => {

      const aScore =
        a.goodMatches /
        Math.max(
          1,
          a.trace.threshold
        );

      const bScore =
        b.goodMatches /
        Math.max(
          1,
          b.trace.threshold
        );

      if (
        bScore !==
        aScore
      ) {

        return (
          bScore -
          aScore
        );
      }

      return (
        b.goodMatches -
        a.goodMatches
      );
    }
  );

  return eligible[0];
}

function updateBlockedTrace(
  readings
) {

  if (
    blockedTraceId ==
    null
  ) {

    return;
  }

  const reading =
    readings.find(
      (r) =>
        r.trace.id ===
        blockedTraceId
    );

  if (!reading) {

    blockedTraceId =
      null;

    blockedClearFrames =
      0;

    return;
  }

  const clearLevel =
    Math.max(

      4,

      Math.floor(
        reading.trace
          .threshold *
        0.6
      )
    );

  if (
    reading.goodMatches <
    clearLevel
  ) {

    blockedClearFrames +=
      1;

    if (
      blockedClearFrames >=
      3
    ) {

      blockedTraceId =
        null;

      blockedClearFrames =
        0;
    }

  } else {

    blockedClearFrames =
      0;
  }
}

function playTraceSound(
  trace
) {

  if (

    !audioContext ||

    !trace.audioBuffer ||

    isAudioPlaying

  ) {

    return;
  }

  const source =
    audioContext
      .createBufferSource();

  source.buffer =
    trace.audioBuffer;

  source.connect(
    audioContext.destination
  );

  isAudioPlaying =
    true;

  currentSource =
    source;

  blockedTraceId =
    trace.id;

  blockedClearFrames =
    0;

  cameraBox.classList
    .add(
      'found'
    );

  foundBadge.textContent =
    `TRACE ${trace.id} FOUND`;

  setStatus(

    `TRACE ${trace.id} FOUND — SOUND PLAYING`,

    'When the sound ends, scanning resumes automatically.'

  );

  source.onended =
    () => {

      if (
        currentSource !==
        source
      ) {

        return;
      }

      currentSource =
        null;

      isAudioPlaying =
        false;

      cameraBox.classList
        .remove(
          'found'
        );

      setStatus(

        'SCANNING…',

        `Ready for any trace. Move away briefly before replaying Trace ${trace.id}.`

      );
    };

  source.start(0);
}

function processFrame() {

  if (

    processing ||

    !stream ||

    video.readyState < 2 ||

    !jsfeat

  ) {

    return;
  }

  processing =
    true;

  try {

    drawVideoCover();

    if (
      isAudioPlaying
    ) {

      return;
    }

    const imageData =
      ctx.getImageData(
        0,
        0,
        W,
        H
      );

    jsfeat.imgproc
      .grayscale(

        imageData.data,

        W,
        H,

        imgU8
      );

    jsfeat.imgproc
      .gaussian_blur(

        imgU8,

        imgSmooth,

        5
      );

    const numCorners =
      detectKeypoints(

        imgSmooth,

        screenCorners,

        MAX_SCREEN_POINTS
      );

    jsfeat.orb.describe(

      imgSmooth,

      screenCorners,

      numCorners,

      screenDescriptors
    );

    const readings =
      [];

    for (
      const trace
      of traces
    ) {

      if (
        !trace.imageReady
      ) {

        trace.lastGoodMatches =
          0;

        trace.lastCandidateMatches =
          0;

        readings.push({

          trace,

          goodMatches:
            0,

          candidateMatches:
            0

        });

        continue;
      }

      const candidateMatches =
        matchPattern(
          trace
        );

      const goodMatches =
        findTransform(
          trace,
          candidateMatches
        );

      trace.lastCandidateMatches =
        candidateMatches;

      trace.lastGoodMatches =
        goodMatches;

      readings.push({

        trace,

        goodMatches,

        candidateMatches

      });
    }

    updateBlockedTrace(
      readings
    );

    updateLiveReadings();

    const winner =
      chooseWinner(
        readings
      );

    if (
      winner
    ) {

      playTraceSound(
        winner.trace
      );

    } else {

      cameraBox.classList
        .remove(
          'found'
        );

      setStatus(

        'SCANNING…',

        blockedTraceId == null

          ? 'Point the camera at any prepared trace.'

          : `Trace ${blockedTraceId} can replay after you move away briefly.`

      );
    }

  } catch (err) {

    console.error(err);

    setStatus(

      'Recognition stopped because of an error.',

      'Reload the page and try again.'

    );

    stopCamera();

  } finally {

    processing =
      false;
  }
}

async function startCamera() {

  if (
    !navigator
      .mediaDevices
      ?.getUserMedia
  ) {

    setStatus(

      'Camera access is not available.',

      'Open this page from the HTTPS GitHub Pages link.'

    );

    return;
  }

  if (
    !traces.some(
      (t) => t.ready
    )
  ) {

    setStatus(

      'No trace is ready.',

      'Check the trace and sound files in GitHub.'

    );

    return;
  }

  try {

    audioContext ||=
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    await audioContext
      .resume();

    stream =
      await navigator
        .mediaDevices
        .getUserMedia({

          audio:
            false,

          video: {

            facingMode: {
              ideal:
                'environment'
            },

            width: {
              ideal:
                1280
            },

            height: {
              ideal:
                960
            }
          }

        });

    video.srcObject =
      stream;

    await video.play();

    blockedTraceId =
      null;

    blockedClearFrames =
      0;

    isAudioPlaying =
      false;

    startBtn.style.display =
      'none';

    stopBtn.style.display =
      'block';

    setStatus(

      'SCANNING…',

      'Point the camera at any prepared trace.'

    );

    timer =
      window.setInterval(

        processFrame,

        FRAME_INTERVAL_MS

      );

  } catch (err) {

    console.error(err);

    setStatus(

      'Camera could not start.',

      'Allow camera permission, then try again.'

    );
  }
}

function stopCamera() {

  if (timer) {

    window.clearInterval(
      timer
    );
  }

  timer =
    null;

  if (
    currentSource
  ) {

    currentSource.onended =
      null;

    try {

      currentSource.stop();

    } catch (_) {}
  }

  currentSource =
    null;

  isAudioPlaying =
    false;

  blockedTraceId =
    null;

  blockedClearFrames =
    0;

  stream
    ?.getTracks()
    .forEach(
      (track) =>
        track.stop()
    );

  stream =
    null;

  video.srcObject =
    null;

  processing =
    false;

  cameraBox.classList
    .remove(
      'found'
    );

  foundBadge.textContent =
    'TRACE FOUND';

  startBtn.style.display =
    'block';

  stopBtn.style.display =
    'none';

  setStatus(

    'Stopped. Press START when ready.'

  );
}

startBtn.addEventListener(
  'click',
  startCamera
);

stopBtn.addEventListener(
  'click',
  stopCamera
);

window.addEventListener(
  'pagehide',
  stopCamera
);

async function init() {

  updateExposureLabel();

  if (
    AUDIENCE_MODE
  ) {

    document
      .querySelector(
        '.sub'
      )
      .textContent =

      'Press START, then point the camera at any trace. You can return to any trace again after its sound ends.';
  }

  initVision();

  await loadAllAssets();
}

init();
