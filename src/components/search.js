// const size = 4;

// const kittyText = (text, size = 3) => `\x1b]66;s=${size};${text}\x07`;

// const border = (width) => {
//     const border = '▄'.repeat(width);
    
//     return border;
// }

// function Search() {
//     const placeholder = 'Search';
//     const kittyString = kittyText(placeholder, size);
//     // const colored = `\x1b[1m\x1b[36m${kittyString}\x1b[0m`;



//     const width = placeholder.length * size;
//     const b = border(width);


//     process.stdout.write(b + '\n');
    

//     // process.stdout.write(colored);
//     process.stdout.write('test');
//     process.stdout.write('\n'.repeat(size));


//     process.stdout.write(b + '\n');
// }

// module.exports = Search;

// Search();



const render = (rowItems, itemHeight, gapWidth) => {
    for (let lineIndex = 0; lineIndex < itemHeight; lineIndex++) {
        let line = '';
        
        for (let i = 0; i < rowItems.length; i++) {
            const item = rowItems[i];
            
            if (item.type === 'empty') {
                line += ' '.repeat(item.width);
            } else if (item.type === 'image') {
                if (lineIndex < item.content.length) {
                    line += item.content[lineIndex];
                } else {
                    line += ' '.repeat(item.width);
                }
            } else {
                if (lineIndex === 0) {
                    line += item.content;
                } else {
                    line += ' '.repeat(item.width);
                }
            }
            
            if (i < rowItems.length - 1) {
                line += ' '.repeat(gapWidth);
            }
        }
        
        console.log(line);
    }
};






// const kittyTextLines = [
//     '▄▀▀▀▀▀▀▀▀▀▀▀▀▀▄',  // pretend kitty text line 1 (use real content or placeholders)
//     '█ Search Text █',
//     '▀▄▄▄▄▄▄▄▄▄▄▄▄▄▀'
//   ];


const text = `\x1b]66;s=3;Search\x07`;
const kittyTextLines = [
    '▄--------------▄',  // pretend kitty text line 1 (use real content or placeholders)
    '█ ' + text + ' █',
    '▀▄▄▄▄▄▄▄▄▄▄▄▄▄▀'
  ];
  
// Example item with content as array of strings
const kittyItem = {
    type: 'image',
    width: kittyTextLines[0].length * 3,
    content: kittyTextLines
};
  
// Use renderGridRow to print it like any other multi-line item
render([kittyItem], kittyTextLines.length, 1);


