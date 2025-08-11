'use strict';

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const SPACING = 1; // pixel columns between glyphs (in pixel units)

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

function measurePixelFont(text, scale) {
  const totalGlyphs = text.length;
  const pixelWidth = totalGlyphs > 0
    ? (GLYPH_WIDTH * scale) * totalGlyphs + SPACING * (totalGlyphs - 1)
    : 0;
  const pixelHeight = GLYPH_HEIGHT * scale;
  const cellCols = Math.ceil(pixelWidth / 2);
  const cellRows = Math.ceil(pixelHeight / 2);
  return { cellCols, cellRows };
}

function rasterizePixelFont(text, scale) {
  const { cellCols, cellRows } = measurePixelFont(text, scale);
  const grid = new Array(cellRows);
  for (let r = 0; r < cellRows; r++) grid[r] = new Array(cellCols).fill(0);

  let penPxX = 0;
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    const key = ch.toLowerCase();
    const glyph = PIXEL_FONT[key] || PIXEL_FONT['?'];

    for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
      const rowBits = glyph[gy];
      for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
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

    penPxX += GLYPH_WIDTH * scale;
    if (index !== text.length - 1) penPxX += SPACING;
  }

  return { grid, cellCols, cellRows };
}

// Simple memoization for rasterization by (text, scale)
const rasterCache = new Map();

function rasterizePixelFontCached(text, scale) {
  const key = `${scale}:${text}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const result = rasterizePixelFont(text, scale);
  rasterCache.set(key, result);
  // Cap cache size to avoid unbounded growth
  if (rasterCache.size > 512) {
    // Remove first inserted entry (not true LRU but sufficient here)
    const firstKey = rasterCache.keys().next().value;
    if (firstKey !== undefined) rasterCache.delete(firstKey);
  }
  return result;
}

module.exports = {
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
  SPACING,
  measurePixelFont,
  rasterizePixelFont,
  rasterizePixelFontCached,
  QUAD,
};


