const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');

const CONFIG = {
    maxCells: process.env.MAX_CELLS ? parseInt(process.env.MAX_CELLS) : 200000,
    maxCacheSize: process.env.MAX_CACHE_SIZE ? parseInt(process.env.MAX_CACHE_SIZE) : 10,
    defaultFps: 10
};

class GifPlayer {
    constructor() {
        this.framesDir = null;
        this.frameFiles = [];
        this.currentFrame = 0;
        this.isPlaying = false;
        this.fps = CONFIG.defaultFps;
        this.frameInterval = null;
        this.frameCache = new Map();
        this.maxCacheSize = CONFIG.maxCacheSize;
        this.onFrameUpdate = null;
        this.frameDelay = 1000 / this.fps;
    }

    async getGifFps(gifPath) {
        return new Promise((resolve) => {
            const ffprobe = spawn('ffprobe', [
                '-v', '0',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=avg_frame_rate',
                '-of', 'compact=p=0:nk=1',
                gifPath
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    try {
                        // Parse the frame rate (format: "20/3" for compact output)
                        const frameRateMatch = output.trim().match(/^(\d+)\/(\d+)$/);
                        if (frameRateMatch) {
                            const numerator = parseInt(frameRateMatch[1]);
                            const denominator = parseInt(frameRateMatch[2]);
                            const fps = numerator / denominator;
                            resolve(fps);
                        } else {
                            // Fallback: try to parse other formats
                            const altFrameRateMatch = output.trim().match(/avg_frame_rate=(\d+)\/(\d+)/);
                            if (altFrameRateMatch) {
                                const numerator = parseInt(altFrameRateMatch[1]);
                                const denominator = parseInt(altFrameRateMatch[2]);
                                const fps = numerator / denominator;
                                resolve(fps);
                            } else {
                                resolve(CONFIG.defaultFps);
                            }
                        }
                    } catch (error) {
                        resolve(CONFIG.defaultFps);
                    }
                } else {
                    resolve(CONFIG.defaultFps);
                }
            });

            ffprobe.on('error', () => {
                resolve(CONFIG.defaultFps);
            });
        });
    }

    async extractGifFrames(gifPath, outputDir = null) {
        // Create a unique directory structure for each GIF
        // Format: .temp/gif/[filename]/frames/
        if (!outputDir) {
            const gifFileName = path.basename(gifPath, path.extname(gifPath));
            const gifDir = path.join('.temp', 'gif', gifFileName);
            outputDir = path.join(gifDir, 'frames');
        }
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            // console.log('Extracting GIF frames with FFmpeg...');
            
            const ffmpeg = spawn('ffmpeg', [
                '-i', gifPath,
                '-vf', 'fps=10', // Extract at 10fps for smooth playback
                '-frame_pts', '1',
                path.join(outputDir, 'frame_%04d.png')
            ], {
                stdio: ['ignore', 'pipe', 'pipe'] // Suppress stdin/stdout/stderr
            });

            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Error') || output.includes('error')) {
                    // console.log('FFmpeg Error:', output.trim());
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    // console.log('✓ GIF frame extraction completed');
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

    async convertFrameToArt(framePath, width, height) {
        try {
            const image = sharp(framePath);
            const metadata = await image.metadata();
            const aspectRatio = metadata.width / metadata.height;
            
            let finalWidth = width;
            let finalHeight = height;
            
            // If height is not specified, calculate based on aspect ratio
            if (height === null) {
                finalHeight = Math.round(width / aspectRatio);
            }
            
            // Scale down if too large
            const maxCells = CONFIG.maxCells;
            const estimatedCells = finalWidth * Math.ceil(finalHeight / 2);
            if (estimatedCells > maxCells) {
                const maxWidth = Math.sqrt(maxCells * 2);
                const maxHeight = maxWidth;
                
                if (aspectRatio > 1) {
                    finalWidth = Math.floor(maxWidth);
                    finalHeight = Math.floor(finalWidth / aspectRatio);
                } else {
                    finalHeight = Math.floor(maxHeight);
                    finalWidth = Math.floor(finalHeight * aspectRatio);
                }
            }

            const fullSizeImage = await image.resize(finalWidth, finalHeight).raw().toBuffer({ resolveWithObject: true });
            
            const { data, info } = fullSizeImage;
            const frameHeight = info.height;
            const frameWidth = info.width;
            const channels = info.channels;
            const cells = [];

            let cellCount = 0;

            for (let y = 0; y < frameHeight; y += 2) {
                for (let x = 0; x < frameWidth; x++) {
                    const upperIndex = (y * frameWidth + x) * channels;
                    const hasLowerRow = (y + 1) < frameHeight;
                    const lowerIndex = hasLowerRow ? ((y + 1) * frameWidth + x) * channels : upperIndex;
        
                    const upperA = channels === 4 ? data[upperIndex + 3] : 255;
                    const lowerA = hasLowerRow ? (channels === 4 ? data[lowerIndex + 3] : 255) : 0;

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
            // console.error(`Error converting GIF frame ${framePath}:`, error.message);
            return [];
        }
    }

    async loadGif(gifPath, width, height) {
        // console.log('Loading GIF:', gifPath);
        
        // Get the actual FPS of the GIF
        const detectedFps = await this.getGifFps(gifPath);
        this.setFps(detectedFps);
        
        // Check if frames already exist for this GIF
        const gifFileName = path.basename(gifPath, path.extname(gifPath));
        const gifDir = path.join('.temp', 'gif', gifFileName);
        const framesDir = path.join(gifDir, 'frames');
        
        let files = [];
        if (fs.existsSync(framesDir)) {
            // Frames already exist, use them
            files = fs.readdirSync(framesDir)
                .filter(file => file.endsWith('.png'))
                .sort();
            // console.log(`Found existing ${files.length} GIF frames for ${gifFileName}`);
        }
        
        if (files.length === 0) {
            // No existing frames, extract them
            await this.extractGifFrames(gifPath, framesDir);
            files = fs.readdirSync(framesDir)
                .filter(file => file.endsWith('.png'))
                .sort();
            // console.log(`Extracted ${files.length} GIF frames for ${gifFileName}`);
        }

        // console.log(`Loaded ${files.length} GIF frames. Will load on-demand to save memory.`);
        
        this.framesDir = framesDir;
        this.frameFiles = files;
        this.width = width;
        this.height = height;
        
        return files.length;
    }

    async loadFrame(frameIndex) {
        // Normalize frame index to handle looping
        const normalizedIndex = frameIndex % this.frameFiles.length;
        
        if (normalizedIndex < 0 || normalizedIndex >= this.frameFiles.length) {
            return null;
        }

        if (this.frameCache.has(normalizedIndex)) {
            return this.frameCache.get(normalizedIndex);
        }

        const framePath = path.join(this.framesDir, this.frameFiles[normalizedIndex]);
        // Double the height because convertFrameToArt expects pixel height, not terminal cell height
        const artData = await this.convertFrameToArt(framePath, this.width, this.height * 2);
        
        this.frameCache.set(normalizedIndex, artData);
        
        if (this.frameCache.size > this.maxCacheSize) {
            // Remove the oldest frame that's not the current frame or the next few frames
            // to avoid removing frames that will be needed soon
            const keysToRemove = [];
            for (const [key, _] of this.frameCache.entries()) {
                if (keysToRemove.length >= this.frameCache.size - this.maxCacheSize) break;
                // Don't remove current frame or the next 2 frames
                const currentNormalized = this.currentFrame % this.frameFiles.length;
                if (key !== currentNormalized && 
                    key !== (currentNormalized + 1) % this.frameFiles.length &&
                    key !== (currentNormalized + 2) % this.frameFiles.length) {
                    keysToRemove.push(key);
                }
            }
            // If we couldn't find enough frames to remove, just remove the oldest
            if (keysToRemove.length === 0) {
                const firstKey = this.frameCache.keys().next().value;
                this.frameCache.delete(firstKey);
            } else {
                keysToRemove.forEach(key => this.frameCache.delete(key));
            }
        }
        
        return artData;
    }

    async play(onFrameUpdate) {
        if (this.frameFiles.length === 0) {
            // console.log('No GIF loaded');
            return;
        }

        this.isPlaying = true;
        this.currentFrame = 0;
        this.onFrameUpdate = onFrameUpdate;
        
        const playNextFrame = async () => {
            if (!this.isPlaying) return;
            
            const frameData = await this.loadFrame(this.currentFrame);
            if (frameData && this.onFrameUpdate) {
                this.onFrameUpdate(frameData);
            }
            
            this.currentFrame++;
            
            if (this.currentFrame >= this.frameFiles.length) {
                this.currentFrame = 0; // Loop back to start
            }
            
            this.frameInterval = setTimeout(playNextFrame, this.frameDelay);
        };
        
        playNextFrame();
    }

    pause() {
        this.isPlaying = false;
        if (this.frameInterval) {
            clearTimeout(this.frameInterval);
        }
    }

    resume() {
        if (this.frameFiles.length > 0 && !this.isPlaying) {
            this.isPlaying = true;
            // Don't reset currentFrame, just continue from where we left off
            const playNextFrame = async () => {
                if (!this.isPlaying) return;
                
                const frameData = await this.loadFrame(this.currentFrame);
                if (frameData && this.onFrameUpdate) {
                    this.onFrameUpdate(frameData);
                }
                
                this.currentFrame++;
                
                if (this.currentFrame >= this.frameFiles.length) {
                    this.currentFrame = 0; // Loop back to start
                }
                
                this.frameInterval = setTimeout(playNextFrame, this.frameDelay);
            };
            
            playNextFrame();
        }
    }

    stop() {
        this.pause();
        this.currentFrame = 0;
        this.frameCache.clear();
    }

    setFps(fps) {
        this.fps = fps;
        this.frameDelay = 1000 / fps;
    }

    cleanup() {
        this.stop();
        if (this.framesDir && fs.existsSync(this.framesDir)) {
            // Clean up temporary frames directory and parent directories if empty
            try {
                fs.rmSync(this.framesDir, { recursive: true, force: true });
                
                // Try to clean up parent directories if they're empty
                const parentDir = path.dirname(this.framesDir);
                const grandParentDir = path.dirname(parentDir);
                
                try {
                    if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
                        fs.rmdirSync(parentDir);
                    }
                    if (fs.existsSync(grandParentDir) && fs.readdirSync(grandParentDir).length === 0) {
                        fs.rmdirSync(grandParentDir);
                    }
                } catch (error) {
                    // Ignore errors when trying to remove parent directories
                }
            } catch (error) {
                // console.log('Warning: Could not clean up temporary frames directory:', error.message);
            }
        }
    }

    // Static method to clean up all old GIF frame directories
    static cleanupAllGifFrames() {
        const tempGifDir = path.join('.temp', 'gif');
        if (fs.existsSync(tempGifDir)) {
            try {
                fs.rmSync(tempGifDir, { recursive: true, force: true });
                // console.log('Cleaned up all GIF frame directories');
            } catch (error) {
                // console.log('Warning: Could not clean up GIF frame directories:', error.message);
            }
        }
    }
}

module.exports = { GifPlayer };
