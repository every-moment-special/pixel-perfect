const { exec } = require('child_process');
const { setTerminalFontSize, isKitty } = require('./helper');
const Interface = require('./interface.js');
const { render } = require('./vdom');
const { event } = require('./helper');

async function main() {
  if (isKitty) {
    await setTerminalFontSize(1);
  }


  try {
    let tree = Interface();
    render(tree);
    // await gui.start();

    // Rebuild interface on resize to pick up new terminal dims used inside node styles
    let resizeTimer = null;
    event.on('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        tree = Interface();
        render(tree);
      }, 50);
    });

  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("Running cleanup...");
  try {
    if (isKitty) {
      await setTerminalFontSize(9);
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

module.exports = { isKitty };
