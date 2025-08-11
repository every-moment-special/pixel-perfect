const { terminal, colors, generate } = require('./helper.js');

const isPrimitive = (value) => typeof value === 'string' || typeof value === 'number';

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

const writeToBuffer = (buffer, x, y, text, fgColor = 'transparent', bgColor = 'transparent') => {
  if (y < 0 || y >= buffer.length) return;
  const row = buffer[y];
  let cx = Math.max(0, x);
  for (let i = 0; i < text.length; i++) {
    if (cx >= row.length) break;
    if (cx >= 0) {
      row[cx].char = text[i];
      row[cx].fgColor = fgColor;
      row[cx].bgColor = bgColor;
    }
    cx++;
  }
};

const drawHalfBlockBorder = (
  buffer,
  x,
  y,
  width,
  height,
  borderWidthHalf,
  color
) => {
  if (!borderWidthHalf || borderWidthHalf <= 0) return;
  if (width <= 0 || height <= 0) return;

  const topFullRows = Math.floor(borderWidthHalf / 2);
  const topHalf = borderWidthHalf % 2;
  const bottomFullRows = topFullRows;
  const bottomHalf = topHalf;

  const colThickness = Math.max(1, Math.min(Math.ceil(borderWidthHalf / 2), Math.floor((width + 1) / 2)));

  for (let r = 0; r < Math.min(topFullRows, height); r++) {
    const cy = y + r;
    if (cy < 0 || cy >= buffer.length) continue;
    for (let c = 0; c < width; c++) {
      const cx = x + c;
      if (cx < 0 || cx >= buffer[0].length) continue;
      buffer[cy][cx].char = '█';
      buffer[cy][cx].fgColor = color;
    }
  }

  if (topHalf && topFullRows < height) {
    const cy = y + topFullRows;
    if (cy >= 0 && cy < buffer.length) {
      for (let c = 0; c < width; c++) {
        const cx = x + c;
        if (cx < 0 || cx >= buffer[0].length) continue;
        buffer[cy][cx].char = '▀';
        buffer[cy][cx].fgColor = color;
      }
    }
  }

  for (let r = 0; r < Math.min(bottomFullRows, height); r++) {
    const cy = y + (height - 1 - r);
    if (cy < 0 || cy >= buffer.length) continue;
    for (let c = 0; c < width; c++) {
      const cx = x + c;
      if (cx < 0 || cx >= buffer[0].length) continue;
      buffer[cy][cx].char = '█';
      buffer[cy][cx].fgColor = color;
    }
  }

  if (bottomHalf && height - 1 - bottomFullRows >= 0) {
    const cy = y + (height - 1 - bottomFullRows);
    if (cy >= 0 && cy < buffer.length) {
      for (let c = 0; c < width; c++) {
        const cx = x + c;
        if (cx < 0 || cx >= buffer[0].length) continue;
        buffer[cy][cx].char = '▄';
        buffer[cy][cx].fgColor = color;
      }
    }
  }

  const startInterior = Math.min(topFullRows + topHalf, height);
  const endInterior = Math.max(0, height - (bottomFullRows + bottomHalf));
  for (let r = startInterior; r < endInterior; r++) {
    const cy = y + r;
    if (cy < 0 || cy >= buffer.length) continue;

    for (let t = 0; t < colThickness; t++) {
      const cx = x + t;
      if (cx < 0 || cx >= buffer[0].length) continue;
      buffer[cy][cx].char = '█';
      buffer[cy][cx].fgColor = color;
    }
    for (let t = 0; t < colThickness; t++) {
      const cx = x + (width - 1 - t);
      if (cx < 0 || cx >= buffer[0].length) continue;
      buffer[cy][cx].char = '█';
      buffer[cy][cx].fgColor = color;
    }
  }
};

