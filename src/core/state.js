const path = require('path');

const state = {
  scrollX: 0,
  scrollY: 0,
  selectedIndex: 0,
  currentPath: path.join(__dirname, '..', '..', 'resources'),
  view: 'grid',
  photoPath: null,
  mediaIndex: 0,
  mediaFiles: [],
};

module.exports = { state };
