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
    let laidOut = await render(tree);
    // Extra paint shortly after start to wipe any startup logs (e.g., inspector message)
    setTimeout(async () => {
      tree = Interface();
      laidOut = await render(tree);
    }, 200);
    // await gui.start();
    
    // Scroll with arrow keys when overflow is auto
    const getMaxScrollY = () => {
      const containers = Array.isArray(laidOut) ? laidOut : [laidOut];
      let maxScrollY = 0;
      const scan = (node) => {
        if (!node || typeof node !== 'object') return;
        const s = node.computedStyle || {};
        if (s.overflow === 'auto' && node.scrollMeta) {
          const { contentHeight } = node.scrollMeta;
          const h = node.frame?.height || 0;
          maxScrollY = Math.max(maxScrollY, Math.max(0, contentHeight - h));
        }
        const children = Array.isArray(node.content) ? node.content : (node.content ? [node.content] : []);
        for (const c of children) scan(c);
      };
      for (const n of containers) scan(n);
      return maxScrollY;
    };

    event.on('key:up', async () => {
      const prev = state.scrollY || 0;
      const max = getMaxScrollY();
      const next = Math.max(0, Math.min(prev - 1, max));
      if (next === prev) return; // no change, skip rerender
      state.scrollY = next;
      tree = Interface();
      laidOut = await render(tree);
    });
    event.on('key:down', async () => {
      const prev = state.scrollY || 0;
      const max = getMaxScrollY();
      const next = Math.max(0, Math.min(prev + 1, max));
      if (next === prev) return; // no change, skip rerender
      state.scrollY = next;
      tree = Interface();
      laidOut = await render(tree);
    });

    // Rebuild interface on resize to pick up new terminal dims used inside node styles
    let resizeTimer = null;
    event.on('resize', async () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        (async () => {
          tree = Interface();
          laidOut = await render(tree);
        })();
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
