const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal, isKitty } = require('../utils/helper');
const { state } = require('../core/state');

const Photo = (imagePath) => {
  const elements = [
    element('div', {
      x: 0,
      y: 0,
      width: terminal.width,
      height: terminal.height,
      backgroundColor: 'black',
      zIndex: 0,
    }, [
      element('img', {
        width: terminal.width,
        height: terminal.height,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 2,
        pixelFont: isKitty ? false : true,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        zIndex: 0,
      }, imagePath)
    ])
  ];

  if (state.mediaFiles.length > 1) {
    const currentIndex = state.mediaIndex + 1;
    const totalCount = state.mediaFiles.length;
    const infoText = `${currentIndex}/${totalCount}`;
    
    elements.push(
      element('div', {
        x: terminal.width - infoText.length - 2,
        y: terminal.height - 2,
        width: infoText.length + 2,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        zIndex: 10,
      }, infoText)
    );

    const hintText = '← → navigate • backspace back';
    elements.push(
      element('div', {
        x: 1,
        y: terminal.height - 2,
        width: hintText.length + 2,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        zIndex: 10,
      }, hintText)
    );
  }

  return elements;
}

module.exports = Photo;
