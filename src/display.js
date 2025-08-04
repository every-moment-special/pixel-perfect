const fs = require('fs');

const display = (data) => {
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
            let data;
            try {
                data = JSON.parse(fileContent);
            } catch (parseError) {
                const jsonString = fileContent
                    .replace(/(\w+):/g, '"$1":')
                    .replace(/'/g, '"');
                
                data = JSON.parse(jsonString);
            }
            display(data);
        } else {
            const data = JSON.parse(fileContent);
            display(data);
        }
    } catch (error) {
        console.error('Error reading file:', error.message);
        console.log('Expected format: JSON');
        process.exit(1);
    }
}

module.exports = { display };
