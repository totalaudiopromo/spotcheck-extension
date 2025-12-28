/**
 * DOM Utilities - Safe DOM manipulation without innerHTML
 * Prevents XSS vulnerabilities
 */

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes to set
 * @param {Array|string|Node} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  // Set attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('data')) {
      el.dataset[key.replace('data', '').toLowerCase()] = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  }

  // Add children
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child === null || child === undefined) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }

  return el;
}

/**
 * Clear all children from an element
 * @param {HTMLElement} el
 */
export function clearChildren(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Safely set text content
 * @param {HTMLElement} el
 * @param {string} text
 */
export function setText(el, text) {
  el.textContent = text;
}

/**
 * Create a table row with cells
 * @param {Array} cells - Array of cell contents
 * @param {Object} options - Options for the row
 * @returns {HTMLTableRowElement}
 */
export function createTableRow(cells, options = {}) {
  const tr = createElement('tr');

  for (const cell of cells) {
    const td = createElement('td');

    if (typeof cell === 'string' || typeof cell === 'number') {
      td.textContent = String(cell);
    } else if (cell instanceof Node) {
      td.appendChild(cell);
    } else if (cell && typeof cell === 'object') {
      if (cell.colspan) td.colSpan = cell.colspan;
      if (cell.style) Object.assign(td.style, cell.style);
      if (cell.content instanceof Node) {
        td.appendChild(cell.content);
      } else {
        td.textContent = String(cell.content || '');
      }
    }

    tr.appendChild(td);
  }

  return tr;
}

/**
 * Create a link element
 * @param {string} href
 * @param {string} text
 * @param {Object} attrs
 * @returns {HTMLAnchorElement}
 */
export function createLink(href, text, attrs = {}) {
  return createElement('a', { href, ...attrs }, text);
}

/**
 * Create a badge element
 * @param {string} text
 * @param {string} level - 'low', 'medium', 'high'
 * @returns {HTMLSpanElement}
 */
export function createBadge(text, level = '') {
  return createElement(
    'span',
    {
      className: `risk-badge ${level}`,
    },
    text
  );
}

/**
 * Create tracked playlist item
 * @param {Object} playlist
 * @param {Object} trend
 * @returns {HTMLDivElement}
 */
export function createTrackedItem(playlist, trend) {
  const img = createElement('img', {
    src: playlist.image || '',
    alt: '',
  });

  const nameDiv = createElement('div', { className: 'tracked-item-name' }, playlist.name);
  const followersDiv = createElement(
    'div',
    { className: 'tracked-item-followers' },
    `${formatNumber(playlist.followers)} followers`
  );

  const infoDiv = createElement('div', { className: 'tracked-item-info' }, [nameDiv, followersDiv]);

  const children = [img, infoDiv];

  if (trend && trend.text) {
    const trendSpan = createElement(
      'span',
      {
        className: `tracked-item-trend ${trend.direction}`,
      },
      trend.text
    );
    children.push(trendSpan);
  }

  return createElement(
    'div',
    {
      className: 'tracked-item',
      dataId: playlist.id,
    },
    children
  );
}

/**
 * Create bot score factor badge
 * @param {Object} factor
 * @returns {HTMLSpanElement}
 */
export function createFactorBadge(factor) {
  return createElement(
    'span',
    {
      className: `bot-factor ${factor.level || ''}`,
    },
    factor.label
  );
}

/**
 * Format number with K/M suffix
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
export function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}
