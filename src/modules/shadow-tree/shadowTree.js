const { terminal, colors, generate, getCachedOrGenerateImage } = require('../../utils/helper.js');
const { resolveStylesTree } = require('./style.js');
const { computeLayoutTree } = require('./layout.js');
const { drawHalfBlockBorder, drawQuarterBlockBorder, drawBox, applyRoundedCorners } = require('./borders.js');
const { rasterizePixelFontCached, measurePixelFont, HALFBLOCK } = require('../pixel-font/pixelFont.js');

const isPrimitive = (value) => typeof value === 'string' || typeof value === 'number';

const getBgAnsi = (bgName) => {
  if (bgName === 'transparent') return colors.bgTransparent || '';
  return colors['bg' + bgName] || '';
};

const flattenContent = (content) => {
  const flat = [];
  for (const c of content) {
    if (Array.isArray(c)) {
      flat.push(...flattenContent(c));
    } else if (c === null || c === undefined || c === false) {
      // skip
    } else {
      flat.push(c);
    }
  }
  return flat;
}

const element = (type, style = {}, srcOrContent = null, ...restContent) => {
  // Support flexible calling:
  // - element(type, style, src, ...content)
  // - element(type, style, ...content)  // src omitted
  // - element(type, style, [children])  // third arg is content array

  const looksLikeVNode = (v) => v && typeof v === 'object' && typeof v.type === 'string';

  let src = null;
  let rawContent = restContent;

  const isContentLike = (v) => Array.isArray(v) || looksLikeVNode(v);

  if (type === 'img') {
    // For images, treat a string third argument as src by default
    if (typeof srcOrContent === 'string') {
      src = srcOrContent;
    } else if (isContentLike(srcOrContent)) {
      rawContent = [srcOrContent, ...restContent];
    } else if (srcOrContent != null) {
      src = srcOrContent;
    }
  } else if (type === 'text') {
    // For text nodes, any primitive or node-like third arg is content
    if (srcOrContent != null) rawContent = [srcOrContent, ...restContent];
  } else {
    // General elements: arrays or node-like => content; objects likely style mistake; primitives considered content
    if (isContentLike(srcOrContent) || isPrimitive(srcOrContent)) {
      rawContent = [srcOrContent, ...restContent];
    } else if (srcOrContent != null) {
      src = srcOrContent;
    }
  }

  const normalizedContent = flattenContent(rawContent).map((c) =>
    isPrimitive(c) ? { type: 'text', style: style || {}, src: src, content: c } : c
  );
  return { type, style: style || {}, src, content: normalizedContent };
}

const createBuffer = (width, height) => {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    const cols = new Array(width);
    for (let x = 0; x < width; x++) cols[x] = { char: ' ', fgColor: 'transparent', bgColor: 'transparent', raw: null };
    rows[y] = cols;
  }
  return rows;
}

// Previous frame buffer for damage-based rendering
let previousBuffer = null;
let previousWidth = 0;
let previousHeight = 0;

const cellsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.char === b.char && a.fgColor === b.fgColor && a.bgColor === b.bgColor && a.raw === b.raw;
};

const moveCursorTo = (x, y) => `\x1b[${y};${x}H`; // 1-based

const sgrReset = '\x1b[0m';

function rowsEqual(rowA, rowB) {
  if (!rowA || !rowB) return false;
  if (rowA.length !== rowB.length) return false;
  for (let i = 0; i < rowA.length; i++) {
    if (!cellsEqual(rowA[i], rowB[i])) return false;
  }
  return true;
}

