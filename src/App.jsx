import { useEffect } from 'react';
import { initializeAnalyzer } from './initializeAnalyzer.js';

export default function App() {
  useEffect(() => {
    initializeAnalyzer();
  }, []);

  return (
<div className="analyzer-workspace grid w-full min-h-screen grid-cols-[290px_minmax(0,1fr)_270px] gap-4 max-w-[1380px]">
  {/*Left Column: File & Stream Details*/}
  <div className="meta-sidebar flex flex-col gap-[14px] rounded-[10px] border border-[#242e3d] p-4 text-xs">
    <div>
      <div className="meta-section-title">File & Container</div>
      <div className="meta-grid">
        <span className="meta-label">File:</span>
        <span className="meta-val" id="metaFileName">—</span>
        <span className="meta-label">Size:</span>
        <span className="meta-val" id="metaFileSize">—</span>
        <span className="meta-label">Container:</span>
        <span className="meta-val" id="metaContainer">—</span>
      </div>
    </div>

    <div>
      <div className="meta-section-title">Video Stream</div>
      <div className="meta-grid">
        <span className="meta-label">Codec:</span>
        <span className="meta-val highlight" id="metaVideoCodec">—</span>
        <span className="meta-label">Resolution:</span>
        <span className="meta-val" id="metaResolution">—</span>
        <span className="meta-label">Aspect Ratio:</span>
        <span className="meta-val" id="metaAspectRatio">—</span>
        <span className="meta-label">Set FPS:</span>
        <span className="meta-val" id="metaSetFps">30.000</span>
        <span className="meta-label">Real FPS:</span>
        <span className="meta-val highlight" id="metaRealFps">—</span>
      </div>
    </div>

    <div>
      <div className="meta-section-title">Audio Stream</div>
      <div className="meta-grid">
        <span className="meta-label">Codec:</span>
        <span className="meta-val" id="metaAudioCodec">—</span>
        <span className="meta-label">Sampling:</span>
        <span className="meta-val" id="metaAudioSampleRate">—</span>
        <span className="meta-label">Channels:</span>
        <span className="meta-val" id="metaAudioChannels">—</span>
      </div>
    </div>

    <div>
      <div className="meta-section-title">Device & Timing</div>
      <div className="meta-grid">
        <span className="meta-label">Camera:</span>
        <span className="meta-val" id="metaCamera">—</span>
        <span className="meta-label">Recorded:</span>
        <span className="meta-val" id="metaDate">—</span>
        <span className="meta-label">Duration:</span>
        <span className="meta-val" id="metaDuration">—</span>
      </div>
    </div>
  </div>

  {/*Right Column: Video Viewport, Sliders, Controls*/}
  <div className="analyzer-card flex flex-col rounded-[10px] border border-[#242e3d] p-[18px] shadow-[0_10px_30px_rgba(0,0,0,0.7)]">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
      <input type="file" id="videoFileInput" accept="video/*" />
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
        <span>FPS:</span>
        <input type="number" id="fpsInput" defaultValue="30" step="0.001" style={{ width: "65px", padding: "4px 6px" }} />
        <button className="fps-btn active" data-fps="30">30</button>
        <button className="fps-btn" data-fps="60">60</button>
        <button className="fps-btn" data-fps="29.97">29.97</button>
        <button className="fps-btn" data-fps="59.94">59.94</button>
      </div>
    </div>

    {/*Video Viewport*/}
    <div className="video-viewport">
      <video id="vid" playsInline preload="auto"></video>
      <div className="timer-overlay">
        <div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>RACE TIME</span>
          <span className="timer-val" id="timerDisplay">00:00.000</span>
        </div>
        <div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>FRAME</span>
          <span className="frame-val" id="frameDisplay">#0 (0.000s)</span>
        </div>
      </div>
    </div>

    {/*Range Focus Bar & Slider*/}
    <div className="range-info-bar">
      <span id="rangeStartLabel">0.000s [IN]</span>
      <span id="zoomStatusLabel" style={{ color: "var(--accent)" }}>Full Video Mode</span>
      <span id="rangeEndLabel">0.000s [OUT]</span>
    </div>
    <input type="range" id="timeline" className="timeline-slider" min="0" max="0" step="1" defaultValue="0" />

    {/*Waveform Strip*/}
    <div className="waveform-panel">
      <div className="waveform-header">
        <span>Audio Waveform (Start Gun Acoustic Transient)</span>
        <span id="audioStatus">Waiting for video...</span>
      </div>
      <div className="waveform-canvas-wrapper" id="waveContainer">
        <canvas id="audioWaveCanvas"></canvas>
        <div className="audio-playhead" id="audioPlayhead"></div>
      </div>
    </div>

    {/*Toolbar Controls*/}
    <div className="toolbar">
      <button id="btnPlayPause" className="primary">Play</button>
      <button id="btnStepBack">◀ -1 Frame (←)</button>
      <button id="btnStepForward">+1 Frame (→) ▶</button>

      <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
        Speed:
        <select id="playbackRate">
          <option value="1">1.0x</option>
          <option value="0.5">0.5x</option>
          <option value="0.25">0.25x</option>
          <option value="0.1">0.1x</option>
        </select>
      </label>

      <button id="btnSetIn" className="warn">Set IN [</button>
      <button id="btnSetOut" className="warn">Set OUT ]</button>
      <button id="btnToggleZoom">Zoom to Range</button>
      <button id="btnResetRange">Reset Range</button>
      <button id="btnBookmarkFrame" className="bookmark-trigger">Bookmark Frame</button>

      <button id="btnSetStart" style={{ borderColor: "#f59e0b", color: "#f59e0b", fontWeight: "600" }}>Set Start (T=0) [S]</button>
      <button id="btnAddMarker">Mark Event ▾</button>
    </div>

    {/*Marks Table*/}
    <div className="markers-panel">
      <table id="markersTable">
        <thead>
          <tr>
            <th>Event</th>
            <th>Race Time</th>
            <th>Video Time</th>
            <th>Frame #</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="markersTbody"></tbody>
      </table>
    </div>
  </div>

  <aside className="bookmarks-sidebar" aria-label="Frame bookmarks">
    <div className="meta-section-title">Frame Bookmarks</div>
    <div id="frameBookmarksList" className="bookmark-list" aria-live="polite">
      <span id="emptyBookmarksMessage" className="bookmark-empty">No bookmarks yet</span>
    </div>
  </aside>
</div>
  );
}
