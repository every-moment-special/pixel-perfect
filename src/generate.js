const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const termkit = require('terminal-kit');
const term = termkit.terminal;

class Generator {
    constructor() {
        this.width = process.stdout.columns || 80;
        this.height = process.stdout.rows || 24;
    }

    async generate(imagePath, size = 32) {
        try {
            const image = sharp(imagePath);
            const resizedImage = await image.resize(size, size).raw().toBuffer({ resolveWithObject: true });
            const data = await this.imageToData(resizedImage);
            
            this.display(data);
            this.save(data, imagePath);
        } catch (error) {
            term.clear();
            term('Error: ' + error.message + '\n');
            term('Press any key to exit...\n');
            
            term.grabInput();
            term.on('key', () => {
                term.grabInput(false);
                process.exit(0);
            });
        }
    }

    async imageToData(imageData) {
        const { data, info } = imageData;
        const height = info.height;
        const width = info.width;
        const channels = info.channels;
        const cells = [];

        for (let y = 0; y < height - 1; y += 2) {
            for (let x = 0; x < width; x++) {
                const upperIndex = (y * width + x) * channels;
                const lowerIndex = ((y + 1) * width + x) * channels;
    
                const upperA = channels === 4 ? data[upperIndex + 3] : 255;
                const lowerA = channels === 4 ? data[lowerIndex + 3] : 255;

                let char = '';
                let ansi = '';
    
                if (upperA >= 128 && lowerA >= 128) {
                    ansi = `\x1b[38;2;${data[upperIndex]};${data[upperIndex + 1]};${data[upperIndex + 2]}m` +
                           `\x1b[48;2;${data[lowerIndex]};${data[lowerIndex + 1]};${data[lowerIndex + 2]}m`;
                    char = '▀';
                } else if (upperA >= 128) {
                    ansi = `\x1b[38;2;${data[upperIndex]};${data[upperIndex + 1]};${data[upperIndex + 2]}m`;
                    char = '▀';
                } else if (lowerA >= 128) {
                    ansi = `\x1b[38;2;${data[lowerIndex]};${data[lowerIndex + 1]};${data[lowerIndex + 2]}m`;
                    char = '▄';
                } else {
                    char = ' ';
                    ansi = '';
                }

                if (char !== ' ') {
                    cells.push({
                        x: x,
                        y: Math.floor(y / 2),
                        char: char,
                        ansi: ansi
                    });
                }
            }
        }
        
        return cells;
    }

    display(data) {
        term.clear();
        term.moveTo(1, 1);

        const maxY = Math.max(...data.map(cell => cell.y));
        const maxX = Math.max(...data.map(cell => cell.x));
        const display = Array(maxY + 1).fill().map(() => Array(maxX + 1).fill(' '));
        
        data.forEach(cell => {
            if (cell.y < display.length && cell.x < display[0].length) {
                display[cell.y][cell.x] = cell.ansi + cell.char + '\x1b[0m';
            }
        });
        
        display.forEach(row => {
            term(row.join('') + '\n');
        });
        
        term.grabInput();
        term.on('key', () => {
            term.grabInput(false);
            term.clear();
            process.exit(0);
        });
    }

    save(data, originalImagePath) {
        const code = `const data = [\n${data.map(cell => `{ x: ${cell.x}, y: ${cell.y}, char: '${cell.char}', ansi: '${cell.ansi}' },`).join('\n')}\n];\n\nmodule.exports = data;\n`;
        
        const outputPath = path.join('src', 'assets', path.basename(originalImagePath, path.extname(originalImagePath)) + '.js');
        fs.writeFileSync(outputPath, code);
        
        term(`Data saved to: ${outputPath}`);
    }
}

async function run() {
    const args = process.argv.slice(2);
    const path = args[0];
    const generator = new Generator();
    await generator.generate(path);
}

run();
