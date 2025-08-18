const { element } = require('../modules/shadow-tree/shadowTree');
const { terminal, isKitty } = require('../utils/helper');
const { state } = require('../core/state');
const { truncateFilenameKeepExtension } = require('../utils/helper');
const { GifPlayer } = require('../utils/gifPlayer');
const { Generator } = require('../utils/generate.js');

const Photo = async (imagePath) => {
  // Check if this is a GIF file
  const isGif = imagePath.toLowerCase().endsWith('.gif');
  
  // Calculate normalized dimensions for GIFs (same logic as regular images)
  let normalizedWidth = terminal.width;
  let normalizedHeight = terminal.height - 4;
  
  if (isGif) {
    try {
      const generator = new Generator();
      const dimensions = await generator.getImageDimensions(imagePath);
      const imageAspectRatio = dimensions.width / dimensions.height;
      const passedAspectRatio = normalizedWidth / normalizedHeight;
      
      if (imageAspectRatio > 1) {
        // Image is landscape (width > height)
        // Use passed width as base and calculate height
        normalizedWidth = terminal.width;
        normalizedHeight = Math.round(terminal.width / imageAspectRatio);
      } else {
        // Image is portrait (height >= width)
        // Use passed height as base and calculate width
        normalizedHeight = terminal.height - 4;
        normalizedWidth = Math.round((terminal.height - 4) * imageAspectRatio);
      }
    } catch (error) {
      // If we can't get image dimensions, fall back to original dimensions
      console.warn(`Could not get GIF dimensions for ${imagePath}:`, error.message);
    }
    
    // Initialize GIF player management in state if not exists
    if (!state.gifPlayers) {
      state.gifPlayers = new Map();
    }
    
    // Stop all other GIF players to prevent interference
    for (const [key, player] of state.gifPlayers.entries()) {
      if (key !== imagePath) {
        player.pause();
        // Reset the current frame to ensure clean state
        player.currentFrame = 0;
      }
    }
    
    const gifKey = imagePath;
    let gifPlayer = state.gifPlayers.get(gifKey);
    
    // Check if we need to reload the GIF due to terminal resize
    const needsReload = gifPlayer && gifPlayer.needsReload(
      terminal.width, 
      terminal.height - 4, 
      normalizedWidth, 
      normalizedHeight
    );
    
    if (needsReload) {
      // Kill any ongoing frame conversion processes
      gifPlayer.killFrameConversion();
      
      // Clear cache for old dimensions before updating
      gifPlayer.clearSizeCache(gifPlayer.normalizedWidth, gifPlayer.normalizedHeight);
      
      // Update dimensions
      gifPlayer.width = terminal.width;
      gifPlayer.height = terminal.height - 4;
      gifPlayer.normalizedWidth = normalizedWidth;
      gifPlayer.normalizedHeight = normalizedHeight;
      
      // Resume playing if it was playing before
      if (gifPlayer.isPlaying) {
        gifPlayer.resume();
      }
    }
    
    if (!gifPlayer) {
      gifPlayer = new GifPlayer();
      state.gifPlayers.set(gifKey, gifPlayer);
      
      // Mark as loading
      gifPlayer.isLoading = true;
      
      // Load and start the GIF with normalized dimensions
      gifPlayer.loadGif(imagePath, terminal.width, terminal.height - 4, normalizedWidth, normalizedHeight).then(() => {
        gifPlayer.isLoading = false;
        gifPlayer.play((frameData) => {
          // This callback will be called for each frame update
          // We need to trigger a re-render
          // Only trigger re-render if this is still the current GIF
          if (state.photoPath === imagePath) {
            state.needsRerender = true;
          }
        });
      }).catch(error => {
        // console.error('Error loading GIF:', error);
        gifPlayer.isLoading = false;
      });
    } else if (!gifPlayer.isPlaying && gifPlayer.frameCache.size > 0) {
      // Resume the existing GIF player if it was paused and has frames loaded
      gifPlayer.resume();
    } else if (!gifPlayer.isPlaying && gifPlayer.frameCache.size === 0) {
      // If the player exists but has no frames, reload it with normalized dimensions
      gifPlayer.isLoading = true;
      gifPlayer.loadGif(imagePath, terminal.width, terminal.height - 4, normalizedWidth, normalizedHeight).then(() => {
        gifPlayer.isLoading = false;
        gifPlayer.play((frameData) => {
          if (state.photoPath === imagePath) {
            state.needsRerender = true;
          }
        });
      }).catch(error => {
        // console.error('Error reloading GIF:', error);
        gifPlayer.isLoading = false;
      });
    }
  }

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
        height: terminal.height - 4,
        textAlign: 'left',
        verticalAlign: 'top',
        pixelFont: true,
        backgroundColor: 'black',
        overflow: 'hidden',
        zIndex: 0,
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
        zIndex: 0,
      }, truncateFilenameKeepExtension(imagePath.split('/').pop(), terminal.width - 2, 1, 'compact')),
    ])
  ];

  return elements;
}

module.exports = Photo;
