'use strict';

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
      if (r === 0 && (mask & (1 | 2))) ch = '▔';
      if (r === rows - 1 && (mask & (4 | 8))) ch = '▁';

      buffer[cy][cx].char = ch;
      buffer[cy][cx].fgColor = color;
    }
  }
};

const drawBox = (buffer, x, y, width, height, title, color = 'white') => {
  if (width < 2 || height < 2) return;
  const right = x + width - 1;
  const bottom = y + height - 1;

  writeToBuffer(buffer, x, y, '┌', color);
  writeToBuffer(buffer, right, y, '┐', color);
  writeToBuffer(buffer, x, bottom, '└', color);
  writeToBuffer(buffer, right, bottom, '┘', color);

  writeToBuffer(buffer, x + 1, y, '─'.repeat(Math.max(0, width - 2)), color);
  writeToBuffer(buffer, x + 1, bottom, '─'.repeat(Math.max(0, width - 2)), color);

  for (let iy = y + 1; iy < bottom; iy++) {
    writeToBuffer(buffer, x, iy, '│', color);
    writeToBuffer(buffer, right, iy, '│', color);
  }

  if (title) {
    const capped = ` ${title} `;
    const maxLen = Math.max(0, width - 4);
    const text = capped.length > maxLen ? `${capped.slice(0, maxLen - 1)}…` : capped;
    writeToBuffer(buffer, x + 2, y, text, color);
  }
};

/**
 * Create a mask for rounded corners.
 * Returns a 2D array where true means the pixel should be visible, false means it should be masked out.
 * 
 * @param {number} width - Width of the element
 * @param {number} height - Height of the element  
 * @param {number} radius - Border radius (0 = no rounding)
 * @returns {boolean[][]} - 2D mask array
 */
const createRoundedCornerMask = (width, height, radius) => {
  if (radius <= 0) {
    // No rounding, return all true
    const mask = new Array(height);
    for (let y = 0; y < height; y++) {
      mask[y] = new Array(width).fill(true);
    }
    return mask;
  }

  const mask = new Array(height);
  for (let y = 0; y < height; y++) {
    mask[y] = new Array(width).fill(true);
  }

  // For radius 100, we want perfect circles
  // Calculate the maximum possible radius for perfect circles
  const maxRadius = Math.min(Math.floor(width / 2), Math.floor(height / 2));
  const effectiveRadius = Math.min(radius, maxRadius);

  if (effectiveRadius <= 0) return mask;

  // For perfect circles, we need to ensure the radius is exactly half the smaller dimension
  // This ensures the corners are perfectly round
  const circleRadius = Math.min(effectiveRadius, maxRadius);
  
  // Top-left corner
  for (let y = 0; y < circleRadius; y++) {
    for (let x = 0; x < circleRadius; x++) {
      // Calculate distance from corner center (circleRadius, circleRadius)
      const dx = x - circleRadius;
      const dy = y - circleRadius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > circleRadius) {
        mask[y][x] = false;
      }
    }
  }

  // Top-right corner
  for (let y = 0; y < circleRadius; y++) {
    for (let x = width - circleRadius; x < width; x++) {
      // Calculate distance from corner center (width - circleRadius, circleRadius)
      const dx = x - (width - circleRadius);
      const dy = y - circleRadius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > circleRadius) {
        mask[y][x] = false;
      }
    }
  }

  // Bottom-left corner
  for (let y = height - circleRadius; y < height; y++) {
    for (let x = 0; x < circleRadius; x++) {
      // Calculate distance from corner center (circleRadius, height - circleRadius)
      const dx = x - circleRadius;
      const dy = y - (height - circleRadius);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > circleRadius) {
        mask[y][x] = false;
      }
    }
  }

  // Bottom-right corner
  for (let y = height - circleRadius; y < height; y++) {
    for (let x = width - circleRadius; x < width; x++) {
      // Calculate distance from corner center (width - circleRadius, height - circleRadius)
      const dx = x - (width - circleRadius);
      const dy = y - (height - circleRadius);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > circleRadius) {
        mask[y][x] = false;
      }
    }
  }

  return mask;
};

/**
 * Apply rounded corner mask to a buffer region.
 * This function masks out pixels that fall outside the rounded corners.
 * 
 * @param {Array} buffer - The render buffer
 * @param {number} x - X coordinate of the element
 * @param {number} y - Y coordinate of the element
 * @param {number} width - Width of the element
 * @param {number} height - Height of the element
 * @param {number} radius - Border radius
 */
const applyRoundedCorners = (buffer, x, y, width, height, radius) => {
  if (radius <= 0) return;

  const mask = createRoundedCornerMask(width, height, radius);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!mask[row][col]) {
        const bufferX = x + col;
        const bufferY = y + row;
        
        if (bufferY >= 0 && bufferY < buffer.length && 
            bufferX >= 0 && bufferX < buffer[0].length) {
          // Clear the pixel by setting it to transparent
          // Also clear the raw property which contains image data
          buffer[bufferY][bufferX].char = ' ';
          buffer[bufferY][bufferX].bgColor = 'transparent';
          buffer[bufferY][bufferX].fgColor = 'transparent';
          buffer[bufferY][bufferX].raw = null;
        }
      }
    }
  }
};

module.exports = {
  drawHalfBlockBorder,
  drawQuarterBlockBorder,
  drawBox,
  createRoundedCornerMask,
  applyRoundedCorners,
};


