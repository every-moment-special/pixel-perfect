const path = require('path');

const state = {
  scrollX: 0,
  scrollY: 0,
  selectedIndex: 0,
  currentPath: path.resolve(process.cwd()),
  view: 'grid',
  photoPath: null,
  mediaIndex: 0,
  mediaFiles: [],
  // Cache for generated directory item images
  directoryItemCache: new Map(), // key: itemPath, value: { cells, timestamp }
  lastDirectoryRead: null, // timestamp of last directory read
};

module.exports = { state };
