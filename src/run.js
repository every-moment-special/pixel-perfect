const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga'];

class TerminalGUI {
    constructor() {
        this.currentDirectory = process.cwd();
        this.files = [];
        this.selectedIndex = 0;
        this.scrollOffset = 0;

        this.terminalWidth = process.stdout.columns || 80;
        this.terminalHeight = process.stdout.rows || 24;
        
        this.terminalWidth = Math.max(this.terminalWidth, 40);
        this.terminalHeight = Math.max(this.terminalHeight, 15);
        
        this.maxDisplayLines = Math.max(1, this.terminalHeight - 8);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        // Mouse click tracking
        this.lastClickTime = 0;
        this.lastClickTarget = null;
        this.doubleClickThreshold = 500; // milliseconds
        this.mouseEnabled = false;
        
        process.stdout.write('\x1b[?25l');
        
        process.stdout.on('resize', () => {
            this.terminalWidth = process.stdout.columns || 80;
            this.terminalHeight = process.stdout.rows || 24;
            this.terminalWidth = Math.max(this.terminalWidth, 40);
            this.terminalHeight = Math.max(this.terminalHeight, 15);
            this.maxDisplayLines = Math.max(1, this.terminalHeight - 8);
            this.render();
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

    clearScreen() {
        process.stdout.write('\x1b[3J\x1b[H');
    }

    drawHeader() {
        const topBorder = '╔' + '═'.repeat(this.terminalWidth - 2) + '╗';
        const bottomBorder = '╚' + '═'.repeat(this.terminalWidth - 2) + '╝';
        
        console.log('\x1b[36m' + topBorder + '\x1b[0m');
        
        const title = 'Media Files Browser';
        const titlePadding = Math.floor((this.terminalWidth - 2 - title.length) / 2);
        const titleLine = '║' + ' '.repeat(titlePadding) + '\x1b[1m' + title + '\x1b[0m' + ' '.repeat(this.terminalWidth - 2 - title.length - titlePadding) + '║';
        console.log('\x1b[36m' + titleLine + '\x1b[0m');
        
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
        
        console.log('\x1b[36m' + bottomBorder + '\x1b[0m');
    }

    drawFileList() {
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

    drawFooter() {
        const footerStartLine = this.terminalHeight - 3;
        process.stdout.write(`\x1b[${footerStartLine};1H`);
        
        const topBorder = '╔' + '═'.repeat(this.terminalWidth - 2) + '╗';
        const bottomBorder = '╚' + '═'.repeat(this.terminalWidth - 2) + '╝';
        
        console.log('\x1b[36m' + topBorder + '\x1b[0m');
        
        const navText = 'Navigation: ↑/↓ Select  Mouse: Click  Double-Click: Open  Backspace: Back  Q: Quit  R: Refresh';
        const navPadding = Math.floor((this.terminalWidth - 2 - navText.length) / 2);
        const navLine = '║' + ' '.repeat(navPadding) + '\x1b[90m' + navText + '\x1b[0m' + ' '.repeat(this.terminalWidth - 2 - navText.length - navPadding) + '║';
        console.log('\x1b[36m' + navLine + '\x1b[0m');
        
        console.log('\x1b[36m' + bottomBorder + '\x1b[0m');
    }

    render() {
        this.clearScreen();
        this.drawHeader();
        this.drawFileList();
        this.drawFooter();

        process.stdout.write('\x1b[H');
    }

    moveSelection(direction) {
        const newIndex = this.selectedIndex + direction;
        if (newIndex >= 0 && newIndex < this.files.length) {
            this.selectedIndex = newIndex;
            
            if (this.selectedIndex < this.scrollOffset) {
                this.scrollOffset = this.selectedIndex;
            } else if (this.selectedIndex >= this.scrollOffset + this.maxDisplayLines) {
                this.scrollOffset = this.selectedIndex - this.maxDisplayLines + 1;
            }
            
            this.render();
        }
    }

    viewSelectedFile() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        
        if (selectedItem.type === 'directory') {
            this.navigateToDirectory(selectedItem.path);
        } else {
            console.log(`\n\x1b[33mOpening: ${selectedItem.name}\x1b[0m`);
            
            console.log(`\x1b[36mFile Details:\x1b[0m`);
            console.log(`  Name: ${selectedItem.name}`);
            console.log(`  Size: ${this.formatFileSize(selectedItem.size)}`);
            console.log(`  Type: ${selectedItem.extension.toUpperCase()}`);
            console.log(`  Path: ${selectedItem.path}`);
            
            console.log('\n\x1b[90mPress any key to continue...\x1b[0m');
            this.rl.question('', () => {
                this.render();
            });
        }
    }

    navigateToDirectory(dirPath) {
        this.currentDirectory = dirPath;
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.files = this.getMediaFiles();
        this.render();
    }

    refresh() {
        this.files = this.getMediaFiles();
        this.selectedIndex = Math.min(this.selectedIndex, this.files.length - 1);
        this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.files.length - this.maxDisplayLines));
        this.render();
    }

    setupInput() {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        process.stdout.write('\x1b[?1000h');
        this.mouseEnabled = true;

        process.stdin.on('data', (key) => {
            if (key === '\u0003') { // Ctrl+C
                this.quit();
            } else if (key === 'q' || key === 'Q') {
                this.quit();
            } else if (key === '\u001b[A') { // Up arrow
                this.moveSelection(-1);
            } else if (key === '\u001b[B') { // Down arrow
                this.moveSelection(1);
            } else if (key === '\r' || key === '\n') { // Enter
                this.handleEnterKey();
            } else if (key === 'r' || key === 'R') {
                this.refresh();
            } else if (key === '\u0008' || key === '\u007f') { // Backspace
                this.goBack();
            } else if (key.startsWith('\x1b[M')) { // Mouse event
                this.handleMouseEvent(key);
            }
        });
    }

    handleMouseEvent(data) {
        const button = data.charCodeAt(3) - 32;
        const x = data.charCodeAt(4) - 32;
        const y = data.charCodeAt(5) - 32;
        
        const adjustedY = y - 1;
        const headerHeight = 5;
        
        if (button === 0 && adjustedY >= headerHeight && adjustedY < headerHeight + this.maxDisplayLines) {
            const listIndex = adjustedY - headerHeight + this.scrollOffset;
            
            if (listIndex >= 0 && listIndex < this.files.length) {
                this.selectedIndex = listIndex;
                this.render();
                
                this.handleMouseClick();
            }
        }
    }

    handleMouseClick() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        const currentTime = Date.now();
        
        if (this.lastClickTarget === selectedItem.path && 
            (currentTime - this.lastClickTime) < this.doubleClickThreshold) {
            this.lastClickTime = 0;
            this.lastClickTarget = null;
            
            if (selectedItem.type === 'directory') {
                this.navigateToDirectory(selectedItem.path);
            } else {
                this.viewSelectedFile();
            }
        } else {
            this.lastClickTime = currentTime;
            this.lastClickTarget = selectedItem.path;
        }
    }

