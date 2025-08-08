const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Generator } = require('./generate');
const { setFontSize, isKitty } = require('./start');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];

class ImageGallerySlider {
    constructor(imagePaths, startIndex = 0, generator) {
        this.imagePaths = imagePaths;
        this.currentIndex = startIndex;
        this.generator = generator;
        this.isNavigating = false;
        this.terminalWidth = process.stdout.columns || 80;
        this.terminalHeight = process.stdout.rows || 24;
        this.scrollOffset = 0;
        this.imageData = null;
        this.imageHeight = 0;
        
        this.resizeHandler = async () => {
            this.terminalWidth = process.stdout.columns || 80;
            this.terminalHeight = process.stdout.rows || 24;
            await this.showCurrentImage();
        };
        
        process.stdout.on('resize', this.resizeHandler);
    }

    async showCurrentImage() {
        if (this.imagePaths.length === 0) {
            console.log('No image files found.');
            return;
        }

        const currentPath = this.imagePaths[this.currentIndex];
        const filename = path.basename(currentPath);
        
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(`\x1b[36mGallery: ${this.currentIndex + 1}/${this.imagePaths.length}\x1b[0m`);
        console.log(`\x1b[33mCurrent: ${filename}\x1b[0m\n`);

        try {
            const data = await this.generator.generate(currentPath);
            this.imageData = data;
            this.calculateImageDimensions();
            this.scrollOffset = 0;
            this.displayWithNavigation();
        } catch (error) {
            console.error(`Error loading image: ${error.message}`);
            this.showNavigationHelp();
        }
    }

    calculateImageDimensions() {
        if (!this.imageData) return;
        
        let cells;
        if (this.imageData.t && this.imageData.d) {
            const ansiTable = this.imageData.t;
            cells = this.imageData.d.map(cell => ({
                x: cell[0],
                y: cell[1],
                char: cell[2],
                ansi: ansiTable[cell[3]] || ''
            }));
        } else {
            cells = this.imageData;
        }
        
        this.imageHeight = cells.reduce((max, cell) => Math.max(max, cell.y), 0) + 1;
    }

    displayWithNavigation() {
        if (!this.imageData) return;
        
        process.stdout.write('\x1b[2J\x1b[H');
        
        let cells;
        if (this.imageData.t && this.imageData.d) {
            const ansiTable = this.imageData.t;
            cells = this.imageData.d.map(cell => ({
                x: cell[0],
                y: cell[1],
                char: cell[2],
                ansi: ansiTable[cell[3]] || ''
            }));
        } else {
            cells = this.imageData;
        }
        
        const maxY = cells.reduce((max, cell) => Math.max(max, cell.y), 0);
        const maxX = cells.reduce((max, cell) => Math.max(max, cell.x), 0);
        const display = Array(maxY + 1).fill().map(() => Array(maxX + 1).fill(' '));
        
        cells.forEach(cell => {
            if (cell.y < display.length && cell.x < display[0].length) {
                display[cell.y][cell.x] = cell.ansi + cell.char + '\x1b[0m';
            }
        });
        
        const availableHeight = this.terminalHeight - 6;
        const startY = this.scrollOffset;
        const endY = Math.min(startY + availableHeight, display.length);
        
        for (let y = startY; y < endY; y++) {
            if (y < display.length) {
                process.stdout.write(display[y].join('') + '\n');
            }
        }
        
        this.showNavigationInfo();
        
        this.setupNavigation();
    }

    showNavigationInfo() {
        const currentPath = this.imagePaths[this.currentIndex];
        const filename = path.basename(currentPath);
        const totalImages = this.imagePaths.length;
        const currentNum = this.currentIndex + 1;
        
        const availableHeight = this.terminalHeight - 6;
        const totalHeight = this.imageHeight;
        const scrollProgress = totalHeight > availableHeight ? 
            ` (${this.scrollOffset + 1}-${Math.min(this.scrollOffset + availableHeight, totalHeight)}/${totalHeight})` : '';
        
        process.stdout.write(`\x1b[${this.terminalHeight};1H`);
        console.log(`\x1b[36m${currentNum}/${totalImages}\x1b[0m - \x1b[33m${filename}\x1b[0m${scrollProgress}`);
        console.log('\x1b[90mNavigation: ←/→ arrows (images), ↑/↓ arrows (scroll), q to quit, ESC to return\x1b[0m');
    }

    showNavigationHelp() {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('\x1b[33mNavigation Controls:\x1b[0m');
        console.log('  \x1b[36m←/→\x1b[0m  Navigate between images');
        console.log('  \x1b[36m↑/↓\x1b[0m  Scroll up/down in current image');
        console.log('  \x1b[36mq\x1b[0m  Quit gallery');
        console.log('  \x1b[36mESC\x1b[0m  Return to browser');
        console.log('\n\x1b[90mPress any key to continue...\x1b[0m');
    }

    setupNavigation() {
        process.stdin.removeAllListeners('data');
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        const handleKey = async (key) => {
            if (this.isNavigating) return;
            
            this.isNavigating = true;
            
            if (key === 'q' || key === 'Q') {
                process.stdout.write('\x1b[2J\x1b[H');
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.exit(0);
            } else if (key === '\u001b') { // ESC key
                process.stdout.write('\x1b[2J\x1b[H');
                process.stdin.setRawMode(false);
                process.stdin.pause();
                this.onExit();
                return;
            } else if (key === '\u001b[D') { // Left arrow
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                    await this.showCurrentImage();
                }
            } else if (key === '\u001b[C') { // Right arrow
                if (this.currentIndex < this.imagePaths.length - 1) {
                    this.currentIndex++;
                    await this.showCurrentImage();
                }
            } else if (key === '\u001b[A') { // Up arrow - scroll up
                const availableHeight = this.terminalHeight - 6;
                if (this.scrollOffset > 0) {
                    this.scrollOffset = Math.max(0, this.scrollOffset - 1);
                    this.displayWithNavigation();
                }
            } else if (key === '\u001b[B') { // Down arrow - scroll down
                const availableHeight = this.terminalHeight - 6;
                const maxScrollOffset = Math.max(0, this.imageHeight - availableHeight);
                if (this.scrollOffset < maxScrollOffset) {
                    this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + 1);
                    this.displayWithNavigation();
                }
            }
            
