const { terminal, colors } = require('../helper');

class Element {
    constructor(x, y, width, height, children = [], src = null) {
        this.terminal = terminal;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.children = children;
        this.src = src;

        this.render();
    }
  
    render() {
        for (let th = 0; th < this.terminal.height; th++) {
            for (let tw = 0; tw < this.terminal.width; tw++) {
                const cell = 'c';
                this.terminal.write(tw, th, cell);
            }
        }

        for (let h = 0; h < this.height; h++) {
            let line = '';

            for (let w = 0; w < this.width; w++) {
                const cell = 'c';

                line += cell;
            }

            console.log(colors[this.backgroundColor] + line + colors.reset);
        }
    }
}

module.exports = Element;
