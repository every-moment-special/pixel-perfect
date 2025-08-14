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
      backgroundColor: 'transparent',
      zIndex: 0,
    }, [
      element('text', {
        width: terminal.width,
        height: 10,
        textAlign: 'center',
        verticalAlign: 'middle',
        fontSize: 1,
        pixelFont: true,
        fontFamily: 'compact',
        backgroundColor: 'transparent',
        overflowX: 'auto',
        overflowY: 'hidden',
        zIndex: 0,
      }, truncateFilenameKeepExtension(imagePath.split('/').pop(), terminal.width - 2, 1, 'compact')),

      element('img', {
        width: terminal.width,
        height: terminal.height - 10,
        y: 10,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 2,
        pixelFont: true,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        zIndex: 0,
      }, imagePath)
    ])
  ];

  // elements.push(
  //   element('div', {
  //     x: 0,
  //     y: 0,
  //     width: terminal.width,
  //     height: 10,
  //     backgroundColor: 'transparent',
  //     zIndex: 0,
  //   }, [
  //     element('text', {
  //       width: terminal.width,
  //       height: 10,
  //       textAlign: 'center',
  //       verticalAlign: 'middle',
  //       fontSize: 1,
  //       pixelFont: true,
  //       backgroundColor: 'transparent',
  //       overflow: 'hidden',
  //       zIndex: 0,
  //     }, truncateFilenameKeepExtension(imagePath.split('/').pop(), terminal.width - 10, 1, 'compact'))
  //   ])
  // );

  // if (state.mediaFiles.length > 1) {
  //   const currentIndex = state.mediaIndex + 1;
  //   const totalCount = state.mediaFiles.length;
  //   const infoText = `${currentIndex}/${totalCount}`;
    
  //   elements.push(
  //     element('div', {
  //       x: terminal.width - infoText.length - 2,
  //       y: terminal.height - 2,
  //       width: infoText.length + 2,
  //       height: 1,
  //       backgroundColor: 'transparent',
  //       color: 'white',
  //       zIndex: 10,
  //     }, infoText)
  //   );

  //   const hintText = '← → navigate • backspace back';
  //   elements.push(
  //     element('div', {
  //       x: 1,
  //       y: terminal.height - 2,
  //       width: hintText.length + 2,
  //       height: 1,
  //       backgroundColor: 'transparent',
  //       color: 'white',
  //       zIndex: 10,
  //     }, hintText)
  //   );
  // }

  return elements;
}

module.exports = Photo;
