// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d");
const container = document.getElementById("canvas-container");

let tool = "pen";
let color = "#1a1916";
let strokeSize = 2;
let opacity = 1;
let zoom = 1;
let panX = 0,
  panY = 0;

let isDrawing = false;
let lastX = 0,
  lastY = 0;
let startX = 0,
  startY = 0;
let spaceHeld = false;
let isPanning = false;
let panStartX = 0,
  panStartY = 0;

// stroke smoothing
let points = [];

// history
let history = [];
let historyIndex = -1;

// shapes / text overlays
let shapes = []; // {type, x,y,w,h,color,strokeSize,opacity,text?}
let selectedShapes = [];

// current shape being drawn
let currentShape = null;

// text editing
let textInput = document.getElementById("text-input");
let activeText = null;

// eraser cursor
const eraserCursor = document.getElementById("eraser-cursor");

function updateEraserCursor(clientX, clientY) {
  if (tool !== "eraser") {
    eraserCursor.style.display = "none";
    return;
  }
  const diameter = Math.max(8, strokeSize * zoom);
  eraserCursor.style.display = "block";
  eraserCursor.style.width = diameter + "px";
  eraserCursor.style.height = diameter + "px";
  eraserCursor.style.left = clientX + "px";
  eraserCursor.style.top = clientY + "px";
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.scale(dpr, dpr);
  redraw();
}
window.addEventListener("resize", resize);
resize();

// ─────────────────────────────────────────────
//  COORDINATE HELPERS
// ─────────────────────────────────────────────
function screenToWorld(sx, sy) {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}
function worldToScreen(wx, wy) {
  return { x: wx * zoom + panX, y: wy * zoom + panY };
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return screenToWorld(cx, cy);
}

// ─────────────────────────────────────────────
//  HISTORY
// ─────────────────────────────────────────────
function saveState() {
  history = history.slice(0, historyIndex + 1);
  history.push({
    shapes: JSON.parse(JSON.stringify(shapes)),
    imageData: canvas.toDataURL(),
  });
  historyIndex++;
  if (history.length > 80) {
    history.shift();
    historyIndex--;
  }
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreState(history[historyIndex]);
  toast("Undo");
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreState(history[historyIndex]);
  toast("Redo");
}

function restoreState(state) {
  shapes = JSON.parse(JSON.stringify(state.shapes));
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(
      0,
      0,
      canvas.width / (window.devicePixelRatio || 1),
      canvas.height / (window.devicePixelRatio || 1),
    );
    redraw();
  };
  img.src = state.imageData;
}

// ─────────────────────────────────────────────
//  DRAWING ENGINE
// ─────────────────────────────────────────────
function applyTransform() {
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
}

function redraw() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  applyTransform();

  // draw all shapes
  for (const s of shapes) {
    drawShape(s);
  }

  // draw current shape preview
  if (currentShape) drawShape(currentShape, true);

  ctx.restore();
}

