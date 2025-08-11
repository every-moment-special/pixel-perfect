const { terminal, colors, generate } = require('./helper.js');
const { resolveStylesTree } = require('./style.js');
const { computeLayoutTree } = require('./layout.js');
const { drawHalfBlockBorder, drawQuarterBlockBorder, drawBox } = require('./borders.js');
const { rasterizePixelFontCached, measurePixelFont, QUAD } = require('./pixelFont.js');

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


// removed local border helpers; now imported from borders.js

const renderToBuffer = async (node, buffer, offsetX = 0, offsetY = 0, depth = 0, clipRect = null) => {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const c of node) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1, clipRect);
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
      const { cellCols, cellRows, grid } = rasterizePixelFontCached(text, scale);
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
          buffer[cy][cx].char = QUAD[mask];
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
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

    if (src) {
      const genHeight = (style.height != null) ? height * 2 : height;
      const cells = await generate(src, width, genHeight);
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

    for (const c of content) {
      await renderToBuffer(c, buffer, 0, 0, depth + 1, clipRect);
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
      }
    }

    for (const c of content) {
      await renderToBuffer(c, buffer, 0, 0, depth + 1, childClip);
    }

    // Draw vertical scrollbar when overflowing and overflow is auto
    if (style.overflow === 'auto' && node.scrollMeta) {
      const { contentHeight, effectiveScrollY } = node.scrollMeta;
      const scrollable = contentHeight > height;
      if (scrollable && width >= 1 && height >= 3) {
        const sbWidth = Math.max(1, Number(style.scrollbarWidth) || 1);
        const barLeft = x + width - sbWidth;
        const barRight = x + width - 1;
        const trackTop = y + 0;
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
        for (let row = trackTop; row < trackTop + trackHeight; row++) {
          if (row < 0 || row >= buffer.length) continue;
          for (let col = barLeft; col <= barRight; col++) {
            if (col < 0 || col >= buffer[0].length) continue;
            buffer[row][col].char = '░';
            buffer[row][col].fgColor = style.color || 'white';
            buffer[row][col].bgColor = buffer[row][col].bgColor || 'transparent';
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
    return;
  }

  for (const c of content) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1, clipRect);
}

const render = async (root) => {
  const width = Math.max(1, terminal.width || 80);
  const height = Math.max(1, terminal.height || 24);

  const buffer = createBuffer(width, height);
  const styledRoot = resolveStylesTree(root);
  const laidOutRoot = computeLayoutTree(styledRoot, { width, height });
  await renderToBuffer(laidOutRoot, buffer, 0, 0);

  process.stdout.write('\x1b[2J\x1b[H');

  let prevFg = null;
  let prevBg = null;

  for (let y = 0; y < height; y++) {
    prevFg = null;
    prevBg = null;
    for (let x = 0; x < width; x++) {
      const cell = buffer[y][x];

      if (cell.raw != null) {
        process.stdout.write(cell.raw);
        prevFg = null;
        prevBg = null;
        continue;
      }

      if (cell.fgColor !== prevFg) {
        process.stdout.write(colors[cell.fgColor] || '');
        prevFg = cell.fgColor;
      }
      if (cell.bgColor !== prevBg) {
        process.stdout.write(getBgAnsi(cell.bgColor));
        prevBg = cell.bgColor;
      }

      process.stdout.write(cell.char);
    }
    process.stdout.write('\x1b[0m\n');
  }
  process.stdout.write(`\x1b[${height};1H`);
}

module.exports = { element, render };
