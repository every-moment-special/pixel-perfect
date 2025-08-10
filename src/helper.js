const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Item = require('./item');
const Terminal = require('./terminal.js');
const { render: renderVDOM } = require('./vdom');

const terminal = new Terminal();
const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];
const terminalType = process.env.TERM;
const isKitty = !!process.env.KITTY_WINDOW_ID;

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";

const colors = {
    reset: RESET,
    red: RED,
    green: GREEN,
    yellow: YELLOW,
    blue: BLUE,
    magenta: MAGENTA,
    cyan: CYAN,
    white: WHITE,
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

// Render a VNode tree to the terminal using the virtual DOM buffer
const render = (vnode) => {
  return renderVDOM(vnode, terminal);
}

module.exports = {
    setTerminalFontSize,
    readDirectory,
    isKitty,
    terminalType,
    extensions,
    terminal,
    colors,
    render,
}