function drawShape(s, preview = false) {
  ctx.save();
  ctx.globalAlpha = s.opacity !== undefined ? s.opacity : 1;
  ctx.strokeStyle = s.color || "#1a1916";
  ctx.fillStyle = s.color || "#1a1916";
  ctx.lineWidth = s.strokeSize || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.type === "eraser") {
    // Pixel-level eraser using destination-out compositing
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = s.strokeSize || 10;
    if (!s.points || !s.points.length) { ctx.restore(); return; }
    if (s.points.length === 1) {
      // single dot
      ctx.beginPath();
      ctx.arc(s.points[0].x, s.points[0].y, (s.strokeSize || 10) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length - 1; i++) {
        const mx = (s.points[i].x + s.points[i + 1].x) / 2;
        const my = (s.points[i].y + s.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
      }
      ctx.lineTo(
        s.points[s.points.length - 1].x,
        s.points[s.points.length - 1].y,
      );
      ctx.stroke();
    }
    ctx.restore();
    return;
  } else if (s.type === "path") {
    if (!s.points || s.points.length < 2) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length - 1; i++) {
      const mx = (s.points[i].x + s.points[i + 1].x) / 2;
      const my = (s.points[i].y + s.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
    }
    ctx.lineTo(
      s.points[s.points.length - 1].x,
      s.points[s.points.length - 1].y,
    );
    if (s.highlighter) {
      ctx.globalAlpha = 0.3 * (s.opacity || 1);
      ctx.lineWidth = (s.strokeSize || 2) * 3;
    }
    ctx.stroke();
  } else if (s.type === "rect") {
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 2);
    ctx.stroke();
    if (preview) {
      ctx.globalAlpha = 0.08;
      ctx.fill();
    }
  } else if (s.type === "ellipse") {
    const rx = Math.abs(s.w) / 2;
    const ry = Math.abs(s.h) / 2;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (preview) {
      ctx.globalAlpha = 0.08;
      ctx.fill();
    }
  } else if (s.type === "line") {
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.stroke();
  } else if (s.type === "arrow") {
    const ex = s.x + s.w,
      ey = s.y + s.h;
    const angle = Math.atan2(s.h, s.w);
    const hl = Math.max(10, (s.strokeSize || 2) * 4);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - hl * Math.cos(angle - 0.4),
      ey - hl * Math.sin(angle - 0.4),
    );
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - hl * Math.cos(angle + 0.4),
      ey - hl * Math.sin(angle + 0.4),
    );
    ctx.stroke();
  } else if (s.type === "text") {
    ctx.font = `${s.fontSize || 16}px 'DM Sans', sans-serif`;
    ctx.fillStyle = s.color || "#1a1916";
    ctx.globalAlpha = s.opacity || 1;
    const lines = (s.text || "").split("\n");
    lines.forEach((ln, i) => {
      ctx.fillText(
        ln,
        s.x,
        s.y + (s.fontSize || 16) * 1.5 * i + (s.fontSize || 16),
      );
    });
  }

  // selection indicator
  if (s.selected) {
    ctx.save();
    ctx.strokeStyle = "#378add";
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    const pad = 6 / zoom;
    const bounds = getShapeBounds(s);
    ctx.strokeRect(
      bounds.x - pad,
      bounds.y - pad,
      bounds.w + pad * 2,
      bounds.h + pad * 2,
    );
    ctx.restore();
  }

  ctx.restore();
}

function getShapeBounds(s) {
  if (s.type === "path" || s.type === "eraser") {
    if (!s.points || !s.points.length) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    s.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (s.type === "text") {
    return {
      x: s.x,
      y: s.y - (s.fontSize || 16),
      w: 200,
      h: (s.fontSize || 16) * 1.5 * (s.text || "").split("\n").length,
    };
  }
  return {
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h),
  };
}

// ─────────────────────────────────────────────
//  EVENT HANDLERS
// ─────────────────────────────────────────────
function onPointerDown(e) {
  if (e.button === 1) {
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    return;
  }

  const pos = getPos(e);

  if (tool === "hand" || spaceHeld) {
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    container.classList.add("dragging");
    return;
  }

  if (tool === "text") {
    commitText();
    openTextInput(pos.x, pos.y);
    return;
  }

  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;
  startX = pos.x;
  startY = pos.y;

  if (tool === "pen" || tool === "highlighter") {
    points = [pos];
    currentShape = {
      type: "path",
      points: [pos],
      color,
      strokeSize,
      opacity,
      highlighter: tool === "highlighter",
    };
  } else if (["rect", "ellipse", "line", "arrow"].includes(tool)) {
    currentShape = {
      type: tool,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      color,
      strokeSize,
      opacity,
    };
  } else if (tool === "eraser") {
    points = [pos];
    currentShape = {
      type: "eraser",
      points: [pos],
      strokeSize: Math.max(8, strokeSize),
      opacity: 1,
    };
  }

  redraw();
}

