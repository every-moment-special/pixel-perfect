const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Item = require('./item');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];

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
    return SUPPORTED_EXTENSIONS.includes(ext);
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
}
