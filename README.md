# Pixel Perfect
Terminal UI for browsing directories and viewing images/GIFs

> [!NOTE]
> This project is still in early development
> 
> **Supported formats**:
> `.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.svg`, `.gif`

> [!IMPORTANT]
> Display resolution depends on the size of terminal window

> [!TIP]
> Reduce your terminal font size to view higher resolution images

## Requirements
- `Node.js` ≥ 18
- `ffmpeg` (optional, only required for `.gif` playback)

## Installation
```bash
git clone https://github.com/every-moment-special/pixel-perfect.git
cd pixel-perfect
npm install
npm install -g .
```

## Usage
| Command / Key | Description   |
|---------|---------------|
| `pp`               | Launches the media browser in the current directory     |
| `Arrow Keys`       | Navigate through items                                   |
| `Enter`            | Open the selected directory or file                     |
| `Backspace`        | Go up one directory level or close the current image    |
| `Q` or `Ctrl + C`  | Exit the program                                         |
