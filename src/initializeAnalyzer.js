export function initializeAnalyzer() {

  const vid = document.getElementById('vid');
  const timeline = document.getElementById('timeline');
  const timerDisplay = document.getElementById('timerDisplay');
  const frameDisplay = document.getElementById('frameDisplay');
  const fpsInput = document.getElementById('fpsInput');
  const waveCanvas = document.getElementById('audioWaveCanvas');
  const waveContainer = document.getElementById('waveContainer');
  const audioPlayhead = document.getElementById('audioPlayhead');
  const audioStatus = document.getElementById('audioStatus');
  const markersTbody = document.getElementById('markersTbody');
  const frameBookmarksList = document.getElementById('frameBookmarksList');
  
  const rangeStartLabel = document.getElementById('rangeStartLabel');
  const rangeEndLabel = document.getElementById('rangeEndLabel');
  const zoomStatusLabel = document.getElementById('zoomStatusLabel');

  // Metadata Fields
  const metaFileName = document.getElementById('metaFileName');
  const metaFileSize = document.getElementById('metaFileSize');
  const metaContainer = document.getElementById('metaContainer');
  const metaVideoCodec = document.getElementById('metaVideoCodec');
  const metaResolution = document.getElementById('metaResolution');
  const metaAspectRatio = document.getElementById('metaAspectRatio');
  const metaSetFps = document.getElementById('metaSetFps');
  const metaRealFps = document.getElementById('metaRealFps');
  const metaAudioCodec = document.getElementById('metaAudioCodec');
  const metaAudioSampleRate = document.getElementById('metaAudioSampleRate');
  const metaAudioChannels = document.getElementById('metaAudioChannels');
  const metaCamera = document.getElementById('metaCamera');
  const metaDate = document.getElementById('metaDate');
  const metaDuration = document.getElementById('metaDuration');

  let fps = 30.0;
  let totalVideoFrames = 0;
  let raceStartSeconds = 0.0;

  let rangeInSeconds = 0.0;
  let rangeOutSeconds = 0.0;
  let isZoomedToRange = false;

  let activeFrameIndex = 0;
  let isHardwareSeeking = false;
  let queuedFrameIndex = null;
  let isDraggingSlider = false;
  let isDraggingWave = false;
  let audioBuffer = null;

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  function setFPS(val) {
    fps = val;
    fpsInput.value = val;
    metaSetFps.textContent = val.toFixed(3);
    document.querySelectorAll('.fps-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.textContent) === val);
    });
    refreshTimelineBounds();
    calculateRealFps();
    requestFrameSeek(activeFrameIndex);
  }

  fpsInput.addEventListener('change', () => {
    fps = parseFloat(fpsInput.value) || 30.0;
    metaSetFps.textContent = fps.toFixed(3);
    refreshTimelineBounds();
    calculateRealFps();
    requestFrameSeek(activeFrameIndex);
  });

  // Native Binary Atom Parser to inspect Codecs, Camera Make/Model & Metadata
  async function parseVideoHeader(file) {
    const ext = file.name.split('.').pop().toUpperCase();
    metaFileName.textContent = file.name;
    metaFileSize.textContent = formatBytes(file.size);
    metaContainer.textContent = ext === 'MOV' ? 'QuickTime (.mov)' : ext === 'WEBM' ? 'WebM' : 'MPEG-4 (.mp4)';

    const fileDate = new Date(file.lastModified);
    metaDate.textContent = fileDate.toLocaleDateString() + ' ' + fileDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    try {
      // Read initial slice for ISO-BMFF / QuickTime atoms
      const sliceSize = Math.min(file.size, 1024 * 1024 * 3);
      const buffer = await file.slice(0, sliceSize).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('latin1').decode(bytes);

      // Search for Video Codecs
      if (text.includes('avc1')) metaVideoCodec.textContent = 'H.264 / AVC (avc1)';
      else if (text.includes('hvc1') || text.includes('hev1')) metaVideoCodec.textContent = 'HEVC / H.265 (hvc1)';
      else if (text.includes('apch') || text.includes('apcn')) metaVideoCodec.textContent = 'Apple ProRes';
      else if (text.includes('vp09')) metaVideoCodec.textContent = 'VP9';
      else if (text.includes('av01')) metaVideoCodec.textContent = 'AV1';
      else metaVideoCodec.textContent = 'Standard Video Track';

      // Search for Audio Codecs
      if (text.includes('mp4a')) metaAudioCodec.textContent = 'AAC (mp4a)';
      else if (text.includes('Opus') || text.includes('opus')) metaAudioCodec.textContent = 'Opus';
      else if (text.includes('lpcm') || text.includes('twos') || text.includes('sowt')) metaAudioCodec.textContent = 'Linear PCM';
      else metaAudioCodec.textContent = 'Stereo Audio';

      // Camera Make / Model heuristics in Apple/Android atoms
      let camera = 'Unknown Device';
      const appleMakeMatch = text.match(/(?:©mak|@mak|\x00make)([^\x00\x08]{3,30})/);
      const appleModelMatch = text.match(/(?:©mod|@mod|\x00model)([^\x00\x08]{3,30})/);

      if (appleModelMatch) {
        camera = appleModelMatch[1].replace(/[^a-zA-Z0-9,\.\- ]/g, '').trim();
      } else if (text.includes('iPhone')) {
        const m = text.match(/iPhone[A-Za-z0-9, ]{2,20}/);
        camera = m ? m[0] : 'Apple iPhone';
      } else if (text.includes('samsung') || text.includes('Samsung')) {
        camera = 'Samsung Galaxy Device';
      } else if (text.includes('GoPro')) {
        camera = 'GoPro Action Cam';
      }
      metaCamera.textContent = camera;

    } catch (err) {
      console.warn("Fast metadata parser skipped:", err);
    }
  }

  // Handle Video File Selection
  document.getElementById('videoFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseVideoHeader(file);
    vid.src = URL.createObjectURL(file);
    audioStatus.textContent = 'Decoding waveform...';

    // Decode audio asynchronously
    file.arrayBuffer().then(buf => {
      audioCtx.decodeAudioData(buf).then(decoded => {
        audioBuffer = decoded;
        metaAudioSampleRate.textContent = `${decoded.sampleRate} Hz`;
        metaAudioChannels.textContent = decoded.numberOfChannels === 1 ? '1 (Mono)' : `${decoded.numberOfChannels} (Stereo)`;
        audioStatus.textContent = 'Waveform ready';
        renderWaveform();
      }).catch(() => {
        audioStatus.textContent = 'No audio track / decode skipped';
        metaAudioCodec.textContent = 'None / Muted';
      });
    });
  });

  vid.addEventListener('loadedmetadata', () => {
    rangeInSeconds = 0.0;
    rangeOutSeconds = vid.duration;
    metaDuration.textContent = `${vid.duration.toFixed(3)}s`;

    // Compute Resolution & Aspect Ratio
    const w = vid.videoWidth;
    const h = vid.videoHeight;
    metaResolution.textContent = `${w} × ${h}`;

    if (w && h) {
      const d = gcd(w, h);
      const aspectX = w / d;
      const aspectY = h / d;
      // Identify common ratios or simplify
      if ((aspectX === 16 && aspectY === 9) || (aspectX === 9 && aspectY === 16) || (aspectX === 4 && aspectY === 3)) {
        metaAspectRatio.textContent = `${aspectX}:${aspectY}`;
      } else {
        const ratio = (w / h).toFixed(2);
        metaAspectRatio.textContent = `${aspectX}:${aspectY} (~${ratio}:1)`;
      }
    }

    refreshTimelineBounds();
    calculateRealFps();
    renderWaveform();
  });

  function calculateRealFps() {
    if (!vid.duration) return;
    // Calculate total frames over real playback duration
    const frames = Math.round(vid.duration * fps);
    const derivedFps = frames / vid.duration;
    metaRealFps.textContent = `${derivedFps.toFixed(3)} fps`;
  }

  function refreshTimelineBounds() {
    if (!vid.duration || isNaN(vid.duration)) return;
    totalVideoFrames = Math.max(1, Math.floor(vid.duration * fps));

    const minSec = isZoomedToRange ? rangeInSeconds : 0.0;
    const maxSec = isZoomedToRange ? rangeOutSeconds : vid.duration;

    timeline.min = Math.floor(minSec * fps);
    timeline.max = Math.ceil(maxSec * fps);

    rangeStartLabel.textContent = `${minSec.toFixed(3)}s [IN]`;
    rangeEndLabel.textContent = `${maxSec.toFixed(3)}s [OUT]`;
  }

  // Non-stalling Serialized Frame Seeker
  function requestFrameSeek(targetFrame) {
    const clampedFrame = Math.max(0, Math.min(totalVideoFrames, targetFrame));
    activeFrameIndex = clampedFrame;

    const targetSeconds = (clampedFrame / fps) + (0.5 / fps);
    syncUI(targetSeconds, clampedFrame);

    if (isHardwareSeeking) {
      queuedFrameIndex = clampedFrame;
      return;
    }

    isHardwareSeeking = true;
    vid.currentTime = targetSeconds;
  }

  vid.addEventListener('seeked', () => {
    isHardwareSeeking = false;
    if (queuedFrameIndex !== null) {
      const next = queuedFrameIndex;
      queuedFrameIndex = null;
      requestFrameSeek(next);
    }
  });

  function stepFrames(delta) {
    vid.pause();
    document.getElementById('btnPlayPause').textContent = 'Play';
    requestFrameSeek(activeFrameIndex + delta);
  }

  function formatTime(totalSeconds) {
    const sign = totalSeconds < 0 ? "-" : "";
    const abs = Math.abs(totalSeconds);
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    const ms = Math.floor((abs % 1) * 1000);
    return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function syncUI(mediaTime, frameIdx = null) {
    if (frameIdx === null) {
      frameIdx = Math.round(mediaTime * fps);
      activeFrameIndex = frameIdx;
    }
    const raceTime = mediaTime - raceStartSeconds;

    timerDisplay.textContent = formatTime(raceTime);
    frameDisplay.textContent = `#${frameIdx} (${mediaTime.toFixed(3)}s)`;

    if (!isDraggingSlider) timeline.value = frameIdx;

    if (vid.duration) {
      const viewStart = isZoomedToRange ? rangeInSeconds : 0.0;
      const viewEnd = isZoomedToRange ? rangeOutSeconds : vid.duration;
      const pct = Math.max(0, Math.min(100, ((mediaTime - viewStart) / (viewEnd - viewStart)) * 100));
      audioPlayhead.style.left = `${pct}%`;
    }
  }

  function onFrame(now, metadata) {
    if (!vid.paused) syncUI(metadata.mediaTime);
    vid.requestVideoFrameCallback(onFrame);
  }
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    vid.requestVideoFrameCallback(onFrame);
  } else {
    vid.addEventListener('timeupdate', () => {
      if (!vid.paused) syncUI(vid.currentTime);
    });
  }

  // Waveform Rendering
  function renderWaveform() {
    if (!audioBuffer) return;

    const width = waveContainer.clientWidth;
    const height = waveContainer.clientHeight;
    waveCanvas.width = width * window.devicePixelRatio;
    waveCanvas.height = height * window.devicePixelRatio;

    const ctx = waveCanvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    const midY = height / 2;
    const rawData = audioBuffer.getChannelData(0);

    const viewStart = isZoomedToRange ? rangeInSeconds : 0.0;
    const viewEnd = isZoomedToRange ? rangeOutSeconds : vid.duration;
    const totalSampleRate = audioBuffer.sampleRate;

    const startSample = Math.max(0, Math.floor(viewStart * totalSampleRate));
    const endSample = Math.min(rawData.length, Math.floor(viewEnd * totalSampleRate));
    const rangeSamples = endSample - startSample;
    const step = Math.ceil(rangeSamples / width);
    const amp = height * 0.45;

    ctx.strokeStyle = '#388bfd';
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let max = 0;
      const chunkStart = startSample + (i * step);
      const chunkEnd = Math.min(chunkStart + step, endSample);
      for (let j = chunkStart; j < chunkEnd; j += 4) {
        const v = Math.abs(rawData[j]);
        if (v > max) max = v;
      }
      const y = midY - (max * amp);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }

    for (let i = width - 1; i >= 0; i--) {
      let max = 0;
      const chunkStart = startSample + (i * step);
      const chunkEnd = Math.min(chunkStart + step, endSample);
      for (let j = chunkStart; j < chunkEnd; j += 4) {
        const v = Math.abs(rawData[j]);
        if (v > max) max = v;
      }
      const y = midY + (max * amp);
      ctx.lineTo(i, y);
    }

    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 139, 253, 0.25)';
    ctx.fill();
  }

  window.addEventListener('resize', renderWaveform);

  // Range Focus Trimming
  function setInPoint() {
    rangeInSeconds = vid.currentTime;
    if (rangeInSeconds >= rangeOutSeconds) rangeOutSeconds = vid.duration;
    refreshTimelineBounds();
    if (isZoomedToRange) renderWaveform();
  }

  function setOutPoint() {
    rangeOutSeconds = vid.currentTime;
    if (rangeOutSeconds <= rangeInSeconds) rangeInSeconds = 0.0;
    refreshTimelineBounds();
    if (isZoomedToRange) renderWaveform();
  }

  document.getElementById('btnSetIn').addEventListener('click', setInPoint);
  document.getElementById('btnSetOut').addEventListener('click', setOutPoint);

  document.getElementById('btnToggleZoom').addEventListener('click', () => {
    if (rangeOutSeconds <= rangeInSeconds) {
      alert("Please mark valid IN and OUT points first.");
      return;
    }
    isZoomedToRange = !isZoomedToRange;
    document.getElementById('btnToggleZoom').textContent = isZoomedToRange ? "Zoom: Focus Range" : "Zoom to Range";
    zoomStatusLabel.textContent = isZoomedToRange ? "Focused Range Mode" : "Full Video Mode";
    zoomStatusLabel.style.color = isZoomedToRange ? "#eab308" : "var(--accent)";
    refreshTimelineBounds();
    renderWaveform();
    syncUI(vid.currentTime);
  });

  document.getElementById('btnResetRange').addEventListener('click', () => {
    isZoomedToRange = false;
    rangeInSeconds = 0.0;
    rangeOutSeconds = vid.duration;
    document.getElementById('btnToggleZoom').textContent = "Zoom to Range";
    zoomStatusLabel.textContent = "Full Video Mode";
    zoomStatusLabel.style.color = "var(--accent)";
    refreshTimelineBounds();
    renderWaveform();
    syncUI(vid.currentTime);
  });

  document.getElementById('btnBookmarkFrame').addEventListener('click', () => {
    if (!vid.src || !vid.duration) return;

    const frameIndex = activeFrameIndex;
    document.getElementById('emptyBookmarksMessage')?.remove();

    const bookmark = document.createElement('div');
    bookmark.className = 'bookmark-row';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'bookmark-remove-button';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Remove bookmark for frame ${frameIndex}`);
    removeButton.addEventListener('click', () => {
      bookmark.remove();
      if (!frameBookmarksList.querySelector('.bookmark-row')) {
        const emptyMessage = document.createElement('span');
        emptyMessage.id = 'emptyBookmarksMessage';
        emptyMessage.className = 'bookmark-empty';
        emptyMessage.textContent = 'No bookmarks yet';
        frameBookmarksList.appendChild(emptyMessage);
      }
    });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'bookmark-label-input';
    labelInput.maxLength = 120;
    labelInput.placeholder = 'Label this frame';
    labelInput.setAttribute('aria-label', `Label for frame ${frameIndex}`);

    const seekButton = document.createElement('button');
    seekButton.type = 'button';
    seekButton.className = 'bookmark-frame-button';
    seekButton.textContent = `#${frameIndex}`;
    seekButton.setAttribute('aria-label', `Seek to frame ${frameIndex}`);
    seekButton.addEventListener('click', () => {
      vid.pause();
      document.getElementById('btnPlayPause').textContent = 'Play';
      requestFrameSeek(frameIndex);
    });

    bookmark.append(removeButton, labelInput, seekButton);
    frameBookmarksList.appendChild(bookmark);
  });

  // Waveform Interaction
  function seekFromWave(e) {
    const rect = waveCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const viewStart = isZoomedToRange ? rangeInSeconds : 0.0;
    const viewEnd = isZoomedToRange ? rangeOutSeconds : vid.duration;
    const targetSeconds = viewStart + ((x / rect.width) * (viewEnd - viewStart));
    requestFrameSeek(Math.round(targetSeconds * fps));
  }

  waveContainer.addEventListener('mousedown', (e) => {
    isDraggingWave = true;
    vid.pause();
    document.getElementById('btnPlayPause').textContent = 'Play';
    seekFromWave(e);
  });
  window.addEventListener('mousemove', (e) => { if (isDraggingWave) seekFromWave(e); });
  window.addEventListener('mouseup', () => { isDraggingWave = false; });

  // Slider Interaction
  timeline.addEventListener('mousedown', () => {
    isDraggingSlider = true;
    vid.pause();
    document.getElementById('btnPlayPause').textContent = 'Play';
  });
  timeline.addEventListener('mouseup', () => { isDraggingSlider = false; });
  timeline.addEventListener('input', (e) => {
    requestFrameSeek(parseInt(e.target.value, 10));
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      stepFrames(e.shiftKey ? -5 : -1);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      stepFrames(e.shiftKey ? 5 : 1);
    } else if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === '[') {
      e.preventDefault();
      setInPoint();
    } else if (e.key === ']') {
      e.preventDefault();
      setOutPoint();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      setRaceStart();
    }
  });

  function togglePlay() {
    if (vid.paused) {
      vid.play();
      document.getElementById('btnPlayPause').textContent = 'Pause';
    } else {
      vid.pause();
      document.getElementById('btnPlayPause').textContent = 'Play';
    }
  }

  document.getElementById('btnPlayPause').addEventListener('click', togglePlay);
  document.getElementById('btnStepBack').addEventListener('click', () => stepFrames(-1));
  document.getElementById('btnStepForward').addEventListener('click', () => stepFrames(1));

  document.getElementById('playbackRate').addEventListener('change', (e) => {
    vid.playbackRate = parseFloat(e.target.value);
  });

  // Race Markings
  function setRaceStart() {
    raceStartSeconds = vid.currentTime;
    syncUI(vid.currentTime);
    addMarkerRow("Race Start (Horn)", raceStartSeconds);
  }
  document.getElementById('btnSetStart').addEventListener('click', setRaceStart);

  document.getElementById('btnAddMarker').addEventListener('click', () => {
    const chosen = prompt("Event label:\n1. 15m Breakout\n2. 25m Split\n3. 35m Mark\n4. 50m Touch / Finish", "50m Touch");
    if (!chosen) return;
    addMarkerRow(chosen, vid.currentTime);
  });

  function addMarkerRow(label, rawTime) {
    const frameIndex = Math.round(rawTime * fps);
    const raceTime = rawTime - raceStartSeconds;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${label}</strong></td>
      <td style="color:var(--accent); font-weight:600;">${formatTime(raceTime)}</td>
      <td>${rawTime.toFixed(3)}s</td>
      <td>#${frameIndex}</td>
      <td><button style="padding: 2px 6px; font-size: 11px;">Jump</button></td>
    `;

    tr.querySelector('button').addEventListener('click', () => {
      vid.pause();
      document.getElementById('btnPlayPause').textContent = 'Play';
      requestFrameSeek(frameIndex);
    });

    markersTbody.appendChild(tr);
  }

  document.querySelectorAll('[data-fps]').forEach((button) => {
    button.addEventListener('click', () => setFPS(parseFloat(button.dataset.fps)));
  });

}
