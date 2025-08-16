const Panel = require('./panel.js');
const Photo = require('./photo.js');
const { terminal } = require('../utils/helper.js');
const { state } = require('../core/state.js');
const { element } = require('../modules/shadow-tree/shadowTree');

const Interface = () => {
  if (state.view === 'photo' && state.photoPath) {
    return Photo(state.photoPath);
  }

  return [
    element('div', {
      x: 0,
      y: 0,
      width: terminal.width,
      height: terminal.height,
      backgroundColor: 'black',
      zIndex: 0,
    },[
      Panel()
    ])
  ];
};

module.exports = Interface;
