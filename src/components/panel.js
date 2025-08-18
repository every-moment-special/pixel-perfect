const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal, readDirectory, isKitty, truncateFilenameKeepExtension } = require('../utils/helper');
const { state } = require('../core/state');
const path = require('path');

const Panel = (style = {}, content = []) => {
  const items = readDirectory(state.currentPath);

  // Check if directory has changed and clear cache if needed
  const currentTime = Date.now();
  if (state.lastDirectoryRead !== state.currentPath) {
    // Directory changed, clear the cache
    state.directoryItemCache.clear();
    state.lastDirectoryRead = state.currentPath;
  }

  const mediaItems = items.sort((a, b) => a.type.localeCompare(b.type));
  const itemCount = mediaItems.length;
  // Clamp selected index to valid range [0, itemCount - 1]
  const selected = itemCount > 0
    ? Math.max(0, Math.min(state.selectedIndex || 0, itemCount - 1))
    : 0;

  style = {
    x: style.x !== undefined ? style.x : 0,
    y: style.y !== undefined ? style.y : terminal.height - 4,
    width: terminal.width,
    height: 4,
    backgroundColor: 'black',
    zIndex: 10,
    position: 'fixed',
  };

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
        zIndex: 0,
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
              zIndex: 0,
            }, [
              // element(
              //   'img',
              //   { 
              //     width: 64,
              //     height: 32,
              //     textAlign: 'left',
              //     verticalAlign: 'top',
              //     fontSize: 2,
              //     pixelFont: true,
              //     backgroundColor: 'black',
              //     overflow: 'hidden',
              //     zIndex: 0,
              //   },
              //   path.join(__dirname, '..', 'assets', 'dir.svg')
              // ),
              element(
                'text',
                {
                  width: 64,
                  height: 32,
                  y: 0,
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  fontSize: 5,
                  pixelFont: true,
                  fontFamily: 'compact',
                  backgroundColor: 'transparent',
                  zIndex: 10,
                  color: isSelected ? 'white' : 'coolGray',
                  // position: 'absolute',
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
                  zIndex: 0,
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
                    zIndex: 0,
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
                    zIndex: 0,
                    color: isSelected ? 'white' : 'coolGray',
                  },
                  truncateFilenameKeepExtension(item.name, 62, 1, 'compact')
                ),
            ]);
          }
        }),
      ]
    ),

    element('div', style, [
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
