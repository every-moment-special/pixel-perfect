const path = require('path');

// Shared UI state

const state = {
  scrollX: 0,
  scrollY: 0,
  selectedIndex: 0,
  currentPath: path.join(__dirname, '..', 'resources'),
  view: 'grid',
  photoPath: null,
};

module.exports = { state };
