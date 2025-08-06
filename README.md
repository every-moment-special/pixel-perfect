# Pixel Perfect
A minimal, mouse-aware GUI to browse media and folders directly in your terminal.

> [!NOTE]
> This project is still in early development.
> 
> **Supported formats:** 
> `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tiff`, `.tga`, `.svg`

> [!IMPORTANT]
> Display resolution depends on the size of your terminal window.

> [!TIP]
> Reduce your terminal font size to view higher-resolution images.

## Installation
```bash
git clone https://github.com/every-moment-special/pixel-perfect.git
cd pixel-perfect
npm install
```

## Usage
<div align="left">
 <table>
  <th>Command</th>
  <th>Description</th>
  <tr>
  <td>
    
  `npm run run`
    
  </td>
  <td>
 Starts the GUI.
  </td>
  </tr>
  <tr>
  <td>
    
  `npm run see <path>`
 
  </td>
  <td>
   
  Displays a previously generated `.json` ANSI image in the terminal.
  
  </td>
  </tr>
  <tr>
  <td>
    
  `npm run gen <path> [width] [height]`
 
  </td>
  <td>

  Converts an image into ANSI characters. Uses terminal size if width/height not provided.
 
  </td>
  </tr>
  </table>
</div>
