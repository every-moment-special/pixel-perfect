'use strict';

const { currentPath } = require('../utils/helper');

const state = {
  scrollX: 0,
  scrollY: 0,
  selectedIndex: 0,
  currentPath: currentPath,
  view: 'grid',
  photoPath: null,
  mediaIndex: 0,
  mediaFiles: [],
  directoryItemCache: new Map(),
  lastDirectoryRead: null,
  gifPlayers: new Map(),
  onGifFrameUpdate: null,
  needsRerender: false,

  terminal: {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  },
};

if (process.stdout && typeof process.stdout.on === 'function') {
  process.stdout.on('resize', () => {
    state.terminal.width = process.stdout.columns || state.terminal.width || 80;
    state.terminal.height = process.stdout.rows || state.terminal.height || 24;
  });
}

module.exports = { state };
