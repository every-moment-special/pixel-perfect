const { terminal, colors } = require('./helper.js');

const isPrimitive = (value) => typeof value === 'string' || typeof value === 'number';

const flattenContent = (content) => {
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
    isPrimitive(c) ? { type: 'text', style: style || {}, content: c || [] } : c
  );
  return { type, style: style || {}, content: normalizedContent };
}

const createBuffer = (width, height) => {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    const cols = new Array(width);
    for (let x = 0; x < width; x++) cols[x] = { char: ' ', fgColor: 'white', bgColor: 'white' };
    rows[y] = cols;
  }
  return rows;
}

const writeToBuffer = (buffer, x, y, text, fgColor = 'white', bgColor = 'white') => {
  if (y < 0 || y >= buffer.length) return;
  const row = buffer[y];
  let cx = Math.max(0, x);
  for (let i = 0; i < text.length; i++) {
    if (cx >= row.length) break;
    if (cx >= 0) {
      row[cx].char = text[i];
      row[cx].fgColor = fgColor;
      row[cx].bgColor = bgColor;
    }
    cx++;
  }
};

const drawBox = (buffer, x, y, width, height, title) => {
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

const renderToBuffer = (node, buffer, offsetX = 0, offsetY = 0, depth = 0) => {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const c of node) renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
    return;
  }

  const { type, style = {}, content = [] } = node;

  if (type === 'text') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const text = content != null ? String(content[0]?.content ?? content) : '';
    const fgColor = style.color || 'white';
    const bgColor = style.backgroundColor || 'black';

    for (let i = 0; i < text.length; i++) {
      const cx = x + i;
      if (y >= 0 && y < buffer.length && cx >= 0 && cx < buffer[0].length) {
        buffer[y][cx].char = text[i];
        buffer[y][cx].fgColor = fgColor;
        buffer[y][cx].bgColor = bgColor;
      }
    }
    return;
  }

  if (type === 'div') {
    const x = (style.x || 0) + offsetX;
    const y = (style.y || 0) + offsetY;
    const width = style.width || terminal.width;
    const height = style.height || terminal.height;
    const bgColor = style.backgroundColor || 'black';

    for (let row = y; row < y + height; row++) {
      if (row < 0 || row >= buffer.length) continue;
      for (let col = x; col < x + width; col++) {
        if (col < 0 || col >= buffer[0].length) continue;
        // Fill with space but with background color
        buffer[row][col].char = ' ';
        buffer[row][col].bgColor = bgColor;
        // Optionally keep fgColor as is or set to default (white)
        buffer[row][col].fgColor = buffer[row][col].fgColor || 'white';
      }
    }

    for (const c of content) {
      renderToBuffer(c, buffer, x, y, depth + 1);
    }
    return;
  }

  for (const c of content) renderToBuffer(c, buffer, offsetX, offsetY, depth + 1);
}

const render = (root) => {
  const width = Math.max(1, terminal.width || 80);
  const height = Math.max(1, terminal.height || 24);

  const buffer = createBuffer(width, height);
  renderToBuffer(root, buffer, 0, 0);

  process.stdout.write('\x1b[2J\x1b[H');

  let prevFg = null;
  let prevBg = null;

  for (let y = 0; y < height; y++) {
    prevFg = null;
    prevBg = null;
    for (let x = 0; x < width; x++) {
      const cell = buffer[y][x];

      if (cell.fgColor !== prevFg) {
        process.stdout.write(colors[cell.fgColor] || '');
        prevFg = cell.fgColor;
      }
      if (cell.bgColor !== prevBg) {
        process.stdout.write(colors['bg' + cell.bgColor] || '');
        prevBg = cell.bgColor;
      }

      process.stdout.write(cell.char);
    }
    process.stdout.write('\x1b[0m\n');
  }
  process.stdout.write(`\x1b[${height};1H`);
}

module.exports = { element, render };
