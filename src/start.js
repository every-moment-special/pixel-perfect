const { exec } = require('child_process');
const { TerminalGUI } = require('./run.js');

const isKitty = !!process.env.KITTY_WINDOW_ID;

function setFontSize(size) {
  return new Promise((resolve, reject) => {
    exec(`kitty @ set-font-size ${size}`, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

async function main() {
  if (isKitty) {
    await setFontSize(1);
  }


  try {
    const gui = new TerminalGUI();
    await gui.start();

  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("Running cleanup...");
  try {
    if (isKitty) {
      await setFontSize(9);
    }
    console.log("Font size restored.");
  } catch (err) {
    console.error("Error restoring font size:", err.message);
  } finally {
    process.exit();
  }
}

process.on('SIGINT', shutdown);   // Ctrl+C
process.on('SIGTERM', shutdown);  // kill
process.on('uncaughtException', err => {
  console.error("Uncaught error:", err);
  shutdown();
});

main();

module.exports = { setFontSize, isKitty };