function detectVerticalScroll(prev, next) {
  if (!prev || !next) return 0;
  const height = Math.min(prev.length, next.length);
  if (height === 0) return 0;
  const width = Math.min(prev[0].length, next[0].length);
  if (width === 0) return 0;
  const maxShift = Math.min(10, Math.floor(height / 4));
  const minMatchingRows = Math.max(1, Math.floor(height * 0.8));

  let bestDelta = 0;
  let bestMatch = 0;

  // Try scroll up by s (content moved up)
  for (let s = 1; s <= maxShift; s++) {
    let matches = 0;
    for (let y = 0; y < height - s; y++) {
      if (rowsEqual(prev[y + s], next[y])) matches++;
    }
    if (matches > bestMatch && matches >= minMatchingRows) {
      bestMatch = matches;
      bestDelta = s; // positive => scroll up
    }
  }

  // Try scroll down by s (content moved down)
  for (let s = 1; s <= maxShift; s++) {
    let matches = 0;
    for (let y = s; y < height; y++) {
      if (rowsEqual(prev[y - s], next[y])) matches++;
    }
    if (matches > bestMatch && matches >= minMatchingRows) {
      bestMatch = matches;
      bestDelta = -s; // negative => scroll down
    }
  }

  return bestDelta;
}

function applyScrollBuffer(buffer, delta) {
  if (!buffer) return buffer;
  const height = buffer.length;
  if (height === 0) return buffer;
  const width = buffer[0].length;
  const blankRow = () => new Array(width).fill(null).map(() => ({ char: ' ', fgColor: 'transparent', bgColor: 'transparent', raw: null }));
  const out = new Array(height);
  if (delta > 0) {
    // scrolled up by delta: rows move up, new blank rows at bottom
    for (let y = 0; y < height - delta; y++) out[y] = buffer[y + delta].map((c) => ({ ...c }));
    for (let y = Math.max(0, height - delta); y < height; y++) out[y] = blankRow();
  } else if (delta < 0) {
    const s = -delta;
    // scrolled down by s: rows move down, new blank rows at top
    for (let y = height - 1; y >= s; y--) out[y] = buffer[y - s].map((c) => ({ ...c }));
    for (let y = 0; y < Math.min(height, s); y++) out[y] = blankRow();
  } else {
    return buffer.map((row) => row.map((c) => ({ ...c })));
  }
  return out;
}

function writeDiffFrame(nextBuffer) {
  const height = nextBuffer.length;
  const width = height > 0 ? nextBuffer[0].length : 0;

  // If no previousBuffer or size changed, do a full redraw baseline
  const fullRedraw = !previousBuffer || previousWidth !== width || previousHeight !== height;

  let currentFg = null;
  let currentBg = null;

  if (fullRedraw) {
    process.stdout.write('\x1b[2J');
  }

  // Attempt scroll detection to reduce redraw for large vertical shifts
  let prevForDiff = previousBuffer;
  if (!fullRedraw) {
    const delta = detectVerticalScroll(previousBuffer, nextBuffer);
    if (delta !== 0) {
      if (delta > 0) {
        process.stdout.write(`\x1b[${delta}S`); // Scroll Up
      } else {
        process.stdout.write(`\x1b[${-delta}T`); // Scroll Down
      }
      prevForDiff = applyScrollBuffer(previousBuffer, delta);
      // After scroll, styles are unknown
      currentFg = null;
      currentBg = null;
    }
  }

  for (let y = 0; y < height; y++) {
    const prevRow = fullRedraw ? null : prevForDiff[y];
    const nextRow = nextBuffer[y];

    let x = 0;
    while (x < width) {
      const nextCell = nextRow[x];
      const prevCell = prevRow ? prevRow[x] : null;

      const different = fullRedraw || !cellsEqual(prevCell, nextCell);
      if (!different) {
        x++;
        continue;
      }

      // If nextCell is raw, write it directly and continue
      if (nextCell.raw != null) {
        process.stdout.write(moveCursorTo(x + 1, y + 1));
        process.stdout.write(nextCell.raw);
        // Raw likely contains its own SGR; invalidate cached styles
        currentFg = null;
        currentBg = null;
        x++;
        continue;
      }

      // Start a styled run where cells differ and share same fg/bg and are not raw
      const runFg = nextCell.fgColor;
      const runBg = nextCell.bgColor;
      let runStart = x;
      let runEnd = x;
      while (runEnd < width) {
        const n = nextRow[runEnd];
        const p = prevRow ? prevRow[runEnd] : null;
        if (!(fullRedraw || !cellsEqual(p, n))) break; // stop when same
        if (n.raw != null) break; // don't include raw in styled run
        if (n.fgColor !== runFg || n.bgColor !== runBg) break; // keep uniform attrs
        runEnd++;
      }

      // Check if the run is all spaces to end-of-line with uniform bg => BCE erase
      let allSpaces = true;
      for (let i = runStart; i < runEnd; i++) {
        if (nextRow[i].char !== ' ') { allSpaces = false; break; }
      }
      const canUseBce = allSpaces && runEnd === width;

      // Emit cursor move
      process.stdout.write(moveCursorTo(runStart + 1, y + 1));

      // Emit minimal SGR changes
      if (currentFg !== runFg) {
        process.stdout.write(colors[runFg] || '');
        currentFg = runFg;
      }
      if (currentBg !== runBg) {
        process.stdout.write(getBgAnsi(runBg));
        currentBg = runBg;
      }

      if (canUseBce) {
        // Erase to end of line honoring current background color
        process.stdout.write('\x1b[K');
      } else {
        // Write characters for the run
        let out = '';
        for (let i = runStart; i < runEnd; i++) {
          out += nextRow[i].char;
        }
        process.stdout.write(out);
      }

      x = runEnd;
    }
  }

  // Reset attributes and park cursor bottom-left like before
  process.stdout.write(sgrReset);
  process.stdout.write(`\x1b[${height};1H`);

  // Update previousBuffer
  previousBuffer = nextBuffer.map((row) => row.map((c) => ({ ...c })));
  previousWidth = width;
  previousHeight = height;
}


