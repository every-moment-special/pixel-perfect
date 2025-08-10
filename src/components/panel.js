const { h } = require('../vdom');

// Panel component returns a VNode of type 'panel' with props and children
function Panel(props = {}, children = []) {
  const { x = 0, y = 0, width = 20, height = 7, title = '' } = props;
  return h('panel', { x, y, width, height, title }, children);
}

module.exports = Panel;