            this.isNavigating = false;
        };

        process.stdin.on('data', handleKey);
        
        this.keyHandler = handleKey;
    }

    onExit() {
        if (this.keyHandler) {
            process.stdin.removeListener('data', this.keyHandler);
        }
        
        process.stdout.removeListener('resize', this.resizeHandler);
        
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }

    async start() {
        await this.showCurrentImage();
    }
}

class TerminalGUI {
    constructor() {
        this.currentDirectory = process.cwd();
        this.files = [];
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.viewMode = 'grid'; // 'list' or 'grid'

        this.terminalWidth = process.stdout.columns || 80;
        this.terminalHeight = process.stdout.rows || 24;
        
        this.terminalWidth = Math.max(this.terminalWidth, 40);
        this.terminalHeight = Math.max(this.terminalHeight, 15);
        
        this.maxDisplayLines = Math.max(1, this.terminalHeight - 5);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.lastClickTime = 0;
        this.lastClickTarget = null;
        this.doubleClickThreshold = 500;
        this.mouseEnabled = false;
        this.hoverIndex = -1;
        this.scrollMode = process.argv.includes('--scroll-arrows') || process.argv.includes('--scroll-mode');
        
        this.disableMouse = process.argv.includes('--no-mouse');
        
        this.thumbnailCache = new Map();
        this.generator = new Generator();
        
        this.activeGallery = null;

        // this.folderIcon = this.generator.generate(directoryIconData, 32, 32);
        
        process.stdout.write('\x1b[?25l');
        
        process.stdout.on('resize', async () => {
            this.terminalWidth = process.stdout.columns || 80;
            this.terminalHeight = process.stdout.rows || 24;
            this.terminalWidth = Math.max(this.terminalWidth, 40);
            this.terminalHeight = Math.max(this.terminalHeight, 15);
            this.maxDisplayLines = Math.max(1, this.terminalHeight - 5);
            
            if (this.activeGallery) {
                return;
            }
            
            await this.render();
        });
    }

    isMediaFile(filename) {
        const ext = path.extname(filename).toLowerCase();
        return SUPPORTED_EXTENSIONS.includes(ext);
    }