function onPointerMove(e) {
  const pos = getPos(e);

  if (isPanning) {
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    updateDotPattern();
    redraw();
    return;
  }

  if (!isDrawing) return;

  if (tool === "pen" || tool === "highlighter") {
    points.push(pos);
    currentShape.points = points;
    redraw();
  } else if (["rect", "ellipse", "line", "arrow"].includes(tool)) {
    let w = pos.x - startX,
      h = pos.y - startY;
    if (e.shiftKey) {
      const side = Math.min(Math.abs(w), Math.abs(h));
      w = w < 0 ? -side : side;
      h = h < 0 ? -side : side;
    }
    currentShape.w = w;
    currentShape.h = h;
    redraw();
  } else if (tool === "eraser") {
    points.push(pos);
    currentShape.points = points;
    redraw();
  }

  // update eraser cursor
  updateEraserCursor(e.clientX, e.clientY);

  lastX = pos.x;
  lastY = pos.y;
}

function onPointerUp(e) {
  if (isPanning) {
    isPanning = false;
    container.classList.remove("dragging");
    return;
  }
  if (!isDrawing) return;
  isDrawing = false;

  if (currentShape) {
    // allow eraser single-dots; only discard pen paths that are too short
    if (currentShape.type === "path" && currentShape.points.length < 2) {
      currentShape = null;
      redraw();
      return;
    }
    shapes.push(currentShape);
    currentShape = null;
    saveState();
    redraw();
  }
}

// Dot pattern tracks pan
function updateDotPattern() {
  const ox = panX % 24;
  const oy = panY % 24;
  container.style.backgroundPosition = `${ox}px ${oy}px`;
}

// Track eraser cursor on mouse move over canvas
canvas.addEventListener("mousemove", (e) => updateEraserCursor(e.clientX, e.clientY));
canvas.addEventListener("mouseleave", () => { eraserCursor.style.display = "none"; });

// ─────────────────────────────────────────────
//  TEXT TOOL
// ─────────────────────────────────────────────
function openTextInput(wx, wy) {
  const sc = worldToScreen(wx, wy);
  textInput.style.display = "block";
  textInput.style.left = sc.x + "px";
  textInput.style.top = sc.y + "px";
  textInput.style.color = color;
  textInput.style.fontSize = Math.max(12, 16 * zoom) + "px";
  textInput.style.opacity = opacity;
  textInput.value = "";
  textInput.focus();
  activeText = { wx, wy };

  textInput.oninput = () => {
    textInput.style.height = "auto";
    textInput.style.height = textInput.scrollHeight + "px";
  };
}

function commitText() {
  if (!activeText || !textInput.value.trim()) {
    textInput.style.display = "none";
    activeText = null;
    return;
  }
  shapes.push({
    type: "text",
    x: activeText.wx,
    y: activeText.wy,
    text: textInput.value,
    color,
    opacity,
    fontSize: 16,
  });
  saveState();
  textInput.style.display = "none";
  activeText = null;
  redraw();
}

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    textInput.style.display = "none";
    activeText = null;
  }
  e.stopPropagation();
});

// ─────────────────────────────────────────────
//  ZOOM
// ─────────────────────────────────────────────
// Excalidraw-style predefined zoom steps
const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 8];

function zoomIn() {
  const next = ZOOM_STEPS.find((s) => s > zoom + 0.01);
  setZoom(next || 8);
}
function zoomOut() {
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01);
  setZoom(prev || 0.1);
}

function setZoom(z, cx, cy) {
  cx = cx || window.innerWidth / 2;
  cy = cy || window.innerHeight / 2;
  const oldZoom = zoom;
  zoom = Math.min(8, Math.max(0.1, z));
  panX = cx - (cx - panX) * (zoom / oldZoom);
  panY = cy - (cy - panY) * (zoom / oldZoom);
  updateZoomDisplay();
  updateDotPattern();
  redraw();
}

function updateZoomDisplay() {
  document.getElementById("zoom-display").textContent =
    Math.round(zoom * 100) + "%";
}

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Proportional zoom: small delta = small zoom, large delta = large zoom.
      // Clamped so one wheel click can't jump more than ~15%.
      const factor = Math.exp(
        Math.max(-0.15, Math.min(0.15, -e.deltaY * 0.005)),
      );
      setZoom(zoom * factor, e.clientX, e.clientY);
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
      updateDotPattern();
      redraw();
    }
  },
  { passive: false },
);

