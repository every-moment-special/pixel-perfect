const sharp = require('sharp');
const fs = require('fs');

class Framebuffer{
    constructor(fbPath = '/dev/fb0') {
        this.fbPath = fbPath;
        this.fbBase = '/sys/class/graphics/fb0/';
        this.fb = null;
        this.originalBuffer = null;
        this.width = 0;
        this.height = 0;
        this.bpp = 0;
        this.framebufferSize = 0;
    }

    async initialize() {
        try {
            this.fb = fs.openSync(this.fbPath, 'r+');
            this.bpp = parseInt(fs.readFileSync(this.fbBase + 'bits_per_pixel').toString());
            
            try {
                const virtualSize = fs.readFileSync(this.fbBase + 'virtual_size').toString().split(',');
                this.width = parseInt(virtualSize[0]);
                this.height = parseInt(virtualSize[1]);
            } catch (error) {
                this.width = 1920;
                this.height = 1080;
                console.log('Using default framebuffer size:', this.width, 'x', this.height);
            }

            this.framebufferSize = this.width * this.height * (this.bpp / 8);
            
            this.originalBuffer = Buffer.alloc(this.framebufferSize);
            fs.readSync(this.fb, this.originalBuffer, 0, this.framebufferSize, 0);
            
            console.log(`Framebuffer initialized: ${this.width}x${this.height}, ${this.bpp} bpp`);
            return true;
        } catch (error) {
            console.error('Failed to initialize framebuffer:', error.message);
            return false;
        }
    }

    async renderImage(imagePath, targetWidth = null, targetHeight = null) {
        if (!this.fb) {
            throw new Error('Framebuffer not initialized');
        }

        try {
            let image = sharp(imagePath);
            
            if (!targetWidth || !targetHeight) {
                targetWidth = this.width;
                targetHeight = this.height;
            }

            const resizedImage = await image
                .resize(targetWidth, targetHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .raw()
                .toBuffer({ resolveWithObject: true });

            const { data, info } = resizedImage;
            
            const buffer = Buffer.alloc(this.framebufferSize);
            
            const offsetX = Math.floor((this.width - targetWidth) / 2);
            const offsetY = Math.floor((this.height - targetHeight) / 2);

            for (let y = 0; y < targetHeight; y++) {
                for (let x = 0; x < targetWidth; x++) {
                    const imageIndex = (y * targetWidth + x) * info.channels;
                    const fbX = offsetX + x;
                    const fbY = offsetY + y;
                    
                    if (fbX >= 0 && fbX < this.width && fbY >= 0 && fbY < this.height) {
                        const fbOffset = (fbY * this.width + fbX) * (this.bpp / 8);
                        
                        const r = data[imageIndex];
                        const g = data[imageIndex + 1];
                        const b = data[imageIndex + 2];
                        const a = info.channels === 4 ? data[imageIndex + 3] : 255;
                        
                        if (this.bpp === 32) {
                            // BGRA format (most common for 32-bit framebuffers)
                            buffer.writeUInt8(b, fbOffset + 0);     // Blue
                            buffer.writeUInt8(g, fbOffset + 1);     // Green
                            buffer.writeUInt8(r, fbOffset + 2);     // Red
                            buffer.writeUInt8(a, fbOffset + 3);     // Alpha
                        } else if (this.bpp === 24) {
                            // BGR format
                            buffer.writeUInt8(b, fbOffset + 0);     // Blue
                            buffer.writeUInt8(g, fbOffset + 1);     // Green
                            buffer.writeUInt8(r, fbOffset + 2);     // Red
                        } else if (this.bpp === 16) {
                            // RGB565 format
                            const r5 = Math.floor(r * 31 / 255);
                            const g6 = Math.floor(g * 63 / 255);
                            const b5 = Math.floor(b * 31 / 255);
                            const pixel = (r5 << 11) | (g6 << 5) | b5;
                            buffer.writeUInt16LE(pixel, fbOffset);
                        }
                    }
                }
            }

            fs.writeSync(this.fb, buffer, 0, buffer.length, 0);
            console.log(`Image rendered to framebuffer: ${targetWidth}x${targetHeight}`);
            
        } catch (error) {
            console.error('Failed to render image:', error.message);
        }
    }

    restore() {
        if (this.fb && this.originalBuffer) {
            fs.writeSync(this.fb, this.originalBuffer, 0, this.originalBuffer.length, 0);
            console.log('Framebuffer restored');
        }
    }

    close() {
        if (this.fb) {
            this.restore();
            fs.closeSync(this.fb);
            this.fb = null;
            console.log('Framebuffer closed');
        }
    }
}

module.exports = Framebuffer;
