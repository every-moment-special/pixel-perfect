const { element } = require('../vdom');
const { terminal, readDirectory, currentPath } = require('../helper');
const { state } = require('../state');
const path = require('path');

const Panel = (style = {}, content = []) => {
  const items = readDirectory(path.join(__dirname, '..', '..', 'resources'));

  const mediaItems = items.filter(item => item.type === 'media');
  const itemCount = mediaItems.length;
  const selected = itemCount > 0
    ? Math.max(0, Math.min(state.selectedIndex || 0, itemCount - 1))
    : 0;

  style = {
    x: 0,
    y: 1,
    width: terminal.width,
    height: 5,
    backgroundColor: 'transparent',
    zIndex: 10,
    position: 'fixed',
  };

  return [
    element('div', style, [
      element('text', {
          width: terminal.width,
          textAlign: 'center',
          verticalAlign: 'top',
          fontSize: 2,
          pixelFont: true,
          backgroundColor: 'transparent',
          color: 'white',
          zIndex: 1,
        },
        `size: ${terminal.width}x${terminal.height * 2 - 1}`
      )
    ]),
    element('div', {
        width: terminal.width,
        height: terminal.height - 5,
        y: 7,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 2,
        pixelFont: true,
        display: 'grid',
        gap: 10,
        backgroundColor: 'transparent', 
        overflow: 'auto',
        scrollbarWidth: 1,
        scrollY: state.scrollY || 0,
        justifyContent: 'center',
        zIndex: 0,
      }, [
        mediaItems.map((item, index) => {
          const isSelected = selected === index;
          if (item.type === 'media') {
            return element('div', { display: 'flex', flexDirection: 'column', gap: 1, backgroundColor: 'transparent', overflow: 'hidden', zIndex: 0 }, [
              element(
                'img',
                { 
                  // x: (index * 64) + (index * 5),
                  width: 64,
                  // y: 2,
                  height: 32,
                  textAlign: 'left',
                  verticalAlign: 'top',
                  fontSize: 2,
                  pixelFont: true,
                  backgroundColor: 'blue',
                  overflow: 'hidden',
                  zIndex: 0,
                },
                item.path
              ),

              element(
                'text',
                { 
                  // x: (index * 64) + (index * 5),
                  width: 64,
                  // y: 2 + 32 + 1,
                  textAlign: 'center',
                  verticalAlign: 'bottom',
                  fontSize: 1,
                  pixelFont: true,
                  backgroundColor: 'transparent',
                  zIndex: 0,
                  color: isSelected ? 'cyan' : 'gray',
                },
                item.name
              )
            ]);
          }
        }),
      ]
    )
  ];
}

module.exports = Panel;
