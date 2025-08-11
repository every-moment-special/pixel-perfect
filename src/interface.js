const Panel = require('./components/panel.js');
const Photo = require('./components/photo.js');
const { terminal } = require('./helper.js');
const { state } = require('./state');

const Interface = () => {
  // const style = { x: 0, y: 2, width: terminal.width, height: terminal.height - 2 };
  if (state.view === 'photo' && state.photoPath) {
    return Photo(state.photoPath);
  }
  return Panel();
};

module.exports = Interface;
