'use strict';

const { measurePixelFont } = require('../pixel-font/pixelFont.js');

// Layout computation: computes absolute frames (x, y, width, height) for each node
// based on its computedStyle and content, without any renderer-specific quirks

// Recursively translate frame positions by (dx, dy)
function translateFrames(node, dx, dy) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => translateFrames(n, dx, dy));
  const hasFrame = node.frame && typeof node.frame === 'object';
  const newFrame = hasFrame
    ? {
        x: (node.frame.x ?? 0) + dx,
        y: (node.frame.y ?? 0) + dy,
        width: node.frame.width,
        height: node.frame.height,
      }
    : node.frame;
  const children = Array.isArray(node.content) ? node.content : node.content != null ? [node.content] : [];
  const translatedChildren = children.map((c) => translateFrames(c, dx, dy));
  return {
    ...node,
    frame: newFrame,
    content: translatedChildren,
  };
}

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
    const fontFamily = style.fontFamily || 'full';
    const { cellCols, cellRows } = measurePixelFont(text, scale, fontFamily);
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
  if (Array.isArray(node)) {
    return node.map((n) => computeLayoutTree(n, terminal, parentAbsX, parentAbsY));
  }
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

  const absX = parentAbsX + (style.x ?? 0);
  const absY = parentAbsY + (style.y ?? 0);

  // First, lay out children relative to our absolute origin. We'll position them precisely later.
  const children = Array.isArray(node.content) ? node.content : (node.content != null ? [node.content] : []);
  let laidOutChildren = children.map((child) => computeLayoutTree(child, terminal, absX, absY));

  // Measure this node
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
    const hasExplicitWidth = style.width != null;
    const hasExplicitHeight = style.height != null;
    const gap = Math.max(0, Number(style.gap) || 0);
    if ((style.display || 'block') === 'flex') {
      const isRow = (style.flexDirection || 'row') === 'row';
      // Filter out absolutely positioned children for sizing calculations
      const nonAbsoluteChildren = laidOutChildren.filter(ch => 
        !(ch && ch.computedStyle && ch.computedStyle.position === 'absolute')
      );
      const totalW = nonAbsoluteChildren.reduce((s, ch) => s + ((ch && ch.frame && ch.frame.width) || 0), 0);
      const totalH = nonAbsoluteChildren.reduce((s, ch) => s + ((ch && ch.frame && ch.frame.height) || 0), 0);
      const maxW = nonAbsoluteChildren.reduce((m, ch) => Math.max(m, ((ch && ch.frame && ch.frame.width) || 0)), 0);
      const maxH = nonAbsoluteChildren.reduce((m, ch) => Math.max(m, ((ch && ch.frame && ch.frame.height) || 0)), 0);
      const fixedGaps = Math.max(0, nonAbsoluteChildren.length - 1) * gap;
      measuredWidth = hasExplicitWidth
        ? style.width
        : (isRow ? (totalW + fixedGaps) : maxW);
      measuredHeight = hasExplicitHeight
        ? style.height
        : (isRow ? maxH : (totalH + fixedGaps));
    } else {
      // Auto-size to children bounding box if not explicitly sized
      // Filter out absolutely positioned children for sizing calculations
      const nonAbsoluteChildren = laidOutChildren.filter(ch => 
        !(ch && ch.computedStyle && ch.computedStyle.position === 'absolute')
      );
      const rightMost = nonAbsoluteChildren.reduce((m, ch) => Math.max(m, ((ch && ch.frame) ? (ch.frame.x + ch.frame.width) : absX)), absX);
      const bottomMost = nonAbsoluteChildren.reduce((m, ch) => Math.max(m, ((ch && ch.frame) ? (ch.frame.y + ch.frame.height) : absY)), absY);
      measuredWidth = hasExplicitWidth ? style.width : Math.max(0, rightMost - absX);
      measuredHeight = hasExplicitHeight ? style.height : Math.max(0, bottomMost - absY);
      // Fallback to terminal if still zero and no children
      if (!hasExplicitWidth && measuredWidth === 0 && nonAbsoluteChildren.length === 0) measuredWidth = terminal.width;
      if (!hasExplicitHeight && measuredHeight === 0 && nonAbsoluteChildren.length === 0) measuredHeight = terminal.height;
    }
  } else {
    measuredWidth = style.width != null ? style.width : 0;
    measuredHeight = style.height != null ? style.height : 0;
  }

  const frame = { x: absX, y: absY, width: measuredWidth, height: measuredHeight };

  // Flex layout (no wrapping for now). Uses justifyContent and gap along main axis.
  if (style.display === 'flex' && laidOutChildren.length > 0) {
    const isRow = (style.flexDirection || 'row') === 'row';
    const containerMain = isRow ? frame.width : frame.height;
    const gap = Math.max(0, Number(style.gap) || 0);

    const totalChildrenMain = laidOutChildren.reduce((sum, ch) => {
      const w = (ch && ch.frame && ch.frame.width) || 0;
      const h = (ch && ch.frame && ch.frame.height) || 0;
      return sum + (isRow ? w : h);
    }, 0);
    const fixedGaps = Math.max(0, laidOutChildren.length - 1) * gap;
    const contentMain = totalChildrenMain + fixedGaps;

    let start = isRow ? frame.x : frame.y;
    let extraGap = 0;
    switch (style.justifyContent) {
      case 'center':
        start += Math.floor((containerMain - contentMain) / 2);
        break;
      case 'end':
        start += (containerMain - contentMain);
        break;
      case 'space-between': {
        if (laidOutChildren.length > 1) {
          const free = containerMain - contentMain;
          extraGap = free > 0 ? Math.floor(free / (laidOutChildren.length - 1)) : 0;
        }
        break;
      }
      case 'start':
      default:
        // start unchanged
        break;
    }

    let cursor = start;
    laidOutChildren = laidOutChildren.map((ch) => {
      // Skip flex positioning for absolutely positioned children
      if (ch && ch.computedStyle && ch.computedStyle.position === 'absolute') {
        return ch; // Keep absolute positioned elements as-is
      }
      
      const w = (ch && ch.frame && ch.frame.width) || 0;
      const h = (ch && ch.frame && ch.frame.height) || 0;
      const targetX = isRow ? cursor : ch.frame.x;
      const targetY = isRow ? ch.frame.y : cursor;
      const dx = targetX - ch.frame.x;
      const dy = targetY - ch.frame.y;
      const updated = translateFrames(ch, dx, dy);
      cursor += (isRow ? w : h) + gap + extraGap;
      return updated;
    });
    // Maintain source order for column, do not reverse
  }

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
      // Skip grid positioning for absolutely positioned children
      if (ch && ch.computedStyle && ch.computedStyle.position === 'absolute') {
        continue; // Skip absolutely positioned elements in grid layout
      }
      
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
    const rowTopsRelative = [];
    const rowHeights = [];
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
      rowTopsRelative.push(cursorY - frame.y);
      rowHeights.push(row.rowHeight);
      for (const ch of row.items) {
        const chWidth = (ch && ch.frame && ch.frame.width) || 0;
        const dx = cursorX - ch.frame.x;
        const dy = cursorY - ch.frame.y;
        const translated = translateFrames(ch, dx, dy);
        placed.push(translated);
        cursorX += chWidth + gap + extraGap;
      }

      cursorY += row.rowHeight + Math.floor(gap / 2); // vertical gap is half
    }

    // Add back absolutely positioned elements that were skipped during grid layout
    const absoluteElements = laidOutChildren.filter(ch => 
      ch && ch.computedStyle && ch.computedStyle.position === 'absolute'
    );
    laidOutChildren = [...placed, ...absoluteElements];

    // Attach grid row metadata on node for smarter scrolling
    node = {
      ...node,
      gridMeta: { rowTops: rowTopsRelative, rowHeights },
    };
  }

  // Compute content bounds before applying scroll translation
  let contentRightMost = frame.x;
  let contentBottomMost = frame.y;
  let contentLeftMost = frame.x;
  let contentTopMost = frame.y;
  for (const ch of laidOutChildren) {
    if (ch && ch.frame) {
      const r = ch.frame.x + ch.frame.width;
      const b = ch.frame.y + ch.frame.height;
      if (r > contentRightMost) contentRightMost = r;
      if (b > contentBottomMost) contentBottomMost = b;
      if (ch.frame.x < contentLeftMost) contentLeftMost = ch.frame.x;
      if (ch.frame.y < contentTopMost) contentTopMost = ch.frame.y;
    }
  }
  const contentWidth = Math.max(0, contentRightMost - frame.x);
  let contentHeight = Math.max(0, contentBottomMost - frame.y);

  // If overflow is auto and a vertical scrollbar would be visible, optionally reflow grid using reduced width
  let scrollbarVisible = false;
  const sbWidth = Math.max(1, Number(style.scrollbarWidth) || 1);
  if (style.overflow === 'auto' && contentHeight > frame.height) {
    scrollbarVisible = true;
    const sbMarginRight = 1;
    if (style.display === 'grid' && frame.width - (sbWidth + sbMarginRight) >= 1) {
      // Reflow grid children to account for reduced content width (avoid overlap under scrollbar)
      const containerWidth = frame.width - (sbWidth + sbMarginRight);
      const gap = Math.max(0, Number(style.gap) || 0);
      const rows = [];
      let currentRowItems = [];
      let currentRowWidth = 0;
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
        const gapsSoFar = Math.max(0, currentRowItems.length - 1) * gap;
        const wouldExceed = currentRowItems.length > 0 && (currentRowWidth + chWidth + gapsSoFar) > containerWidth;
        if (wouldExceed) finalizeRow();
        currentRowItems.push(ch);
        currentRowWidth += chWidth;
        if (chHeight > currentRowHeight) currentRowHeight = chHeight;
      }
      if (currentRowItems.length > 0) finalizeRow();

      // Position rows per justifyContent
      let cursorY2 = frame.y;
      const placed2 = [];
      for (const row of rows) {
        const count = row.items.length;
        let startX2 = frame.x;
        let extraGap2 = 0;
        const fixedGapsWidth2 = Math.max(0, count - 1) * gap;
        const contentWidth2 = row.rowWidth + fixedGapsWidth2;
        switch (style.justifyContent) {
          case 'center':
            startX2 = frame.x + Math.floor((containerWidth - contentWidth2) / 2);
            break;
          case 'end':
            startX2 = frame.x + (containerWidth - contentWidth2);
            break;
          case 'space-between':
            if (count > 1) {
              const free2 = containerWidth - contentWidth2;
              extraGap2 = free2 > 0 ? Math.floor(free2 / (count - 1)) : 0;
            }
            break;
          case 'start':
          default:
            break;
        }
        let cursorX2 = startX2;
        for (const ch of row.items) {
          const chWidth = (ch && ch.frame && ch.frame.width) || 0;
          const dx = cursorX2 - ch.frame.x;
          const dy = cursorY2 - ch.frame.y;
          const translated = translateFrames(ch, dx, dy);
          placed2.push(translated);
          cursorX2 += chWidth + gap + extraGap2;
        }
        cursorY2 += row.rowHeight + Math.floor(gap / 2);
      }
      laidOutChildren = placed2;
      // Recompute content bounds and height after reflow
      contentRightMost = frame.x;
      contentBottomMost = frame.y;
      for (const ch of laidOutChildren) {
        if (ch && ch.frame) {
          const r = ch.frame.x + ch.frame.width;
          const b = ch.frame.y + ch.frame.height;
          if (r > contentRightMost) contentRightMost = r;
          if (b > contentBottomMost) contentBottomMost = b;
        }
      }
      contentHeight = Math.max(0, contentBottomMost - frame.y);
    }
  }

  // Apply scroll offsets for overflow:auto by translating children negatively, clamped to content size
  let effectiveScrollX = 0;
  let effectiveScrollY = 0;
  if (style.overflow === 'auto') {
    const desiredScrollX = Math.max(0, Number(style.scrollX) || 0);
    const desiredScrollY = Math.max(0, Number(style.scrollY) || 0);
    const maxScrollX = Math.max(0, contentWidth - frame.width);
    const maxScrollY = Math.max(0, contentHeight - frame.height);
    effectiveScrollX = Math.min(desiredScrollX, maxScrollX);
    effectiveScrollY = Math.min(desiredScrollY, maxScrollY);
    // Only translate non-fixed children; fixed elements (e.g. overlays) should ignore scroll
    if (effectiveScrollX !== 0 || effectiveScrollY !== 0) {
      laidOutChildren = laidOutChildren.map((ch) => {
        const pos = ch?.computedStyle?.position || 'static';
        if (pos === 'fixed') return ch;
        return translateFrames(ch, -effectiveScrollX, -effectiveScrollY);
      });
    }
  }

  return {
    ...node,
    frame,
    content: laidOutChildren,
    scrollMeta: {
      contentWidth,
      contentHeight,
      effectiveScrollX,
      effectiveScrollY,
      scrollbarVisible,
      // Include grid row info if available
      rowTops: node.gridMeta?.rowTops || null,
      rowHeights: node.gridMeta?.rowHeights || null,
    },
  };
}

module.exports = { computeLayoutTree };