document.getElementById("zoom-in").onclick = zoomIn;
document.getElementById("zoom-out").onclick = zoomOut;
document.getElementById("zoom-display").onclick = () => setZoom(1);
document.getElementById("zoom-fit").onclick = () => {
  if (!shapes.length) {
    setZoom(1);
    panX = 0;
    panY = 0;
    updateDotPattern();
    redraw();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  shapes.forEach((s) => {
    const b = getShapeBounds(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  const pad = 60;
  const scaleX = (window.innerWidth - pad * 2) / (maxX - minX || 1);
  const scaleY = (window.innerHeight - pad * 2) / (maxY - minY || 1);
  const newZoom = Math.min(scaleX, scaleY, 3);
  zoom = newZoom;
  panX = (window.innerWidth - (maxX + minX) * zoom) / 2;
  panY = (window.innerHeight - (maxY + minY) * zoom) / 2;
  updateZoomDisplay();
  updateDotPattern();
  redraw();
};

// ─────────────────────────────────────────────
//  TOOL SWITCHING
// ─────────────────────────────────────────────
function setTool(t) {
  commitText();
  tool = t;
  document
    .querySelectorAll(".tool-btn[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  const cursors = {
    pen: "pen",
    highlighter: "pen",
    eraser: "eraser",
    select: "select",
    hand: "hand",
    text: "text",
    rect: "shape",
    ellipse: "shape",
    line: "shape",
    arrow: "shape",
  };
  container.className = "";
  container.classList.add("cursor-" + (cursors[t] || "pen"));
  // hide eraser cursor when switching away
  if (t !== "eraser") eraserCursor.style.display = "none";
}

document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

// ─────────────────────────────────────────────
//  SIDEBAR
// ─────────────────────────────────────────────
document.querySelectorAll(".color-swatch").forEach((sw) => {
  sw.addEventListener("click", () => {
    color = sw.dataset.color;
    document
      .querySelectorAll(".color-swatch")
      .forEach((s) => s.classList.remove("selected"));
    sw.classList.add("selected");
  });
});

document.getElementById("custom-color").addEventListener("input", (e) => {
  color = e.target.value;
  document
    .querySelectorAll(".color-swatch")
    .forEach((s) => s.classList.remove("selected"));
});

const strokeSlider = document.getElementById("stroke-slider");

function setStrokeSize(val) {
  strokeSize = Math.max(1, Math.min(100, Math.round(+val)));
  strokeSlider.value = strokeSize;
}

strokeSlider.addEventListener("input", (e) => setStrokeSize(e.target.value));
strokeSlider.addEventListener("change", (e) => setStrokeSize(e.target.value));

document
  .getElementById("opacity-slider")
  .addEventListener("input", (e) => {
    opacity = e.target.value / 100;
  });

// ─────────────────────────────────────────────
//  CANVAS EVENTS
// ─────────────────────────────────────────────
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointerleave", onPointerUp);

// ─────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.target === textInput || e.target.id === "file-name") return;

  if (e.code === "Space" && !spaceHeld) {
    spaceHeld = true;
    container.classList.add("cursor-hand");
    return;
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    zoomIn();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "-") {
    e.preventDefault();
    zoomOut();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "0") {
    e.preventDefault();
    setZoom(1);
    panX = 0;
    panY = 0;
    updateDotPattern();
    redraw();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "y") {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "a") {
    e.preventDefault();
    shapes.forEach((s) => (s.selected = true));
    redraw();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (shapes.some((s) => s.selected)) {
      shapes = shapes.filter((s) => !s.selected);
      saveState();
      redraw();
    }
    return;
  }

  const keys = {
    v: "select",
    h: "hand",
    p: "pen",
    e: "eraser",
    t: "text",
    r: "rect",
    o: "ellipse",
    l: "line",
    a: "arrow",
    m: "highlighter",
  };
  if (!e.metaKey && !e.ctrlKey && !e.altKey && keys[e.key])
    setTool(keys[e.key]);
  if (e.key === "?") toggleShortcuts();
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    setTool(tool); // restore cursor
  }
});

// ─────────────────────────────────────────────
//  CLEAR
// ─────────────────────────────────────────────
document.getElementById("clear-btn").addEventListener("click", () => {
  if (!shapes.length) return;
  if (confirm("Clear the entire canvas?")) {
    shapes = [];
    saveState();
    redraw();
    toast("Canvas cleared");
  }
});

// ─────────────────────────────────────────────
//  UNDO / REDO BUTTONS
// ─────────────────────────────────────────────
document.getElementById("undo-btn").onclick = undo;
document.getElementById("redo-btn").onclick = redo;

// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────
const exportBtn = document.getElementById("export-btn");
const exportMenu = document.getElementById("export-menu");

exportBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle("open");
});
document.addEventListener("click", () =>
  exportMenu.classList.remove("open"),
);

