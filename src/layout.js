'use strict';

const { measurePixelFont } = require('./pixelFont.js');

// Layout computation: computes absolute frames (x, y, width, height) for each node
// based on its computedStyle and content, without any renderer-specific quirks

const extractText = (node) => {
  const content = node.content;
  if (Array.isArray(content)) {
    const first = content[0];
    if (first && typeof first === 'object' && 'content' in first) return String(first.content ?? '');
    return String(first ?? '');
  }
  return String(content ?? '');
};

const measureText = (node, style) => {
  const scale = Math.max(1, Math.floor(style.fontSize));
  const text = extractText(node);

  if (style.pixelFont) {
    const { cellCols, cellRows } = measurePixelFont(text, scale);
    const width = style.width != null ? style.width : cellCols;
    const height = style.height != null ? style.height : cellRows;
    return { width, height };
  }

  const scaledTextLength = text.length * scale;
  const width = style.width != null ? style.width : scaledTextLength;
  const height = style.height != null ? style.height : scale;
  return { width, height };
};

/**
 * Compute absolute frames for a styled node tree
 * @param {any} node - styled VNode (with computedStyle)
 * @param {{width:number,height:number}} terminal
 * @param {number} parentAbsX
 * @param {number} parentAbsY
 * @returns {any} node with frame and children laid out
 */
function computeLayoutTree(node, terminal, parentAbsX = 0, parentAbsY = 0) {
  if (node == null) return node;
  if (Array.isArray(node)) return node.map((n) => computeLayoutTree(n, terminal, parentAbsX, parentAbsY));
  if (typeof node !== 'object') return node;

  const style = node.computedStyle || node.style || {};
  const type = node.type || 'div';

  // Measure
  let measuredWidth = 0;
  let measuredHeight = 0;

  if (type === 'text') {
    const m = measureText(node, style);
    measuredWidth = m.width;
    measuredHeight = m.height;
  } else if (type === 'img') {
    measuredWidth = style.width != null ? style.width : terminal.width;
    measuredHeight = style.height != null ? style.height : terminal.height;
  } else if (type === 'div') {
    measuredWidth = style.width != null ? style.width : terminal.width;
    measuredHeight = style.height != null ? style.height : terminal.height;
  } else {
    measuredWidth = style.width != null ? style.width : 0;
    measuredHeight = style.height != null ? style.height : 0;
  }

  const absX = parentAbsX + (style.x ?? 0);
  const absY = parentAbsY + (style.y ?? 0);

  const frame = {
    x: absX,
    y: absY,
    width: measuredWidth,
    height: measuredHeight,
  };

  const children = Array.isArray(node.content) ? node.content : (node.content != null ? [node.content] : []);
  const laidOutChildren = children.map((child) => computeLayoutTree(child, terminal, frame.x, frame.y));

  return {
    ...node,
    frame,
    content: laidOutChildren,
  };
}

module.exports = { computeLayoutTree };


