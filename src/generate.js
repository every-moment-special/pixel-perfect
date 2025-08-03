const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { display } = require('./display');

class Generator {
    async getImageDimensions(imagePath) {
        try {
            const image = sharp(imagePath);
            const metadata = await image.metadata();
            return {
                width: metadata.width,
                height: metadata.height
            };
        } catch (error) {
            throw new Error(`Failed to get image dimensions: ${error.message}`);
        }
    }

    async generate(imagePath, sizeX = null, sizeY = null) {
        let finalSizeX = sizeX;
        let finalSizeY = sizeY;
        
        if (sizeX === null || sizeY === null) {
            const dimensions = await this.getImageDimensions(imagePath);
            
            finalSizeX = process.stdout.columns;
            
            const aspectRatio = dimensions.width / dimensions.height;
            finalSizeY = Math.round(process.stdout.columns / aspectRatio);
        }
        
        const image = sharp(imagePath);
        const fullSizeImage = await image.resize(finalSizeX, finalSizeY).raw().toBuffer({ resolveWithObject: true });
        const fullSizeData = await this.imageToData(fullSizeImage);
        
        display(fullSizeData);
        this.save(fullSizeData, imagePath);
    }

    async imageToData(imageData) {
        const { data, info } = imageData;
        const height = info.height;
        const width = info.width;
        const channels = info.channels;
        const cells = [];

        const maxCells = 100000;
        let cellCount = 0;

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
                    cellCount++;
                    
                    if (cellCount >= maxCells) {
                        console.log(`Warning: Image too large, limiting to ${maxCells} cells`);
                        return cells;
                    }
                }
            }
        }
        
        return cells;
    }

    save(data, originalImagePath) {
        const chunkSize = 1000;
        const outputPath = path.join('src', 'assets', path.basename(originalImagePath, path.extname(originalImagePath)) + '.json');
        const writeStream = fs.createWriteStream(outputPath);
        writeStream.write('[\n');

        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            const chunkCode = chunk.map((cell, index) => {
                const escapedAnsi = JSON.stringify(cell.ansi).slice(1, -1);
                const isLastInChunk = index === chunk.length - 1;
                const isLastChunk = i + chunkSize >= data.length;
                const comma = (isLastInChunk && isLastChunk) ? '' : ',';
                const line = `{ "x": ${cell.x}, "y": ${cell.y}, "char": "${cell.char}", "ansi": "${escapedAnsi}" }${comma}`;
                
                return line;
            }).join('\n');
            writeStream.write(chunkCode + '\n');
        }
        
        writeStream.write(']\n');
        writeStream.end();
        
        console.log(`Data saved to: ${outputPath}`);
    }
}

async function run() {
    const args = process.argv.slice(2);
    const imagePath = args[0];
    
    if (!imagePath) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('Usage: npm run gen <path> [width] [height]\n');
        console.log('If width and height are not provided, terminal dimensions will be used.');
        process.exit(1);
    }
    
    const sizeX = args[1] ? parseInt(args[1]) : null;
    const sizeY = args[2] ? parseInt(args[2]) : null;
    
    const generator = new Generator();
    await generator.generate(imagePath, sizeX, sizeY);
}

run();
