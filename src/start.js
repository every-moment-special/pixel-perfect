#!/usr/bin/env node

const { exec } = require('child_process');
const { setTerminalFontSize, isKitty, readDirectory, cleanupImageCache } = require('./utils/helper.js');
const Interface = require('./components/interface.js');
const { render } = require('./modules/shadow-tree/shadowTree.js');
const { event } = require('./utils/helper.js');
const { state } = require('./core/state.js');
const { setFontMode, FONT_MODE } = require('./modules/pixel-font/pixelFont.js');
const path = require('path');

async function main() {
  // Check for compact font mode via environment variable or command line
  const useCompactFont = process.env.COMPACT_FONT === 'true' || process.argv.includes('--compact-font');
  if (useCompactFont) {
    setFontMode(FONT_MODE.COMPACT);
    console.log('Using compact font mode (3x5 glyphs)');
  }

  // if (isKitty) {
  //   await setTerminalFontSize(1);
  // }


    try {
    // Enter alternate screen buffer and hide cursor for a clean TUI area
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
    // Disable terminal local echo as an extra safeguard (if supported)
    process.stdout.write('\x1b[?12l');

    // Enable mouse tracking (SGR) so we can receive click events
    try { event.enableMouse(); } catch (_) {}

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

    const getScrollStep = (direction) => {
      // If we have grid row metadata, jump to next/prev row boundary
      const containers = Array.isArray(laidOut) ? laidOut : [laidOut];
      let best = null;
      const current = state.scrollY || 0;
      const scan = (node) => {
        if (!node || typeof node !== 'object') return;
        const s = node.computedStyle || {};
        if (s.overflow === 'auto' && node.scrollMeta) {
          const { rowTops, rowHeights } = node.scrollMeta;
          if (Array.isArray(rowTops) && Array.isArray(rowHeights) && rowTops.length === rowHeights.length && rowTops.length > 0) {
            if (direction < 0) {
              // find the largest rowTop strictly less than current
              const candidates = rowTops.filter((t) => t < current);
              if (candidates.length > 0) {
                const nextTop = candidates[candidates.length - 1];
                best = (best == null) ? nextTop : Math.max(best, nextTop);
              } else {
                best = 0;
              }
            } else {
              // find the smallest rowTop strictly greater than current
              const candidates = rowTops.filter((t) => t > current);
              if (candidates.length > 0) {
                const nextTop = candidates[0];
                best = (best == null) ? nextTop : Math.min(best, nextTop);
              }
            }
          }
        }
        const children = Array.isArray(node.content) ? node.content : (node.content ? [node.content] : []);
        for (const c of children) scan(c);
      };
      for (const n of containers) scan(n);
      if (best == null) return direction < 0 ? current - 1 : current + 1; // fallback
      return best;
    };

    // Selection-aware grid helpers
    const findGridContainer = (node) => {
      if (!node || typeof node !== 'object') return null;
      const style = node.computedStyle || {};
      if (style.display === 'grid') return node;
      const children = Array.isArray(node.content) ? node.content : (node.content ? [node.content] : []);
      for (const c of children) {
        const found = findGridContainer(c);
        if (found) return found;
      }
      return null;
    };

    const getGridContext = () => {
      const rootNodes = Array.isArray(laidOut) ? laidOut : [laidOut];
      let grid = null;
      for (const n of rootNodes) {
        grid = findGridContainer(n);
        if (grid) break;
      }
      if (!grid) return null;
      const container = grid;
      const rowTops = container.scrollMeta?.rowTops || [];
      const rowHeights = container.scrollMeta?.rowHeights || [];
      const content = Array.isArray(container.content) ? container.content : [];
      // Estimate columns using first row band
      let columns = 0;
      if (rowTops.length > 0 && rowHeights.length > 0) {
        const top0 = rowTops[0];
        const h0 = rowHeights[0];
        const y0Min = container.frame.y + top0;
        const y0Max = y0Min + h0 - 1;
        for (const ch of content) {
          if (!ch || !ch.frame) continue;
          const cy = ch.frame.y;
          if (cy >= y0Min && cy <= y0Max) columns++;
        }
      }
      if (columns <= 0) columns = content.length > 0 ? content.length : 1;
      const viewportHeight = container.frame?.height || 0;
      const contentHeight = container.scrollMeta?.contentHeight || 0;
      const itemCount = content.length;
      return { container, columns, rowTops, rowHeights, viewportHeight, contentHeight, itemCount };
    };

    const ensureRowVisible = (ctx, rowIndex) => {
      if (!ctx) return;
      const { rowTops, rowHeights, viewportHeight, contentHeight } = ctx;
      if (!rowTops || !rowHeights || rowIndex < 0 || rowIndex >= rowTops.length) return;
      const rowTop = rowTops[rowIndex];
      const rowBottom = rowTop + Math.max(1, rowHeights[rowIndex]) - 1;
      const current = state.scrollY || 0;
      let next = current;
      if (rowTop < current) next = rowTop;
      else if (rowBottom >= current + viewportHeight) next = Math.max(0, rowBottom - viewportHeight + 1);
      next = Math.max(0, Math.min(next, Math.max(0, contentHeight - viewportHeight)));
      if (next !== current) state.scrollY = next;
    };

    event.on('key:enter', async () => {
      const ctx = getGridContext();
      if (ctx) {
        const items = readDirectory(state.currentPath);
        const count = items.length;
        if (count === 0) return;
        const selectedIndex = state.selectedIndex || 0;
        const selectedItem = items[selectedIndex];
        if (selectedItem) {
          if (selectedItem.type === 'directory') {
            state.currentPath = path.join(state.currentPath, selectedItem.name);
            state.selectedIndex = 0;
            state.scrollY = 0;
            tree = Interface();
            laidOut = await render(tree);
          } else if (selectedItem.type === 'media') {
            const mediaFiles = items.filter(item => item.type === 'media');
            const mediaIndex = mediaFiles.findIndex(item => item.path === selectedItem.path);
            
            state.view = 'photo';
            state.photoPath = selectedItem.path;
            state.mediaFiles = mediaFiles;
            state.mediaIndex = mediaIndex >= 0 ? mediaIndex : 0;
            tree = Interface();
            laidOut = await render(tree);
          }
        }
      }
    });

    event.on('key:backspace', async () => {
      if (state.view === 'photo') {
        state.view = 'grid';
        state.photoPath = null;
        state.mediaFiles = [];
        state.mediaIndex = 0;
      } else {
        const parentPath = path.dirname(state.currentPath);
        if (!parentPath || parentPath === state.currentPath) return;
        state.currentPath = parentPath;
        state.selectedIndex = 0;
        state.scrollY = 0;
      }
      tree = Interface();
      laidOut = await render(tree);
    });

    event.on('key:up', async () => {
      const ctx = getGridContext();
      if (ctx) {
        const prevIndex = state.selectedIndex || 0;
        const newIndex = Math.max(0, prevIndex - ctx.columns);
        if (newIndex !== prevIndex) {
          state.selectedIndex = newIndex;
          const rowIndex = Math.floor(newIndex / Math.max(1, ctx.columns));
          ensureRowVisible(ctx, rowIndex);
          tree = Interface();
          laidOut = await render(tree);
          return;
        }
      }
      // Fallback to scroll behavior
      const prev = state.scrollY || 0;
      const max = getMaxScrollY();
      const target = getScrollStep(-1);
      const next = Math.max(0, Math.min(target, max));
      if (next === prev) return;
      state.scrollY = next;
      tree = Interface();
      laidOut = await render(tree);
    });
    event.on('key:down', async () => {
      const ctx = getGridContext();
      if (ctx) {
        const prevIndex = state.selectedIndex || 0;
        const newIndex = Math.min(ctx.itemCount - 1, prevIndex + ctx.columns);
        if (newIndex !== prevIndex) {
          state.selectedIndex = newIndex;
          const rowIndex = Math.floor(newIndex / Math.max(1, ctx.columns));
          ensureRowVisible(ctx, rowIndex);
          tree = Interface();
          laidOut = await render(tree);
          return;
        }
      }
      // Fallback to scroll behavior
      const prev = state.scrollY || 0;
      const max = getMaxScrollY();
      const target = getScrollStep(1);
      const next = Math.max(0, Math.min(target, max));
      if (next === prev) return;
      state.scrollY = next;
      tree = Interface();
      laidOut = await render(tree);
    });

    // Track last click for double-click detection
    let lastClickTime = 0;
    let lastClickIndex = -1;
    const doubleClickThresholdMs = 500;

    // Mouse click handling: left click selects/open on double-click, right click goes back
    const getTileIndexAtPoint = (container, px, py) => {
      if (!container) return -1;
      const children = Array.isArray(container.content) ? container.content : [];
      for (let i = 0; i < children.length; i++) {
        const ch = children[i];
        const f = ch && ch.frame;
        if (!f) continue;
        if (px >= f.x && px < f.x + f.width && py >= f.y && py < f.y + f.height) {
          return i;
        }
      }
      return -1;
    };

    event.on('click', async ({ x, y, button }) => {
      // Right click: works even when not in grid view
      if (button === 2) {
        if (state.view === 'photo') {
          state.view = 'grid';
          state.photoPath = null;
        } else {
          const parentPath = path.dirname(state.currentPath);
          if (parentPath && parentPath !== state.currentPath) {
            state.currentPath = parentPath;
            state.selectedIndex = 0;
            state.scrollY = 0;
          }
        }
        tree = Interface();
        laidOut = await render(tree);
        return;
      }

      const ctx = getGridContext();
      if (!ctx) return;
      const px = Math.max(0, (x || 1) - 1);
      const py = Math.max(0, (y || 1) - 1);

      // Only handle selection/double-open for left click
      if (button !== 0) return;

      const hit = getTileIndexAtPoint(ctx.container, px, py);
      if (hit < 0 || hit >= ctx.itemCount) return;

      const now = Date.now();
      const isDoubleClick = (hit === lastClickIndex) && (now - lastClickTime <= doubleClickThresholdMs);
      lastClickTime = now;
      lastClickIndex = hit;

      state.selectedIndex = hit;
      const rowIndex = Math.floor(hit / Math.max(1, ctx.columns));
      ensureRowVisible(ctx, rowIndex);

      if (isDoubleClick) {
        const items = readDirectory(state.currentPath);
        const selectedItem = items[hit];
        if (selectedItem) {
          if (selectedItem.type === 'directory') {
            state.currentPath = path.join(state.currentPath, selectedItem.name);
            state.selectedIndex = 0;
            state.scrollY = 0;
          } else if (selectedItem.type === 'media') {
            const mediaFiles = items.filter(item => item.type === 'media');
            const mediaIndex = mediaFiles.findIndex(item => item.path === selectedItem.path);
            
            state.view = 'photo';
            state.photoPath = selectedItem.path;
            state.mediaFiles = mediaFiles;
            state.mediaIndex = mediaIndex >= 0 ? mediaIndex : 0;
          }
        }
      }

      tree = Interface();
      laidOut = await render(tree);
    });

    // Selection left/right
    event.on('key:left', async () => {
      if (state.view === 'photo' && state.mediaFiles.length > 0) {
        const prev = state.mediaIndex || 0;
        const next = (prev - 1 + state.mediaFiles.length) % state.mediaFiles.length;
        if (next !== prev) {
          state.mediaIndex = next;
          state.photoPath = state.mediaFiles[next].path;
          tree = Interface();
          laidOut = await render(tree);
        }
        return;
      }

      const resourcesDir = path.join(__dirname, '..', 'resources');
      const items = readDirectory(resourcesDir).sort((a, b) => a.type.localeCompare(b.type));
      const count = items.length;
      if (count === 0) return;
      const prev = state.selectedIndex || 0;
      const next = (prev - 1 + count) % count;
      if (next < 0) return;
      if (next === prev) return;
      state.selectedIndex = next;

      // Ensure visibility (handle wrap-around first->last)
      const ctx = getGridContext();
      if (ctx) {
        const rowIndex = Math.floor(next / Math.max(1, ctx.columns));
        ensureRowVisible(ctx, rowIndex);
      }

      tree = Interface();
      laidOut = await render(tree);
    });

    event.on('key:right', async () => {
      if (state.view === 'photo' && state.mediaFiles.length > 0) {
        const prev = state.mediaIndex || 0;
        const next = (prev + 1) % state.mediaFiles.length;
        if (next !== prev) {
          state.mediaIndex = next;
          state.photoPath = state.mediaFiles[next].path;
          tree = Interface();
          laidOut = await render(tree);
        }
        return;
      }

      const resourcesDir = path.join(__dirname, '..', 'resources');
      const items = readDirectory(resourcesDir).sort((a, b) => a.type.localeCompare(b.type));
      const count = items.length;
      if (count === 0) return;
      const prev = state.selectedIndex || 0;
      const next = (prev + 1) % count;
      if (next > count) return;
      if (next === prev) return;
      state.selectedIndex = next;

      // Ensure visibility (handle wrap-around last->first)
      const ctx = getGridContext();
      if (ctx) {
        const rowIndex = Math.floor(next / Math.max(1, ctx.columns));
        ensureRowVisible(ctx, rowIndex);
      }

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

    // Periodic cache cleanup to prevent memory leaks
    setInterval(() => {
      cleanupImageCache();
    }, 60000); // Clean up every minute

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