    getMediaFiles() {
        try {
            const files = fs.readdirSync(this.currentDirectory);
            const items = [];
            
            for (const file of files) {
                if (file === '.' || file === '..') continue;
                
                const fullPath = path.join(this.currentDirectory, file);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    items.push({
                        name: file,
                        path: fullPath,
                        type: 'directory',
                        size: 0,
                        extension: ''
                    });
                } else if (this.isMediaFile(file)) {
                    items.push({
                        name: file,
                        path: fullPath,
                        type: 'file',
                        size: stats.size,
                        extension: path.extname(file).toLowerCase()
                    });
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

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async generateThumbnail(imagePath) {
        if (this.thumbnailCache.has(imagePath)) {
            return this.thumbnailCache.get(imagePath);
        }

        try {
            const thumbnailData = await this.generator.generate(imagePath, 32, 32);
            this.thumbnailCache.set(imagePath, thumbnailData);
            return thumbnailData;
        } catch (error) {
            console.error(`Error generating thumbnail for ${imagePath}: ${error.message}`);
            return null;
        }
    }

    renderThumbnail(thumbnailData, itemWidth, isSelected, filename, useTripleText = false) {
        const lines = [];
        const maxHeight = 16;
        
        const grid = Array(maxHeight).fill().map(() => Array(itemWidth).fill(' '));
        
        const thumbnailWidth = Math.min(32, itemWidth - 2);
        const startX = Math.floor((itemWidth - thumbnailWidth) / 2);
        
        thumbnailData.forEach(cell => {
            const adjustedX = cell.x + startX;
            if (cell.y < maxHeight && adjustedX < itemWidth) {
                grid[cell.y][adjustedX] = cell.ansi + cell.char + '\x1b[0m';
            }
        });
        
        for (let y = 0; y < maxHeight; y++) {
            lines.push(grid[y].join(''));
        }
        
        if (filename) {
            const displayName = filename.length > itemWidth - 2 ? filename.substring(0, itemWidth - 5) + '...' : filename;
            const leftPadding = Math.max(0, Math.floor((itemWidth - displayName.length) / 2));
            const rightPadding = Math.max(0, itemWidth - displayName.length - leftPadding);

            if (useTripleText) {
                const oscTriple = `\x1b]66;s=3;${displayName}\x07`;
                lines.push(`${' '.repeat(leftPadding)}${oscTriple}${' '.repeat(rightPadding)}`);
                lines.push(' '.repeat(itemWidth));
                lines.push(' '.repeat(itemWidth));
            } else {
                const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[90m';
                lines.push(`${color}${' '.repeat(leftPadding)}${displayName}${' '.repeat(rightPadding)}\x1b[0m`);
            }
        }
        
        return lines;
    }

    renderGridRow(rowItems, itemHeight, gapWidth) {
        for (let lineIndex = 0; lineIndex < itemHeight; lineIndex++) {
            let line = '';
            
            for (let i = 0; i < rowItems.length; i++) {
                const item = rowItems[i];
                
                if (item.type === 'empty') {
                    line += ' '.repeat(item.width);
                } else if (item.type === 'image') {
                    if (lineIndex < item.content.length) {
                        line += item.content[lineIndex];
                    } else {
                        line += ' '.repeat(item.width);
                    }
                } else {
                    if (lineIndex === 0) {
                        line += item.content;
                    } else {
                        line += ' '.repeat(item.width);
                    }
                }
                
                if (i < rowItems.length - 1) {
                    line += ' '.repeat(gapWidth);
                }
            }
            
            console.log(line);
        }
    }

    calculateGridDimensions() {
        const gapWidth = 2;
        const availableWidth = this.terminalWidth - 2;
        
        const minImageWidth = 32;
        const minOtherWidth = 20;
        
        const columns = Math.floor(availableWidth / (minImageWidth + gapWidth));
        const actualColumns = Math.max(1, columns);
        
        const rows = Math.ceil(this.files.length / actualColumns);

        const totalWidth = (actualColumns * minImageWidth) + ((actualColumns - 1) * gapWidth);

        const tripleItemHeight = 19; // 16 image + 3 text
        const normalItemHeight = 17; // 16 image + 1 text
        const useTripleText = (minImageWidth * tripleItemHeight) >= 500;
        this.useTripleText = useTripleText;

        const itemHeight = useTripleText ? tripleItemHeight : normalItemHeight;
        const totalHeight = rows * itemHeight;

        return { 
            columns: actualColumns, 
            rows, 
            gapWidth,
            totalWidth,
            totalHeight,
            itemWidth: minImageWidth,
            itemHeight
        };
    }

    clearScreen() {
        process.stdout.write('\x1b[3J\x1b[H');
    }

    clearDisplayArea() {
        const displayHeight = this.maxDisplayLines + 2;
        for (let i = 0; i < displayHeight; i++) {
            process.stdout.write(`\x1b[${i + 1};1H`);
            process.stdout.write(' '.repeat(this.terminalWidth));
        }
        process.stdout.write('\x1b[H');
    }

    forceClearScreen() {
        process.stdout.write('\x1b[2J\x1b[H');
        process.stdout.write('\x1b[3J\x1b[H');
        process.stdout.write('\x1b[H');
    }

    drawHeader() {
        // const topBorder = '╔' + '═'.repeat(this.terminalWidth - 2) + '╗';
        // const bottomBorder = '╚' + '═'.repeat(this.terminalWidth - 2) + '╝';
        
        // console.log('\x1b[36m' + topBorder + '\x1b[0m');
        
        // const title = 'Media Files Browser';
        // const titlePadding = Math.floor((this.terminalWidth - 2 - title.length) / 2);
        // const titleLine = '║' + ' '.repeat(titlePadding) + '\x1b[1m' + title + '\x1b[0m' + ' '.repeat(this.terminalWidth - 2 - title.length - titlePadding) + '║';
        // console.log('\x1b[36m' + titleLine + '\x1b[0m');
        
        // const dirLabel = 'Directory: ';
        // const dirText = this.currentDirectory;
        // const maxDirLength = this.terminalWidth - 4 - dirLabel.length;
        // const displayDir = dirText.length > maxDirLength ? '...' + dirText.slice(-maxDirLength + 3) : dirText;
        // const dirPadding = ' '.repeat(this.terminalWidth - 2 - dirLabel.length - displayDir.length);
        // const dirLine = '║' + dirLabel + '\x1b[33m' + displayDir + '\x1b[0m' + dirPadding + '║';
        // console.log('\x1b[36m' + dirLine + '\x1b[0m');
        
        // const countLabel = 'Items found: ';
        // const countText = this.files.length.toString();
        // const countPadding = ' '.repeat(this.terminalWidth - 2 - countLabel.length - countText.length);
        // const countLine = '║' + countLabel + '\x1b[32m' + countText + '\x1b[0m' + countPadding + '║';
        // console.log('\x1b[36m' + countLine + '\x1b[0m');
        
        // console.log('\x1b[36m' + bottomBorder + '\x1b[0m');
    }

    async drawFileList() {
        if (this.viewMode === 'grid') {
            await this.drawGridView();
        } else {
            this.drawListView();
        }
    }

    drawListView() {
        const startIndex = this.scrollOffset;
        const actualDisplayLines = Math.min(this.maxDisplayLines, this.files.length - this.scrollOffset);
        const endIndex = startIndex + actualDisplayLines;
        
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.files[i];
            const isSelected = i === this.selectedIndex;
            const prefix = isSelected ? '\x1b[7m▶ \x1b[0m' : '  ';
            const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
            
            if (item.type === 'directory') {
                const icon = '📁';
                const name = item.name;
                const typeLabel = '[DIR]';
                
                const iconWidth = 2;
                const prefixWidth = 2;
                const spaceWidth = 1;
                const typeLabelWidth = 5;
                
                const availableSpace = this.terminalWidth - prefixWidth - iconWidth - spaceWidth - typeLabelWidth;
                const displayName = name.length > availableSpace ? name.substring(0, availableSpace - 3) + '...' : name;
                const padding = ' '.repeat(Math.max(0, availableSpace - displayName.length));
                
                console.log(`${prefix}${color}${icon} ${displayName}${padding}${typeLabel}\x1b[0m`);
            } else {
                const icon = '📄';
                const name = item.name;
                const sizeStr = this.formatFileSize(item.size);
                const extStr = item.extension.toUpperCase();
                
                const iconWidth = 2;
                const prefixWidth = 2;
                const spaceWidth = 1;
                const parenthesesWidth = 2;
                const bracketsWidth = 2;
                
                const totalAvailable = this.terminalWidth - prefixWidth - iconWidth - spaceWidth - parenthesesWidth - bracketsWidth;
                const nameSpace = Math.floor(totalAvailable * 0.6);
                const sizeSpace = Math.floor(totalAvailable * 0.25);
                const extSpace = Math.floor(totalAvailable * 0.15);
                
                const displayName = name.length > nameSpace ? name.substring(0, nameSpace - 3) + '...' : name;
                const namePadding = ' '.repeat(Math.max(0, nameSpace - displayName.length));
                
                const displaySize = sizeStr.length > sizeSpace ? sizeStr.substring(0, sizeSpace - 3) + '...' : sizeStr;
                const sizePadding = ' '.repeat(Math.max(0, sizeSpace - displaySize.length));
                
                const displayExt = extStr.length > extSpace ? extStr.substring(0, extSpace - 3) + '...' : extStr;
                const extPadding = ' '.repeat(Math.max(0, extSpace - displayExt.length));
                
                console.log(`${prefix}${color}${icon} ${displayName}${namePadding} (${displaySize})${sizePadding} [${displayExt}]${extPadding}\x1b[0m`);
            }
        }
        
        const remainingSpace = this.maxDisplayLines - actualDisplayLines;
        if (this.files.length > this.maxDisplayLines && remainingSpace > 0) {
            let indicatorsShown = 0;
            if (this.scrollOffset > 0 && remainingSpace > indicatorsShown) {
                console.log('\x1b[90m↑ More items above\x1b[0m');
                indicatorsShown++;
            }
            if (endIndex < this.files.length && remainingSpace > indicatorsShown) {
                console.log('\x1b[90m↓ More items below\x1b[0m');
                indicatorsShown++;
            }
        }
    }

    async drawGridView() {
        const { columns, rows, gapWidth, totalWidth, totalHeight, itemWidth: tileWidth, itemHeight } = this.calculateGridDimensions();
        
        const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
        const actualVisibleRows = Math.min(maxVisibleRows, rows);
        
        const maxScrollRows = Math.max(0, rows - actualVisibleRows);
        const maxScrollOffset = maxScrollRows * columns;
        
        if (this.scrollOffset < 0) {
            this.scrollOffset = 0;
        }
        if (this.scrollOffset > maxScrollOffset) {
            this.scrollOffset = maxScrollOffset;
        }
        
        for (let i = 0; i < this.maxDisplayLines + 2; i++) {
            process.stdout.write(`\x1b[${i + 1};1H`);
            process.stdout.write(' '.repeat(this.terminalWidth));
        }
        process.stdout.write('\x1b[H');
        
        for (let row = 0; row < actualVisibleRows; row++) {
            const rowItems = [];
            for (let col = 0; col < columns; col++) {
                const index = row * columns + col + this.scrollOffset;
                
                if (index >= this.files.length) {
                    rowItems.push({ type: 'empty', width: tileWidth });
                    continue;
                }
                
                const item = this.files[index];
                const isSelected = index === this.selectedIndex;
                
                if (item.type === 'directory') {
                    const itemWidth = tileWidth;
                    const icon = '📁';
                    const name = item.name;
                    const displayName = name.length > itemWidth - 4 ? name.substring(0, itemWidth - 7) + '...' : name;
                    const padding = ' '.repeat(Math.max(0, itemWidth - displayName.length - 3));
                    const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                    // const displayText = isSelected ? `▶ ${icon} ${displayName}${padding}` : `  ${icon} ${displayName}${padding}`;
                    // const displayText = `${displayName}${padding}`;
                    const displayText = `\x1b]66;s=3;${item.name}\x07`;
                    
                    // rowItems.push({
                    //     type: 'directory',
                    //     content: `${color}${displayText}\x1b[0m`,
                    //     width: itemWidth
                    // });
                    const folderData = await this.generator.generate('src/assets/dir.svg', 32, 32);
        
                    const folderIcon = this.renderThumbnail(folderData, itemWidth, isSelected, item.name, this.useTripleText);
        

                    rowItems.push({
                        type: 'image',
                        content: folderIcon,
                        width: itemWidth,
                        name: displayText
                    });
                } else if (this.isMediaFile(item.name)) {
                    const itemWidth = tileWidth;
                    try {
                        const thumbnailData = await this.generateThumbnail(item.path);
                        if (thumbnailData && thumbnailData.length > 0) {
                            const thumbnailLines = this.renderThumbnail(thumbnailData, itemWidth, isSelected, item.name, this.useTripleText);
                            rowItems.push({
                                type: 'image',
                                content: thumbnailLines,
                                width: itemWidth,
                                name: item.name
                            });
                        } else {
                            const name = item.name;
                            const trimmed = name.length > itemWidth - 2 ? name.substring(0, itemWidth - 5) + '...' : name;
                            if (this.useTripleText) {
                                const leftPadding = Math.max(0, Math.floor((itemWidth - trimmed.length) / 2));
                                const rightPadding = Math.max(0, itemWidth - trimmed.length - leftPadding);
                                const oscTriple = `\x1b]66;s=3;${trimmed}\x07`;
                                rowItems.push({
                                    type: 'fallback',
                                    content: `${' '.repeat(leftPadding)}${oscTriple}${' '.repeat(rightPadding)}`,
                                    width: itemWidth
                                });
                            } else {
                                const icon = '📄';
                                const padding = ' '.repeat(Math.max(0, itemWidth - trimmed.length - 2));
                                const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                                const displayText = `  ${icon} ${trimmed}${padding}`;
                                rowItems.push({
                                    type: 'fallback',
                                    content: `${color}${displayText}\x1b[0m`,
                                    width: itemWidth
                                });
                            }
                        }
                    } catch (error) {
                        const icon = '📄';
                        const name = item.name;
                        const displayName = name.length > itemWidth - 6 ? name.substring(0, itemWidth - 7) + '...' : name;
                        const padding = ' '.repeat(Math.max(0, itemWidth - displayName.length - 2));
                        const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                        const displayText = isSelected ? `▶ ${icon} ${displayName}${padding}` : `  ${icon} ${displayName}${padding}`;
                        
                        rowItems.push({
                            type: 'fallback',
                            content: `${color}${displayText}\x1b[0m`,
                            width: itemWidth
                        });
                    }
                } else {
                    const itemWidth = tileWidth;
                    const name = item.name;
                    const trimmed = name.length > itemWidth - 2 ? name.substring(0, itemWidth - 5) + '...' : name;
                    if (this.useTripleText) {
                        const leftPadding = Math.max(0, Math.floor((itemWidth - trimmed.length) / 2));
                        const rightPadding = Math.max(0, itemWidth - trimmed.length - leftPadding);
                        const oscTriple = `\x1b]66;s=3;${trimmed}\x07`;
                        rowItems.push({
                            type: 'file',
                            content: `${' '.repeat(leftPadding)}${oscTriple}${' '.repeat(rightPadding)}`,
                            width: itemWidth
                        });
                    } else {
                        const icon = '📄';
                        const padding = ' '.repeat(Math.max(0, itemWidth - trimmed.length - 2));
                        const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                        const displayText = `  ${icon} ${trimmed}${padding}`;
                        rowItems.push({
                            type: 'file',
                            content: `${color}${displayText}\x1b[0m`,
                            width: itemWidth
                        });
                    }
                }
            }
            
            this.renderGridRow(rowItems, itemHeight, gapWidth);
        }
        
        if (maxScrollOffset > 0) {
            if (this.scrollOffset > 0) {
                console.log('\x1b[90m↑ More items above\x1b[0m');
            }
            if (this.scrollOffset < maxScrollOffset) {
                console.log('\x1b[90m↓ More items below\x1b[0m');
            }
        }
        
        if (this.scrollOffset > 0) {
            const scrollIndicator = `\x1b[90mScroll: ${Math.floor(this.scrollOffset / columns) + 1}/${Math.ceil(this.files.length / columns)}\x1b[0m`;
            if (scrollIndicator.length < this.terminalWidth) {
                console.log(scrollIndicator);
            }
        }
    }

    drawFooter() {
        const footerStartLine = this.terminalHeight - 5;
        process.stdout.write(`\x1b[${footerStartLine};1H`);
        
        const topBorder = '╔' + '═'.repeat(this.terminalWidth - 2) + '╗';
        const bottomBorder = '╚' + '═'.repeat(this.terminalWidth - 2) + '╝';
        
        console.log('\x1b[36m' + topBorder + '\x1b[0m');
        
        let navText;
        const viewModeText = `View: ${this.viewMode.toUpperCase()}`;
        if (this.viewMode === 'grid') {
            const scrollText = this.scrollMode ? '\x1b[1m\x1b[33m↑/↓ Scroll\x1b[0m' : '↑/↓ Select';
            const pageText = 'PgUp/PgDn: Scroll';
            const toggleText = this.scrollMode ? '\x1b[1m\x1b[33mS: Toggle Scroll\x1b[0m' : 'S: Toggle Scroll';
            
            if (this.mouseEnabled) {
                navText = `${viewModeText} | ${scrollText} ${pageText} ${toggleText} Mouse: Single-Click Select  Double-Click Open  Right-Click: Open  Scroll-Wheel: Scroll  V: Toggle View  Backspace: Back  Q: Quit  R: Refresh`;
            } else {
                navText = `${viewModeText} | ${scrollText} ${pageText} ${toggleText} Enter: Open  V: Toggle View  Backspace: Back  Q: Quit  R: Refresh`;
            }
        } else {
            if (this.mouseEnabled) {
                navText = `${viewModeText} | ↑/↓ Select  Mouse: Single-Click Select  Double-Click Open  Right-Click: Open  Scroll-Wheel: Scroll  V: Toggle View  Backspace: Back  Q: Quit  R: Refresh`;
            } else {
                navText = `${viewModeText} | ↑/↓ Select  Enter: Open  V: Toggle View  Backspace: Back  Q: Quit  R: Refresh`;
            }
        }
        
        const maxTextLength = this.terminalWidth - 4;
        if (navText.length > maxTextLength) {
            navText = navText.substring(0, maxTextLength - 3) + '...';
        }
        
        const navPadding = Math.floor((this.terminalWidth - 2 - navText.length) / 2);
        const remainingSpace = this.terminalWidth - 2 - navText.length - navPadding;
        const navLine = '║' + ' '.repeat(Math.max(0, navPadding)) + '\x1b[90m' + navText + '\x1b[0m' + ' '.repeat(Math.max(0, remainingSpace)) + '║';
        console.log('\x1b[36m' + navLine + '\x1b[0m');

        const dirLabel = 'Directory: ';
        const dirText = this.currentDirectory;
        const maxDirLength = this.terminalWidth - 4 - dirLabel.length;
        const displayDir = dirText.length > maxDirLength ? '...' + dirText.slice(-maxDirLength + 3) : dirText;
        const dirPadding = ' '.repeat(this.terminalWidth - 2 - dirLabel.length - displayDir.length);
        const dirLine = '║' + dirLabel + '\x1b[33m' + displayDir + '\x1b[0m' + dirPadding + '║';
        console.log('\x1b[36m' + dirLine + '\x1b[0m');
        
        const countLabel = 'Items found: ';
        const countText = this.files.length.toString();
        const countPadding = ' '.repeat(this.terminalWidth - 2 - countLabel.length - countText.length);
        const countLine = '║' + countLabel + '\x1b[32m' + countText + '\x1b[0m' + countPadding + '║';
        console.log('\x1b[36m' + countLine + '\x1b[0m');
        
        if (this.viewMode === 'grid' && this.scrollMode && this.files.length > 0) {
            const { columns } = this.calculateGridDimensions();
            if (this.files.length > this.maxDisplayLines * columns) {
                const totalRows = Math.ceil(this.files.length / columns);
                const currentRow = Math.floor(this.scrollOffset / columns);
                const visibleRows = this.maxDisplayLines;
                const progress = Math.min(100, Math.max(0, (currentRow / (totalRows - visibleRows)) * 100));
                const barLength = Math.min(30, this.terminalWidth - 20);
                const filledLength = Math.floor((progress / 100) * barLength);
                const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
                const scrollText = `Scroll: [${bar}] ${Math.round(progress)}% (${currentRow + 1}/${totalRows})`;
                const scrollPadding = ' '.repeat(Math.max(0, this.terminalWidth - 2 - scrollText.length));
                const scrollLine = '║' + '\x1b[33m' + scrollText + '\x1b[0m' + scrollPadding + '║';
                console.log('\x1b[36m' + scrollLine + '\x1b[0m');
            }
        }
        
        console.log('\x1b[36m' + bottomBorder + '\x1b[0m');
    }

    async render() {
        this.clearScreen();
        this.drawHeader();
        await this.drawFileList();
        this.drawFooter();

        process.stdout.write('\x1b[H');
    }

    async renderWithClear() {
        this.clearDisplayArea();
        
        process.stdout.write('\x1b[H');
        
        this.drawHeader();
        await this.drawFileList();
        this.drawFooter();

        process.stdout.write('\x1b[H');
    }

    async moveSelection(direction) {
        if (this.viewMode === 'grid') {
            await this.moveSelectionGrid(direction);
        } else {
            await this.moveSelectionList(direction);
        }
    }

    async moveSelectionList(direction) {
        const newIndex = this.selectedIndex + direction;
        if (newIndex >= 0 && newIndex < this.files.length) {
            this.selectedIndex = newIndex;
            
            if (this.selectedIndex < this.scrollOffset) {
                this.scrollOffset = this.selectedIndex;
            } else if (this.selectedIndex >= this.scrollOffset + this.maxDisplayLines) {
                this.scrollOffset = this.selectedIndex - this.maxDisplayLines + 1;
            }
            
            await this.render();
        }
    }

    async moveSelectionGrid(direction) {
        const { columns, rows, itemHeight } = this.calculateGridDimensions();
        const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
        const actualVisibleRows = Math.min(maxVisibleRows, rows);
        
        let newIndex = this.selectedIndex;
        
        if (direction === -1) { // Up
            newIndex = Math.max(0, this.selectedIndex - columns);
        } else if (direction === 1) { // Down
            newIndex = Math.min(this.files.length - 1, this.selectedIndex + columns);
        } else if (direction === -2) { // Left
            newIndex = Math.max(0, this.selectedIndex - 1);
        } else if (direction === 2) { // Right
            newIndex = Math.min(this.files.length - 1, this.selectedIndex + 1);
        }
        
        if (newIndex !== this.selectedIndex && newIndex >= 0 && newIndex < this.files.length) {
            this.selectedIndex = newIndex;
            
            const currentVisibleRow = Math.floor((this.selectedIndex - this.scrollOffset) / columns);
            
            if (currentVisibleRow < 0) {
                this.scrollOffset = this.selectedIndex;
            } else if (currentVisibleRow >= actualVisibleRows) {
                this.scrollOffset = Math.max(0, this.selectedIndex - (actualVisibleRows - 1) * columns);
            }
            
            await this.renderWithClear();
        }
    }

    async scrollGrid(direction) {
        const { columns, rows, itemHeight } = this.calculateGridDimensions();
        const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
        const actualVisibleRows = Math.min(maxVisibleRows, rows);
        const maxScrollRows = Math.max(0, rows - actualVisibleRows);
        const maxScrollOffset = maxScrollRows * columns;
        
        const scrollAmount = columns;
        
        if (direction === -1) {
            this.scrollOffset = Math.max(0, this.scrollOffset - scrollAmount);
        } else {
            this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + scrollAmount);
        }
        
        const maxVisibleIndex = this.scrollOffset + (this.maxDisplayLines * columns) - 1;
        const minVisibleIndex = this.scrollOffset;
        
        if (this.selectedIndex < minVisibleIndex) {
            this.selectedIndex = minVisibleIndex;
        } else if (this.selectedIndex > maxVisibleIndex) {
            this.selectedIndex = maxVisibleIndex;
        }
        
        await this.renderWithClear();
        
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    async viewSelectedFile() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        
        if (selectedItem.type === 'directory') {
            this.navigateToDirectory(selectedItem.path);
        } else if (this.isMediaFile(selectedItem.name)) {
            await this.openImageViewer(selectedItem.path);
        }
    }

    async openImageViewer(imagePath) {
        const imageFiles = this.files
            .filter(item => item.type === 'file' && this.isMediaFile(item.name))
            .map(item => item.path);
        
        const currentIndex = imageFiles.indexOf(imagePath);
        
        if (currentIndex === -1) {
            console.log('Image not found in current directory.');
            return;
        }
        
        const gallery = new ImageGallerySlider(imageFiles, currentIndex, this.generator);
        
        this.activeGallery = gallery;
        
        await new Promise((resolve) => {
            gallery.onExit = () => {
                this.activeGallery = null;
                this.setupInput();
                resolve();
            };
            gallery.start();
        });
        
        await this.render();
    }

    async navigateToDirectory(dirPath) {
        this.currentDirectory = dirPath;
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.files = this.getMediaFiles();
        await this.render();
    }

    async refresh() {
        this.files = this.getMediaFiles();
        this.selectedIndex = Math.min(this.selectedIndex, this.files.length - 1);
        this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.files.length - this.maxDisplayLines));
        await this.render();
    }

