const { element } = require('../vdom');
const { terminal, readDirectory, currentPath, isKitty } = require('../helper');
const { state } = require('../state');
const { measurePixelFont } = require('../pixelFont');
const path = require('path');

function truncateFilenameKeepExtension(filename, maxCellWidth, scale = 1) {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;

  // Fits as-is
  if (measurePixelFont(filename, scale).cellCols <= maxCellWidth) return filename;

  const ellipsis = '';

  // If even ellipsis + ext does not fit, try trimming ext from the left; fallback to ellipsis only
  if (measurePixelFont(ellipsis + ext, scale).cellCols > maxCellWidth) {
    let shortExt = ext;
    while (shortExt.length > 0 && measurePixelFont(ellipsis + shortExt, scale).cellCols > maxCellWidth) {
      shortExt = shortExt.slice(1);
    }
    return shortExt.length > 0 ? ellipsis + shortExt : ellipsis;
  }

  // Binary search the longest prefix of base that fits with ellipsis + ext
  let left = 0;
  let right = base.length;
  let best = '';
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = base.slice(0, mid) + ellipsis + ext;
    const width = measurePixelFont(candidate, scale).cellCols;
    if (width <= maxCellWidth) {
      best = candidate;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return best || (ellipsis + ext);
}

const Panel = (style = {}, content = []) => {
  const items = readDirectory(path.join(__dirname, '..', '..', 'resources'));

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
        `${currentPath.split('/').pop()}`
      ),
      element('text', {
          // width: terminal.width,
          y: 10,
          height: 10,
          textAlign: 'left',
          verticalAlign: 'middle',
          fontSize: 1,
          pixelFont: true,
          backgroundColor: 'transparent',
          color: 'cyan',
          zIndex: 2,
        },
        `Selected: ${selected+1} of ${itemCount}`
      ),
      element('text', {
          width: terminal.width,
          y: 10,
          height: 10,
          textAlign: 'right',
          verticalAlign: 'middle',
          fontSize: 1,
          pixelFont: true,
          backgroundColor: 'transparent',
          color: 'cyan',
          zIndex: 1,
        },
        `Size: ${terminal.width}x${terminal.height * 2}`
      )
    ]),
    element('div', {
        width: terminal.width,
        height: terminal.height - 20,
        y: 20,
        textAlign: 'left',
        verticalAlign: 'top',
        fontSize: 2,
        pixelFont: isKitty ? false : true,
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
                  pixelFont: isKitty ? false : true,
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
                  pixelFont: isKitty ? false : true,
                  backgroundColor: 'transparent',
                  zIndex: 0,
                  color: isSelected ? 'cyan' : 'gray',
                },
                truncateFilenameKeepExtension(item.name, 64, 1)
              )
            ]);
          }

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
                  pixelFont: isKitty ? false : true,
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
                  pixelFont: isKitty ? false : true,
                  backgroundColor: 'transparent',
                  zIndex: 0,
                  color: isSelected ? 'cyan' : 'gray',
                },
                truncateFilenameKeepExtension(item.name, 64, 1)
              )
            ]);
          }
        }),
      ]
    )
  ];
}

module.exports = Panel;
