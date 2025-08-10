const Panel = require('./components/panel.js');
const { terminal } = require('./helper.js');

const Interface = () => {
  const style = { x: 0, y: 2, width: terminal.width, height: terminal.height - 2 };
  return Panel(style);
};

module.exports = Interface;
