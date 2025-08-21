const Panel = require('./panel.js');
const Photo = require('./photo.js');
const { terminal } = require('../utils/helper.js');
const { state } = require('../core/state.js');
const { element } = require('../modules/shadow-tree/shadowTree');

const Interface = async () => {
  if (state.view === 'photo' && state.photoPath) {
    return await Photo(state.photoPath);
  }

  return [
    element('div', {
      width: terminal.width,
      height: terminal.height,
      backgroundColor: 'black',
    },[
      Panel()
    ])
  ];
};

module.exports = Interface;
