'use strict';

const fs = require('fs');
const path = require('path');

const BITMAP_FILE = path.join(__dirname, 'assets', 'font.json');
const FONT_FILE = path.join(__dirname, "font.js");

const FONT_FAMILY = {};

const decodeRowBitsToBool = (str, targetWidth) => {
    const out = new Array(targetWidth);
    for (let i = 0; i < targetWidth; i++) out[i] = Number(str[i]);
    return out;
};
  
const loadGlyph = () => {
    try {
        if (!fs.existsSync(BITMAP_FILE)) return;
    
        const raw = fs.readFileSync(BITMAP_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
    
        for (const key in data) {
            const value = data[key];
            const { width = 0, height = 0, glyphs = {} } = value;
    
            let family = FONT_FAMILY[key];
            if (!family) {
            family = FONT_FAMILY[key] = { width, height, glyphs: {} };
            }
    
            for (const ch in glyphs) {
            const rows = glyphs[ch];
            if (!Array.isArray(rows) || rows.length !== height) continue;
    
            const bmp = new Array(height);
            for (let y = 0; y < height; y++) {
                bmp[y] = decodeRowBitsToBool(rows[y], width);
            }
            family.glyphs[ch] = bmp;
            }
        }
    } catch (_) {}
};
  
const stringifyCompact = (obj) => {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (
          Array.isArray(value) &&
          value.every(
            row =>
              Array.isArray(row) &&
              row.every(v => typeof v === "boolean" || typeof v === "number")
          )
        ) {
          return "__INLINE__" + JSON.stringify(value);
        }
        
        if (
          Array.isArray(value) &&
          value.every(v => typeof v === "boolean" || typeof v === "number")
        ) {
          return "__INLINE__" + JSON.stringify(value);
        }
        return value;
      },
      2
    ).replace(/"__INLINE__(\[.*?\])"/g, (_, arr) => arr);
};
  
const saveFont = () => {
    const output = 
        "const FONT_FAMILY = " + stringifyCompact(FONT_FAMILY) + ";\n\n" +
        "module.exports = FONT_FAMILY;\n";
    
    fs.writeFileSync(FONT_FILE, output, "utf8");
};

module.exports = {
  loadGlyph,
  saveFont,
};