    async toggleViewMode() {
        this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
        this.scrollOffset = 0;
        await this.render();
    }

    async toggleScrollMode() {
        this.scrollMode = !this.scrollMode;
        await this.render();
    }

    setupInput() {
        process.stdin.removeAllListeners('data');
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        if (!this.disableMouse) {
            process.stdout.write('\x1b[?1000h');
            process.stdout.write('\x1b[?1002h');
            this.mouseEnabled = true;
        }

        const handleKey = async (key) => {
            if (key === '\u0003') { // Ctrl+C
                this.quit();
            } else if (key === 'q' || key === 'Q') {
                this.quit();
            } else if (key === '\u001b[A') { // Up arrow
                if (this.viewMode === 'grid' && this.scrollMode) {
                    await this.scrollGrid(-1);
                } else {
                    await this.moveSelection(-1);
                }
            } else if (key === '\u001b[B') { // Down arrow
                if (this.viewMode === 'grid' && this.scrollMode) {
                    await this.scrollGrid(1);
                } else {
                    await this.moveSelection(1);
                }
            } else if (key === '\u001b[D') { // Left arrow
                if (this.viewMode === 'grid') {
                    await this.moveSelection(-2);
                }
            } else if (key === '\u001b[C') { // Right arrow
                if (this.viewMode === 'grid') {
                    await this.moveSelection(2);
                }
            } else if (key === '\u001b[5~') { // Page Up
                if (this.viewMode === 'grid') {
                    await this.scrollGrid(-1);
                }
            } else if (key === '\u001b[6~') { // Page Down
                if (this.viewMode === 'grid') {
                    await this.scrollGrid(1);
                }
            } else if (key === '\r' || key === '\n') { // Enter
                await this.handleEnterKey();
            } else if (key === 'r' || key === 'R') {
                await this.refresh();
            } else if (key === 'v' || key === 'V') { // Toggle view mode
                await this.toggleViewMode();
            } else if (key === 's' || key === 'S') { // Toggle scroll mode
                await this.toggleScrollMode();
            } else if (key === '\u0008' || key === '\u007f') { // Backspace
                await this.goBack();
            } else if (this.mouseEnabled && key.startsWith('\x1b[M')) { // Mouse event
                await this.handleMouseEvent(key);
            } else if (this.mouseEnabled && key.startsWith('\x1b[') && key.includes('M')) {
                // Alternative mouse event format
                await this.handleMouseEvent(key);
            } else if (this.mouseEnabled && key.startsWith('\x1b[') && key.includes('t')) {
                // Mouse movement events (optional hover support)
                await this.handleMouseMovement(key);
            } else if (this.mouseEnabled && key.startsWith('\x1b[') && key.includes('A')) {
                // Scroll wheel events in some terminals
                await this.handleMouseEvent(key);
            } else if (this.mouseEnabled && key.length > 1 && key.charCodeAt(0) === 27) {
                await this.handleMouseEvent(key);
            }
        };

        process.stdin.on('data', handleKey);
    }

