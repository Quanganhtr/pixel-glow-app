import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_ROWS = 16;
const DEFAULT_COLS = 16;
const CELL_SIZE = 28;
const BG = '#050505';
const ANIM_DEFAULTS = { glowIn: 0.2, hold: 1.0, glowOut: 0.5, stagger: 0.5 };

const RATIO_PRESETS = {
  '1:1':  [1, 1],
  '4:3':  [4, 3],
  '3:4':  [3, 4],
  '16:9': [16, 9],
};

const PALETTE = [
  '#ff2d55', '#ff6b2d', '#ffd60a', '#30d158',
  '#00d4ff', '#0a84ff', '#bf5af2', '#ff375f',
  '#ffffff', '#ffe066', '#5effa0', '#5ec9ff',
  '#d97aff', '#ff8cba', '#aaaaaa', '#000000',
];


function createGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function lightenToL(hex, l) {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, s, l);
}

// Stable per-cell pseudo-random values (deterministic so no re-render flicker)
function cellRandom(r, c) {
  const x = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function cellRandom2(r, c) {
  const x = Math.sin(r * 419.2 + c * 521.1) * 43758.5453;
  return x - Math.floor(x);
}

// Euclidean nearest neighbor search — returns {cell, dist, nr, nc}
function getNearestPaintedNeighbor(grid, r, c, rows, cols, maxDist) {
  let best = null;
  for (let dr = -maxDist; dr <= maxDist; dr++) {
    for (let dc = -maxDist; dc <= maxDist; dc++) {
      const dist = Math.sqrt(dr * dr + dc * dc);
      if (dist > maxDist) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
        if (!best || dist < best.dist) best = { cell: grid[nr][nc], dist, nr, nc };
      }
    }
  }
  return best;
}

// Returns 0→1→1→0 intensity for a sequence pixel at time t
function getPixelAnimIntensity(t, seqIdx, timing) {
  const { glowIn, hold, glowOut, stagger } = timing;
  const start = seqIdx * stagger;
  const rel = t - start;
  if (rel <= 0) return 0;
  if (rel < glowIn) return rel / glowIn;
  if (rel < glowIn + hold) return 1;
  const fadeStart = glowIn + hold;
  if (rel < fadeStart + glowOut) return 1 - (rel - fadeStart) / glowOut;
  return 0;
}

function fillRoundRect(ctx, x, y, w, h, r) {
  if (r <= 0) { ctx.fillRect(x, y, w, h); return; }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
}

function getCellStyle(grid, r, c, rows, cols, bgColor) {
  const cell = grid[r][c];

  if (cell) {
    const { color, intensity } = cell;
    const bgL = 75 + intensity * 20;
    const glowAlpha = Math.round(intensity * 255).toString(16).padStart(2, '0');
    const whiteAlpha = (intensity * 0.32).toFixed(2);
    return {
      backgroundColor: lightenToL(color, bgL),
      position: 'relative',
      zIndex: 10,
      overflow: 'visible',
      boxShadow: [
        `0px 0px 96px rgba(0,0,0,0.25)`,
        `0px 0px 96px 8px ${color}${glowAlpha}`,
        `0px 0px 32px rgba(255,255,255,${whiteAlpha})`,
      ].join(', '),
      transition: 'background-color 0.1s ease, box-shadow 0.1s ease',
    };
  }

  const cellReach = 1.0 + cellRandom(r, c) * 2.5;
  const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
  if (!nearest || nearest.dist > cellReach) {
    return { backgroundColor: bgColor, transition: 'background-color 0.1s ease' };
  }

  const { color } = nearest.cell;
  const opacity = 0.05 + cellRandom2(r, c) * 0.25;
  const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return { backgroundColor: `${color}${opacityHex}`, transition: 'background-color 0.1s ease' };
}

