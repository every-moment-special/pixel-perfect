// Minimal Virtual DOM

function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number';
}

function flattenChildren(children) {
  const flat = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      flat.push(...flattenChildren(child));
    } else if (child === null || child === undefined || child === false) {
      // skip
    } else {
      flat.push(child);
    }
  }
  return flat;
}

function h(type, props, ...children) {
  const normalizedChildren = flattenChildren(children).map((c) =>
    isPrimitive(c) ? { type: 'text', props: { text: String(c) }, children: [] } : c
  );
  return { type, props: props || {}, children: normalizedChildren };
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

function renderToBuffer(node, buffer, offsetX = 0, offsetY = 0) {
  if (!node) return;

  // Treat arrays as fragments
  if (Array.isArray(node)) {
    for (const child of node) renderToBuffer(child, buffer, offsetX, offsetY);
    return;
  }

  const { type, props = {}, children = [] } = node;

  if (type === 'text') {
    const x = (props.x || 0) + offsetX;
    const y = (props.y || 0) + offsetY;
    const text = props.text != null ? String(props.text) : '';
    writeToBuffer(buffer, x, y, text);
    return;
  }

  if (type === 'panel') {
    const x = (props.x || 0) + offsetX;
    const y = (props.y || 0) + offsetY;
    const width = props.width || 10;
    const height = props.height || 5;
    const title = props.title || '';
    drawBox(buffer, x, y, width, height, title);

    // Render children inside the box content area (1px inset)
    for (const child of children) {
      renderToBuffer(child, buffer, x + 1, y + 1);
    }
    return;
  }

  // Fragment or unknown: recurse into children without drawing
  for (const child of children) renderToBuffer(child, buffer, offsetX, offsetY);
}

function render(rootVNode, terminal) {
  const width = Math.max(1, terminal.width || 80);
  const height = Math.max(1, terminal.height || 24);

  const buffer = createBuffer(width, height);
  renderToBuffer(rootVNode, buffer, 0, 0);

  // Flush to terminal
  process.stdout.write('\x1b[2J\x1b[H');
  for (let y = 0; y < height; y++) {
    process.stdout.write(buffer[y].join(''));
    process.stdout.write('\n');
  }
  process.stdout.write(`\x1b[${height};1H`);
}

module.exports = { h, render };