const drawQuarterBlockBorder = (
  buffer,
  x,
  y,
  width,
  height,
  borderWidth,
  color
) => {
  if (!borderWidth || borderWidth <= 0) return;
  if (width <= 0 || height <= 0) return;

  const rows = height;
  const cols = width;
  const totalQuarterRows = rows * 2;
  const totalQuarterCols = cols * 2;

  const grid = new Array(rows);
  for (let r = 0; r < rows; r++) grid[r] = new Array(cols).fill(0);

  const setMask = (r, c, mask) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    grid[r][c] |= mask;
  };

  const topMaxQR = Math.min(borderWidth, totalQuarterRows);
  for (let qr = 0; qr < topMaxQR; qr++) {
    const cellRow = Math.floor(qr / 2);
    const half = qr % 2;
    const mask = half === 0 ? (1 | 2) : (4 | 8);
    for (let c = 0; c < cols; c++) setMask(cellRow, c, mask);
  }

  const bottomStartQR = Math.max(0, totalQuarterRows - Math.min(borderWidth, totalQuarterRows));
  for (let qr = bottomStartQR; qr < totalQuarterRows; qr++) {
    const cellRow = Math.floor(qr / 2);
    const half = qr % 2;
    const mask = half === 0 ? (1 | 2) : (4 | 8);
    for (let c = 0; c < cols; c++) setMask(cellRow, c, mask);
  }

  const leftMaxQC = Math.min(borderWidth, totalQuarterCols);
  for (let qc = 0; qc < leftMaxQC; qc++) {
    const cellCol = Math.floor(qc / 2);
    const side = qc % 2;
    const mask = side === 0 ? (1 | 4) : (2 | 8);
    for (let r = 0; r < rows; r++) setMask(r, cellCol, mask);
  }

  const rightStartQC = Math.max(0, totalQuarterCols - Math.min(borderWidth, totalQuarterCols));
  for (let qc = rightStartQC; qc < totalQuarterCols; qc++) {
    const cellCol = Math.floor(qc / 2);
    const side = qc % 2;
    const mask = side === 0 ? (1 | 4) : (2 | 8);
    for (let r = 0; r < rows; r++) setMask(r, cellCol, mask);
  }

  // Map mask to quarter block glyphs
  const QUAD = [
    ' ',  // 0
    '▘',  // 1 UL
    '▝',  // 2 UR
    '▀',  // 3 UL+UR
    '▖',  // 4 LL
    '▌',  // 5 UL+LL
    '▞',  // 6 UR+LL
    '▛',  // 7 UL+UR+LL
    '▗',  // 8 LR
    '▚',  // 9 UL+LR
    '▐',  // 10 UR+LR
    '▜',  // 11 UL+UR+LR
    '▄',  // 12 LL+LR
    '▙',  // 13 UL+LL+LR
    '▟',  // 14 UR+LL+LR
    '█'   // 15 all
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mask = grid[r][c];
      if (mask === 0) continue;
      const cx = x + c;
      const cy = y + r;
      if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;

      let ch = QUAD[mask];
      // If this is the topmost row and there is any top-quarters set, use upper one-eighth line
      if (r === 0 && (mask & (1 | 2))) {
        ch = '▔'; // upper one-eighth
      }
      // If this is the bottommost row and there is any bottom-quarters set, use lower one-eighth line
      if (r === rows - 1 && (mask & (4 | 8))) {
        ch = '▁'; // lower one-eighth
      }

      buffer[cy][cx].char = ch;
      buffer[cy][cx].fgColor = color;
    }
  }
};

const drawBox = (buffer, x, y, width, height, title) => {
  if (width < 2 || height < 2) return;
  const right = x + width - 1;
  const bottom = y + height - 1;

  // Corners
  writeToBuffer(buffer, x, y, '┌');
  writeToBuffer(buffer, right, y, '┐');
  writeToBuffer(buffer, x, bottom, '└');
  writeToBuffer(buffer, right, bottom, '┘');

  // Horizontal borders
  writeToBuffer(buffer, x + 1, y, '─'.repeat(Math.max(0, width - 2)));
  writeToBuffer(buffer, x + 1, bottom, '─'.repeat(Math.max(0, width - 2)));

  // Vertical borders
  for (let iy = y + 1; iy < bottom; iy++) {
    writeToBuffer(buffer, x, iy, '│');
    writeToBuffer(buffer, right, iy, '│');
  }

  // Optional title
  if (title) {
    const capped = ` ${title} `;
    const maxLen = Math.max(0, width - 4);
    const text = capped.length > maxLen ? `${capped.slice(0, maxLen - 1)}…` : capped;
    writeToBuffer(buffer, x + 2, y, text);
  }
}