    async handleMouseEvent(data) {
        try {
            let button, x, y;
             
            if (data.startsWith('\x1b[M')) {
                button = data.charCodeAt(3) - 32;
                x = data.charCodeAt(4) - 32;
                y = data.charCodeAt(5) - 32;
            } else if (data.startsWith('\x1b[') && data.includes('M')) {
                const parts = data.slice(2, -1).split(';');
                if (parts.length >= 3) {
                    button = parseInt(parts[0]) - 32;
                    x = parseInt(parts[1]) - 32;
                    y = parseInt(parts[2]) - 32;
                } else {
                    return;
                }
            } else {
                if (data.length >= 6) {
                    button = data.charCodeAt(3) - 32;
                    x = data.charCodeAt(4) - 32;
                    y = data.charCodeAt(5) - 32;
                } else {
                    return;
                }
            }
            
            // (button 64 = scroll up, button 65 = scroll down)
            // alternative formats: 96 = scroll up, 97 = scroll down
            if (button === 64 || button === 65 || button === 96 || button === 97) {
                const isScrollUp = (button === 64 || button === 96);
                await this.handleScrollWheel(isScrollUp ? -1 : 1);
                return;
            }
            
            const adjustedY = y - 1;
            const headerHeight = 0;
            
            if ((button === 0 || button === 3) && adjustedY >= headerHeight && adjustedY < headerHeight + this.maxDisplayLines) {
                let listIndex;
                let clickedOnPreview = false;
                let clickedOnFilename = false;
                
                if (this.viewMode === 'grid') {
                    const { columns, gapWidth } = this.calculateGridDimensions();
                    const minImageWidth = 32;
                    const minOtherWidth = 20;
                    const availableWidth = this.terminalWidth - 2 - (gapWidth * (columns - 1));
                    const baseItemWidth = Math.floor(availableWidth / columns);
                    const itemHeight = 17;
                    
                    const row = Math.floor((adjustedY - headerHeight) / itemHeight);
                    let col = 0;
                    let currentX = 1;
                    
                    for (let c = 0; c < columns; c++) {
                        const itemWidth = Math.max(c === 0 ? minImageWidth : minOtherWidth, baseItemWidth);
                        if (x >= currentX && x < currentX + itemWidth) {
                            col = c;
                            break;
                        }
                        currentX += itemWidth + gapWidth;
                    }
                    
                    listIndex = (row + this.scrollOffset) * columns + col;
                    
                    if (listIndex >= 0 && listIndex < this.files.length) {
                        const relativeY = (adjustedY - headerHeight) % itemHeight;
                        
                        if (relativeY >= 15) {
                            clickedOnFilename = true;
                        } else if (relativeY >= 0 && relativeY < 16) {
                            clickedOnPreview = true;
                        }
                    }
                } else {
                    listIndex = adjustedY - headerHeight + this.scrollOffset;
                    clickedOnFilename = true;
                }
                
                if (listIndex >= 0 && listIndex < this.files.length) {
                    const wasSelected = this.selectedIndex === listIndex;
                    this.selectedIndex = listIndex;
                    
                    if (!wasSelected) {
                        await this.render();
                    }
                    
                    if (button === 0) {
                        await this.handleLeftMouseClick();
                    } else if (button === 3) {
                        const selectedItem = this.files[this.selectedIndex];
                        if (selectedItem.type === 'directory') {
                            await this.navigateToDirectory(selectedItem.path);
                        } else {
                            this.viewSelectedFile();
                        }
                    }
                }
            }
        } catch (error) {
            console.log(`\nMouse event parsing error: ${error.message}`);
            await this.render();
        }
    }

