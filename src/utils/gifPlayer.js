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
        this.isLoading = false;
        this.currentFrameConversionProcess = null;
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
                        const frameRateMatch = output.trim().match(/^(\d+)\/(\d+)$/);
                        if (frameRateMatch) {
                            const numerator = parseInt(frameRateMatch[1]);
                            const denominator = parseInt(frameRateMatch[2]);
                            const fps = numerator / denominator;
                            resolve(fps);
                        } else {
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
        if (!outputDir) {
            const gifFileName = path.basename(gifPath, path.extname(gifPath));
            const gifDir = path.join('.cache', 'gif', gifFileName);
            outputDir = path.join(gifDir, 'frames');
        }
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', gifPath,
                '-vsync', '0',
                '-frame_pts', '1',
                path.join(outputDir, 'frame_%04d.png')
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Error') || output.includes('error')) {
                    // TODO:add proper error handling
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
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
            
            if (height === null) {
                finalHeight = Math.round(width / aspectRatio);
            }
            
            if (aspectRatio > 1) {
                finalWidth = width;
                finalHeight = Math.round(width / aspectRatio);
            } else {
                finalHeight = height;
                finalWidth = Math.round(height * aspectRatio);
            }
            
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
            // TODO: add proper error handling
            return [];
        }
    }

    async loadGif(gifPath, width, height, normalizedWidth = null, normalizedHeight = null) {
        const detectedFps = await this.getGifFps(gifPath);
        this.setFps(detectedFps);
        
        const gifFileName = path.basename(gifPath, path.extname(gifPath));
        const gifDir = path.join('.cache', 'gif', gifFileName);
        const framesDir = path.join(gifDir, 'frames');
        
        let files = [];
        if (fs.existsSync(framesDir)) {
            files = fs.readdirSync(framesDir)
                .filter(file => file.endsWith('.png'))
                .sort();
        }
        
        if (files.length === 0) {
            await this.extractGifFrames(gifPath, framesDir);
            files = fs.readdirSync(framesDir)
                .filter(file => file.endsWith('.png'))
                .sort();
        }
        
        this.framesDir = framesDir;
        this.frameFiles = files;
        this.width = width;
        this.height = height;
        this.normalizedWidth = normalizedWidth || width;
        this.normalizedHeight = normalizedHeight || height;
        
        return files.length;
    }

    async loadFrame(frameIndex) {
        const normalizedIndex = frameIndex % this.frameFiles.length;
        
        if (normalizedIndex < 0 || normalizedIndex >= this.frameFiles.length) {
            return null;
        }

        const cacheKey = this.getCacheKey(normalizedIndex, this.normalizedWidth, this.normalizedHeight);
        
        if (this.frameCache.has(cacheKey)) {
            return this.frameCache.get(cacheKey);
        }

        const framePath = path.join(this.framesDir, this.frameFiles[normalizedIndex]);
        const artData = await this.convertFrameToArt(framePath, this.normalizedWidth, this.normalizedHeight * 2);
        
        this.frameCache.set(cacheKey, artData);
        
        if (this.frameCache.size > this.maxCacheSize) {
            const keysToRemove = [];
            for (const [key, _] of this.frameCache.entries()) {
                if (keysToRemove.length >= this.frameCache.size - this.maxCacheSize) break;

                const currentNormalized = this.currentFrame % this.frameFiles.length;
                const currentCacheKey = this.getCacheKey(currentNormalized, this.normalizedWidth, this.normalizedHeight);
                const nextCacheKey = this.getCacheKey((currentNormalized + 1) % this.frameFiles.length, this.normalizedWidth, this.normalizedHeight);
                const nextNextCacheKey = this.getCacheKey((currentNormalized + 2) % this.frameFiles.length, this.normalizedWidth, this.normalizedHeight);
                
                if (key !== currentCacheKey && key !== nextCacheKey && key !== nextNextCacheKey) {
                    keysToRemove.push(key);
                }
            }

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
            return;
        }

        this.isPlaying = true;
        this.currentFrame = 0;
        this.onFrameUpdate = onFrameUpdate;
        this.startTime = Date.now();
        
        const playNextFrame = async () => {
            if (!this.isPlaying) return;
            
            const frameData = await this.loadFrame(this.currentFrame);
            if (frameData && this.onFrameUpdate) {
                this.onFrameUpdate(frameData);
            }
            
            this.currentFrame++;
            
            if (this.currentFrame >= this.frameFiles.length) {
                this.currentFrame = 0;
                this.startTime = Date.now();
            }
            
            const elapsedTime = Date.now() - this.startTime;
            const expectedFrameTime = (this.currentFrame * this.frameDelay);
            const delay = Math.max(0, expectedFrameTime - elapsedTime);
            
            this.frameInterval = setTimeout(playNextFrame, delay);
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
            this.startTime = Date.now() - (this.currentFrame * this.frameDelay);

            const playNextFrame = async () => {
                if (!this.isPlaying) return;
                
                const frameData = await this.loadFrame(this.currentFrame);
                if (frameData && this.onFrameUpdate) {
                    this.onFrameUpdate(frameData);
                }
                
                this.currentFrame++;
                
                if (this.currentFrame >= this.frameFiles.length) {
                    this.currentFrame = 0;
                    this.startTime = Date.now();
                }
                
                const elapsedTime = Date.now() - this.startTime;
                const expectedFrameTime = (this.currentFrame * this.frameDelay);
                const delay = Math.max(0, expectedFrameTime - elapsedTime);
                
                this.frameInterval = setTimeout(playNextFrame, delay);
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
        this.killFrameConversion();
        if (this.framesDir && fs.existsSync(this.framesDir)) {
            try {
                fs.rmSync(this.framesDir, { recursive: true, force: true });
                
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
                    // TODO: add proper error handling
                }
            } catch (error) {
                // TODO: add proper error handling
            }
        }
    }

    static cleanupAllGifFrames() {
        const tempGifDir = path.join('.cache', 'gif');
        if (fs.existsSync(tempGifDir)) {
            try {
                fs.rmSync(tempGifDir, { recursive: true, force: true });
            } catch (error) {
                // TODO: add proper error handling
            }
        }
    }

    needsReload(newWidth, newHeight, newNormalizedWidth, newNormalizedHeight) {
        return this.width !== newWidth || 
               this.height !== newHeight ||
               this.normalizedWidth !== newNormalizedWidth ||
               this.normalizedHeight !== newNormalizedHeight;
    }

    killFrameConversion() {
        if (this.currentFrameConversionProcess) {
            try {
                this.currentFrameConversionProcess.kill();
                this.currentFrameConversionProcess = null;
            } catch (error) {
                // TODO: add proper error handling
            }
        }
    }

    getCacheKey(frameIndex, width, height) {
        return `${frameIndex}_${width}x${height}`;
    }

    clearSizeCache(width, height) {
        const sizePattern = `_${width}x${height}`;
        for (const [key, _] of this.frameCache.entries()) {
            if (key.includes(sizePattern)) {
                this.frameCache.delete(key);
            }
        }
    }
}

module.exports = { GifPlayer };
