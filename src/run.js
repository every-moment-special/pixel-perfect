const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Generator } = require('./generate');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga', '.svg'];

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

        // this.folderIcon = this.generator.generate(directoryIconData, 32, 32);
        
        process.stdout.write('\x1b[?25l');
        
        process.stdout.on('resize', async () => {
            this.terminalWidth = process.stdout.columns || 80;
            this.terminalHeight = process.stdout.rows || 24;
            this.terminalWidth = Math.max(this.terminalWidth, 40);
            this.terminalHeight = Math.max(this.terminalHeight, 15);
            this.maxDisplayLines = Math.max(1, this.terminalHeight - 5);
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
                // Skip . and .. directories
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

    renderThumbnail(thumbnailData, itemWidth, isSelected, filename) {
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
            const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[90m';
            const leftPadding = Math.floor((itemWidth - displayName.length) / 2);
            const rightPadding = itemWidth - displayName.length - leftPadding;
            lines.push(`${color}${' '.repeat(leftPadding)}${displayName}${' '.repeat(rightPadding)}\x1b[0m`);
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
        
        // Calculate how many items we can fit horizontally
        const columns = Math.floor(availableWidth / (minImageWidth + gapWidth));
        const actualColumns = Math.max(1, columns);
        
        // Calculate total rows needed based on actual item count
        const rows = Math.ceil(this.files.length / actualColumns);
        
        // Calculate actual space used
        const totalWidth = (actualColumns * minImageWidth) + ((actualColumns - 1) * gapWidth);
        const totalHeight = rows * 17; // 17 lines per item (16 for image + 1 for filename)
        
        return { 
            columns: actualColumns, 
            rows, 
            gapWidth,
            totalWidth,
            totalHeight,
            itemWidth: minImageWidth,
            itemHeight: 17
        };
    }

    clearScreen() {
        process.stdout.write('\x1b[3J\x1b[H');
    }

    clearDisplayArea() {
        // Clear only the display area (not the footer)
        const displayHeight = this.maxDisplayLines + 2; // +2 for potential scroll indicators and header
        for (let i = 0; i < displayHeight; i++) {
            process.stdout.write(`\x1b[${i + 1};1H`);
            process.stdout.write(' '.repeat(this.terminalWidth));
        }
        process.stdout.write('\x1b[H');
    }

    forceClearScreen() {
        // More aggressive screen clearing
        process.stdout.write('\x1b[2J\x1b[H'); // Clear entire screen and move cursor to top
        process.stdout.write('\x1b[3J\x1b[H'); // Clear scrollback buffer
        process.stdout.write('\x1b[H'); // Ensure cursor is at top
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
        const { columns, rows, gapWidth, totalWidth, totalHeight, itemWidth, itemHeight } = this.calculateGridDimensions();
        
        const minImageWidth = 32;
        const baseItemWidth = 32;
        
        // Calculate how many rows we can actually display
        const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
        const actualVisibleRows = Math.min(maxVisibleRows, rows);
        
        // Calculate scroll bounds based on actual space
        const maxScrollRows = Math.max(0, rows - actualVisibleRows);
        const maxScrollOffset = maxScrollRows * columns;
        
        // Ensure scroll offset is within bounds
        if (this.scrollOffset < 0) {
            this.scrollOffset = 0;
        }
        if (this.scrollOffset > maxScrollOffset) {
            this.scrollOffset = maxScrollOffset;
        }
        
        // Clear the display area first to prevent visual artifacts
        for (let i = 0; i < this.maxDisplayLines + 2; i++) {
            process.stdout.write(`\x1b[${i + 1};1H`);
            process.stdout.write(' '.repeat(this.terminalWidth));
        }
        process.stdout.write('\x1b[H');
        
        // Render only the rows that fit in the available space
        for (let row = 0; row < actualVisibleRows; row++) {
            const rowItems = [];
            for (let col = 0; col < columns; col++) {
                const index = row * columns + col + this.scrollOffset;
                
                if (index >= this.files.length) {
                    rowItems.push({ type: 'empty', width: baseItemWidth });
                    continue;
                }
                
                const item = this.files[index];
                const isSelected = index === this.selectedIndex;
                
                if (item.type === 'directory') {
                    // const itemWidth = Math.max(minOtherWidth, baseItemWidth);
                    const itemWidth = Math.max(minImageWidth, baseItemWidth);
                    const icon = '📁';
                    const name = item.name;
                    const displayName = name.length > itemWidth - 4 ? name.substring(0, itemWidth - 7) + '...' : name;
                    const padding = ' '.repeat(Math.max(0, itemWidth - displayName.length - 3));
                    const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                    // const displayText = isSelected ? `▶ ${icon} ${displayName}${padding}` : `  ${icon} ${displayName}${padding}`;
                    const displayText = `${displayName}${padding}`;
                    
                    // rowItems.push({
                    //     type: 'directory',
                    //     content: `${color}${displayText}\x1b[0m`,
                    //     width: itemWidth
                    // });
                    const folderData = await this.generator.generate('src/assets/dir.svg', 32, 32);
        
                    const folderIcon = this.renderThumbnail(folderData, itemWidth, isSelected, item.name);
        

                    rowItems.push({
                        type: 'image',
                        content: folderIcon,
                        width: itemWidth,
                        name: displayName
                    });
                } else if (this.isMediaFile(item.name)) {
                    const itemWidth = Math.max(minImageWidth, baseItemWidth);
                    try {
                        const thumbnailData = await this.generateThumbnail(item.path);
                        if (thumbnailData && thumbnailData.length > 0) {
                            const thumbnailLines = this.renderThumbnail(thumbnailData, itemWidth, isSelected, item.name);
                            rowItems.push({
                                type: 'image',
                                content: thumbnailLines,
                                width: itemWidth,
                                name: item.name
                            });
                        } else {
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
                    const itemWidth = Math.max(minOtherWidth, baseItemWidth);
                    const icon = '📄';
                    const name = item.name;
                    const displayName = name.length > itemWidth - 4 ? name.substring(0, itemWidth - 7) + '...' : name;
                    const padding = ' '.repeat(Math.max(0, itemWidth - displayName.length - 2));
                    const color = isSelected ? '\x1b[1m\x1b[36m' : '\x1b[0m';
                    const displayText = isSelected ? `▶ ${icon} ${displayName}${padding}` : `  ${icon} ${displayName}${padding}`;
                    
                    rowItems.push({
                        type: 'file',
                        content: `${color}${displayText}\x1b[0m`,
                        width: itemWidth
                    });
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
        
        // Ensure proper positioning after scroll
        if (this.scrollOffset > 0) {
            // Add a small visual indicator for scroll position
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
        
        // Show scroll position indicator in footer
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
        // Clear the display area more thoroughly to prevent artifacts
        this.clearDisplayArea();
        
        // Ensure cursor is at the top
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
            
            // Use renderWithClear for consistent position updates
            await this.renderWithClear();
        }
    }

    async scrollGrid(direction) {
        const { columns, rows, itemHeight } = this.calculateGridDimensions();
        const maxVisibleRows = Math.floor(this.maxDisplayLines / itemHeight);
        const actualVisibleRows = Math.min(maxVisibleRows, rows);
        const maxScrollRows = Math.max(0, rows - actualVisibleRows);
        const maxScrollOffset = maxScrollRows * columns;
        
        const scrollAmount = columns; // Scroll by one row
        
        if (direction === -1) { // Scroll up
            this.scrollOffset = Math.max(0, this.scrollOffset - scrollAmount);
        } else { // Scroll down
            this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + scrollAmount);
        }
        
        // Adjust selected index if it's no longer visible
        const maxVisibleIndex = this.scrollOffset + (this.maxDisplayLines * columns) - 1;
        const minVisibleIndex = this.scrollOffset;
        
        if (this.selectedIndex < minVisibleIndex) {
            this.selectedIndex = minVisibleIndex;
        } else if (this.selectedIndex > maxVisibleIndex) {
            this.selectedIndex = maxVisibleIndex;
        }
        
        // Use renderWithClear for smoother scrolling with position updates
        await this.renderWithClear();
        
        // Small delay for visual feedback during scroll
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    viewSelectedFile() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        
        if (selectedItem.type === 'directory') {
            this.navigateToDirectory(selectedItem.path);
        } else {
            // console.log(`\n\x1b[33mOpening: ${selectedItem.name}\x1b[0m`);
            
            // console.log(`\x1b[36mFile Details:\x1b[0m`);
            // console.log(`  Name: ${selectedItem.name}`);
            // console.log(`  Size: ${this.formatFileSize(selectedItem.size)}`);
            // console.log(`  Type: ${selectedItem.extension.toUpperCase()}`);
            // console.log(`  Path: ${selectedItem.path}`);
            
            // console.log('\n\x1b[90mPress any key to continue...\x1b[0m');
            // this.rl.question('', () => {
            //     this.render();
            // });
        }
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
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        if (!this.disableMouse) {
            process.stdout.write('\x1b[?1000h');
            process.stdout.write('\x1b[?1002h');
            this.mouseEnabled = true;
        }

        process.stdin.on('data', async (key) => {
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
        });
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
            
            // Handle scroll wheel events (button 64 = scroll up, button 65 = scroll down)
            // Also handle alternative formats: 96 = scroll up, 97 = scroll down
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
            
            const scrollAmount = columns; // Scroll by one row
            
            if (direction === -1) { // Scroll up
                this.scrollOffset = Math.max(0, this.scrollOffset - scrollAmount);
            } else { // Scroll down
                this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + scrollAmount);
            }
            
            // Adjust selected index if it's no longer visible
            const maxVisibleIndex = this.scrollOffset + (this.maxDisplayLines * columns) - 1;
            const minVisibleIndex = this.scrollOffset;
            
            if (this.selectedIndex < minVisibleIndex) {
                this.selectedIndex = minVisibleIndex;
            } else if (this.selectedIndex > maxVisibleIndex) {
                this.selectedIndex = maxVisibleIndex;
            }
            
            // Use renderWithClear for smoother scrolling with proper position updates
            await this.renderWithClear();
        } else {
            // For list view, scroll by one item
            if (direction === -1) { // Scroll up
                this.scrollOffset = Math.max(0, this.scrollOffset - 1);
            } else { // Scroll down
                const maxScrollOffset = Math.max(0, this.files.length - this.maxDisplayLines);
                this.scrollOffset = Math.min(maxScrollOffset, this.scrollOffset + 1);
            }
            
            // Adjust selected index if it's no longer visible
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
                this.viewSelectedFile();
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
                this.viewSelectedFile();
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

// Export the class for testing
module.exports = { TerminalGUI };

const gui = new TerminalGUI();
gui.start().catch(error => {
    console.error('Error starting GUI:', error);
    process.exit(1);
});
