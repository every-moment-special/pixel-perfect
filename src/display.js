const fs = require('fs');
const path = require('path');

const display = (data) => {
    process.stdout.write('\x1b[2J\x1b[H');
    
    const maxY = Math.max(...data.map(cell => cell.y));
    const maxX = Math.max(...data.map(cell => cell.x));
    const display = Array(maxY + 1).fill().map(() => Array(maxX + 1).fill(' '));
    
    data.forEach(cell => {
        if (cell.y < display.length && cell.x < display[0].length) {
            display[cell.y][cell.x] = cell.ansi + cell.char + '\x1b[0m';
        }
    });
    
    display.forEach(row => {
        process.stdout.write(row.join('') + '\n');
    });
    
    process.stdout.write(`\x1b[${process.stdout.rows};1H`);
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
        if (key === 'q') {
            process.stdout.write('\x1b[2J\x1b[H');
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.exit(0);
        }
    });
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const dataPath = args[0];
    
    if (!dataPath) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log('Usage: npm run see <path>\n');
        process.exit(1);
    }
    
    try {
        const fileContent = fs.readFileSync(dataPath, 'utf8');
        
        if (dataPath.endsWith('.json')) {
            // Handle JavaScript object syntax in .json files (from generate.js)
            // Convert JavaScript object syntax to valid JSON
            const jsonString = fileContent
                .replace(/(\w+):/g, '"$1":')  // Quote property names
                .replace(/'/g, '"');           // Replace single quotes with double quotes
            
            const data = JSON.parse(jsonString);
            display(data);
        } else {
            // Try to parse as regular JSON
            const data = JSON.parse(fileContent);
            display(data);
        }
    } catch (error) {
        console.error('Error reading file:', error.message);
        console.log('Expected format: JSON or JavaScript object syntax');
        process.exit(1);
    }
}

module.exports = { display };