const renderToBuffer = async (node, buffer, offsetX = 0, offsetY = 0, depth = 0) => {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const c of node) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
    return;
  }

  const { type, style = {}, src = null, content = [] } = node;

  if (type === 'text') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const text = content != null ? String(content[0]?.content ?? content) : '';
    const fgColor = style.color || 'transparent';
    const bgColor = style.backgroundColor || 'transparent';
    const textAlign = style.textAlign || 'left'; // 'left', 'center', 'right'
    const verticalAlign = style.verticalAlign || 'top'; // 'top', 'middle', 'bottom'
    const scale = Math.max(1, Math.floor(style.fontSize || 1));

    // Pixel font rendering path (3x5 bitmap per glyph), enabled via style.pixelFont
    if (style.pixelFont) {
      const PIXEL_FONT = {
        'a': ['010','101','111','101','101'],
        'b': ['110','101','110','101','110'],
        'c': ['011','100','100','100','011'],
        'd': ['110','101','101','101','110'],
        'e': ['111','100','110','100','111'],
        'f': ['111','100','110','100','100'],
        'g': ['011','100','101','101','011'],
        'h': ['101','101','111','101','101'],
        'i': ['111','010','010','010','111'],
        'j': ['001','001','001','101','010'],
        'k': ['101','110','100','110','101'],
        'l': ['100','100','100','100','111'],
        'm': ['101','111','111','101','101'],
        'n': ['110','101','101','101','101'],
        'o': ['010','101','101','101','010'],
        'p': ['110','101','110','100','100'],
        'q': ['010','101','101','111','011'],
        'r': ['110','101','110','110','101'],
        's': ['111','100','110','001','111'],
        't': ['111','010','010','010','010'],
        'u': ['101','101','101','101','111'],
        'v': ['101','101','101','101','010'],
        'w': ['101','101','111','111','101'],
        'x': ['101','101','010','101','101'],
        'y': ['101','101','010','010','010'],
        'z': ['111','001','010','100','111'],
        '0': ['111','101','101','101','111'],
        '1': ['010','110','010','010','111'],
        '2': ['111','001','111','100','111'],
        '3': ['111','001','111','001','111'],
        '4': ['101','101','111','001','001'],
        '5': ['111','100','111','001','111'],
        '6': ['111','100','111','101','111'],
        '7': ['111','001','001','010','010'],
        '8': ['111','101','111','101','111'],
        '9': ['111','101','111','001','111'],
        ' ': ['000','000','000','000','000'],
        '-': ['000','000','111','000','000'],
        '_': ['000','000','000','000','111'],
        ':': ['000','010','000','010','000'],
        '.': ['000','000','000','000','010'],
        ',': ['000','000','000','010','100'],
        '!': ['010','010','010','000','010'],
        '?': ['111','001','011','000','010']
      };

      const glyphWidth = 3;
      const glyphHeight = 5;
      const spacing = 1; // pixel columns between glyphs (in pixel units)

      // Overall pixel dimensions before packing to quarter blocks
      const totalGlyphs = text.length;
      const pixelWidth = totalGlyphs > 0
        ? (glyphWidth * scale) * totalGlyphs + spacing * (totalGlyphs - 1)
        : 0;
      const pixelHeight = glyphHeight * scale;

      // Quarter blocks encode 2x2 pixels per terminal cell
      const cellCols = Math.ceil(pixelWidth / 2);
      const cellRows = Math.ceil(pixelHeight / 2);

      const width = style.width != null ? style.width : cellCols;
      const height = style.height != null ? style.height : cellRows;

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
          if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
          buffer[cy][cx].char = ' ';
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
        }
      }

      // Build quarter-block grid (4-bit mask per cell)
      const grid = new Array(cellRows);
      for (let r = 0; r < cellRows; r++) grid[r] = new Array(cellCols).fill(0);

      let penPxX = 0; // x position in pixel space
      for (let index = 0; index < text.length; index++) {
        const ch = text[index];
        const key = ch.toLowerCase();
        const glyph = PIXEL_FONT[key] || PIXEL_FONT['?'];

        for (let gy = 0; gy < glyphHeight; gy++) {
          const rowBits = glyph[gy];
          for (let gx = 0; gx < glyphWidth; gx++) {
            if (rowBits[gx] !== '1') continue;
            for (let sy = 0; sy < scale; sy++) {
              const py = gy * scale + sy;
              const cellY = Math.floor(py / 2);
              if (cellY < 0 || cellY >= cellRows) continue;
              const quarterY = (py % 2 === 0) ? 0 : 1; // 0=top,1=bottom
              for (let sx = 0; sx < scale; sx++) {
                const px = penPxX + gx * scale + sx;
                const cellX = Math.floor(px / 2);
                if (cellX < 0 || cellX >= cellCols) continue;
                const quarterX = (px % 2 === 0) ? 0 : 1; // 0=left,1=right
                const bit = (quarterY === 0 ? (quarterX === 0 ? 1 : 2) : (quarterX === 0 ? 4 : 8));
                grid[cellY][cellX] |= bit;
              }
            }
          }
        }

        penPxX += glyphWidth * scale;
        if (index !== text.length - 1) penPxX += spacing;
      }

      // Map masks to quarter-block characters
      const QUAD = [
        ' ',  // 0
        '▘',  // 1 UL
        '▝',  // 2 UR
        '▀',  // 3 UL+UR
        '▖',  // 4 LL
        '▌',  // 5 UL+LL
        '▞',  // 6 UR+LL
        '▛',  // 7 UL+UR+LL
        '▗',  // 8 LR
        '▚',  // 9 UL+LR
        '▐',  // 10 UR+LR
        '▜',  // 11 UL+UR+LR
        '▄',  // 12 LL+LR
        '▙',  // 13 UL+LL+LR
        '▟',  // 14 UR+LL+LR
        '█'   // 15 all
      ];

      // Paint quarter blocks
      for (let r = 0; r < Math.min(height, cellRows); r++) {
        for (let c = 0; c < Math.min(width, cellCols); c++) {
          const mask = grid[r][c];
          if (mask === 0) continue;
          const cx = x + leftPadding + c;
          const cy = y + startRow + r;
          if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
          buffer[cy][cx].char = QUAD[mask];
          buffer[cy][cx].fgColor = fgColor;
          buffer[cy][cx].bgColor = bgColor;
        }
      }

      // Draw border if requested (around the width x height box), using quarter blocks
      if (style.border && (style.border.width || style.border.color)) {
        const bw = Math.max(1, Math.floor(style.border.width || 1));
        const bColor = style.border.color || fgColor;
        drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
      }
      return;
    }

    // Default scaled text rendering
    const scaledTextLength = text.length * scale;
    const width = style.width != null ? style.width : scaledTextLength;
    const height = style.height != null ? style.height : scale;

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
    // Draw border around default scaled text region, if requested (quarter blocks)
    if (style.border && (style.border.width || style.border.color)) {
      const bw = Math.max(1, Math.floor(style.border.width || 1));
      const bColor = style.border.color || fgColor;
      drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
    }
    return;
  }

  if (type === 'img') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const width = style.width || terminal.width;
    const height = style.height * 2 || terminal.height;

    if (src) {
      const cells = await generate(src, width, height);
      for (const pixel of cells) {
        const cx = x + pixel.x;
        const cy = y + pixel.y;
        if (cy < 0 || cy >= buffer.length || cx < 0 || cx >= buffer[0].length) continue;
        buffer[cy][cx].raw = (pixel.ansi || '') + (pixel.char || ' ');
      }
    }

    for (const c of content) {
      await renderToBuffer(c, buffer, x, y, depth + 1);
    }

    return;
  }

  if (type === 'div') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const width = style.width || terminal.width;
    const height = style.height || terminal.height;
    const bgColor = style.backgroundColor || 'black';

    for (let row = y; row < y + height; row++) {
      if (row < 0 || row >= buffer.length) continue;
      for (let col = x; col < x + width; col++) {
        if (col < 0 || col >= buffer[0].length) continue;
        buffer[row][col].char = ' ';
        buffer[row][col].bgColor = bgColor;
        buffer[row][col].fgColor = buffer[row][col].fgColor || 'transparent';
      }
    }

    for (const c of content) {
      await renderToBuffer(c, buffer, x, y, depth + 1);
    }
    // Draw border for div if requested (quarter blocks)
    if (style.border && (style.border.width || style.border.color)) {
      const bw = Math.max(1, Math.floor(style.border.width || 1));
      const bColor = style.border.color || 'white';
      drawQuarterBlockBorder(buffer, x, y, width, height, bw, bColor);
    }
    return;
  }

  for (const c of content) await renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
}

const render = async (root) => {
  const width = Math.max(1, terminal.width || 80);
  const height = Math.max(1, terminal.height || 24);

  const buffer = createBuffer(width, height);
  await renderToBuffer(root, buffer, 0, 0);

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
        process.stdout.write(colors['bg' + cell.bgColor] || '');
        prevBg = cell.bgColor;
      }

      process.stdout.write(cell.char);
    }
    process.stdout.write('\x1b[0m\n');
  }
  process.stdout.write(`\x1b[${height};1H`);
}

module.exports = { element, render };
