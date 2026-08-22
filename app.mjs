export function clampThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.max(4, Math.min(100, Math.round(n)));
}

export function chooseWinningTrace(readings, blockedTraceId = null) {
  const eligible = readings.filter((r) =>
    r.ready &&
    r.id !== blockedTraceId &&
    r.goodMatches >= r.threshold
  );

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const aScore = a.goodMatches / Math.max(1, a.threshold);
    const bScore = b.goodMatches / Math.max(1, b.threshold);

    if (bScore !== aScore) return bScore - aScore;

    return b.goodMatches - a.goodMatches;
  });

  return eligible[0];
}

export function shouldReleaseBlockedTrace({
  goodMatches,
  threshold,
  clearFrames,
  framesNeeded = 3,
}) {
  const clearLevel = Math.max(
    4,
    Math.floor(threshold * 0.6)
  );

  if (goodMatches < clearLevel) {
    const next = clearFrames + 1;

    if (next >= framesNeeded) {
      return {
        release: true,
        clearFrames: 0
      };
    }

    return {
      release: false,
      clearFrames: next
    };
  }

  return {
    release: false,
    clearFrames: 0
  };
}

if (typeof document !== 'undefined') {
  initApp();
}

function ensureThreeTraceUI() {

  if (
    document.getElementById(
      'traceImage1'
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      'style'
    );

  style.id =
    'trace3-app-style';

  style.textContent = `

    main {
      width: min(820px, 100%);
      margin: 0 auto;
      padding: 14px;
    }

    .trace3-sub {
      margin: 0 0 14px;
      color: #bdbdbd;
      line-height: 1.4;
    }

    .trace3-card {
      border: 1px solid #3f3f3f;
      border-radius: 12px;
      padding: 11px;
      margin-bottom: 10px;
      background: #1d1d1d;
    }

    .trace3-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 9px;
    }

    .trace3-name {
      font-weight: 850;
    }

    .trace3-info {
      color: #aaa;
      font-size: .82rem;
      text-align: right;
    }

    .trace3-controls {
      display: grid;
      grid-template-columns:
        1fr 1fr 110px;
      gap: 8px;
      align-items: stretch;
    }

    .trace3-pick,
    .trace3-threshold {
      min-height: 48px;
      border: 1px solid #555;
      border-radius: 10px;
      background: #252525;
    }

    .trace3-pick {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8px;
      cursor: pointer;
      font-weight: 700;
    }

    .trace3-pick input {
      display: none;
    }

    .trace3-pick.ready {
      border-color: #999;
      background: #303030;
    }

    .trace3-threshold {
      padding: 5px 8px;
    }

    .trace3-threshold label {
      display: block;
      color: #aaa;
      font-size: .7rem;
      margin-bottom: 2px;
    }

    .trace3-threshold input {
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: white;
      font-size: 1rem;
      font-weight: 800;
    }

    #liveReadings {
      margin-top: 9px;
      padding: 9px 10px;
      border-radius: 9px;
      background: #1c1c1c;
      color: #ccc;
      font-size: .88rem;
      line-height: 1.5;
    }

    @media (max-width: 580px) {

      .trace3-controls {
        grid-template-columns:
          1fr 1fr;
      }

      .trace3-threshold {
        grid-column:
          1 / -1;
      }
    }

  `;

  document.head.appendChild(
    style
  );

  const main =
    document.querySelector(
      'main'
    ) ||
    document.body.appendChild(
      document.createElement(
        'main'
      )
    );

  main.innerHTML = `

    <h1>
      3 Trace → 3 Sound Test
    </h1>

    <p class="trace3-sub">
      Each trace has its own
      geometric trigger.
      Start at 15 and tune it
      from the live readings.
    </p>

    ${[1, 2, 3].map((id) => `

      <section class="trace3-card">

        <div class="trace3-head">

          <div class="trace3-name">
            TRACE ${id}
          </div>

          <div
            class="trace3-info"
            id="traceInfo${id}">
            Not prepared
          </div>

        </div>

        <div class="trace3-controls">

          <label
            class="trace3-pick"
            id="imageLabel${id}">

            CHOOSE IMAGE

            <input
              id="traceImage${id}"
              type="file"
              accept="image/*">

          </label>

          <label
            class="trace3-pick"
            id="soundLabel${id}">

            CHOOSE SOUND

            <input
              id="traceSound${id}"
              type="file"
              accept="audio/*">

          </label>

          <div
            class="trace3-threshold">

            <label
              for="traceThreshold${id}">
              GEOMETRIC TRIGGER
            </label>

            <input
              id="traceThreshold${id}"
              type="number"
              min="4"
              max="100"
              step="1"
              value="15">

          </div>

        </div>

      </section>

    `).join('')}

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

      Loading recognition engine…

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

function initApp() {

  ensureThreeTraceUI();

  const W = 480;
  const H = 360;

  const MAX_SCREEN_POINTS = 520;
  const CORNER_POOL = 8000;

  const MAX_PATTERN_SIZE = 512;
  const MAX_PATTERN_POINTS = 300;

  const TRAIN_LEVELS = 4;

  const MATCH_THRESHOLD = 50;

  const FRAME_INTERVAL_MS = 320;

  const $ = (id) =>
    document.getElementById(id);

  const startBtn =
    $('startBtn');

  const stopBtn =
    $('stopBtn');

  const statusEl =
    $('status');

  const detailsEl =
    $('details');

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
        willReadFrequently: true
      }
    );

  const cameraBox =
    $('cameraBox');

  const foundBadge =
    $('foundBadge');

  let jsfeat = null;

  let stream = null;

  let timer = null;

  let processing = false;

  let audioContext = null;

  let currentSource = null;

  let isAudioPlaying = false;

  let blockedTraceId = null;

  let blockedClearFrames = 0;

  let imgU8 = null;

  let imgSmooth = null;

  let screenCorners = null;

  let screenDescriptors = null;

  let matchScratch = [];

  const traces =
    [1, 2, 3].map(
      (id) => ({

        id,

        imageInput:
          $(`traceImage${id}`),

        soundInput:
          $(`traceSound${id}`),

        imageLabel:
          $(`imageLabel${id}`),

        soundLabel:
          $(`soundLabel${id}`),

        thresholdInput:
          $(`traceThreshold${id}`),

        infoEl:
          $(`traceInfo${id}`),

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

  function setStatus(
    text,
    details = ''
  ) {

    statusEl.textContent =
      text;

    detailsEl.textContent =
      details;
  }

  function traceThreshold(
    trace
  ) {

    const value =
      clampThreshold(
        trace.thresholdInput.value
      );

    trace.thresholdInput.value =
      String(value);

    return value;
  }

  function traceIsReady(
    trace
  ) {

    return (
      trace.imageReady &&
      trace.soundReady
    );
  }

  function readyCount() {

    return traces.filter(
      traceIsReady
    ).length;
  }

  function updateTraceInfo(
    trace
  ) {

    const parts = [];

    if (trace.imageReady) {

      parts.push(
        `${trace.featureCount} features`
      );

    } else {

      parts.push(
        'image not ready'
      );
    }

    parts.push(
      trace.soundReady
        ? 'sound ready'
        : 'sound not ready'
    );

    parts.push(
      `trigger ${traceThreshold(trace)}`
    );

    trace.infoEl.textContent =
      parts.join(' · ');
  }

  function updateStartButton() {

    const count =
      readyCount();

    startBtn.disabled =
      !(jsfeat && count > 0);

    if (!stream && jsfeat) {

      if (count === 0) {

        setStatus(
          'Prepare at least one trace + sound pair.'
        );

      } else {

        setStatus(
          `${count}/3 trace${count === 1 ? '' : 's'} ready.`,
          'Press START CAMERA + SOUND when ready.'
        );
      }
    }
  }

  function updateLiveReadings() {

    liveReadingsEl.textContent =
      traces.map(
        (trace) => {

          if (
            !trace.imageReady
          ) {

            return `T${trace.id} —`;
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
            `[trigger ${traceThreshold(trace)}]` +
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
        'Check the internet connection and reload this page.'
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

      updateTraceInfo(
        trace
      );
    }

    setStatus(
      'Ready. Prepare your trace images and sounds.'
    );

    updateStartButton();
  }

  const U_MAX =
    new Int32Array([
      15, 15, 15, 15,
      14, 14, 14,
      13, 13,
      12, 11, 10,
      9, 8, 6, 3, 0
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
        py * step +
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
            v * step
          ];

        const minus =
          src[
            centerOff +
            u -
            v * step
          ];

        vSum +=
          plus - minus;

        m10 +=
          u *
          (
            plus +
            minus
          );
      }

      m01 +=
        v * vSum;
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

      if (lev === 0) {

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

      if (lev > 0) {

        for (
          let i = 0;
          i < count;
          i++
        ) {

          corners[i].x *=
            1 / scale;

          corners[i].y *=
            1 / scale;
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

    return totalPoints;
  }

  async function loadTraceImage(
    trace
  ) {

    const file =
      trace.imageInput
        .files?.[0];

    if (
      !file ||
      !jsfeat
    ) {
      return;
    }

    const url =
      URL.createObjectURL(
        file
      );

    const image =
      new Image();

    image.onload =
      () => {

        try {

          const points =
            trainTrace(
              trace,
              image
            );

          trace.imageLabel
            .classList.toggle(
              'ready',
              trace.imageReady
            );

          trace.imageLabel
            .childNodes[0]
            .textContent =
              trace.imageReady
                ? 'IMAGE READY ✓'
                : 'CHOOSE BETTER IMAGE';

          if (
            !trace.imageReady
          ) {

            setStatus(
              `Trace ${trace.id} is too plain.`,
              `${points} features found. Try an image with more texture, edges or detail.`
            );

          } else {

            setStatus(
              `Trace ${trace.id} image prepared.`,
              `${points} reference features found.`
            );
          }

        } catch (err) {

          console.error(
            err
          );

          trace.imageReady =
            false;

          trace.imageLabel
            .classList.remove(
              'ready'
            );

          setStatus(
            `Could not prepare Trace ${trace.id}.`,
            'Try a smaller or more detailed image.'
          );

        } finally {

          URL.revokeObjectURL(
            url
          );

          updateTraceInfo(
            trace
          );

          updateStartButton();

          updateLiveReadings();
        }
      };

    image.onerror =
      () => {

        URL.revokeObjectURL(
          url
        );

        setStatus(
          `Could not read Trace ${trace.id} image.`
        );
      };

    image.src =
      url;
  }

  async function loadTraceSound(
    trace
  ) {

    const file =
      trace.soundInput
        .files?.[0];

    if (!file) {
      return;
    }

    try {

      audioContext ||=
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

      const data =
        await file.arrayBuffer();

      trace.audioBuffer =
        await audioContext
          .decodeAudioData(
            data.slice(0)
          );

      trace.soundReady =
        true;

      trace.soundLabel
        .classList.add(
          'ready'
        );

      trace.soundLabel
        .childNodes[0]
        .textContent =
          'SOUND READY ✓';

      setStatus(
        `Trace ${trace.id} sound prepared.`
      );

    } catch (err) {

      console.error(
        err
      );

      trace.soundReady =
        false;

      trace.audioBuffer =
        null;

      trace.soundLabel
        .classList.remove(
          'ready'
        );

      setStatus(
        `Could not read Trace ${trace.id} sound.`,
        'MP3, M4A or WAV usually work best.'
      );
    }

    updateTraceInfo(
      trace
    );

    updateStartButton();
  }

  for (
    const trace
    of traces
  ) {

    trace.imageInput
      .addEventListener(
        'change',
        () =>
          loadTraceImage(
            trace
          )
      );

    trace.soundInput
      .addEventListener(
        'change',
        () =>
          loadTraceSound(
            trace
          )
      );

    trace.thresholdInput
      .addEventListener(
        'change',
        () => {

          trace.thresholdInput
            .value =
              String(
                traceThreshold(
                  trace
                )
              );

          updateTraceInfo(
            trace
          );

          updateLiveReadings();
        }
      );
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
      W / scale;

    const sh =
      H / scale;

    const sx =
      (
        vw - sw
      ) / 2;

    const sy =
      (
        vh - sh
      ) / 2;

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
          trace.patternDescriptors[
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
                  qdOff + k
                ] ^
                ldI32[
                  ldOff + k
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

    if (count < 4) {
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
      jsfeat.motion_estimator
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

        patternXY[good] =
          patternXY[i];

        screenXY[good] =
          screenXY[i];

        good++;
      }
    }

    if (
      good >= 4
    ) {

      jsfeat.homography2d
        .run(
          patternXY,
          screenXY,
          trace.homo3x3,
          good
        );
    }

    return good;
  }

  function drawDetectedShape(
    trace
  ) {

    const M =
      trace.homo3x3.data;

    const base = [

      {
        x: 0,
        y: 0
      },

      {
        x:
          trace.patternBaseWidth,
        y: 0
      },

      {
        x:
          trace.patternBaseWidth,
        y:
          trace.patternBaseHeight
      },

      {
        x: 0,
        y:
          trace.patternBaseHeight
      }

    ];

    const points =
      base.map(
        (point) => {

          const x =
            M[0] *
              point.x +
            M[1] *
              point.y +
            M[2];

          const y =
            M[3] *
              point.x +
            M[4] *
              point.y +
            M[5];

          const z =
            M[6] *
              point.x +
            M[7] *
              point.y +
            M[8];

          return {
            x:
              x / z,
            y:
              y / z
          };
        }
      );

    if (
      points.some(
        (p) =>
          !Number.isFinite(
            p.x
          ) ||
          !Number.isFinite(
            p.y
          )
      )
    ) {

      return;
    }

    ctx.save();

    ctx.strokeStyle =
      'red';

    ctx.lineWidth =
      5;

    ctx.beginPath();

    ctx.moveTo(
      points[0].x,
      points[0].y
    );

    for (
      let i = 1;
      i < points.length;
      i++
    ) {

      ctx.lineTo(
        points[i].x,
        points[i].y
      );
    }

    ctx.closePath();

    ctx.stroke();

    ctx.restore();
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
      'Recognition pauses until this sound ends.'
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
          `Ready for the next trace. Trace ${trace.id} will re-arm after you move away from it.`
        );
      };

    source.start(0);
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
        (item) =>
          item.id ===
          blockedTraceId
      );

    if (!reading) {

      blockedTraceId =
        null;

      blockedClearFrames =
        0;

      return;
    }

    const result =
      shouldReleaseBlockedTrace({

        goodMatches:
          reading.goodMatches,

        threshold:
          reading.threshold,

        clearFrames:
          blockedClearFrames

      });

    blockedClearFrames =
      result.clearFrames;

    if (
      result.release
    ) {

      blockedTraceId =
        null;

      blockedClearFrames =
        0;
    }
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

      const readings = [];

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

            id:
              trace.id,

            ready:
              false,

            goodMatches:
              0,

            candidateMatches:
              0,

            threshold:
              traceThreshold(
                trace
              ),

            trace

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

          id:
            trace.id,

          ready:
            traceIsReady(
              trace
            ),

          goodMatches,

          candidateMatches,

          threshold:
            traceThreshold(
              trace
            ),

          trace

        });
      }

      updateBlockedTrace(
        readings
      );

      updateLiveReadings();

      const winner =
        chooseWinningTrace(
          readings,
          blockedTraceId
        );

      if (winner) {

        cameraBox.classList
          .add(
            'found'
          );

        foundBadge.textContent =
          `TRACE ${winner.id} FOUND`;

        drawDetectedShape(
          winner.trace
        );

        playTraceSound(
          winner.trace
        );

      } else {

        cameraBox.classList
          .remove(
            'found'
          );

        foundBadge.textContent =
          'TRACE FOUND';

        if (
          blockedTraceId ==
          null
        ) {

          setStatus(
            'SCANNING…',
            'Point the camera at one of the prepared traces.'
          );

        } else {

          setStatus(
            'SCANNING…',
            `Trace ${blockedTraceId} is temporarily blocked until you move away from it.`
          );
        }
      }

    } catch (err) {

      console.error(
        err
      );

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
      !navigator.mediaDevices
        ?.getUserMedia
    ) {

      setStatus(
        'Camera access is not available.',
        'Open this page from an HTTPS address such as GitHub Pages.'
      );

      return;
    }

    if (
      readyCount() === 0
    ) {

      setStatus(
        'Prepare at least one complete trace + sound pair first.'
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
        'Point the camera at one of the prepared traces.'
      );

      timer =
        window.setInterval(
          processFrame,
          FRAME_INTERVAL_MS
        );

    } catch (err) {

      console.error(
        err
      );

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

  initVision();
}
