const { exec } = require('child_process');

const setTerminalFontSize = (size) => {
    return new Promise((resolve, reject) => {
        exec(`kitty @ set-font-size ${size}`, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });
}

module.exports = {
    setTerminalFontSize,
}