    handleEnterKey() {
        if (this.files.length === 0) return;
        
        const selectedItem = this.files[this.selectedIndex];
        const currentTime = Date.now();
        
        if (this.lastClickTarget === selectedItem.path && 
            (currentTime - this.lastClickTime) < this.doubleClickThreshold) {
            this.lastClickTime = 0;
            this.lastClickTarget = null;
            
            if (selectedItem.type === 'directory') {
                this.navigateToDirectory(selectedItem.path);
            } else {
                this.viewSelectedFile();
            }
        } else {
            this.lastClickTime = currentTime;
            this.lastClickTarget = selectedItem.path;
            
            this.render();
        }
    }

    goBack() {
        const parentDir = path.dirname(this.currentDirectory);
        if (parentDir !== this.currentDirectory) {
            this.currentDirectory = parentDir;
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            this.files = this.getMediaFiles();
            this.render();
        }
    }

    quit() {
        if (this.mouseEnabled) {
            process.stdout.write('\x1b[?1000l');
        }
        process.stdout.write('\x1b[?25h');
        process.stdin.setRawMode(false);
        this.rl.close();
        this.clearScreen();
        console.log('\x1b[36mGoodbye! 👋\x1b[0m\n');
        process.exit(0);
    }

    start() {
        this.files = this.getMediaFiles();
        this.render();
        this.setupInput();
        
        process.on('exit', () => {
            process.stdout.write('\x1b[?25h');
        });
        
        process.on('SIGINT', () => {
            if (this.mouseEnabled) {
                process.stdout.write('\x1b[?1000l');
            }
            process.stdout.write('\x1b[?25h');
            process.exit(0);
        });
    }
}

const gui = new TerminalGUI();
gui.start();
