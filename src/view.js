const { Generator } = require('./generate');
const { display } = require('./display');

async function run() {
    const args = process.argv.slice(2);
    const imagePath = args[0];
    
    if (!imagePath) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('Usage: npm run view <path>\n');
        process.exit(1);
    }
    
    const sizeX = args[1] ? parseInt(args[1]) : null;
    const sizeY = args[2] ? parseInt(args[2]) : null;
    
    const generator = new Generator();
    const data = await generator.generate(imagePath, sizeX, sizeY);

    display(data);
}

if (require.main === module) {
    run();
}
