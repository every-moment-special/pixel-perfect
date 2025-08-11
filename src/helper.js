const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Item = require('./item');
const Terminal = require('./terminal.js');
const Event = require('./event.js');
const { Generator } = require('./generate');

const event = new Event();

const terminal = new Terminal();

const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];
const terminalType = process.env.TERM;
const isKitty = !!process.env.KITTY_WINDOW_ID;

const currentPath = process.cwd();

const colors = {
    black: '\x1b[30m',
    white: '\x1b[37m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bgblack: '\x1b[40m',
    bgwhite: '\x1b[47m',
    bgred: '\x1b[41m',
    bgblue: '\x1b[44m',
    bgcyan: '\x1b[46m',
    reset: '\x1b[0m',
    bgReset: '\x1b[49m',
    transparent: '\x1b[39m',
    bgTransparent: '\x1b[49m',
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
}
