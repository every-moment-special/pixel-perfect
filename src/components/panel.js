const { element } = require('../vdom');
const { terminal, readDirectory, currentPath } = require('../helper');
const { state } = require('../state');

const Panel = (style = {}, content = []) => {
  const items = readDirectory(path.join(__dirname, '..', '..', 'resources'));

  style = {
    x: 0,
    y: 1,
    width: terminal.width,
    height: 5,
    backgroundColor: 'transparent',
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
          color: 'white'
        },
        `size: ${terminal.width}x${terminal.height - 5}`
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
        scrollY: state.scrollY || 0,
        justifyContent: 'center',
      }, [
        items.filter(item => item.type === 'media').map((item, index) => {
          if (item.type === 'media') {
            return element('div', { display: 'flex', flexDirection: 'column', gap: 1, backgroundColor: 'transparent', overflow: 'hidden' }, [
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
                  verticalAlign: 'top',
                  fontSize: 1,
                  pixelFont: true,
                  backgroundColor: 'transparent'
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
