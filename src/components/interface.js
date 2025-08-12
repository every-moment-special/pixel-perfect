const Panel = require('./panel.js');
const Photo = require('./photo.js');
const { terminal } = require('../utils/helper.js');
const { state } = require('../core/state.js');

const Interface = () => {
  // const style = { x: 0, y: 2, width: terminal.width, height: terminal.height - 2 };
  if (state.view === 'photo' && state.photoPath) {
    return Photo(state.photoPath);
  }
  return Panel();
};

module.exports = Interface;