export default function PixelGrid() {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [grid, setGrid] = useState(() => createGrid(DEFAULT_ROWS, DEFAULT_COLS));
  const [selectedColor, setSelectedColor] = useState(PALETTE[4]);
  const [isErasing, setIsErasing] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const gridRef = useRef(null);
  const containerRef = useRef(null);
  const [ratioKey, setRatioKey] = useState('1:1');
  const [baseSize, setBaseSize] = useState(DEFAULT_ROWS);
  const [isAnimMode, setIsAnimMode] = useState(false);
  const [animSequence, setAnimSequence] = useState([]);
  const [animTime, setAnimTime] = useState(-1);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoRes, setVideoRes] = useState('FHD');
  const [animTiming, setAnimTiming] = useState(ANIM_DEFAULTS);
  const animTimerRef = useRef(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [bgColor, setBgColor] = useState(BG);
  const [pixelRadius, setPixelRadius] = useState(0); // 0–50 (%)
  const [pixelGap, setPixelGap] = useState(0);       // px
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [noiseSize, setNoiseSize] = useState(2);
  const [noiseDensity, setNoiseDensity] = useState(50);
  const [noiseColor, setNoiseColor] = useState('#ffffff');
  const [noiseColorOpacity, setNoiseColorOpacity] = useState(0);
  const noiseCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = noiseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const drawNoise = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (noiseColorOpacity === 0) return;
      const r = parseInt(noiseColor.slice(1, 3), 16);
      const g = parseInt(noiseColor.slice(3, 5), 16);
      const b = parseInt(noiseColor.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${r},${g},${b},${noiseColorOpacity / 100})`;
      const s = Math.max(1, noiseSize);
      for (let y = 0; y < canvas.height; y += s)
        for (let x = 0; x < canvas.width; x += s)
          if (Math.random() < noiseDensity / 100)
            ctx.fillRect(x, y, s, s);
    };

    if (animPlaying && noiseColorOpacity > 0) {
      let rafId;
      const loop = () => { drawNoise(); rafId = requestAnimationFrame(loop); };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    } else {
      drawNoise();
    }
  }, [noiseSize, noiseDensity, noiseColor, noiseColorOpacity, animPlaying]);

  const paint = useCallback((row, col) => {
    setGrid(prev => {
      const next = prev.map(r => [...r]);
      next[row][col] = isErasing ? null : { color: selectedColor, intensity: 0.7 + Math.random() * 0.3 };
      return next;
    });
  }, [selectedColor, isErasing]);

  const handleMouseDown = (row, col) => {
    if (isAnimMode) {
      if (!grid[row][col]) return;
      setAnimSequence(prev => {
        const idx = prev.findIndex(p => p.r === row && p.c === col);
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : [...prev, { r: row, c: col }];
      });
      return;
    }
    setIsPainting(true); paint(row, col);
  };
  const handleMouseEnter = (row, col) => { if (!isAnimMode && isPainting) paint(row, col); };
  const handleMouseUp = () => setIsPainting(false);
  const handleClear = () => { setGrid(createGrid(rows, cols)); setAnimSequence([]); };
  const handleResize = (newRows, newCols) => {
    setRows(newRows); setCols(newCols); setGrid(createGrid(newRows, newCols)); setAnimSequence([]);
  };
  const applyRatio = (size, rKey) => {
    const [w, h] = RATIO_PRESETS[rKey];
    const maxDim = Math.max(w, h);
    const newCols = Math.round(size * w / maxDim);
    const newRows = Math.round(size * h / maxDim);
    handleResize(newRows, newCols);
  };

  const handleRandomAnim = useCallback(() => {
    const painted = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c]) painted.push({ r, c });
    if (painted.length === 0) return;
    for (let i = painted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [painted[i], painted[j]] = [painted[j], painted[i]];
    }
    setAnimSequence(painted);
    cancelAnimationFrame(animTimerRef.current);
    setAnimPlaying(true);
    const { glowIn, hold, glowOut, stagger } = animTiming;
    const totalDur = (painted.length - 1) * stagger + glowIn + hold + glowOut + 0.3;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      setAnimTime(t);
      if (t < totalDur) {
        animTimerRef.current = requestAnimationFrame(tick);
      } else {
        setAnimTime(-1);
        setAnimPlaying(false);
      }
    };
    animTimerRef.current = requestAnimationFrame(tick);
  }, [grid, rows, cols, animTiming, animTimerRef]);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animTimerRef.current);
    setAnimPlaying(false);
    setAnimTime(-1);
  }, []);

  const startAnimation = useCallback(() => {
    if (animSequence.length === 0) return;
    stopAnimation();
    setAnimPlaying(true);
    const { glowIn, hold, glowOut, stagger } = animTiming;
    const totalDur = (animSequence.length - 1) * stagger + glowIn + hold + glowOut + 0.3;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      setAnimTime(t);
      if (t < totalDur) {
        animTimerRef.current = requestAnimationFrame(tick);
      } else {
        setAnimTime(-1);
        setAnimPlaying(false);
      }
    };
    animTimerRef.current = requestAnimationFrame(tick);
  }, [animSequence, stopAnimation]);

  const handleExportMP4 = async () => {
    if (animSequence.length === 0) return;
    setIsExportingVideo(true);

    const TARGET_W = videoRes === '4K' ? 3840 : 1920;
    const TARGET_H = videoRes === '4K' ? 2160 : 1080;
    const gridW = cols * CELL_SIZE + (cols - 1) * pixelGap;
    const gridH = rows * CELL_SIZE + (rows - 1) * pixelGap;
    const S = Math.min((TARGET_W * 0.82) / gridW, (TARGET_H * 0.82) / gridH);
    const W = TARGET_W;
    const H = TARGET_H;
    const PAD_X = Math.round((TARGET_W - gridW * S) / 2);
    const PAD_Y = Math.round((TARGET_H - gridH * S) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const FPS = 30;
    const { glowIn, hold, glowOut, stagger } = animTiming;
    const totalDur = (animSequence.length - 1) * stagger + glowIn + hold + glowOut + 0.5;
    const totalFrames = Math.ceil(totalDur * FPS);

    const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pixel-art.${ext}`; a.click();
      URL.revokeObjectURL(url);
      setIsExportingVideo(false);
    };

    const cxf = c => c * (CELL_SIZE + pixelGap) * S + PAD_X;
    const cyf = r => r * (CELL_SIZE + pixelGap) * S + PAD_Y;
    const CS = CELL_SIZE * S;
    const CR = CS * pixelRadius / 100;
    const SPREAD = 8 * S;
    const OFFSCREEN = 200000;

    const drawFrame = (t) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);

      // Pass 1: ambient bleed
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c]) continue;
          const cellReach = 1.0 + cellRandom(r, c) * 2.5;
          const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
          if (!nearest || nearest.dist > cellReach) continue;
          const srcSeqIdx = animSequence.findIndex(p => p.r === nearest.nr && p.c === nearest.nc);
          if (srcSeqIdx < 0) continue;
          const animI = getPixelAnimIntensity(t, srcSeqIdx, animTiming);
          if (animI < 0.01) continue;
          const { color } = nearest.cell;
          const opacity = (0.05 + cellRandom2(r, c) * 0.25) * animI;
          const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
          ctx.fillStyle = `${color}${opacityHex}`;
          fillRoundRect(ctx, cxf(c), cyf(r), CS, CS, CR);
        }
      }

      // Pass 2: glow halos
      for (let seqIdx = 0; seqIdx < animSequence.length; seqIdx++) {
        const { r, c } = animSequence[seqIdx];
        const cell = grid[r][c];
        if (!cell) continue;
        const animI = getPixelAnimIntensity(t, seqIdx, animTiming);
        if (animI < 0.01) continue;
        const { color, intensity } = cell;
        const eff = intensity * animI;
        const px = cxf(c), py = cyf(r);
        const ex = px - SPREAD, ey = py - SPREAD;
        const ECS = CS + SPREAD * 2;
        const ECR = CR + SPREAD;
        const glowAlphaHex = Math.round(eff * 0.9 * 255).toString(16).padStart(2, '0');
        const whiteAlpha = (eff * 0.25).toFixed(3);
        ctx.save();
        ctx.shadowOffsetX = -OFFSCREEN;
        ctx.shadowOffsetY = -OFFSCREEN;
        ctx.fillStyle = `${color}${glowAlphaHex}`;
        ctx.shadowColor = `${color}${glowAlphaHex}`;
        ctx.shadowBlur = 96 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        const wc = `rgba(255,255,255,${whiteAlpha})`;
        ctx.fillStyle = wc; ctx.shadowColor = wc;
        ctx.shadowBlur = 32 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.restore();
      }

      // Pass 3: core pixels
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      for (let seqIdx = 0; seqIdx < animSequence.length; seqIdx++) {
        const { r, c } = animSequence[seqIdx];
        const cell = grid[r][c];
        if (!cell) continue;
        const animI = getPixelAnimIntensity(t, seqIdx, animTiming);
        if (animI < 0.01) continue;
        const { color, intensity } = cell;
        const eff = intensity * animI;
        ctx.fillStyle = lightenToL(color, 75 + eff * 20);
        fillRoundRect(ctx, cxf(c), cyf(r), CS, CS, CR);
      }
    };

    recorder.start();
    for (let f = 0; f < totalFrames; f++) {
      const t0 = performance.now();
      drawFrame(f / FPS);
      const elapsed = performance.now() - t0;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 / FPS - elapsed)));
    }
    recorder.requestData();
    recorder.stop();
  };

  const handleExportPNG = () => {
    const S = 2;
    const PAD = 96 * S;
    const W = (cols * CELL_SIZE + (cols - 1) * pixelGap) * S + PAD * 2;
    const H = (rows * CELL_SIZE + (rows - 1) * pixelGap) * S + PAD * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const cx = c => c * (CELL_SIZE + pixelGap) * S + PAD;
    const cy = r => r * (CELL_SIZE + pixelGap) * S + PAD;
    const CS = CELL_SIZE * S;
    const CR = CS * pixelRadius / 100;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) continue;
        const cellReach = 1.0 + cellRandom(r, c) * 2.5;
        const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
        if (!nearest || nearest.dist > cellReach) continue;
        const { color } = nearest.cell;
        const opacityHex = Math.round((0.05 + cellRandom2(r, c) * 0.25) * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = `${color}${opacityHex}`;
        fillRoundRect(ctx, cx(c), cy(r), CS, CS, CR);
      }
    }

    const SPREAD = 8 * S;
    const OFFSCREEN = 200000;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        const px = cx(c), py = cy(r);
        const glowAlphaHex = Math.round(intensity * 255).toString(16).padStart(2, '0');
        const ex = px - SPREAD, ey = py - SPREAD;
        const ECS = CS + SPREAD * 2;
        const ECR = CR + SPREAD;
        const whiteAlpha = (intensity * 0.32).toFixed(3);

        ctx.save();
        ctx.shadowOffsetX = -OFFSCREEN;
        ctx.shadowOffsetY = -OFFSCREEN;

        ctx.fillStyle = `${color}${glowAlphaHex}`;
        ctx.shadowColor = `${color}${glowAlphaHex}`;
        ctx.shadowBlur = 96 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.shadowBlur = 40 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);

        ctx.fillStyle = `rgba(255,255,255,${whiteAlpha})`;
        ctx.shadowColor = `rgba(255,255,255,${whiteAlpha})`;
        ctx.shadowBlur = 32 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 96 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);

        ctx.restore();
      }
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        ctx.fillStyle = lightenToL(color, 75 + intensity * 20);
        fillRoundRect(ctx, cx(c), cy(r), CS, CS, CR);
      }
    }

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pixel-art.png'; a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleExportSVG = () => {
    const PAD = 150;
    const W = cols * CELL_SIZE + (cols - 1) * pixelGap + PAD * 2;
    const H = rows * CELL_SIZE + (rows - 1) * pixelGap + PAD * 2;
    const ox = c => c * (CELL_SIZE + pixelGap) + PAD;
    const oy = r => r * (CELL_SIZE + pixelGap) + PAD;
    const CS = CELL_SIZE;
    const CR = Math.round(CS * pixelRadius / 100);
    const rxAttr = CR > 0 ? ` rx="${CR}"` : '';
    const SPREAD = 8;
    const FR = 'x="-500%" y="-500%" width="1100%" height="1100%"';

    const defs = `
      <filter id="halo-wide" ${FR}>
        <feMorphology operator="dilate" radius="${SPREAD}" result="spread"/>
        <feGaussianBlur in="spread" stdDeviation="48"/>
      </filter>
      <filter id="halo-tight" ${FR}>
        <feMorphology operator="dilate" radius="${SPREAD}" result="spread"/>
        <feGaussianBlur in="spread" stdDeviation="20"/>
      </filter>
      <filter id="bloom" ${FR}>
        <feGaussianBlur stdDeviation="16"/>
      </filter>`;

    const els = [`<rect width="${W}" height="${H}" fill="${bgColor}"/>`];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) continue;
        const cellReach = 1.0 + cellRandom(r, c) * 2.5;
        const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
        if (!nearest || nearest.dist > cellReach) continue;
        const { color } = nearest.cell;
        const opacity = (0.05 + cellRandom2(r, c) * 0.25).toFixed(3);
        els.push(`<rect x="${ox(c)}" y="${oy(r)}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${opacity}"/>`);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        const lightColor = lightenToL(color, 75 + intensity * 20);
        const alpha = intensity.toFixed(3);
        const whiteAlpha = (intensity * 0.32).toFixed(3);
        const x = ox(c), y = oy(r);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-wide)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-wide)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-tight)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="white" opacity="${whiteAlpha}" filter="url(#bloom)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${lightColor}"/>`);
      }
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}
  </defs>
  ${els.join('\n  ')}
</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pixel-art.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySVG = () => {
    const PAD = 150;
    const W = cols * CELL_SIZE + (cols - 1) * pixelGap + PAD * 2;
    const H = rows * CELL_SIZE + (rows - 1) * pixelGap + PAD * 2;
    const ox = c => c * (CELL_SIZE + pixelGap) + PAD;
    const oy = r => r * (CELL_SIZE + pixelGap) + PAD;
    const CS = CELL_SIZE;
    const CR = Math.round(CS * pixelRadius / 100);
    const rxAttr = CR > 0 ? ` rx="${CR}"` : '';
    const SPREAD = 8;
    const FR = 'x="-500%" y="-500%" width="1100%" height="1100%"';
    const defs = `
      <filter id="halo-wide" ${FR}>
        <feMorphology operator="dilate" radius="${SPREAD}" result="spread"/>
        <feGaussianBlur in="spread" stdDeviation="48"/>
      </filter>
      <filter id="halo-tight" ${FR}>
        <feMorphology operator="dilate" radius="${SPREAD}" result="spread"/>
        <feGaussianBlur in="spread" stdDeviation="20"/>
      </filter>
      <filter id="bloom" ${FR}>
        <feGaussianBlur stdDeviation="16"/>
      </filter>`;
    const els = [`<rect width="${W}" height="${H}" fill="${bgColor}"/>`];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) continue;
        const cellReach = 1.0 + cellRandom(r, c) * 2.5;
        const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
        if (!nearest || nearest.dist > cellReach) continue;
        const { color } = nearest.cell;
        const opacity = (0.05 + cellRandom2(r, c) * 0.25).toFixed(3);
        els.push(`<rect x="${ox(c)}" y="${oy(r)}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${opacity}"/>`);
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        const lightColor = lightenToL(color, 75 + intensity * 20);
        const alpha = intensity.toFixed(3);
        const whiteAlpha = (intensity * 0.32).toFixed(3);
        const x = ox(c), y = oy(r);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-wide)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-wide)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${color}" opacity="${alpha}" filter="url(#halo-tight)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="white" opacity="${whiteAlpha}" filter="url(#bloom)"/>`);
        els.push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}"${rxAttr} fill="${lightColor}"/>`);
      }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}
  </defs>
  ${els.join('\n  ')}
