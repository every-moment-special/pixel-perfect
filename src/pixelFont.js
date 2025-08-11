'use strict';

const fs = require('fs');
const path = require('path');

// Base bitmap glyph dimensions (existing 3x5 bitmap definitions)
const BASE_GLYPH_WIDTH = 3;
const BASE_GLYPH_HEIGHT = 5;

// Target render glyph size to approximate Press Start 2P proportions.
// We render on an 8x8 pixel grid and then encode via half-blocks, which
// produces 8x4 terminal cells per glyph at scale 1.
const RENDER_GLYPH_WIDTH = 8;
const RENDER_GLYPH_HEIGHT = 8;

const SPACING = 1; // pixel columns between glyphs (in pixel units)

// Existing compact source glyphs (3x5). We will upscale these at render time
// to the 8x8 target grid to approximate Press Start 2P.
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

// Half-block character map (two vertical halves per cell)
// 0: empty, 1: upper half, 2: lower half, 3: full block
const HALFBLOCK = [' ', '▀', '▄', '█'];

// Persistent glyph bitmap cache (char -> 8x8 boolean rows), saved to JSON
const CACHE_FILE = path.join(__dirname, 'assets', 'PS2P.bitmap.json');
/** @type {Map<string, boolean[][]>} */
const glyphBitmapCache = new Map();

function decodeRowBitsToBool(str) {
  const out = new Array(RENDER_GLYPH_WIDTH);
  for (let i = 0; i < RENDER_GLYPH_WIDTH; i++) out[i] = str[i] === '1';
  return out;
}

function loadGlyphCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Validate cache (no TTF dependency). Allow any meta or none.
    const ok = !!data && typeof data === 'object';
    if (!ok) return;
    const glyphs = data.glyphs || {};
    for (const ch of Object.keys(glyphs)) {
      const rows = glyphs[ch];
      if (Array.isArray(rows) && rows.length === RENDER_GLYPH_HEIGHT) {
        const bmp = new Array(RENDER_GLYPH_HEIGHT);
        for (let y = 0; y < RENDER_GLYPH_HEIGHT; y++) bmp[y] = decodeRowBitsToBool(rows[y]);
        glyphBitmapCache.set(ch, bmp);
      }
    }
  } catch (_) {
    // ignore
  }
}


loadGlyphCacheFromDisk();

function measurePixelFont(text, scale) {
  const totalGlyphs = text.length;
  const pixelWidth = totalGlyphs > 0
    ? (RENDER_GLYPH_WIDTH * scale) * totalGlyphs + SPACING * (totalGlyphs - 1)
    : 0;
  const pixelHeight = RENDER_GLYPH_HEIGHT * scale;
  // Half-blocks: one pixel per column; two vertical pixels per cell row
  const cellCols = pixelWidth;
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
    let bmp = glyphBitmapCache.get(ch) || null;
    if (!bmp) {
      // Fallback to upscaled 3x5 source glyphs
      const baseGlyph = PIXEL_FONT[key] || PIXEL_FONT['?'];
      bmp = new Array(RENDER_GLYPH_HEIGHT);
      for (let ty = 0; ty < RENDER_GLYPH_HEIGHT; ty++) {
        const srcY = Math.floor((ty / RENDER_GLYPH_HEIGHT) * BASE_GLYPH_HEIGHT);
        const rowBits = baseGlyph[srcY];
        const row = new Array(RENDER_GLYPH_WIDTH).fill(false);
        for (let tx = 0; tx < RENDER_GLYPH_WIDTH; tx++) {
          const srcX = Math.floor((tx / RENDER_GLYPH_WIDTH) * BASE_GLYPH_WIDTH);
          row[tx] = rowBits[srcX] === '1';
        }
        bmp[ty] = row;
      }
      glyphBitmapCache.set(ch, bmp);
      // No need to persist fallback-only glyphs
    }

    // Emit into half-block grid with scaling
    for (let ty = 0; ty < RENDER_GLYPH_HEIGHT; ty++) {
      for (let tx = 0; tx < RENDER_GLYPH_WIDTH; tx++) {
        if (!bmp[ty][tx]) continue;
        for (let sy = 0; sy < scale; sy++) {
          const py = ty * scale + sy;
          const cellY = Math.floor(py / 2);
          if (cellY < 0 || cellY >= cellRows) continue;
          const isTop = (py % 2 === 0);
          for (let sx = 0; sx < scale; sx++) {
            const px = penPxX + tx * scale + sx;
            const cellX = px;
            if (cellX < 0 || cellX >= cellCols) continue;
            grid[cellY][cellX] |= isTop ? 1 : 2;
          }
        }
      }
    }

    penPxX += RENDER_GLYPH_WIDTH * scale;
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
  // Expose render-time glyph dimensions
  GLYPH_WIDTH: RENDER_GLYPH_WIDTH,
  GLYPH_HEIGHT: RENDER_GLYPH_HEIGHT,
  SPACING,
  measurePixelFont,
  rasterizePixelFont,
  rasterizePixelFontCached,
  HALFBLOCK,
};
