const fs = require('fs');
const path = require('path');
const Framebuffer = require('../utils/framebuffer.js');

(async () => {
    const renderer = new Framebuffer();
    
    if (!await renderer.initialize()) {
        process.exit(1);
    }

    process.on('SIGINT', () => {
        renderer.close();
        process.exit();
    });

    process.on('SIGTERM', () => {
        renderer.close();
        process.exit();
    });

    const imagePath = path.join(__dirname, '..', '..', 'resources', '01.jpg');
    
    if (fs.existsSync(imagePath)) {
        await renderer.renderImage(imagePath);
        console.log('Press Ctrl+C to exit');
    } else {
        console.log('Image not found');
    }
})();
