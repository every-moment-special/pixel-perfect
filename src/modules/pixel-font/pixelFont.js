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

// Compact render glyph size for native 3x5 rendering
const COMPACT_GLYPH_WIDTH = 3;
const COMPACT_GLYPH_HEIGHT = 5;

const SPACING = 1; // pixel columns between glyphs (in pixel units)

// Configuration for font rendering mode
const FONT_MODE = {
  COMPACT: 'compact',    // Render at native 3x5 size
  FULL: 'full'          // Render at 8x8 size (default)
};

// Font mode configuration functions (for backward compatibility)
function setFontMode(mode) {
  if (mode === FONT_MODE.COMPACT || mode === FONT_MODE.FULL) {
    // Clear caches when switching modes
    fullGlyphBitmapCache.clear();
    compactGlyphBitmapCache.clear();
    rasterCache.clear();
  }
}

function getFontMode() {
  return FONT_MODE.FULL; // Default for backward compatibility
}

function getCurrentGlyphDimensions() {
  return { width: RENDER_GLYPH_WIDTH, height: RENDER_GLYPH_HEIGHT };
}

// New function to get glyph dimensions based on font family
function getGlyphDimensionsForFontFamily(fontFamily) {
  if (fontFamily === FONT_MODE.COMPACT) {
    return { width: COMPACT_GLYPH_WIDTH, height: COMPACT_GLYPH_HEIGHT };
  }
  return { width: RENDER_GLYPH_WIDTH, height: RENDER_GLYPH_HEIGHT };
}

// Function to get cell dimensions for rendering (optimized for half-blocks)
function getCellDimensionsForFontFamily(fontFamily) {
  if (fontFamily === FONT_MODE.COMPACT) {
    // Compact font: 3x5 pixels → 3x3 cells (3 columns, 3 rows)
    // Each cell can hold 2 vertical pixels via half-blocks
    return { width: COMPACT_GLYPH_WIDTH, height: 3 };
  }
  // Full font: 8x8 pixels → 8x4 cells
  return { width: RENDER_GLYPH_WIDTH, height: 4 };
}

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
  'á': ['010','101','111','101','101'],
  'é': ['111','100','110','100','111'],
  'í': ['111','010','010','010','111'],
  'ó': ['010','101','101','101','010'],
  'ú': ['101','101','101','101','111'],
  'ñ': ['110','101','111','101','101'],
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
  '?': ['111','001','011','000','010'],
  '(': ['001','010','010','010','001'],
  ')': ['100','010','010','010','100'],
  '/': ['001','001','010','100','100'],
  '\\': ['100','100','010','001','001'],
  '+': ['000','010','111','010','000'],
  '=': ['000','111','000','111','000'],
  '[': ['110','100','100','100','110'],
  ']': ['011','001','001','001','011'],
  '{': ['011','010','100','010','011'],
  '}': ['110','010','001','010','110'],
  '<': ['001','010','100','010','001'],
  '>': ['100','010','001','010','100'],
  '|': ['010','010','010','010','010'],
  '…': ['000','000','000','000','111'],
  '⋮': ['010','000','010','000','010']
};

// Half-block character map (two vertical halves per cell)
// 0: empty, 1: upper half, 2: lower half, 3: full block
const HALFBLOCK = [' ', '▀', '▄', '█'];

// Persistent glyph bitmap cache files for different font families
const COMBINED_CACHE_FILE = path.join(__dirname, 'assets', 'font-cache.json');
const FULL_CACHE_FILE = path.join(__dirname, 'assets', 'PS2P.bitmap.json');
const COMPACT_CACHE_FILE = path.join(__dirname, 'assets', 'compact.bitmap.json');

// Separate caches for each font family
/** @type {Map<string, boolean[][]>} */
const fullGlyphBitmapCache = new Map();
/** @type {Map<string, boolean[][]>} */
const compactGlyphBitmapCache = new Map();

// Helper function to get the appropriate cache for a font family
function getGlyphCache(fontFamily) {
  return fontFamily === FONT_MODE.COMPACT ? compactGlyphBitmapCache : fullGlyphBitmapCache;
}

function decodeRowBitsToBool(str, targetWidth) {
  const out = new Array(targetWidth);
  for (let i = 0; i < targetWidth; i++) out[i] = str[i] === '1';
  return out;
}

