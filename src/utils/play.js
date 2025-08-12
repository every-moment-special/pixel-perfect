const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { display } = require('./utils/display');
const sharp = require('sharp');

const CONFIG = {
    maxCells: process.env.MAX_CELLS ? parseInt(process.env.MAX_CELLS) : 200000,
    maxCellsVideo: process.env.MAX_CELLS_VIDEO ? parseInt(process.env.MAX_CELLS_VIDEO) : 100000,
    maxCacheSize: process.env.MAX_CACHE_SIZE ? parseInt(process.env.MAX_CACHE_SIZE) : 10,
    fps: process.env.VIDEO_FPS ? parseInt(process.env.VIDEO_FPS) : 10
};

class Player {
    constructor() {
        this.framesDir = null;
        this.frameFiles = [];
        this.currentFrame = 0;
        this.isPlaying = false;
        this.fps = CONFIG.fps;
        this.frameInterval = null;
        this.cursorHidden = false;
        this.frameCache = new Map();
        this.maxCacheSize = CONFIG.maxCacheSize;
    }

    createProgressBar(width = 40) {
        return {
            width,
            update: (progress, label = '') => {
                const filled = Math.round(width * progress);
                const empty = width - filled;
                const bar = '█'.repeat(filled) + '░'.repeat(empty);
                const percentage = Math.round(progress * 100);
                process.stdout.write(`\r${label} [${bar}] ${percentage}%`);
            },
            clear: () => {
                process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 80) + '\r');
            }
        };
    }

    hideCursor() {
        if (!this.cursorHidden) {
            const rows = process.stdout.rows || 24;
            const cols = process.stdout.columns || 80;
            process.stdout.write(`\x1b[${rows};${cols}H\x1b[?25l`);
            this.cursorHidden = true;
        }
    }

    showCursor() {
        if (this.cursorHidden) {
            process.stdout.write('\x1b[?25h\x1b[H');
            this.cursorHidden = false;
        }
    }

    async extractFrames(videoPath, outputDir = './temp_frames') {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            console.log('Extracting frames with FFmpeg...');
            
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-vf', `fps=${this.fps}`,
                '-frame_pts', '1',
                path.join(outputDir, 'frame_%04d.png')
            ]);

            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Error') || output.includes('error')) {
                    console.log('FFmpeg Error:', output.trim());
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log('✓ Frame extraction completed');
                    resolve(outputDir);
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`Failed to start FFmpeg: ${error.message}`));
            });
        });
    }

    async convertFrameToArt(framePath) {
        try {
            const sizeX = process.stdout.columns || 80;
            const image = sharp(framePath);
            const metadata = await image.metadata();
            const aspectRatio = metadata.width / metadata.height;
            let sizeY = Math.round(sizeX / aspectRatio);

            const maxCellsForVideo = CONFIG.maxCellsVideo;
            const maxWidth = Math.sqrt(maxCellsForVideo * 2);
            const maxHeight = maxWidth;
            
            const estimatedCells = sizeX * Math.ceil(sizeY / 2);
            if (estimatedCells > maxCellsForVideo) {
                console.log(`Warning: Video frame size (${sizeX}x${sizeY}) would create ~${estimatedCells} cells, exceeding limit of ${maxCellsForVideo}`);
                console.log(`Scaling down video frames to fit within limits...`);
                
                if (aspectRatio > 1) {
                    const newSizeX = Math.floor(maxWidth);
                    sizeY = Math.floor(newSizeX / aspectRatio);
                } else {
                    const newSizeY = Math.floor(maxHeight);
                    sizeY = Math.floor(newSizeY);
                }
                
                console.log(`Video frames scaled to: ${sizeX}x${sizeY}`);
            }

            const fullSizeImage = await image.resize(sizeX, sizeY).raw().toBuffer({ resolveWithObject: true });
            
            const { data, info } = fullSizeImage;
            const height = info.height;
            const width = info.width;
            const channels = info.channels;
            const cells = [];

            const maxCells = CONFIG.maxCells;
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
                            break;
                        }
                    }
                }
                if (cellCount >= maxCells) break;
            }
            
            return cells;
        } catch (error) {
            console.error(`Error converting frame ${framePath}:`, error.message);
            return [];
        }
    }

    async convertFramesToArt(framesDir) {
        const files = fs.readdirSync(framesDir)
            .filter(file => file.endsWith('.png'))
            .sort();

        console.log(`Found ${files.length} frames. Will load on-demand to save memory.`);
        
        this.framesDir = framesDir;
        this.frameFiles = files;
        
        return files.length;
    }

    async loadFrame(frameIndex) {
        if (frameIndex < 0 || frameIndex >= this.frameFiles.length) {
            return null;
        }

        if (this.frameCache.has(frameIndex)) {
            return this.frameCache.get(frameIndex);
        }

        const framePath = path.join(this.framesDir, this.frameFiles[frameIndex]);
        const artData = await this.convertFrameToArt(framePath);
        
        this.frameCache.set(frameIndex, artData);
        
        if (this.frameCache.size > this.maxCacheSize) {
            const firstKey = this.frameCache.keys().next().value;
            this.frameCache.delete(firstKey);
        }
        
        return artData;
    }

    async loadVideo(videoPath) {
        console.log('Loading video:', videoPath);
        this.logMemoryUsage('Before loading');
        
        const framesDir = await this.extractFrames(videoPath);
        
        const frameCount = await this.convertFramesToArt(framesDir);
        
        console.log(`✓ Video loaded: ${frameCount} frames at ${this.fps} FPS (on-demand loading)`);
        this.logMemoryUsage('After loading');
    }

    async play() {
        if (this.frameFiles.length === 0) {
            console.log('No video loaded');
            return;
        }

        this.isPlaying = true;
        this.currentFrame = 0;
        
        this.hideCursor();
        
        const playNextFrame = async () => {
            if (!this.isPlaying) return;
            
            if (this.currentFrame >= this.frameFiles.length) {
                this.currentFrame = 0;
            }
            
            const frameData = await this.loadFrame(this.currentFrame);
            if (frameData) {
                process.stdout.write('\x1b[2J\x1b[H');
                display(frameData);
            }
            
            this.currentFrame++;
            
            this.frameInterval = setTimeout(playNextFrame, 1000 / this.fps);
        };
        
        playNextFrame();
        
        this.setupControls();
    }

    pause() {
        this.isPlaying = false;
        if (this.frameInterval) {
            clearTimeout(this.frameInterval);
        }
        this.showCursor();
    }

    async resume() {
        if (this.frameFiles.length > 0) {
            this.hideCursor();
            await this.play();
        }
    }

    async setupControls() {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        process.on('exit', () => {
            this.showCursor();
            this.frameCache.clear();
        });

        process.on('SIGINT', () => {
            this.showCursor();
            this.frameCache.clear();
            process.exit(0);
        });

        console.log('\nControls:');
        console.log('  Space - Pause/Resume');
        console.log('  f - Fast forward 5 frames');
        console.log('  b - Rewind 5 frames');
        console.log('  q - Quit');

        process.stdin.on('data', async (key) => {
            switch (key) {
                case 'q':
                    this.pause();
                    this.showCursor();
                    this.frameCache.clear();
                    process.stdout.write('\x1b[2J\x1b[H');
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.exit(0);
                    break;
                case ' ':
                    // Space to pause/resume
                    if (this.isPlaying) {
                        this.pause();
                        console.log('\nPaused - Press space to resume, q to quit');
                    } else {
                        await this.resume();
                    }
                    break;
                case 'f':
                    // Fast forward
                    this.currentFrame = Math.min(this.currentFrame + 5, this.frameFiles.length - 1);
                    if (this.frameFiles.length > 0) {
                        const frameData = await this.loadFrame(this.currentFrame);
                        if (frameData) {
                            process.stdout.write('\x1b[2J\x1b[H');
                            display(frameData);
                        }
                    }
                    break;
                case 'b':
                    // Rewind
                    this.currentFrame = Math.max(this.currentFrame - 5, 0);
                    if (this.frameFiles.length > 0) {
                        const frameData = await this.loadFrame(this.currentFrame);
                        if (frameData) {
                            process.stdout.write('\x1b[2J\x1b[H');
                            display(frameData);
                        }
                    }
                    break;
            }
        });
    }

    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024) // MB
        };
    }

    logMemoryUsage(label = '') {
        const mem = this.getMemoryUsage();
        console.log(`${label} Memory: RSS=${mem.rss}MB, Heap=${mem.heapUsed}/${mem.heapTotal}MB, External=${mem.external}MB`);
    }
}

async function run() {
    const args = process.argv.slice(2);
    const videoPath = args[0];
    
    if (!videoPath) {
        console.log('Usage: npm run play <video_path>\n');
        process.exit(1);
    }
    
    if (!fs.existsSync(videoPath)) {
        console.error('Video file not found:', videoPath);
        process.exit(1);
    }
    
    const player = new Player();
    
    try {
        await player.loadVideo(videoPath);
        await player.play();
    } catch (error) {
        console.error('Error playing video:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run();
}

module.exports = { Player };