    async handleMouseMovement(data) {
        try {
            const parts = data.slice(2, -1).split(';');
            if (parts.length >= 2) {
                const x = parseInt(parts[0]) - 32;
                const y = parseInt(parts[1]) - 32;
                
                const adjustedY = y - 1;
                const headerHeight = 5;
                
                if (adjustedY >= headerHeight && adjustedY < headerHeight + this.maxDisplayLines) {
                    let hoverIndex;
                    
                    if (this.viewMode === 'grid') {
                        const { columns, gapWidth } = this.calculateGridDimensions();
                        const minImageWidth = 32;
                        const minOtherWidth = 20;
                        const availableWidth = this.terminalWidth - 2 - (gapWidth * (columns - 1));
                        const baseItemWidth = Math.floor(availableWidth / columns);
                        const itemHeight = 17;
                        
                        const row = Math.floor((adjustedY - headerHeight) / itemHeight);
                        let col = 0;
                        let currentX = 1;
                        
                        for (let c = 0; c < columns; c++) {
                            const itemWidth = Math.max(c === 0 ? minImageWidth : minOtherWidth, baseItemWidth);
                            if (x >= currentX && x < currentX + itemWidth) {
                                col = c;
                                break;
                            }
                            currentX += itemWidth + gapWidth;
                        }
                        
                        hoverIndex = (row + this.scrollOffset) * columns + col;
                    } else {
                        hoverIndex = adjustedY - headerHeight + this.scrollOffset;
                    }
                    
                    if (hoverIndex >= 0 && hoverIndex < this.files.length && hoverIndex !== this.hoverIndex) {
                        this.hoverIndex = hoverIndex;
                        this.showHoverInfo(hoverIndex);
                    }
                }
            }
        } catch (error) {
        }
    }