// removed local border helpers; now imported from borders.js

const renderToBuffer = async (node, buffer, offsetX = 0, offsetY = 0, depth = 0, clipRect = null) => {
  if (!node) return;

  if (Array.isArray(node)) {
    const toPaint = [...node]
      .map((n, i) => ({ n, i, z: (n && n.computedStyle && Number.isFinite(n.computedStyle.zIndex) ? n.computedStyle.zIndex : 0) }))
      .sort((a, b) => a.z !== b.z ? a.z - b.z : a.i - b.i) // low zIndex first; stable for ties
      .map(({ n }) => n);
    for (const c of toPaint) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1, clipRect);
    return;
  }

  const type = node.type;
  const style = node.computedStyle; // styles are resolved in a pre-pass
  const src = node.src ?? null;
  const content = Array.isArray(node.content) ? node.content : (node.content != null ? [node.content] : []);

  if (type === 'text') {
    if (style.display === 'none') return;
    const frame = node.frame;
    const x = frame.x;
    const y = frame.y;
    const text = content != null ? String(content[0]?.content ?? content) : '';
    const fgColor = style.color;
    const bgColor = style.backgroundColor;
    const textAlign = style.textAlign; // 'left', 'center', 'right'
    const verticalAlign = style.verticalAlign; // 'top', 'middle', 'bottom'
    const scale = style.fontSize;

    // Pixel font rendering path (3x5 bitmap per glyph), enabled via style.pixelFont
    if (style.pixelFont) {
      const fontFamily = style.fontFamily || 'full';
      const { cellCols, cellRows, grid } = rasterizePixelFontCached(text, scale, fontFamily);
      const width = frame.width;
      const height = frame.height;

      let leftPadding = 0;
      if (cellCols < width) {
        const space = width - cellCols;
        if (textAlign === 'center') leftPadding = Math.floor(space / 2);
        else if (textAlign === 'right') leftPadding = space;
      }

      const bandHeight = Math.min(cellRows, height);
      let startRow = 0;
      if (height > bandHeight) {
        const emptyLines = height - bandHeight;
        if (verticalAlign === 'middle') startRow = Math.floor(emptyLines / 2);
        else if (verticalAlign === 'bottom') startRow = emptyLines;
      }

      // Fill background
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          const cx = x + w;
          const cy = y + h;
          if (clipRect) {
            if (cx < clipRect.x || cx >= clipRect.x + clipRect.width || cy < clipRect.y || cy >= clipRect.y + clipRect.height) continue;
          }
          if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
          buffer[cy][cx].char = ' ';
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
          buffer[cy][cx].raw = null; // ensure we draw over any prior raw (e.g., img)
        }
      }

      // Paint quarter blocks
      for (let r = 0; r < Math.min(height, cellRows); r++) {
        for (let c = 0; c < Math.min(width, cellCols); c++) {
          const mask = grid[r][c];
          if (mask === 0) continue;
          const cx = x + leftPadding + c;
          const cy = y + startRow + r;
          if (clipRect) {
            if (cx < clipRect.x || cx >= clipRect.x + clipRect.width || cy < clipRect.y || cy >= clipRect.y + clipRect.height) continue;
          }
          if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
          // mask is 1 (upper), 2 (lower), or 3 (both)
          buffer[cy][cx].char = HALFBLOCK[mask];
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
          buffer[cy][cx].raw = null;
        }
      }

      // Draw border if requested
      const border = style.border;
      if (border.width > 0) {
        const bw = Math.max(1, Math.floor(border.width));
        const bColor = border.color || fgColor;
        switch (border.style) {
          case 'half':
            drawHalfBlockBorder(buffer, x, y, width, height, bw, bColor);
            break;
          case 'box':
            drawBox(buffer, x, y, width, height, null, bColor);
            break;
          case 'quarter':
          default:
            drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
        }
      }
      return;
    }

    // Default scaled text rendering
    const scaledTextLength = text.length * scale;
    const width = frame.width;
    const height = frame.height;

    let leftPadding = 0;
    if (scaledTextLength < width) {
      const space = width - scaledTextLength;
      if (textAlign === 'center') {
        leftPadding = Math.floor(space / 2);
      } else if (textAlign === 'right') {
        leftPadding = space;
      }
    }

    const bandHeight = Math.min(scale, height);
    let startRow = 0;
    if (height > bandHeight) {
      const emptyLines = height - bandHeight;
      if (verticalAlign === 'middle') {
        startRow = Math.floor(emptyLines / 2);
      } else if (verticalAlign === 'bottom') {
        startRow = emptyLines;
      }
    }

    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const cx = x + w;
        const cy = y + h;
        if (clipRect) {
          if (cx < clipRect.x || cx >= clipRect.x + clipRect.width || cy < clipRect.y || cy >= clipRect.y + clipRect.height) continue;
        }
        if (cy >= 0 && cy < buffer.length && cx >= 0 && cx < buffer[0].length) {
          const withinVerticalBand = h >= startRow && h < startRow + bandHeight;
          if (withinVerticalBand) {
            if (w < leftPadding || w >= leftPadding + scaledTextLength) {
              buffer[cy][cx].char = ' ';
            } else {
              const originalIndex = Math.floor((w - leftPadding) / scale);
              buffer[cy][cx].char = text[originalIndex] || ' ';
            }
          } else {
            buffer[cy][cx].char = ' ';
          }
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
          buffer[cy][cx].raw = null;
        }
      }
    }
    // Draw border around default scaled text region, if requested
    const border = style.border;
    if (border.width > 0) {
      const bw = Math.max(1, Math.floor(border.width));
      const bColor = border.color || fgColor;
      switch (border.style) {
        case 'half':
          drawHalfBlockBorder(buffer, x, y, width, height, bw, bColor);
          break;
        case 'box':
          drawBox(buffer, x, y, width, height, null, bColor);
          break;
        case 'quarter':
        default:
          drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
      }
    }
    return;
  }

  if (type === 'img') {
    if (style.display === 'none') return;
    const frame = node.frame;
    const x = frame.x;
    const y = frame.y;
    const width = frame.width;
    const height = frame.height;
    const bgColor = style.backgroundColor;

    // Fill the entire image area with background color first
    for (let row = y; row < y + height; row++) {
      if (row < 0 || row >= buffer.length) continue;
      for (let col = x; col < x + width; col++) {
        if (clipRect) {
          if (col < clipRect.x || col >= clipRect.x + clipRect.width || row < clipRect.y || row >= clipRect.y + clipRect.height) continue;
        }
        if (col < 0 || col >= buffer[0].length) continue;
        buffer[row][col].char = ' ';
        buffer[row][col].bgColor = bgColor;
        buffer[row][col].fgColor = buffer[row][col].fgColor || 'transparent';
        buffer[row][col].raw = null;
      }
    }

    // Apply rounded corners to background
    if (style.borderRadius > 0) {
      applyRoundedCorners(buffer, x, y, width, height, style.borderRadius);
    }

    if (src) {
      const genHeight = (style.height != null) ? height * 2 : height;
      const cells = await getCachedOrGenerateImage(src, width, genHeight);
      for (const pixel of cells) {
        const cx = x + pixel.x;
        const cy = y + pixel.y;
        if (clipRect) {
          if (cx < clipRect.x || cx >= clipRect.x + clipRect.width || cy < clipRect.y || cy >= clipRect.y + clipRect.height) continue;
        }
        if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
        buffer[cy][cx].raw = (pixel.ansi || '') + (pixel.char || ' ');
      }
    }

    // Paint children sorted by zIndex so higher zIndex paint later (on top)
    const childrenForPaint = Array.isArray(content)
      ? [...content].sort((a, b) => ((a?.computedStyle?.zIndex) ?? 0) - ((b?.computedStyle?.zIndex) ?? 0))
      : [];
    for (const c of childrenForPaint) {
      await renderToBuffer(c, buffer, 0, 0, depth + 1, clipRect);
    }

    // Apply rounded corners to image pixels as well
    if (style.borderRadius > 0) {
      applyRoundedCorners(buffer, x, y, width, height, style.borderRadius);
    }

    return;
  }

  if (type === 'div') {
    if (style.display === 'none') return;
    const frame = node.frame;
    const x = frame.x;
    const y = frame.y;
    const width = frame.width;
    const height = frame.height;
    const bgColor = style.backgroundColor;

    // establish clip rect if overflow is hidden or auto (scroll area)
    const childClip = (style.overflow === 'hidden' || style.overflow === 'auto') ? { x, y, width, height } : clipRect;

    for (let row = y; row < y + height; row++) {
      if (row < 0 || row >= buffer.length) continue;
      for (let col = x; col < x + width; col++) {
        if (childClip) {
          if (col < childClip.x || col >= childClip.x + childClip.width || row < childClip.y || row >= childClip.y + childClip.height) continue;
        }
        if (col < 0 || col >= buffer[0].length) continue;
        buffer[row][col].char = ' ';
        buffer[row][col].bgColor = bgColor;
        buffer[row][col].fgColor = buffer[row][col].fgColor || 'transparent';
        buffer[row][col].raw = null;
      }
    }

    // Apply rounded corners to background
    if (style.borderRadius > 0) {
      applyRoundedCorners(buffer, x, y, width, height, style.borderRadius);
    }

    // Paint children sorted by zIndex so higher zIndex paint later (on top)
    const childrenForPaint = Array.isArray(content)
      ? [...content].sort((a, b) => ((a?.computedStyle?.zIndex) ?? 0) - ((b?.computedStyle?.zIndex) ?? 0))
      : [];
    for (const c of childrenForPaint) {
      await renderToBuffer(c, buffer, 0, 0, depth + 1, childClip);
    }

    // Draw vertical scrollbar when overflowing and overflow is auto
    if (style.overflow === 'auto' && node.scrollMeta) {
      const { contentHeight, effectiveScrollY, scrollbarVisible } = node.scrollMeta;
      const scrollable = contentHeight > height;
      if (scrollable && width >= 1 && height >= 3) {
        const sbWidth = Math.max(1, Number(style.scrollbarWidth) || 1);
        const sbMarginRight = 1;
        // Shrink content area under scrollbar to avoid overlap when painting children
        const contentClip = scrollbarVisible ? { x, y, width: Math.max(0, width - (sbWidth + sbMarginRight)), height } : null;
        // Repaint children again with tighter clip so they don't draw under the scrollbar
        // Note: children's own rendering earlier already respected childClip, but this enforces right margin too
        // Only needed if scrollbar is visible and contentClip narrower than full width
        if (scrollbarVisible && contentClip.width < width) {
          for (const c of childrenForPaint) {
            await renderToBuffer(c, buffer, 0, 0, depth + 1, contentClip);
          }
        }

        const barLeft = x + width - sbWidth;
        const barRight = x + width - 1;
        const trackTop = y; // 1-cell top margin
        const trackHeight = height;
        const minThumbSize = Math.max(1, Math.floor(trackHeight * 0.1));
        const visibleRatio = Math.min(1, height / contentHeight);
        const thumbSize = Math.max(minThumbSize, Math.floor(trackHeight * visibleRatio));
        const maxScroll = Math.max(1, contentHeight - height);
        const scrollRatio = Math.min(1, Math.max(0, effectiveScrollY / maxScroll));
        const maxThumbTop = trackHeight - thumbSize;
        const thumbOffset = Math.floor(scrollRatio * maxThumbTop);
        const thumbTop = trackTop + thumbOffset;
        const thumbBottom = thumbTop + thumbSize - 1;

        // Draw track
        for (let row = trackTop; row < trackTop + trackHeight; row++) { // leave 1-cell bottom margin
          if (row < 0 || row >= buffer.length) continue;
          for (let col = barLeft; col <= barRight; col++) {
            if (col < 0 || col >= buffer[0].length) continue;
            buffer[row][col].char = '░';
            buffer[row][col].fgColor = style.color || 'white';
            buffer[row][col].bgColor = buffer[row][col].bgColor || 'transparent';
            buffer[row][col].raw = null;
          }
        }
        // Draw thumb
        for (let row = thumbTop; row <= thumbBottom; row++) {
          if (row < 0 || row >= buffer.length) continue;
          for (let col = barLeft; col <= barRight; col++) {
            if (col < 0 || col >= buffer[0].length) continue;
            buffer[row][col].char = '█';
            buffer[row][col].fgColor = style.color || 'white';
            buffer[row][col].bgColor = buffer[row][col].bgColor || 'transparent';
            buffer[row][col].raw = null;
          }
        }
      }
    }
    // Draw border for div if requested
    const border = style.border;
    if (border.width > 0) {
      const bw = Math.max(1, Math.floor(border.width));
      const bColor = border.color || 'white';
      switch (border.style) {
        case 'half':
          drawHalfBlockBorder(buffer, x, y, width, height, bw, bColor);
          break;
        case 'box':
          drawBox(buffer, x, y, width, height, null, bColor);
          break;
        case 'quarter':
        default:
          drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
      }
    }

    // Apply rounded corners to border as well
    if (style.borderRadius > 0) {
      applyRoundedCorners(buffer, x, y, width, height, style.borderRadius);
    }
    return;
  }

  for (const c of content) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1, clipRect);
}

