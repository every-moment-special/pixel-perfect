const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal, readDirectory, truncateFilenameKeepExtension } = require('../utils/helper');
const { state } = require('../core/state');

const Panel = () => {
  const items = readDirectory(state.currentPath);

  if (state.lastDirectoryRead !== state.currentPath) {
    state.directoryItemCache.clear();
    state.lastDirectoryRead = state.currentPath;
  }

  const mediaItems = items.sort((a, b) => a.type.localeCompare(b.type));
  const itemCount = mediaItems.length;

  const selected = itemCount > 0
    ? Math.max(0, Math.min(state.selectedIndex || 0, itemCount - 1))
    : 0;

  return [
    element('div', {
        width: terminal.width,
        height: terminal.height - 4 - 4,
        y: 4,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 1,
        pixelFont: true,
        display: 'grid',
        gap: 16,
        backgroundColor: 'black',
        overflow: 'auto',
        scrollbarWidth: 1,
        scrollY: state.scrollY || 0,
        justifyContent: 'center',
      }, [
        mediaItems.map((item, index) => {
          const isSelected = selected === index;
          
          if (item.type === 'directory') {
            const dirItems = readDirectory(state.currentPath + '/' + item.name);
            const dirItemCount = dirItems.length > 0 ? dirItems.length : 0;
            
            return element('div', { 
              display: 'flex', 
              flexDirection: 'column', 
              backgroundColor: 'black', 
              overflow: 'hidden', 
            }, [
              element(
                'text',
                {
                  width: 64,
                  height: 32,
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  fontSize: 3,
                  pixelFont: true,
                  fontFamily: 'compact',
                  backgroundColor: 'transparent',
                  zIndex: 10,
                  color: isSelected ? 'white' : 'coolGray',
                  border: {
                    width: 1,
                    color: 'white',
                    style: 'box',
                  },
                },
                dirItemCount
              ),

              element(
                'text',
                {
                  width: 64,
                  height: 7,
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  fontSize: 1,
                  pixelFont: true,
                  fontFamily: 'compact',
                  backgroundColor: 'black',
                  color: isSelected ? 'white' : 'coolGray',
                },
                truncateFilenameKeepExtension(item.name, 64, 1, 'compact')
              ),
            ]);
          }

          if (item.type === 'media') {
            return element('div', {
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'black',
                overflow: 'hidden',
                zIndex: 0,
              }, [
                element(
                  'img',
                  { 
                    width: 64,
                    height: 32,
                    textAlign: 'left',
                    verticalAlign: 'top',
                    fontSize: 2,
                    pixelFont: true,
                    backgroundColor: 'black',
                    overflow: 'hidden',
                    staticMode: true,
                    isPreview: true,
                  },
                  item.path
                ),

                element(
                  'text',
                  {
                    width: 64,
                    height: 7,
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    fontSize: 1,
                    pixelFont: true,
                    fontFamily: 'compact',
                    backgroundColor: 'black',
                    color: isSelected ? 'white' : 'coolGray',
                  },
                  truncateFilenameKeepExtension(item.name, 62, 1, 'compact')
                ),
            ]);
          }
        }),
      ]
    ),

    element('div', {
        y: terminal.height - 3,
        width: terminal.width,
        height: 4,
        backgroundColor: 'black',
        zIndex: 10,
        position: 'fixed',
      }, [
      element('text', {
          width: terminal.width / 2 - 4,
          height: 4,
          x: 4,
          textAlign: 'left',
          verticalAlign: 'bottom',
          fontSize: 1,
          pixelFont: true,
          fontFamily: 'compact',
          backgroundColor: 'black',
          color: 'white',
          zIndex: 2,
        },
        `Directory: ${(state.currentPath || '').split('/').pop()}`
      ),
      element('text', {
        width: terminal.width / 2 - 4,
        height: 4,
        x: terminal.width / 2 - 4,
        textAlign: 'right',
        verticalAlign: 'bottom',
        fontSize: 1,
        pixelFont: true,
        fontFamily: 'compact',
        backgroundColor: 'black',
        color: 'white',
        zIndex: 4,
      }, `Selected: ${itemCount > 0 ? state.selectedIndex + 1 : 0}/${itemCount}`),
    ]),
  ];
}

module.exports = Panel;