    showHoverInfo(index) {
        const item = this.files[index];
        if (item) {
            const infoLine = this.terminalHeight - 4;
            process.stdout.write(`\x1b[${infoLine};1H`);
            
            let info = '';
            if (item.type === 'directory') {
                info = `📁 ${item.name} [Directory]`;
            } else {
                info = `📄 ${item.name} (${this.formatFileSize(item.size)}) [${item.extension.toUpperCase()}]`;
            }
            
            const maxLength = this.terminalWidth - 2;
            if (info.length > maxLength) {
                info = info.substring(0, maxLength - 3) + '...';
            }
            
            process.stdout.write(`\x1b[90m${info}\x1b[0m`);
            
            setTimeout(() => {
                if (this.hoverIndex === index) {
                    process.stdout.write(`\x1b[${infoLine};1H`);
                    process.stdout.write(' '.repeat(info.length));
                }
            }, 2000);
        }
    }

    async handleScrollWheel(direction) {
        if (this.viewMode === 'grid') {
            const { columns, rows, itemHeight } = this.calculateGridDimensions();
            const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
            const actualVisibleRows = Math.min(maxVisibleRows, rows);
            const maxScrollRows = Math.max(0, rows - actualVisibleRows);
            const maxScrollOffset = maxScrollRows * columns;
            
            const scrollAmount = columns;
            
            if (direction === -1) {
                this.scrollOffset = Math.max(0, this.scrollOffset - scrollAmount);
            } else {
                this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + scrollAmount);
            }
            
            const maxVisibleIndex = this.scrollOffset + (this.maxDisplayLines * columns) - 1;
            const minVisibleIndex = this.scrollOffset;
            
            if (this.selectedIndex < minVisibleIndex) {
                this.selectedIndex = minVisibleIndex;
            } else if (this.selectedIndex > maxVisibleIndex) {
                this.selectedIndex = maxVisibleIndex;
            }
            
            await this.renderWithClear();
        } else {
            if (direction === -1) {
                this.scrollOffset = Math.max(0, this.scrollOffset - 1);
            } else {
                const maxScrollOffset = Math.max(0, this.files.length - this.maxDisplayLines);
                this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + 1);
            }
            
