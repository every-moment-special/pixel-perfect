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

  // Handle display: none early
  if (style.display === 'none') {
    const absXNone = parentAbsX + (style.x ?? 0);
    const absYNone = parentAbsY + (style.y ?? 0);
    return {
      ...node,
      frame: { x: absXNone, y: absYNone, width: 0, height: 0 },
      content: [],
    };
  }

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
  let laidOutChildren = children.map((child) => computeLayoutTree(child, terminal, frame.x, frame.y));

  // If container uses grid, lay out children with wrapping and justifyContent per row
  if (style.display === 'grid' && laidOutChildren.length > 0) {
    const containerWidth = frame.width;
    const gap = Math.max(0, Number(style.gap) || 0);

    // Build rows by wrapping when exceeding container width
    /** @type {Array<{items:any[], rowWidth:number, rowHeight:number}>} */
    const rows = [];
    let currentRowItems = [];
    let currentRowWidth = 0; // sum of item widths only (gaps handled separately)
    let currentRowHeight = 0;

    const finalizeRow = () => {
      rows.push({ items: currentRowItems, rowWidth: currentRowWidth, rowHeight: currentRowHeight });
      currentRowItems = [];
      currentRowWidth = 0;
      currentRowHeight = 0;
    };

    for (const ch of laidOutChildren) {
      const chWidth = (ch && ch.frame && ch.frame.width) || 0;
      const chHeight = (ch && ch.frame && ch.frame.height) || 0;

      // Compute prospective width including fixed gaps between items
      const gapsSoFar = Math.max(0, currentRowItems.length - 1) * gap;
      const wouldExceed = currentRowItems.length > 0 && (currentRowWidth + chWidth + gapsSoFar) > containerWidth;
      if (wouldExceed) finalizeRow();

      currentRowItems.push(ch);
      currentRowWidth += chWidth;
      if (chHeight > currentRowHeight) currentRowHeight = chHeight;
    }
    if (currentRowItems.length > 0) finalizeRow();

    // Position rows according to justifyContent per row
    let cursorY = frame.y;
    const placed = [];
    for (const row of rows) {
      const count = row.items.length;
      let startX = frame.x;
      let extraGap = 0;
      const fixedGapsWidth = Math.max(0, count - 1) * gap;
      const contentWidth = row.rowWidth + fixedGapsWidth;
      switch (style.justifyContent) {
        case 'center':
          startX = frame.x + Math.floor((containerWidth - contentWidth) / 2);
          break;
        case 'end':
          startX = frame.x + (containerWidth - contentWidth);
          break;
        case 'space-between':
          if (count > 1) {
            const free = containerWidth - contentWidth;
            extraGap = free > 0 ? Math.floor(free / (count - 1)) : 0;
          }
          break;
        case 'start':
        default:
          // start at frame.x
          break;
      }

      let cursorX = startX;
      for (const ch of row.items) {
        const chWidth = (ch && ch.frame && ch.frame.width) || 0;
        const updated = { ...ch, frame: { ...ch.frame, x: cursorX, y: cursorY } };
        placed.push(updated);
        cursorX += chWidth + gap + extraGap;
      }

      cursorY += row.rowHeight + Math.floor(gap / 2); // vertical gap is half
    }

    laidOutChildren = placed;
  }

  return {
    ...node,
    frame,
    content: laidOutChildren,
  };
}

module.exports = { computeLayoutTree };


