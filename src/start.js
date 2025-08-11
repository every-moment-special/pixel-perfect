const { exec } = require('child_process');
const { setTerminalFontSize, isKitty } = require('./helper');
const Interface = require('./interface.js');
const { render } = require('./vdom');
const { event } = require('./helper');
const { state } = require('./state');

async function main() {
  if (isKitty) {
    await setTerminalFontSize(1);
  }


    try {
    // Enter alternate screen buffer and hide cursor for a clean TUI area
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
    // Disable terminal local echo as an extra safeguard (if supported)
    process.stdout.write('\x1b[?12l');

    let tree = Interface();
    render(tree);
    // Extra paint shortly after start to wipe any startup logs (e.g., inspector message)
    setTimeout(() => {
      tree = Interface();
      render(tree);
    }, 200);
    // await gui.start();
    
    // Scroll with arrow keys when overflow is auto
    event.on('key:up', () => {
      state.scrollY = Math.max(0, (state.scrollY || 0) - 1);
      tree = Interface();
      render(tree);
    });
    event.on('key:down', () => {
      state.scrollY = (state.scrollY || 0) + 1;
      tree = Interface();
      render(tree);
    });

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
    // Restore cursor and leave alternate screen buffer
    try { process.stdout.write('\x1b[?25h'); } catch (_) {}
    try { process.stdout.write('\x1b[?12h'); } catch (_) {}
    try { process.stdout.write('\x1b[?1049l'); } catch (_) {}
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
