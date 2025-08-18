const path = require('path');
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
  // Cache for generated directory item images
  directoryItemCache: new Map(), // key: itemPath, value: { cells, timestamp }
  lastDirectoryRead: null, // timestamp of last directory read
  // GIF player management
  gifPlayers: new Map(), // key: gifPath, value: GifPlayer instance
  onGifFrameUpdate: null, // callback for when GIF frames update
  needsRerender: false, // flag to indicate if a re-render is needed
};

module.exports = { state };
