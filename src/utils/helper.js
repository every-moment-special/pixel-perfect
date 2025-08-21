const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Item = require('../core/item.js');
const Event = require('./event.js');
const { Generator } = require('./generate.js');
const { measurePixelFont } = require('../modules/pixel-font/pixelFont.js');

const event = new Event();

const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];
const terminalType = process.env.TERM;
const isKitty = !!process.env.KITTY_WINDOW_ID;

const currentPath = process.cwd();
// const currentPath = path.join(__dirname, '..', '..', 'resources'); // for testing

const colors = {
    black: '\x1b[38;2;0;0;0m',
    gray: '\x1b[38;2;128;128;128m',
    coolGray: '\x1b[38;2;139;148;163m',
    silver: '\x1b[38;2;220;220;220m',
    silverDark: '\x1b[38;2;169;169;169m',
    silverLight: '\x1b[38;2;240;240;240m',
    silverWarm: '\x1b[38;2;211;211;211m',
    silverCool: '\x1b[38;2;176;196;222m',
    red: '\x1b[38;2;255;0;0m',
    blue: '\x1b[38;2;0;0;255m',
    cyan: '\x1b[38;2;0;255;255m',
    pink: '\x1b[38;2;255;192;203m',
    bgpink: '\x1b[48;2;255;192;203m',
    bggray: '\x1b[48;2;128;128;128m',
    bgwhite: '\x1b[48;2;255;255;255m',
    bgred: '\x1b[48;2;255;0;0m',
    bgblue: '\x1b[48;2;0;0;255m',
    bgcyan: '\x1b[48;2;0;255;255m',
    reset: '\x1b[0m',
    bgReset: '\x1b[49m',
    transparent: '\x1b[39m',
    bgTransparent: '\x1b[49m',

    neonGreen: '\x1b[38;2;122;254;178m',
    bgneonGreen: '\x1b[48;2;122;254;178m',
    bgcoolGray: '\x1b[48;2;139;148;163m',
    bgblack: '\x1b[48;2;0;0;0m',
    white: '\x1b[38;2;255;255;255m',
};

const generator = new Generator();

const generate = (path, width, height) => {
    return generator.generate(path, width, height);
}

const setTerminalFontSize = (size) => {
    return new Promise((resolve, reject) => {
        exec(`kitty @ set-font-size ${size}`, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });
}

const isDirectory = (filename) => {
    return fs.statSync(filename).isDirectory();
}

const isMedia = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return extensions.includes(ext);
}

const readDirectory = (currentPath) => {
    try {
        const files = fs.readdirSync(currentPath);
        const items = [];

        for (const file of files) {
            if (file === '.' || file === '..' || file.startsWith('.')) continue;
            
            const fullPath = path.join(currentPath, file);
            const stats = fs.statSync(fullPath);
            
            if (isDirectory(fullPath)) {
                items.push(new Item(file, fullPath, 'directory', 0, ''));
            } else if (isMedia(file)) {
                items.push(new Item(file, fullPath, 'media', stats.size, path.extname(file).toLowerCase()));
            }
        }
        
        return items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
    } catch (error) {
        console.error(`Error reading directory: ${error.message}`);
        return [];
    }
}

const truncateFilenameKeepExtension = (filename, maxCellWidth, scale = 1, fontFamily = 'full') => {
    const ext = path.extname(filename).slice(1);
    const base = ext ? filename.slice(0, -ext.length) : filename;
  
    if (measurePixelFont(filename, scale, fontFamily).cellCols <= maxCellWidth) return filename;
  
    const ellipsis = '...';
  
    if (measurePixelFont(ellipsis + ext, scale, fontFamily).cellCols > maxCellWidth) {
      let shortExt = ext;
      while (shortExt.length > 0 && measurePixelFont(ellipsis + shortExt, scale, fontFamily).cellCols > maxCellWidth) {
        shortExt = shortExt.slice(1);
      }
      return shortExt.length > 0 ? ellipsis + shortExt : ellipsis;
    }
  
    let left = 0;
    let right = base.length;
    let best = '';

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const candidate = base.slice(0, mid) + ellipsis + ext;
      const width = measurePixelFont(candidate, scale, fontFamily).cellCols;

      if (width <= maxCellWidth) {
        best = candidate;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return best || (ellipsis + ext);
};

const getCachedOrGenerateImage = async (itemPath, width, height, staticMode = false) => {
    const { state } = require('../core/state.js');
    const isGif = itemPath.toLowerCase().endsWith('.gif');
    if (isGif && !staticMode) {
        return { isGif: true };
    }
    
    const cacheKey = `${itemPath}:${width}:${height}`;
    
    const cached = state.directoryItemCache.get(cacheKey);
    if (cached) {
        try {
            const stats = fs.statSync(itemPath);
            if (stats.mtime.getTime() <= cached.timestamp) {
                return cached.cells;
            }
        } catch (error) {
            // TODO: add proper error handling
        }
    }
    
    const cells = await generate(itemPath, width, height);
    
    state.directoryItemCache.set(cacheKey, {
        cells,
        timestamp: Date.now()
    });
    
    return cells;
};

const cleanupImageCache = () => {
    const { state } = require('../core/state.js');
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, value] of state.directoryItemCache.entries()) {
        if (now - value.timestamp > maxAge) {
            state.directoryItemCache.delete(key);
        }
    }
};

const clearImageCache = () => {
    const { state } = require('../core/state.js');
    state.directoryItemCache.clear();
};

module.exports = {
    setTerminalFontSize,
    readDirectory,
    isKitty,
    terminalType,
    extensions,
    colors,
    event,
    currentPath,
    generate,
    truncateFilenameKeepExtension,
    getCachedOrGenerateImage,
    cleanupImageCache,
    clearImageCache,
}
