const { spawn, exec } = require('child_process');
const fs = require('fs');

const socketPath = '/tmp/mykitty';

const kittyProcess = spawn('kitty', [
  `--listen-on=unix:${socketPath}`,
  '--override',
  'font_size=5.0'
], {
  detached: true,
  stdio: 'ignore',
});
kittyProcess.unref();

const waitForSocket = (path, retries = 10) => {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (fs.existsSync(path)) {
        resolve();
      } else if (retries <= 0) {
        reject(new Error('Timeout: Kitty socket not found'));
      } else {
        retries--;
        setTimeout(check, 300);
      }
    };
    check();
  });
};

waitForSocket(socketPath)
.then(() => {
    exec(`kitty @ --to unix:${socketPath} set-font-size 1`, (err, stdout, stderr) => {
        if (err) {
            console.error('Error:', err.message);
            return;
        }
        
        console.log('Output:', stdout.trim());
    });
})
.catch(err => {
    console.error('Failed to connect to Kitty:', err.message);
});
