const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal } = require('../utils/helper');
const { state } = require('../core/state');
const { truncateFilenameKeepExtension } = require('../utils/helper');
const { GifPlayer } = require('../utils/gifPlayer');
const { Generator } = require('../utils/generate.js');

const Photo = async (imagePath) => {
  const isGif = imagePath.toLowerCase().endsWith('.gif');
  
  let normalizedWidth = terminal.width;
  let normalizedHeight = terminal.height - 4;
  
  if (isGif) {
    try {
      const generator = new Generator();
      const dimensions = await generator.getImageDimensions(imagePath);
      const imageAspectRatio = dimensions.width / dimensions.height;
      
      if (imageAspectRatio > 1) {
        normalizedWidth = terminal.width;
        normalizedHeight = Math.round(terminal.width / imageAspectRatio);
      } else {
        normalizedHeight = terminal.height - 4;
        normalizedWidth = Math.round((terminal.height - 4) * imageAspectRatio);
      }
    } catch (error) {
      console.warn(`Could not get GIF dimensions for ${imagePath}:`, error.message);
    }
    
    if (!state.gifPlayers) {
      state.gifPlayers = new Map();
    }
    
    for (const [key, player] of state.gifPlayers.entries()) {
      if (key !== imagePath) {
        player.pause();
        player.currentFrame = 0;
      }
    }
    
    const gifKey = imagePath;
    let gifPlayer = state.gifPlayers.get(gifKey);
    
    const needsReload = gifPlayer && gifPlayer.needsReload(
      terminal.width, 
      terminal.height - 4, 
      normalizedWidth, 
      normalizedHeight
    );
    
    if (needsReload) {
      gifPlayer.killFrameConversion();
      
      gifPlayer.clearSizeCache(gifPlayer.normalizedWidth, gifPlayer.normalizedHeight);
      
      gifPlayer.width = terminal.width;
      gifPlayer.height = terminal.height - 4;
      gifPlayer.normalizedWidth = normalizedWidth;
      gifPlayer.normalizedHeight = normalizedHeight;
      
      if (gifPlayer.isPlaying) {
        gifPlayer.resume();
      }
    }
    
    if (!gifPlayer) {
      gifPlayer = new GifPlayer();
      state.gifPlayers.set(gifKey, gifPlayer);
      
      gifPlayer.isLoading = true;
      
      gifPlayer.loadGif(imagePath, terminal.width, terminal.height - 4, normalizedWidth, normalizedHeight).then(() => {
        gifPlayer.isLoading = false;
        gifPlayer.play((frameData) => {
          if (state.photoPath === imagePath) {
            state.needsRerender = true;
          }
        });
      }).catch(error => {
        gifPlayer.isLoading = false;
      });
    } else if (!gifPlayer.isPlaying && gifPlayer.frameCache.size > 0) {
      gifPlayer.resume();
    } else if (!gifPlayer.isPlaying && gifPlayer.frameCache.size === 0) {
      gifPlayer.isLoading = true;
      gifPlayer.loadGif(imagePath, terminal.width, terminal.height - 4, normalizedWidth, normalizedHeight).then(() => {
        gifPlayer.isLoading = false;
        gifPlayer.play((frameData) => {
          if (state.photoPath === imagePath) {
            state.needsRerender = true;
          }
        });
      }).catch(error => {
        gifPlayer.isLoading = false;
      });
    }
  }

  const elements = [
    element('div', {
      width: terminal.width,
      height: terminal.height,
      backgroundColor: 'black',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 1,
    }, [
      element('img', {
        width: terminal.width,
        height: terminal.height - 4,
        textAlign: 'left',
        verticalAlign: 'top',
        pixelFont: true,
        backgroundColor: 'black',
        overflow: 'hidden',
        staticMode: false,
      }, imagePath),

      element('text', {
        width: terminal.width,
        height: 4,
        y: terminal.height - 4,
        textAlign: 'center',
        verticalAlign: 'bottom',
        fontSize: 1,
        pixelFont: true,
        fontFamily: 'compact',
        backgroundColor: 'black',
        color: 'white',
        overflowX: 'auto',
        overflowY: 'hidden',
      }, truncateFilenameKeepExtension(imagePath.split('/').pop(), terminal.width - 2, 1, 'compact')),
    ])
  ];

  return elements;
}

module.exports = Photo;
