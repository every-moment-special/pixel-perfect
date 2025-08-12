const { Generator } = require('./generate');
const { display } = require('./utils/display');
const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tga'];

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
}

function getImageFiles(folderPath) {
    try {
        const files = fs.readdirSync(folderPath);
        return files
            .filter(file => isImageFile(file))
            .map(file => path.join(folderPath, file))
            .sort();
    } catch (error) {
        throw new Error(`Failed to read directory: ${error.message}`);
    }
}

class GallerySlider {
    constructor(imagePaths, sizeX = null, sizeY = null) {
        this.imagePaths = imagePaths;
        this.currentIndex = 0;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.generator = new Generator();
        this.isNavigating = false;
    }

    async showCurrentImage() {
        if (this.imagePaths.length === 0) {
            console.log('No image files found in the specified folder.');
            process.exit(1);
        }

        const currentPath = this.imagePaths[this.currentIndex];
        const filename = path.basename(currentPath);
        
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(`\x1b[36mGallery: ${this.currentIndex + 1}/${this.imagePaths.length}\x1b[0m`);
        console.log(`\x1b[33mCurrent: ${filename}\x1b[0m\n`);

        try {
            const data = await this.generator.generate(currentPath, this.sizeX, this.sizeY);
            this.displayWithNavigation(data);
        } catch (error) {
            console.error(`Error loading image: ${error.message}`);
            this.showNavigationHelp();
        }
    }

    displayWithNavigation(data) {
        process.stdout.write('\x1b[2J\x1b[H');
        
        let cells;
        if (data.t && data.d) {
            const ansiTable = data.t;
            cells = data.d.map(cell => ({
                x: cell[0],
                y: cell[1],
                char: cell[2],
                ansi: ansiTable[cell[3]] || ''
            }));
        } else {
            cells = data;
        }
        
        const maxY = cells.reduce((max, cell) => Math.max(max, cell.y), 0);
        const maxX = cells.reduce((max, cell) => Math.max(max, cell.x), 0);
        const display = Array(maxY + 1).fill().map(() => Array(maxX + 1).fill(' '));
        
        cells.forEach(cell => {
            if (cell.y < display.length && cell.x < display[0].length) {
                display[cell.y][cell.x] = cell.ansi + cell.char + '\x1b[0m';
            }
        });
        
        display.forEach(row => {
            process.stdout.write(row.join('') + '\n');
        });
        
        this.showNavigationInfo();
        
        this.setupNavigation();
    }

    showNavigationInfo() {
        const currentPath = this.imagePaths[this.currentIndex];
        const filename = path.basename(currentPath);
        const totalImages = this.imagePaths.length;
        const currentNum = this.currentIndex + 1;
        
        process.stdout.write(`\x1b[${process.stdout.rows};1H`);
        console.log(`\x1b[36m${currentNum}/${totalImages}\x1b[0m - \x1b[33m${filename}\x1b[0m`);
        console.log('\x1b[90mNavigation: ←/→ arrows, q to quit\x1b[0m');
    }

    showNavigationHelp() {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('\x1b[33mNavigation Controls:\x1b[0m');
        console.log('  \x1b[36m←\x1b[0m  Previous image');
        console.log('  \x1b[36m→\x1b[0m  Next image');
        console.log('  \x1b[36mq\x1b[0m  Quit gallery');
        console.log('\n\x1b[90mPress any key to continue...\x1b[0m');
    }

    setupNavigation() {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', async (key) => {
            if (this.isNavigating) return;
            
            this.isNavigating = true;
            
            if (key === 'q') {
                process.stdout.write('\x1b[2J\x1b[H');
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.exit(0);
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
            }
            
            this.isNavigating = false;
        });
    }
}

async function run() {
    const args = process.argv.slice(2);
    const inputPath = args[0];
    
    if (!inputPath) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('Usage: npm run view <path>\n');
        console.log('  <path> can be either:');
        console.log('    - A single image file');
        console.log('    - A folder containing images');
        process.exit(1);
    }
    
    const sizeX = args[1] ? parseInt(args[1]) : null;
    const sizeY = args[2] ? parseInt(args[2]) : null;
    
    try {
        const stats = fs.statSync(inputPath);
        
        if (stats.isDirectory()) {
            const imageFiles = getImageFiles(inputPath);
            
            if (imageFiles.length === 0) {
                console.log('No supported image files found in the specified folder.');
                console.log('Supported formats:', SUPPORTED_EXTENSIONS.join(', '));
                process.exit(1);
            }
            
            console.log(`Found ${imageFiles.length} image(s) in folder.`);
            const gallery = new GallerySlider(imageFiles, sizeX, sizeY);
            await gallery.showCurrentImage();
            
        } else if (stats.isFile()) {
            if (!isImageFile(inputPath)) {
                console.log('The specified file is not a supported image format.');
                console.log('Supported formats:', SUPPORTED_EXTENSIONS.join(', '));
                process.exit(1);
            }
            
            const generator = new Generator();
            const data = await generator.generate(inputPath, sizeX, sizeY);
            display(data);
            
        } else {
            console.log('The specified path is neither a file nor a directory.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run();
}
