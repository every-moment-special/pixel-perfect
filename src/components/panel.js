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
    x: 0,
    y: 0,
    width: terminal.width,
    height: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
    position: 'fixed',
  };

  return [
    element('div', style, [
      element('text', {
          width: terminal.width,
          height: 10,
          textAlign: 'center',
          verticalAlign: 'middle',
          fontSize: 1,
          pixelFont: true,
          backgroundColor: 'transparent',
          color: 'cyan',
          zIndex: 2,
        },
        `${(state.currentPath || '').split('/').pop()}`
      ),
      // element('text', {
      //     // width: terminal.width,
      //     y: 10,
      //     height: 10,
      //     textAlign: 'left',
      //     verticalAlign: 'middle',
      //     fontSize: 1,
      //     pixelFont: true,
      //     backgroundColor: 'transparent',
      //     color: 'cyan',
      //     zIndex: 2,
      //   },
      //   `Selected: ${selected+1} of ${itemCount}`
      // ),
      // element('text', {
      //     width: terminal.width,
      //     y: 10,
      //     height: 10,
      //     textAlign: 'right',
      //     verticalAlign: 'middle',
      //     fontSize: 1,
      //     pixelFont: true,
      //     backgroundColor: 'transparent',
      //     color: 'cyan',
      //     zIndex: 1,
      //   },
      //   `Size: ${terminal.width}x${terminal.height * 2}`
      // )
    ]),
    element('div', {
        width: terminal.width,
        height: terminal.height - 10,
        y: 10,
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

          if (item.type === 'directory') {
            return element('div', { 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 1, 
              backgroundColor: 'transparent', 
              overflow: 'hidden', 
              zIndex: 0,
              // borderRadius: 2,
              // border: { width: 1, color: 'red', style: 'box' }
            }, [
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
                  backgroundColor: 'transparent',
                  overflow: 'hidden',
                  zIndex: 0,
                },
                path.join(__dirname, '..', 'assets', 'dir.svg')
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
                truncateFilenameKeepExtension(item.name, 64, 1)
              ),
            ]);
          }

          if (item.type === 'media') {
            return element('div', {
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                backgroundColor: 'transparent',
                overflow: 'hidden',
                zIndex: 0,
                // borderRadius: 1,
                // border: { width: 1, color: 'red', style: 'box' }
              }, [
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
                    backgroundColor: 'transparent',
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
                  truncateFilenameKeepExtension(item.name, 64, 1)
                ),
            ]);
          }
        }),
      ]
    )
  ];
}

module.exports = Panel;
