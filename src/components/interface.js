const Panel = require('./panel.js');
const Photo = require('./photo.js');
const { state } = require('../core/state.js');
const { element } = require('../modules/shadow-tree/shadowTree');

const Interface = async () => {
  if (state.view === 'photo' && state.photoPath) {
    return await Photo(state.photoPath);
  }

  return [
    element('div', {
      width: state.terminal.width,
      height: state.terminal.height,
      backgroundColor: 'black',
    },[
      Panel()
    ])
  ];
};

module.exports = Interface;