function loadGlyphCacheFromDisk() {
  // Try to load from combined cache file first
  try {
    if (fs.existsSync(COMBINED_CACHE_FILE)) {
      const raw = fs.readFileSync(COMBINED_CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      const ok = !!data && typeof data === 'object';
      if (ok) {
        // Load full font cache (8x8 glyphs)
        const fullGlyphs = data.full?.glyphs || {};
        const { width: fullWidth, height: fullHeight } = getGlyphDimensionsForFontFamily(FONT_MODE.FULL);
        
        for (const ch of Object.keys(fullGlyphs)) {
          const rows = fullGlyphs[ch];
          if (Array.isArray(rows) && rows.length === fullHeight) {
            const bmp = new Array(fullHeight);
            for (let y = 0; y < fullHeight; y++) bmp[y] = decodeRowBitsToBool(rows[y], fullWidth);
            fullGlyphBitmapCache.set(ch, bmp);
          }
        }

        // Load compact font cache (3x5 glyphs)
        const compactGlyphs = data.compact?.glyphs || {};
        const { width: compactWidth, height: compactHeight } = getGlyphDimensionsForFontFamily(FONT_MODE.COMPACT);
        
        for (const ch of Object.keys(compactGlyphs)) {
          const rows = compactGlyphs[ch];
          if (Array.isArray(rows) && rows.length === compactHeight) {
            const bmp = new Array(compactHeight);
            for (let y = 0; y < compactHeight; y++) bmp[y] = decodeRowBitsToBool(rows[y], compactWidth);
            compactGlyphBitmapCache.set(ch, bmp);
          }
        }
        
        return; // Successfully loaded from combined cache
      }
    }
  } catch (_) {
    // ignore and fall back to individual files
  }

  // Fallback: Load from individual cache files
  try {
    if (fs.existsSync(FULL_CACHE_FILE)) {
      const raw = fs.readFileSync(FULL_CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      const ok = !!data && typeof data === 'object';
      if (ok) {
        const glyphs = data.glyphs || {};
        const { width: targetWidth, height: targetHeight } = getGlyphDimensionsForFontFamily(FONT_MODE.FULL);
        
        for (const ch of Object.keys(glyphs)) {
          const rows = glyphs[ch];
          if (Array.isArray(rows) && rows.length === targetHeight) {
            const bmp = new Array(targetHeight);
            for (let y = 0; y < targetHeight; y++) bmp[y] = decodeRowBitsToBool(rows[y], targetWidth);
            fullGlyphBitmapCache.set(ch, bmp);
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    if (fs.existsSync(COMPACT_CACHE_FILE)) {
      const raw = fs.readFileSync(COMPACT_CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      const ok = !!data && typeof data === 'object';
      if (ok) {
        const glyphs = data.glyphs || {};
        const { width: targetWidth, height: targetHeight } = getGlyphDimensionsForFontFamily(FONT_MODE.COMPACT);
        
        for (const ch of Object.keys(glyphs)) {
          const rows = glyphs[ch];
          if (Array.isArray(rows) && rows.length === targetHeight) {
            const bmp = new Array(targetHeight);
            for (let y = 0; y < targetHeight; y++) bmp[y] = decodeRowBitsToBool(rows[y], targetWidth);
            compactGlyphBitmapCache.set(ch, bmp);
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }
}


loadGlyphCacheFromDisk();

function measurePixelFont(text, scale, fontFamily = 'full') {
  const totalGlyphs = text.length;
  const { width: glyphWidth, height: glyphHeight } = getGlyphDimensionsForFontFamily(fontFamily);
  const { width: cellWidth, height: cellHeight } = getCellDimensionsForFontFamily(fontFamily);
  
  const pixelWidth = totalGlyphs > 0
    ? (glyphWidth * scale) * totalGlyphs + SPACING * (totalGlyphs - 1)
    : 0;
  
  // Use optimized cell dimensions for rendering
  const cellCols = pixelWidth;
  const cellRows = cellHeight * scale;
  
  return { cellCols, cellRows };
}

function rasterizePixelFont(text, scale, fontFamily = 'full') {
  const { cellCols, cellRows } = measurePixelFont(text, scale, fontFamily);
  const grid = new Array(cellRows);
  for (let r = 0; r < cellRows; r++) grid[r] = new Array(cellCols).fill(0);

  const { width: glyphWidth, height: glyphHeight } = getGlyphDimensionsForFontFamily(fontFamily);
  let penPxX = 0;
  
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    const key = ch.toLowerCase();
    const glyphCache = getGlyphCache(fontFamily);
    let bmp = glyphCache.get(ch) || null;
    
          if (!bmp) {
        // Fallback to source glyphs based on font family
        const baseGlyph = PIXEL_FONT[key] || PIXEL_FONT['?'];
        
        if (fontFamily === FONT_MODE.COMPACT) {
          // Use 3x5 glyphs directly for compact mode
          bmp = new Array(glyphHeight);
          for (let ty = 0; ty < glyphHeight; ty++) {
            const rowBits = baseGlyph[ty];
            const row = new Array(glyphWidth).fill(false);
            for (let tx = 0; tx < glyphWidth; tx++) {
              row[tx] = rowBits[tx] === '1';
            }
            bmp[ty] = row;
          }
        } else {
          // Upscale 3x5 to 8x8 for full mode
          bmp = new Array(glyphHeight);
          for (let ty = 0; ty < glyphHeight; ty++) {
            const srcY = Math.floor((ty / glyphHeight) * BASE_GLYPH_HEIGHT);
            const rowBits = baseGlyph[srcY];
            const row = new Array(glyphWidth).fill(false);
            for (let tx = 0; tx < glyphWidth; tx++) {
              const srcX = Math.floor((tx / glyphWidth) * BASE_GLYPH_WIDTH);
              row[tx] = rowBits[srcX] === '1';
            }
            bmp[ty] = row;
          }
        }
        glyphCache.set(ch, bmp);
        // No need to persist fallback-only glyphs
      }

    // Emit into half-block grid with scaling
    if (fontFamily === FONT_MODE.COMPACT) {
      // Optimized rendering for compact fonts: 3x5 pixels → 3x3 cells
      // Map 5 pixel rows to 3 cell rows using half-blocks
      const pixelToCellMap = [
        [0, 0], // pixel row 0 → cell row 0, top half
        [0, 1], // pixel row 1 → cell row 0, bottom half  
        [1, 0], // pixel row 2 → cell row 1, top half
        [1, 1], // pixel row 3 → cell row 1, bottom half
        [2, 0]  // pixel row 4 → cell row 2, top half
      ];
      
      for (let ty = 0; ty < glyphHeight; ty++) {
        for (let tx = 0; tx < glyphWidth; tx++) {
          if (!bmp[ty][tx]) continue;
          const [cellY, halfBlock] = pixelToCellMap[ty];
          for (let sx = 0; sx < scale; sx++) {
            const px = penPxX + tx * scale + sx;
            const cellX = px;
            if (cellX < 0 || cellX >= cellCols || cellY < 0 || cellY >= cellRows) continue;
            grid[cellY][cellX] |= (halfBlock === 0) ? 1 : 2; // 1 for top, 2 for bottom
          }
        }
      }
    } else {
      // Standard rendering for full fonts: 8x8 pixels → 8x4 cells
      for (let ty = 0; ty < glyphHeight; ty++) {
        for (let tx = 0; tx < glyphWidth; tx++) {
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
    }

    penPxX += glyphWidth * scale;
    if (index !== text.length - 1) penPxX += SPACING;
  }

  return { grid, cellCols, cellRows };
}

// Simple memoization for rasterization by (text, scale)
const rasterCache = new Map();

function rasterizePixelFontCached(text, scale, fontFamily = 'full') {
  const key = `${scale}:${fontFamily}:${text}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const result = rasterizePixelFont(text, scale, fontFamily);
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
  COMPACT_GLYPH_WIDTH,
  COMPACT_GLYPH_HEIGHT,
  SPACING,
  FONT_MODE,
  setFontMode,
  getFontMode,
  getCurrentGlyphDimensions,
  getGlyphDimensionsForFontFamily,
  getCellDimensionsForFontFamily,
  measurePixelFont,
  rasterizePixelFont,
  rasterizePixelFontCached,
  HALFBLOCK,
};
