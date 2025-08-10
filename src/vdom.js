const { terminal } = require('./helper.js');

function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number';
}

function flattenContent(content) {
  const flat = [];
  for (const c of content) {
    if (Array.isArray(c)) {
      flat.push(...flattenContent(c));
    } else if (c === null || c === undefined || c === false) {
      // skip
    } else {
      flat.push(c);
    }
  }
  return flat;
}

const element = (type, style = {}, ...content) => {
  const normalizedContent = flattenContent(content).map((c) =>
    isPrimitive(c) ? { type: 'text', style: {}, content: c } : c
  );
  return { type, style: style || {}, content: normalizedContent };
}

function createBuffer(width, height) {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    const cols = new Array(width);
    for (let x = 0; x < width; x++) cols[x] = ' ';
    rows[y] = cols;
  }
  return rows;
}

function writeToBuffer(buffer, x, y, text) {
  if (y < 0 || y >= buffer.length) return;
  const row = buffer[y];
  let cx = Math.max(0, x);
  for (let i = 0; i < text.length; i++) {
    if (cx >= row.length) break;
    if (cx >= 0) row[cx] = text[i];
    cx++;
  }
}

function drawBox(buffer, x, y, width, height, title) {
  if (width < 2 || height < 2) return;
  const right = x + width - 1;
  const bottom = y + height - 1;

  // Corners
  writeToBuffer(buffer, x, y, '┌');
  writeToBuffer(buffer, right, y, '┐');
  writeToBuffer(buffer, x, bottom, '└');
  writeToBuffer(buffer, right, bottom, '┘');

  // Horizontal borders
  writeToBuffer(buffer, x + 1, y, '─'.repeat(Math.max(0, width - 2)));
  writeToBuffer(buffer, x + 1, bottom, '─'.repeat(Math.max(0, width - 2)));

  // Vertical borders
  for (let iy = y + 1; iy < bottom; iy++) {
    writeToBuffer(buffer, x, iy, '│');
    writeToBuffer(buffer, right, iy, '│');
  }

  // Optional title
  if (title) {
    const capped = ` ${title} `;
    const maxLen = Math.max(0, width - 4);
    const text = capped.length > maxLen ? `${capped.slice(0, maxLen - 1)}…` : capped;
    writeToBuffer(buffer, x + 2, y, text);
  }
}

function renderToBuffer(node, buffer, offsetX = 0, offsetY = 0, depth = 0) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const c of node) renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
    return;
  }

  const { type, style = {}, content = [] } = node;

  if (type === 'text') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const text = content != null ? String(content) : '';
    writeToBuffer(buffer, x, y, text);
    return;
  }

  if (type === 'div') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const width = style.width || terminal.width;
    const height = style.height || terminal.height;

    for (const c of content) {
      renderToBuffer(c, buffer, x, y, depth + 1);
    }
    return;
  }

  for (const c of content) renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
}

function render(root) {
  const width = Math.max(1, terminal.width || 80);
  const height = Math.max(1, terminal.height || 24);

  const buffer = createBuffer(width, height);
  renderToBuffer(root, buffer, 0, 0);

  process.stdout.write('\x1b[2J\x1b[H');
  for (let y = 0; y < height; y++) {
    process.stdout.write(buffer[y].join(''));
    process.stdout.write('\n');
  }
  process.stdout.write(`\x1b[${height};1H`);
}

module.exports = { element, render };