let renderInProgress = false;
let queuedRoot = null;
let queuedResolvers = [];

async function processRenderQueue() {
  if (renderInProgress) return;
  renderInProgress = true;
  try {
    while (queuedRoot != null) {
      const root = queuedRoot;
      queuedRoot = null; // collapse to latest

      const width = Math.max(1, terminal.width || 80);
      const height = Math.max(1, terminal.height || 24);

      const buffer = createBuffer(width, height);
      const styledRoot = resolveStylesTree(root);
      const laidOutRoot = computeLayoutTree(styledRoot, { width, height });
      await renderToBuffer(laidOutRoot, buffer, 0, 0);

      writeDiffFrame(buffer);

      // resolve all waiting promises with the laid out tree
      const resolvers = queuedResolvers;
      queuedResolvers = [];
      for (const resolve of resolvers) resolve(laidOutRoot);
    }
  } finally {
    renderInProgress = false;
  }
}

const render = async (root) => {
  // Coalesce rapid calls; only latest state is rendered
  queuedRoot = root;
  const resultPromise = new Promise((resolve) => queuedResolvers.push(resolve));
  // Kick the processor (next tick) if idle
  if (!renderInProgress) {
    // Use setImmediate when available to batch microtasks, else setTimeout 0
    (typeof setImmediate === 'function' ? setImmediate : setTimeout)(processRenderQueue, 0);
  }
  return resultPromise;
}

module.exports = { element, render };
