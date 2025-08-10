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
      element('text', style = { color: 'white', backgroundColor: 'blue', width: 10, height: 3, textAlign: 'center', verticalAlign: 'middle' }, content = ['test'])
    ])
  ];
}

module.exports = Panel;
