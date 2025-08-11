/**
 * Style normalization utilities.
 *
 * This module defines a canonical NormalizedStyle shape and helpers to
 * normalize a node's style as well as resolve styles across a whole VNode tree.
 *
 * Notes:
 * - Positions (x, y) are integer cell units and may be negative.
 * - Dimensions (width, height) are integer cell units; null means "auto".
 * - Colors are string tokens understood by the renderer's color table.
 * - Border is canonicalized to an object with width/color/style.
 * - No renderer-specific quirks (e.g., img height x2) live here.
 */

'use strict';

/**
 * @typedef {Object} NormalizedBorder
 * @property {number} width // integer >= 0
 * @property {string} color
 * @property {'quarter'|'half'|'box'} style
 */

/**
 * @typedef {Object} NormalizedStyle
 * @property {number} x
 * @property {number} y
 * @property {number|null} width // null = auto
 * @property {number|null} height // null = auto
 * @property {string} color
 * @property {string} backgroundColor
 * @property {'left'|'center'|'right'} textAlign
 * @property {'top'|'middle'|'bottom'} verticalAlign
 * @property {number} fontSize // integer >= 1
 * @property {boolean} pixelFont
 * @property {NormalizedBorder} border
 * @property {'none'|'block'|'grid'} display // 'none', 'block', 'grid'
 */

const coerceIntegerOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : 0;
};

const coerceInteger = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.trunc(fallback || 0);
  return Math.trunc(n);
};

const coerceBoolean = (value, fallback) => {
  if (typeof value === 'boolean') return value;
  if (value === 0) return false;
  if (value === 1) return true;
  if (value == null) return !!fallback;
  return Boolean(value);
};

const oneOf = (value, allowed, fallback) => {
  return allowed.includes(value) ? value : fallback;
};

const baseDefaults = Object.freeze({
  x: 0,
  y: 0,
  width: null,
  height: null,
  color: 'transparent',
  backgroundColor: 'transparent',
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: 1,
  pixelFont: false,
  border: { width: 0, color: 'white', style: 'quarter' },
});

const defaultsByType = Object.freeze({
  text: {
    ...baseDefaults,
    // For text, inherit default border color from foreground color in practice.
    border: { width: 0, color: 'transparent', style: 'quarter' },
  },
  img: {
    ...baseDefaults,
    // Typical default bg for images remains transparent.
    border: { width: 0, color: 'white', style: 'quarter' },
  },
  div: {
    ...baseDefaults,
    backgroundColor: 'black',
    border: { width: 0, color: 'white', style: 'quarter' },
  },
});

const getDefaultsForType = (type) => {
  return defaultsByType[type] || baseDefaults;
};

const normalizeBorder = (type, style, defaults) => {
  const input = style && style.border;
  const defaultBorder = defaults.border || { width: 0, color: 'white', style: 'quarter' };

  if (input == null) {
    return { ...defaultBorder };
  }

  if (typeof input === 'number') {
    const width = Math.max(0, coerceInteger(input, 0));
    // Prefer explicit style.color for text; else fall back to default border color.
    const color = (type === 'text' && typeof style.color === 'string')
      ? style.color
      : defaultBorder.color;
    return { width, color, style: 'quarter' };
  }

  if (typeof input === 'object') {
    const width = Math.max(0, coerceInteger(input.width, defaultBorder.width));
    const color = typeof input.color === 'string' ? input.color
      : (type === 'text' && typeof style.color === 'string') ? style.color
      : defaultBorder.color;
    const styleKind = oneOf(input.style, ['quarter', 'half', 'box'], defaultBorder.style);
    return { width, color, style: styleKind };
  }

  // Fallback
  return { ...defaultBorder };
};

/**
 * Normalize a raw style object into a canonical NormalizedStyle.
 *
 * @param {string} type
 * @param {Object} rawStyle
 * @returns {NormalizedStyle}
 */
function normalizeStyle(type, rawStyle) {
  const s = rawStyle || {};
  const d = getDefaultsForType(type);

  // Geometry
  // Note: positions are not clamped; negative allowed to enable offscreen rendering.
  const x = Number.isFinite(Number(s.x)) ? Math.trunc(Number(s.x)) : d.x;
  const y = Number.isFinite(Number(s.y)) ? Math.trunc(Number(s.y)) : d.y;
  const width = coerceIntegerOrNull(s.width);
  const height = coerceIntegerOrNull(s.height);

  // Colors
  const color = typeof s.color === 'string' ? s.color : d.color;
  const backgroundColor = typeof s.backgroundColor === 'string' ? s.backgroundColor : d.backgroundColor;

  // Text
  const textAlign = oneOf(s.textAlign, ['left', 'center', 'right'], d.textAlign);
  const verticalAlign = oneOf(s.verticalAlign, ['top', 'middle', 'bottom'], d.verticalAlign);
  const fontSize = Math.max(1, coerceInteger(s.fontSize, d.fontSize));
  const pixelFont = coerceBoolean(s.pixelFont, d.pixelFont);

  // Border
  const border = normalizeBorder(type, s, d);

  return {
    x,
    y,
    width,
    height,
    color,
    backgroundColor,
    textAlign,
    verticalAlign,
    fontSize,
    pixelFont,
    border,
  };
}

/**
 * Recursively attach computedStyle to each node in the tree.
 * Does not mutate the input nodes; returns a new tree.
 *
 * @param {any} node - VNode or array of VNodes
 * @returns {any} - New VNode(s) with computedStyle
 */
function resolveStylesTree(node) {
  if (node == null) return node;
  if (Array.isArray(node)) return node.map(resolveStylesTree);

  if (typeof node !== 'object') return node;

  const type = node.type || 'div';
  const computedStyle = normalizeStyle(type, node.style || {});

  const children = Array.isArray(node.content)
    ? node.content.map(resolveStylesTree)
    : node.content;

  return {
    ...node,
    computedStyle,
    content: children,
  };
}

module.exports = {
  normalizeStyle,
  resolveStylesTree,
};


