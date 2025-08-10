const Panel = require('./components/panel.js');
const { h } = require('./vdom');

// class Interface {
//   constructor(terminal) {
//     this.terminal = terminal;
//     this.perspective = null; // browser, gallery, player

//     this.render();
//   }

//   render() {
//     const header = new Panel(0, 0, 20, 10, this.terminal);
//     const browser = new Panel(0, 0, 20, 10, this.terminal);
//     // console.log("renders", browser);
//   }
// }

const Interface = () => {
  // Example interface composed of a root panel with nested text
  return Panel({ x: 2, y: 1, width: 40, height: 8, title: 'Pixel Perfect' }, [
    h('text', { x: 1, y: 1, text: 'Hello Virtual DOM' }),
    h('text', { x: 1, y: 2, text: 'Press Q to quit' })
  ]);
};

module.exports = Interface;
