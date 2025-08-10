const { element } = require('../vdom');
const { terminal } = require('../helper');

const Panel = (style = {}, content = []) => {
  style = {
    x: 0,
    y: 2,
    width: terminal.width,
    height: terminal.height - 2,
    backgroundColor: 'cyan'
  };

  return [
    element('div', style, content = [
      element('text', style = { color: 'blue', backgroundColor: 'black', width: 100, height: 30, textAlign: 'center', verticalAlign: 'middle', fontSize: 3, pixelFont: true, border: { width: 1, color: 'white' } }, content = ['test'])
    ])
  ];
}

module.exports = Panel;