            const maxVisibleIndex = this.scrollOffset + this.maxDisplayLines - 1;
            const minVisibleIndex = this.scrollOffset;
            
            if (this.selectedIndex < minVisibleIndex) {
                this.selectedIndex = minVisibleIndex;
            } else if (this.selectedIndex > maxVisibleIndex) {
                this.selectedIndex = maxVisibleIndex;
            }
            
            await this.renderWithClear();
        }
    }

    async handleLeftMouseClick() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        const currentTime = Date.now();
        
        if (this.lastClickTarget === selectedItem.path && 
            (currentTime - this.lastClickTime) < this.doubleClickThreshold) {
            this.lastClickTime = 0;
            this.lastClickTarget = null;
            
            if (selectedItem.type === 'directory') {
                await this.navigateToDirectory(selectedItem.path);
            } else {
                await this.viewSelectedFile();
            }
        } else {
            this.lastClickTime = currentTime;
            this.lastClickTarget = selectedItem.path;
        }
    }

    handleMouseClick() {
        this.handleLeftMouseClick();
    }

    async handleEnterKey() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        const currentTime = Date.now();
        
        if (this.lastClickTarget === selectedItem.path && 
            (currentTime - this.lastClickTime) < this.doubleClickThreshold) {
            this.lastClickTime = 0;
            this.lastClickTarget = null;
            
            if (selectedItem.type === 'directory') {
                await this.navigateToDirectory(selectedItem.path);
            } else {
                await this.viewSelectedFile();
            }
        } else {
            this.lastClickTime = currentTime;
            this.lastClickTarget = selectedItem.path;

            await this.render();
        }
    }

    async goBack() {
        const parentDir = path.dirname(this.currentDirectory);
        if (parentDir !== this.currentDirectory) {
            this.currentDirectory = parentDir;
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            this.files = this.getMediaFiles();
            await this.render();
        }
    }

    quit() {
        if (isKitty) {
            setFontSize(9);
        }
        if (this.mouseEnabled) {
            process.stdout.write('\x1b[?1000l');
            process.stdout.write('\x1b[?1002l');
        }
        process.stdout.write('\x1b[?25h');
        process.stdin.setRawMode(false);
        this.rl.close();
        this.clearScreen();
        console.log('\x1b[36mGoodbye! 👋\x1b[0m\n');
        process.exit(0);
    }

    async start() {
        this.files = this.getMediaFiles();
        await this.render();
        this.setupInput();
        
        process.on('exit', () => {
            process.stdout.write('\x1b[?25h');
        });
        
        process.on('SIGINT', () => {
            if (this.mouseEnabled) {
                process.stdout.write('\x1b[?1000l');
                process.stdout.write('\x1b[?1002l');
            }
            process.stdout.write('\x1b[?25h');
            process.exit(0);
        });
    }
}

module.exports = { TerminalGUI };

if (require.main === module) {
    const gui = new TerminalGUI();
    gui.start().catch(error => {
        console.error('Error starting GUI:', error);
        process.exit(1);
    });
}