function getFileName() {
  return document.getElementById("file-name").value.trim() || "canvas";
}

// Download a file.
// On http:// (localhost), uses silent blob-URL download — no dialog, straight to Downloads.
// On file:// (Chrome blocks download attribute), uses showSaveFilePicker so the filename
// is correct. The dialog opens with the name + type pre-filled; just press Enter/Save.
async function triggerDownload(blob, filename) {
  const isFileProtocol = location.protocol === "file:";

  if (!isFileProtocol) {
    // Silent download — works on http:// (localhost, any server)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }

  // file:// — Chrome ignores download attribute on blob URLs.
  // showSaveFilePicker is the only API that works; pre-fill name + type to minimise clicks.
  if (typeof window.showSaveFilePicker === "function") {
    const ext = filename.split(".").pop().toLowerCase();
    const mimeMap = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml", json: "application/json" };
    const mime = mimeMap[ext] || "application/octet-stream";
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: filename, accept: { [mime]: ["." + ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // cancelled by user
    }
  }

  // Last resort (Firefox / browsers without showSaveFilePicker)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportCanvas(format) {
  exportMenu.classList.remove("open");
  const fname = getFileName();

  if (format === "png") {
    // Always composite on the background colour — canvas itself is transparent
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tc = tmp.getContext("2d");
    tc.fillStyle = "#f7f6f3";
    tc.fillRect(0, 0, tmp.width, tmp.height);
    tc.drawImage(canvas, 0, 0);
    tmp.toBlob((blob) => {
      triggerDownload(blob, fname + ".png");
      toast("Saving PNG…");
    }, "image/png");
  } else if (format === "jpg") {
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tc = tmp.getContext("2d");
    tc.fillStyle = "#f7f6f3";
    tc.fillRect(0, 0, tmp.width, tmp.height);
    tc.drawImage(canvas, 0, 0);
    tmp.toBlob((blob) => {
      triggerDownload(blob, fname + ".jpg");
      toast("Saving JPEG…");
    }, "image/jpeg", 0.95);
  } else if (format === "svg") {
    // Build SVG from shapes
    const w = window.innerWidth,
      h = window.innerHeight;
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-panX / zoom} ${-panY / zoom} ${w / zoom} ${h / zoom}">`;
    shapes.forEach((s) => {
      const op = s.opacity !== undefined ? s.opacity : 1;
      const clr = s.color || "#1a1916";
      const sw = s.strokeSize || 2;
      if (s.type === "path" && s.points) {
        let d = `M ${s.points[0].x} ${s.points[0].y}`;
        s.points.slice(1).forEach((p) => (d += ` L ${p.x} ${p.y}`));
        const lineW = s.highlighter ? sw * 3 : sw;
        const lineOp = s.highlighter ? op * 0.3 : op;
        svgContent += `<path d="${d}" stroke="${clr}" stroke-width="${lineW}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${lineOp}"/>`;
      } else if (s.type === "rect") {
        svgContent += `<rect x="${Math.min(s.x, s.x + s.w)}" y="${Math.min(s.y, s.y + s.h)}" width="${Math.abs(s.w)}" height="${Math.abs(s.h)}" stroke="${clr}" stroke-width="${sw}" fill="none" opacity="${op}"/>`;
      } else if (s.type === "ellipse") {
        const rx = Math.abs(s.w) / 2,
          ry = Math.abs(s.h) / 2;
        svgContent += `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${rx}" ry="${ry}" stroke="${clr}" stroke-width="${sw}" fill="none" opacity="${op}"/>`;
      } else if (s.type === "line") {
        svgContent += `<line x1="${s.x}" y1="${s.y}" x2="${s.x + s.w}" y2="${s.y + s.h}" stroke="${clr}" stroke-width="${sw}" opacity="${op}"/>`;
      } else if (s.type === "text") {
        svgContent += `<text x="${s.x}" y="${s.y + (s.fontSize || 16)}" font-family="DM Sans,sans-serif" font-size="${s.fontSize || 16}" fill="${clr}" opacity="${op}">${(s.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
      }
    });
    svgContent += "</svg>";
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    triggerDownload(blob, fname + ".svg");
    toast("Saving SVG…");
  } else if (format === "json") {
    const data = JSON.stringify({ shapes, zoom, panX, panY }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    triggerDownload(blob, fname + ".canvas.json");
    toast("Saving JSON…");
  } else if (format === "copy") {
    canvas.toBlob((blob) => {
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          toast("Copied to clipboard!");
        })
        .catch(() => {
          toast("Copy failed — try PNG export");
        });
    });
  } else if (format === "server-save") {
    serverSave();
  } else if (format === "server-load") {
    serverLoad();
  }
}

document.querySelectorAll("[data-export]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    exportCanvas(item.dataset.export);
  });
});

// ─────────────────────────────────────────────
//  PHP SERVER SAVE / LOAD
// ─────────────────────────────────────────────
async function serverSave() {
  const name = getFileName();
  try {
    const res = await fetch("php/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, shapes, zoom, panX, panY }),
    });
    const json = await res.json();
    if (json.success) {
      toast("Saved to server: " + json.file);
    } else {
      toast("Server save failed: " + (json.error || "unknown error"));
    }
  } catch (err) {
    toast("Server save error — is PHP running?");
  }
}

async function serverLoad() {
  try {
    const listRes = await fetch("php/list.php");
    const list = await listRes.json();
    if (!list.length) {
      toast("No saved canvases on server");
      return;
    }
    const name = prompt("Load which canvas?\n\n" + list.join("\n"));
    if (!name) return;
    const res = await fetch(`php/load.php?name=${encodeURIComponent(name)}`);
    if (!res.ok) {
      toast("Canvas not found: " + name);
      return;
    }
    const data = await res.json();
    shapes = data.shapes || [];
    zoom = data.zoom || 1;
    panX = data.panX || 0;
    panY = data.panY || 0;
    updateZoomDisplay();
    updateDotPattern();
    saveState();
    redraw();
    document.getElementById("file-name").value = name;
    toast("Loaded: " + name);
  } catch (err) {
    toast("Server load error — is PHP running?");
  }
}

// ─────────────────────────────────────────────
//  SHORTCUTS PANEL
// ─────────────────────────────────────────────
function toggleShortcuts() {
  const panel = document.getElementById("shortcuts-panel");
  panel.style.display =
    panel.style.display === "block" ? "none" : "block";
}
document
  .getElementById("help-btn")
  .addEventListener("click", toggleShortcuts);

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ─────────────────────────────────────────────
//  TOUCH SUPPORT
// ─────────────────────────────────────────────
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    onPointerDown(e);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    onPointerMove(e);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    onPointerUp(e);
  },
  { passive: false },
);

// ─────────────────────────────────────────────
//  INITIAL STATE
// ─────────────────────────────────────────────
saveState();
setTool("pen");
updateZoomDisplay();
