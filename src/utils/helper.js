const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Item = require('../core/item.js');
const Terminal = require('../core/terminal.js');
const Event = require('./event.js');
const { Generator } = require('./generate.js');
const { measurePixelFont } = require('../modules/pixel-font/pixelFont.js');

const event = new Event();

const terminal = new Terminal();

const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];
const terminalType = process.env.TERM;
const isKitty = !!process.env.KITTY_WINDOW_ID;

const currentPath = process.cwd();

// #7afeb2
// 

const colors = {
    black: '\x1b[30m',
    gray: '\x1b[90m',
    white: '\x1b[37m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    pink: '\x1b[35m',
    bgpink: '\x1b[105m',
    bggray: '\x1b[100m',
    bgwhite: '\x1b[47m',
    bgred: '\x1b[41m',
    bgblue: '\x1b[44m',
    bgcyan: '\x1b[46m',
    reset: '\x1b[0m',
    bgReset: '\x1b[49m',
    transparent: '\x1b[39m',
    bgTransparent: '\x1b[49m',

    neonGreen: '\x1b[38;2;122;254;178m',
    bgNeonGreen: '\x1b[48;2;122;254;178m',
    bgblack: '\x1b[48;2;0;0;0m',
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
            if (file === '.' || file === '..') continue;
            
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
  
    // Fits as-is
    if (measurePixelFont(filename, scale, fontFamily).cellCols <= maxCellWidth) return filename;
  
    const ellipsis = '...';
  
    // If even ellipsis + ext does not fit, try trimming ext from the left; fallback to ellipsis only
    if (measurePixelFont(ellipsis + ext, scale, fontFamily).cellCols > maxCellWidth) {
      let shortExt = ext;
      while (shortExt.length > 0 && measurePixelFont(ellipsis + shortExt, scale, fontFamily).cellCols > maxCellWidth) {
        shortExt = shortExt.slice(1);
      }
      return shortExt.length > 0 ? ellipsis + shortExt : ellipsis;
    }
  
    // Binary search the longest prefix of base that fits with ellipsis + ext
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

// Cache for generated directory item images
const getCachedOrGenerateImage = async (itemPath, width, height) => {
    const { state } = require('../core/state');
    const cacheKey = `${itemPath}:${width}:${height}`;
    
    // Check if we have a cached version
    const cached = state.directoryItemCache.get(cacheKey);
    if (cached) {
        // Check if file has been modified since cache
        try {
            const stats = fs.statSync(itemPath);
            if (stats.mtime.getTime() <= cached.timestamp) {
                return cached.cells;
            }
        } catch (error) {
            // File might not exist anymore, continue to regenerate
        }
    }
    
    // Generate new image
    const cells = await generate(itemPath, width, height);
    
    // Cache the result
    state.directoryItemCache.set(cacheKey, {
        cells,
        timestamp: Date.now()
    });
    
    return cells;
};

// Clean up old cache entries (older than 5 minutes)
const cleanupImageCache = () => {
    const { state } = require('../core/state');
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, value] of state.directoryItemCache.entries()) {
        if (now - value.timestamp > maxAge) {
            state.directoryItemCache.delete(key);
        }
    }
};

module.exports = {
    setTerminalFontSize,
    readDirectory,
    isKitty,
    terminalType,
    extensions,
    terminal,
    colors,
    event,
    currentPath,
    generate,
    truncateFilenameKeepExtension,
    getCachedOrGenerateImage,
    cleanupImageCache,
}
