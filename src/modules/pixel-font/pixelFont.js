'use strict';

const FONT_FAMILY = require('./font.js');
const SPACING = 1;
const HALFBLOCK = [' ', '▀', '▄', '█'];
const rasterCache = new Map();

const measurePixelFont = (text, scale, fontFamily = 'default') => {
  const totalGlyphs = text.length;
  const { width, height } = FONT_FAMILY[fontFamily];
  
  const pixelWidth = totalGlyphs > 0
    ? (width * scale) * totalGlyphs + SPACING * (totalGlyphs - 1)
    : 0;
  
  const cellCols = pixelWidth;
  const cellRows = height * scale;
  
  return { cellCols, cellRows };
};

const drawGlyphToGridFlat = (bmp, penPxX, grid, scale, cellCols, cellRows) => {
  const glyphHeight = bmp.length;
  const glyphWidth = bmp[0].length;

  for (let ty = 0; ty < glyphHeight; ty++) {
    const bmpRow = bmp[ty];
    for (let tx = 0; tx < glyphWidth; tx++) {
      if (!bmpRow[tx]) continue;

      const baseY = ty * scale;
      const baseX = penPxX + tx * scale;

      for (let sy = 0; sy < scale; sy++) {
        const py = baseY + sy;
        const cellY = py >> 1;
        if (cellY < 0 || cellY >= cellRows) continue;
        const bit = (py & 1) === 0 ? 1 : 2;

        let offset = cellY * cellCols + baseX;
        for (let sx = 0; sx < scale; sx++) {
          const cellX = baseX + sx;
          if (cellX >= 0 && cellX < cellCols) {
            grid[offset + sx] |= bit;
          }
        }
      }
    }
  }
};

const rasterizePixelFont = (text, scale, fontFamily = 'default') => {
  const { cellCols, cellRows } = measurePixelFont(text, scale, fontFamily);
  const grid = new Uint8Array(cellCols * cellRows);

  let penPxX = 0;
  const glyphs = FONT_FAMILY[fontFamily].glyphs;
  const defaultGlyphs = FONT_FAMILY['default'].glyphs;

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    const bmp = glyphs[ch] || defaultGlyphs[ch] || defaultGlyphs['?'];
    drawGlyphToGridFlat(bmp, penPxX, grid, scale, cellCols, cellRows);
    penPxX += bmp[0].length * scale + (index !== text.length - 1 ? SPACING : 0);
  }

  return { grid, cellCols, cellRows };
};

const getPixelFont = (text, scale, fontFamily = 'default') => {
  const key = `${scale}:${fontFamily}:${text}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const result = rasterizePixelFont(text, scale, fontFamily);
  rasterCache.set(key, result);

  if (rasterCache.size > 512) {
    const firstKey = rasterCache.keys().next().value;
    if (firstKey !== undefined) rasterCache.delete(firstKey);
  }
  return result;
}

module.exports = {
  getPixelFont,
  measurePixelFont,
  HALFBLOCK,
};
