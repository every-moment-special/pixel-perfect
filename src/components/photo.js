const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal, isKitty } = require('../utils/helper');
const { state } = require('../core/state');
const { truncateFilenameKeepExtension } = require('../utils/helper');

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
        height: terminal.height - 7,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 2,
        pixelFont: true,
        backgroundColor: 'black',
        overflow: 'hidden',
        zIndex: 0,
      }, imagePath),

      element('text', {
        width: terminal.width,
        height: 7,
        y: terminal.height - 7,
        textAlign: 'center',
        verticalAlign: 'middle',
        fontSize: 1,
        pixelFont: true,
        fontFamily: 'compact',
        backgroundColor: 'black',
        color: 'white',
        overflowX: 'auto',
        overflowY: 'hidden',
        zIndex: 0,
      }, truncateFilenameKeepExtension(imagePath.split('/').pop(), terminal.width - 2, 1, 'compact')),
    ])
  ];

  return elements;
}

module.exports = Photo;
