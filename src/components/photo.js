const { element } = require('../vdom');
const { terminal, isKitty } = require('../helper');

const Photo = (imagePath) => {
  return [
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
}

module.exports = Photo;