</svg>`;
    navigator.clipboard.writeText(svg);
  };

  const handleCopyPNG = () => {
    const S = 2;
    const PAD = 96 * S;
    const W = (cols * CELL_SIZE + (cols - 1) * pixelGap) * S + PAD * 2;
    const H = (rows * CELL_SIZE + (rows - 1) * pixelGap) * S + PAD * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);
    const cx = c => c * (CELL_SIZE + pixelGap) * S + PAD;
    const cy = r => r * (CELL_SIZE + pixelGap) * S + PAD;
    const CS = CELL_SIZE * S;
    const CR = CS * pixelRadius / 100;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) continue;
        const cellReach = 1.0 + cellRandom(r, c) * 2.5;
        const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
        if (!nearest || nearest.dist > cellReach) continue;
        const { color } = nearest.cell;
        const opacityHex = Math.round((0.05 + cellRandom2(r, c) * 0.25) * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = `${color}${opacityHex}`;
        fillRoundRect(ctx, cx(c), cy(r), CS, CS, CR);
      }
    const SPREAD = 8 * S;
    const OFFSCREEN = 200000;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        const px = cx(c), py = cy(r);
        const glowAlphaHex = Math.round(intensity * 255).toString(16).padStart(2, '0');
        const ex = px - SPREAD, ey = py - SPREAD;
        const ECS = CS + SPREAD * 2;
        const ECR = CR + SPREAD;
        const whiteAlpha = (intensity * 0.32).toFixed(3);
        ctx.save();
        ctx.shadowOffsetX = -OFFSCREEN; ctx.shadowOffsetY = -OFFSCREEN;
        ctx.fillStyle = `${color}${glowAlphaHex}`; ctx.shadowColor = `${color}${glowAlphaHex}`; ctx.shadowBlur = 96 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.shadowBlur = 40 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.fillStyle = `rgba(255,255,255,${whiteAlpha})`; ctx.shadowColor = `rgba(255,255,255,${whiteAlpha})`; ctx.shadowBlur = 32 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 96 * S;
        fillRoundRect(ctx, ex + OFFSCREEN, ey + OFFSCREEN, ECS, ECS, ECR);
        ctx.restore();
      }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const { color, intensity } = cell;
        ctx.fillStyle = lightenToL(color, 75 + intensity * 20);
        fillRoundRect(ctx, cx(c), cy(r), CS, CS, CR);
      }
    canvas.toBlob(blob => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]));
  };

  const grainBg = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

  return (
    <div
      className="flex h-screen overflow-hidden select-none"
      style={{ background: '#080808' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ─── Left Sidebar ─── */}
      <div
        className="shrink-0 flex flex-col"
        style={{
          width: sidebarOpen ? 360 : 48,
          background: '#0e0e0e',
          borderRight: '1px solid #1c1c1c',
          transition: 'width 0.25s ease',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            position: 'absolute', top: 16, right: 12, zIndex: 10,
            width: 24, height: 24, borderRadius: 6,
            background: '#1e1e1e', border: '1px solid #2a2a2a',
            color: '#555', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {sidebarOpen
              ? <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              : <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
          </svg>
        </button>

        {/* Scrollable content */}
        <div
          className="flex flex-col gap-3 p-4 overflow-y-auto flex-1"
          style={{ width: 360, opacity: sidebarOpen ? 1 : 0, transition: 'opacity 0.15s ease', pointerEvents: sidebarOpen ? 'auto' : 'none' }}
        >
        {/* Header */}
        <div className="px-1 pt-3 pb-1">
          <h1 className="text-xl font-bold" style={{ color: '#fff' }}>PixelGlow Tool</h1>
          <p className="text-xs mt-0.5" style={{ color: '#444' }}>Vibe-coding by Quang</p>
        </div>

        {/* Layout */}
        <div className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid #282828' }}>
          <span className="text-xs mb-3 block" style={{ color: '#555' }}>Layout</span>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm w-10 shrink-0" style={{ color: '#fff' }}>Ratio</span>
            <div className="flex gap-2">
              {Object.keys(RATIO_PRESETS).map(rKey => (
                <button
                  key={rKey}
                  onClick={() => { setRatioKey(rKey); applyRatio(baseSize, rKey); }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={ratioKey === rKey
                    ? { border: '1.5px solid #e84040', color: '#e84040' }
                    : { color: '#555' }}
                >
                  {rKey}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-10 shrink-0" style={{ color: '#fff' }}>Size</span>
            <div className="flex flex-wrap gap-2">
              {[8, 16, 32, 96, 124].map(size => (
                <button
                  key={size}
                  onClick={() => { setBaseSize(size); applyRatio(size, ratioKey); }}
                  className="h-8 px-2.5 rounded-full text-xs font-semibold flex items-center justify-center"
                  style={baseSize === size
                    ? { border: '1.5px solid #e84040', color: '#e84040' }
                    : { color: '#555' }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tools */}
        <div className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid #282828' }}>
          <span className="text-xs mb-3 block" style={{ color: '#555' }}>Tools</span>
          <div className="flex gap-2">
            <button
              onClick={() => setIsErasing(e => !e)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"
              style={isErasing
                ? { background: '#ff2d55', color: '#fff' }
                : { background: '#1e1e1e', color: '#fff', border: '1px solid #2a2a2a' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L17.94 6M9 21H21M3 21l3-3" />
              </svg>
              Eraser
            </button>
            <button
              onClick={handleClear}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#1e1e1e', color: '#fff', border: '1px solid #2a2a2a' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear all
            </button>
          </div>
        </div>

        {/* Color */}
        <div className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid #282828' }}>
          <span className="text-xs mb-3 block" style={{ color: '#555' }}>Color</span>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#1e1e1e', border: '1px solid #2a2a2a' }}>
            <input
              type="text"
              value={selectedColor.toUpperCase()}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) { setSelectedColor(v); setIsErasing(false); }
              }}
              className="flex-1 bg-transparent text-sm font-mono outline-none"
              style={{ color: '#fff' }}
            />
            <label
              className="w-6 h-6 rounded-md cursor-pointer shrink-0"
              style={{ backgroundColor: selectedColor, border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <input
                type="color"
                value={selectedColor}
                onChange={e => { setSelectedColor(e.target.value); setIsErasing(false); }}
                className="opacity-0 w-0 h-0 absolute"
              />
            </label>
          </div>
        </div>

        {/* Canvas */}
        <div className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid #282828' }}>
          <span className="text-xs mb-3 block" style={{ color: '#555' }}>Canvas</span>
          {/* Background color */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3" style={{ background: '#1e1e1e', border: '1px solid #2a2a2a' }}>
            <span className="text-xs flex-1" style={{ color: '#555' }}>Background</span>
            <input
              type="text"
              value={bgColor.toUpperCase()}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBgColor(v);
              }}
              className="bg-transparent text-sm font-mono outline-none w-20 text-right"
              style={{ color: '#fff' }}
            />
            <label
              className="w-6 h-6 rounded-md cursor-pointer shrink-0"
              style={{ backgroundColor: bgColor, border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <input
                type="color"
                value={bgColor}
                onChange={e => setBgColor(e.target.value)}
                className="opacity-0 w-0 h-0 absolute"
              />
            </label>
          </div>
          {/* Corner radius */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: '#555' }}>Corner radius</span>
              <span className="text-xs font-mono" style={{ color: '#888' }}>{pixelRadius}%</span>
            </div>
            <div className="relative flex items-center">
              <input
                type="range" min={0} max={50} step={1}
                value={pixelRadius}
                onChange={e => setPixelRadius(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#555' }}
              />
              <div
                className="absolute -top-6 px-1.5 py-0.5 rounded text-xs font-mono pointer-events-none"
                style={{
                  left: `calc(${(pixelRadius / 50) * 100}% + ${(0.5 - pixelRadius / 50) * 16}px)`,
                  transform: 'translateX(-50%)',
                  background: '#222', color: '#ccc', border: '1px solid #333'
                }}
              >{pixelRadius}</div>
            </div>
          </div>
          {/* Spacing */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: '#555' }}>Spacing</span>
              <span className="text-xs font-mono" style={{ color: '#888' }}>{pixelGap}px</span>
            </div>
            <div className="relative flex items-center">
              <input
                type="range" min={0} max={10} step={1}
                value={pixelGap}
                onChange={e => setPixelGap(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#555' }}
              />
              <div
                className="absolute -top-6 px-1.5 py-0.5 rounded text-xs font-mono pointer-events-none"
                style={{
                  left: `calc(${(pixelGap / 10) * 100}% + ${(0.5 - pixelGap / 10) * 16}px)`,
                  transform: 'translateX(-50%)',
                  background: '#222', color: '#ccc', border: '1px solid #333'
                }}
              >{pixelGap}</div>
            </div>
          </div>
          {/* Noise */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #222' }}>
            <span className="text-xs mb-3 block" style={{ color: '#555' }}>Noise</span>
            {/* Size + Density row */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <span className="text-xs block mb-1" style={{ color: '#555' }}>Size</span>
                <input
                  type="number" min={1} max={20} step={1}
                  value={noiseSize}
                  onChange={e => setNoiseSize(Math.min(20, Math.max(1, Number(e.target.value))))}
                  className="w-full bg-transparent text-sm font-mono outline-none px-2 py-1.5 rounded-lg text-center"
                  style={{ color: '#fff', border: '1px solid #2a2a2a', background: '#1e1e1e' }}
                />
              </div>
              <div className="flex-1">
                <span className="text-xs block mb-1" style={{ color: '#555' }}>Density %</span>
                <input
                  type="number" min={0} max={100} step={1}
                  value={noiseDensity}
                  onChange={e => setNoiseDensity(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full bg-transparent text-sm font-mono outline-none px-2 py-1.5 rounded-lg text-center"
                  style={{ color: '#fff', border: '1px solid #2a2a2a', background: '#1e1e1e' }}
                />
              </div>
            </div>
            {/* Color + Opacity row */}
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-xs block mb-1" style={{ color: '#555' }}>Color</span>
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer" style={{ border: '1px solid #2a2a2a', background: '#1e1e1e' }}>
                  <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: noiseColor, border: '1px solid rgba(255,255,255,0.15)' }} />
                  <span className="text-xs font-mono flex-1" style={{ color: '#fff' }}>{noiseColor.toUpperCase()}</span>
                  <input type="color" value={noiseColor} onChange={e => setNoiseColor(e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                </label>
              </div>
              <div className="flex-1">
                <span className="text-xs block mb-1" style={{ color: '#555' }}>Opacity %</span>
                <input
                  type="number" min={0} max={100} step={1}
                  value={noiseColorOpacity}
                  onChange={e => setNoiseColorOpacity(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full bg-transparent text-sm font-mono outline-none px-2 py-1.5 rounded-lg text-center"
                  style={{ color: '#fff', border: '1px solid #2a2a2a', background: '#1e1e1e' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Animation */}
        <div className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid #282828' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#555' }}>Animation</span>
              <button
                onClick={() => { setIsAnimMode(e => !e); stopAnimation(); }}
                className="text-xs px-2 py-0.5 rounded-full"
                style={isAnimMode
                  ? { border: '1px solid #e84040', color: '#e84040' }
                  : { color: '#444', border: '1px solid #2a2a2a' }}
              >
                {isAnimMode ? '● Select' : 'Select'}
              </button>
            </div>
            <button
              onClick={() => { setAnimSequence([]); stopAnimation(); }}
              className="flex items-center gap-1 text-xs"
              style={{ color: '#555' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          </div>

          {/* Timing sliders */}
          {[
            { key: 'glowIn',  label: 'Fade in',  min: 0.05, max: 1.0, step: 0.05 },
            { key: 'glowOut', label: 'Fade out', min: 0.05, max: 2.0, step: 0.05 },
            { key: 'hold',    label: 'Hold',     min: 0.1,  max: 5.0, step: 0.1  },
            { key: 'stagger', label: 'Stagger',  min: 0.1,  max: 3.0, step: 0.1  },
          ].map(({ key, label, min, max, step }) => {
            const val = animTiming[key];
            const pct = (val - min) / (max - min);
            return (
              <div key={key} className="mb-4">
                <span className="text-sm mb-1 block" style={{ color: '#ccc' }}>{label}</span>
                <div className="relative" style={{ paddingTop: 24 }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: `calc(${pct * 100}% + ${(0.5 - pct) * 16}px)`,
                    transform: 'translateX(-50%)',
                    background: '#fff', color: '#000',
                    borderRadius: 99, padding: '1px 7px',
                    fontSize: 10, fontWeight: 700,
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                    lineHeight: '18px',
                  }}>
                    {val.toFixed(2)}
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={val}
                    onChange={e => setAnimTiming(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                    className="w-full"
                    style={{ accentColor: '#555' }}
                  />
                </div>
              </div>
            );
          })}

          {/* Shuffle & Play */}
          <button
            onClick={handleRandomAnim}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold mb-2"
            style={{ background: '#1e1e1e', color: '#fff', border: '1px solid #2a2a2a' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Shuffle & Play
          </button>

          {/* Preview */}
          <button
            onClick={animPlaying ? stopAnimation : startAnimation}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: '#1e1e1e',
              color: animSequence.length === 0 && !animPlaying ? '#444' : '#fff',
              border: '1px solid #2a2a2a',
            }}
          >
            {animPlaying
              ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            {animPlaying ? 'Stop' : 'Preview'}
          </button>
        </div>
        </div> {/* end scrollable content */}
      </div>

      {/* ─── Right: Grid canvas ─── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.25) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundColor: '#080808',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: grainBg,
          backgroundRepeat: 'repeat',
          backgroundSize: '150px 150px',
          opacity: 0.04,
          pointerEvents: 'none',
          mixBlendMode: 'overlay',
        }} />
        {/* Noise overlay */}
        <canvas
          ref={noiseCanvasRef}
          width={1920} height={1080}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            zIndex: 5,
            opacity: noiseColorOpacity > 0 ? 1 : 0,
          }}
        />
        {/* Zoom controls */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setZoom(z => Math.min(4, z + 0.25))}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#1e1e1e', border: '1px solid #333', color: '#aaa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >+</button>
          <span
            onClick={() => setZoom(1)}
            style={{ fontSize: 11, color: '#555', cursor: 'pointer', minWidth: 36, textAlign: 'center', fontFamily: 'monospace' }}
            title="Click to reset"
          >{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#1e1e1e', border: '1px solid #333', color: '#aaa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >−</button>
        </div>
        <div ref={containerRef} style={{ padding: '48px', overflow: 'visible', position: 'relative', zIndex: 1, transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          <div
            ref={gridRef}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${rows}, ${CELL_SIZE}px)`,
              gap: `${pixelGap}px`,
              cursor: isErasing ? 'cell' : 'crosshair',
              background: bgColor,
              overflow: 'visible',
              outline: '1px solid rgba(255,255,255,0.12)',
            }}
            onDragStart={e => e.preventDefault()}
          >
            {grid.map((row, r) =>
              row.map((_cell, c) => {
                const seqIdx = animSequence.findIndex(p => p.r === r && p.c === c);

                let cellStyle;
                if (animTime >= 0) {
                  if (seqIdx >= 0 && grid[r][c]) {
                    const animI = getPixelAnimIntensity(animTime, seqIdx, animTiming);
                    if (animI > 0.01) {
                      const { color, intensity } = grid[r][c];
                      const eff = intensity * animI;
                      cellStyle = {
                        backgroundColor: lightenToL(color, 75 + eff * 20),
                        position: 'relative', zIndex: 10, overflow: 'visible',
                        boxShadow: [
                          `0px 0px 96px rgba(0,0,0,0.25)`,
                          `0px 0px 96px 8px ${color}${Math.round(eff * 255).toString(16).padStart(2, '0')}`,
                          `0px 0px 32px rgba(255,255,255,${(eff * 0.32).toFixed(2)})`,
                        ].join(', '),
                        transition: 'none',
                      };
                    } else {
                      cellStyle = { backgroundColor: bgColor, transition: 'none' };
                    }
                  } else if (!grid[r][c]) {
                    const cellReach = 1.0 + cellRandom(r, c) * 2.5;
                    const nearest = getNearestPaintedNeighbor(grid, r, c, rows, cols, Math.ceil(cellReach));
                    if (nearest && nearest.dist <= cellReach) {
                      const srcSeqIdx = animSequence.findIndex(p => p.r === nearest.nr && p.c === nearest.nc);
                      const animI = srcSeqIdx >= 0 ? getPixelAnimIntensity(animTime, srcSeqIdx, animTiming) : 0;
                      if (animI > 0.01) {
                        const opacity = (0.05 + cellRandom2(r, c) * 0.25) * animI;
                        const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
                        cellStyle = { backgroundColor: `${nearest.cell.color}${opacityHex}`, transition: 'none' };
                      } else {
                        cellStyle = { backgroundColor: bgColor, transition: 'none' };
                      }
                    } else {
                      cellStyle = { backgroundColor: bgColor, transition: 'none' };
                    }
                  } else {
                    cellStyle = { backgroundColor: bgColor, transition: 'none' };
                  }
                } else {
                  cellStyle = getCellStyle(grid, r, c, rows, cols, bgColor);
                }

                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseDown={() => handleMouseDown(r, c)}
                    onMouseEnter={() => handleMouseEnter(r, c)}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      position: 'relative',
                      borderRadius: `${pixelRadius}%`,
                      ...cellStyle,
                      cursor: isAnimMode ? (grid[r][c] ? 'pointer' : 'default') : undefined,
                    }}
                  >
                    {isAnimMode && animTime < 0 && seqIdx >= 0 && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', fontWeight: '900', color: '#fff',
                        pointerEvents: 'none', zIndex: 20,
                        textShadow: '0 0 4px #000, 0 0 8px #000',
                      }}>
                        {seqIdx + 1}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Floating Export Button + Popup ─── */}
      {isExportOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          onMouseDown={() => setIsExportOpen(false)}
        />
      )}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button
          onClick={() => setIsExportOpen(e => !e)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ background: '#fff', color: '#000', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>

        {isExportOpen && (
          <div
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: '#141414', border: '1px solid #282828', width: 220, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: '#fff' }}>Export</span>
              <button onClick={() => setIsExportOpen(false)} style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#555' }}>Video quality</span>
              <div className="flex gap-1">
                {['FHD', '4K'].map(res => (
                  <button
                    key={res}
                    onClick={() => setVideoRes(res)}
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={videoRes === res
                      ? { border: '1.5px solid #e84040', color: '#e84040' }
                      : { color: '#555', border: '1px solid #2a2a2a' }}
                  >{res}</button>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#222' }} />

            {/* PNG */}
            <div>
              <span className="text-xs mb-1.5 block" style={{ color: '#555' }}>PNG</span>
              <div className="flex gap-2">
                <button onClick={handleExportPNG} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold" style={{ background: '#fff', color: '#000' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download
                </button>
                <button onClick={handleCopyPNG} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold" style={{ background: '#1e1e1e', color: '#fff', border: '1px solid #2a2a2a' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
              </div>
            </div>

            {/* SVG */}
            <div>
              <span className="text-xs mb-1.5 block" style={{ color: '#555' }}>SVG</span>
              <div className="flex gap-2">
                <button onClick={handleExportSVG} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold" style={{ background: '#fff', color: '#000' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download
                </button>
                <button onClick={handleCopySVG} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold" style={{ background: '#1e1e1e', color: '#fff', border: '1px solid #2a2a2a' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
              </div>
            </div>

            {/* MP4 */}
            <div>
              <span className="text-xs mb-1.5 block" style={{ color: '#555' }}>MP4 Animation</span>
              <button onClick={handleExportMP4} disabled={isExportingVideo} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-semibold" style={{ background: '#fff', color: '#000', opacity: isExportingVideo ? 0.5 : 1 }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {isExportingVideo ? 'Rendering…' : 'Download'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
