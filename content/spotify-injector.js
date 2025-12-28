/**
 * Spot Checker - Content Script
 * Injects validation UI directly into Spotify web player
 * Cross-browser compatible - Uses safe DOM methods (no innerHTML)
 */

// Cross-browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// State
let isInjected = false;
let currentPlaylistId = null;

/**
 * Main injection function
 */
async function init() {
  if (isInjected) return;
  isInjected = true;

  const playlistId = extractPlaylistId(window.location.href);
  if (!playlistId) return;

  currentPlaylistId = playlistId;

  await waitForSpotify();
  injectFloatingButton();
  injectStyles();
  observeUrlChanges();
}

/**
 * Extract playlist ID from URL
 */
function extractPlaylistId(url) {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Wait for Spotify player to load
 */
async function waitForSpotify() {
  return new Promise(resolve => {
    const checkInterval = setInterval(() => {
      const mainContent =
        document.querySelector('[data-testid="playlist-page"]') ||
        document.querySelector('.playlist-page') ||
        document.querySelector('main');

      if (mainContent) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 10000);
  });
}

/**
 * Create SVG element helper
 */
function createSVG(width, height, viewBox, children) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');

  children.forEach(child => svg.appendChild(child));
  return svg;
}

/**
 * Create SVG circle element
 */
function createSVGCircle(cx, cy, r, attrs = {}) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  Object.entries(attrs).forEach(([key, value]) => circle.setAttribute(key, value));
  return circle;
}

/**
 * Create SVG path element
 */
function createSVGPath(d, attrs = {}) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  Object.entries(attrs).forEach(([key, value]) => path.setAttribute(key, value));
  return path;
}

/**
 * Create check icon SVG
 */
function createCheckIcon(size = 20) {
  const circle = createSVGCircle(12, 12, 10, { stroke: 'currentColor', 'stroke-width': '2' });
  const path = createSVGPath('M8 12l3 3 5-6', {
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  return createSVG(size, size, '0 0 24 24', [circle, path]);
}

/**
 * Create spinner icon SVG
 */
function createSpinnerIcon(size = 20) {
  const circle = createSVGCircle(12, 12, 10, {
    stroke: 'currentColor',
    'stroke-width': '2',
    fill: 'none',
    'stroke-dasharray': '60',
  });
  const svg = createSVG(size, size, '0 0 24 24', [circle]);
  svg.classList.add('spinner');
  return svg;
}

/**
 * Inject floating check button
 */
function injectFloatingButton() {
  const existing = document.getElementById('spot-checker-btn');
  if (existing) existing.remove();

  const button = document.createElement('button');
  button.id = 'spot-checker-btn';
  button.className = 'spot-checker-float-btn';
  button.title = 'Validate this playlist with Spot Checker';

  button.appendChild(createCheckIcon());

  const span = document.createElement('span');
  span.textContent = 'Check';
  button.appendChild(span);

  button.addEventListener('click', handleCheckClick);
  document.body.appendChild(button);
}

/**
 * Set button to loading state
 */
function setButtonLoading(button, isLoading) {
  button.classList.toggle('loading', isLoading);

  // Clear existing children
  while (button.firstChild) {
    button.removeChild(button.firstChild);
  }

  if (isLoading) {
    button.appendChild(createSpinnerIcon());
    const span = document.createElement('span');
    span.textContent = 'Checking...';
    button.appendChild(span);
  } else {
    button.appendChild(createCheckIcon());
    const span = document.createElement('span');
    span.textContent = 'Check';
    button.appendChild(span);
  }
}

/**
 * Inject validation badge next to playlist title
 */
function injectValidationBadge(data) {
  const existing = document.getElementById('spot-checker-badge');
  if (existing) existing.remove();

  const titleElement =
    document.querySelector('[data-testid="entityTitle"]') ||
    document.querySelector('h1') ||
    document.querySelector('.playlist-title');

  if (!titleElement) return;

  const badge = document.createElement('div');
  badge.id = 'spot-checker-badge';
  badge.className = `spot-checker-badge ${data.level}`;

  badge.appendChild(createCheckIcon(14));

  const scoreSpan = document.createElement('span');
  scoreSpan.textContent = data.botScore !== undefined ? `${data.botScore}% risk` : 'Verified';
  badge.appendChild(scoreSpan);

  badge.title = `Bot risk: ${data.level}\nFollowers: ${formatNumber(data.followers)}\nTracks: ${data.tracks}`;

  titleElement.parentElement?.appendChild(badge);
}

/**
 * Handle check button click
 */
async function handleCheckClick() {
  const button = document.getElementById('spot-checker-btn');
  if (!button) return;

  setButtonLoading(button, true);

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'GET_PLAYLIST',
      playlistId: currentPlaylistId,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const playlist = response.data;
    const botData = calculateBotScore(playlist);

    showResultsPopover(playlist, botData);
    injectValidationBadge({
      level: botData.level,
      botScore: botData.score,
      followers: playlist.followers?.total,
      tracks: playlist.tracks?.total,
    });
  } catch (error) {
    console.error('Check failed:', error);
    showError(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

/**
 * Show results popover using safe DOM methods
 */
function showResultsPopover(playlist, botData) {
  const existing = document.getElementById('spot-checker-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'spot-checker-popover';
  popover.className = 'spot-checker-popover';

  // Header
  const header = document.createElement('div');
  header.className = 'spot-checker-popover-header';

  const image = document.createElement('img');
  image.src = playlist.images?.[0]?.url || '';
  image.alt = '';
  image.className = 'spot-checker-popover-image';
  header.appendChild(image);

  const info = document.createElement('div');
  info.className = 'spot-checker-popover-info';

  const title = document.createElement('h3');
  title.className = 'spot-checker-popover-title';
  title.textContent = playlist.name;
  info.appendChild(title);

  const curator = document.createElement('p');
  curator.className = 'spot-checker-popover-curator';
  curator.textContent = `by ${playlist.owner.display_name}`;
  info.appendChild(curator);

  header.appendChild(info);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'spot-checker-popover-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => popover.remove());
  header.appendChild(closeBtn);

  popover.appendChild(header);

  // Metrics
  const metrics = document.createElement('div');
  metrics.className = 'spot-checker-popover-metrics';

  const metricsData = [
    { value: formatNumber(playlist.followers?.total || 0), label: 'Followers' },
    { value: String(playlist.tracks?.total || 0), label: 'Tracks' },
    { value: playlist.public ? 'Public' : 'Private', label: 'Visibility' },
  ];

  metricsData.forEach(m => {
    const metric = document.createElement('div');
    metric.className = 'spot-checker-metric';

    const value = document.createElement('span');
    value.className = 'spot-checker-metric-value';
    value.textContent = m.value;
    metric.appendChild(value);

    const label = document.createElement('span');
    label.className = 'spot-checker-metric-label';
    label.textContent = m.label;
    metric.appendChild(label);

    metrics.appendChild(metric);
  });

  popover.appendChild(metrics);

  // Score section
  const scoreSection = document.createElement('div');
  scoreSection.className = `spot-checker-popover-score ${botData.level}`;

  const scoreHeader = document.createElement('div');
  scoreHeader.className = 'spot-checker-score-header';

  const levelEmoji =
    { low: '\u2705', medium: '\u26A0\uFE0F', high: '\u274C' }[botData.level] || '\u2705';

  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = `${levelEmoji} Bot Risk Score`;
  scoreHeader.appendChild(scoreLabel);

  const scoreValue = document.createElement('span');
  scoreValue.className = 'spot-checker-score-value';
  scoreValue.textContent = `${botData.score}%`;
  scoreHeader.appendChild(scoreValue);

  scoreSection.appendChild(scoreHeader);

  const scoreBar = document.createElement('div');
  scoreBar.className = 'spot-checker-score-bar';

  const scoreFill = document.createElement('div');
  scoreFill.className = 'spot-checker-score-fill';
  scoreFill.style.width = `${botData.score}%`;
  scoreBar.appendChild(scoreFill);

  scoreSection.appendChild(scoreBar);

  const factors = document.createElement('div');
  factors.className = 'spot-checker-score-factors';

  botData.factors.forEach(f => {
    const factor = document.createElement('span');
    factor.className = `spot-checker-factor ${f.level || ''}`;
    factor.textContent = f.label;
    factors.appendChild(factor);
  });

  scoreSection.appendChild(factors);
  popover.appendChild(scoreSection);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'spot-checker-popover-footer';

  const branding = document.createElement('a');
  branding.href = 'https://spot-checker.totalaudiopromo.com';
  branding.target = '_blank';
  branding.className = 'spot-checker-branding';
  branding.textContent = 'Powered by Spot Checker';
  footer.appendChild(branding);

  popover.appendChild(footer);

  // Close on click outside
  const closeHandler = e => {
    if (!popover.contains(e.target) && e.target.id !== 'spot-checker-btn') {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 100);

  document.body.appendChild(popover);
}

/**
 * Show error message
 */
function showError(message) {
  const existing = document.getElementById('spot-checker-error');
  if (existing) existing.remove();

  const error = document.createElement('div');
  error.id = 'spot-checker-error';
  error.className = 'spot-checker-error';
  error.textContent = message || 'Something went wrong';

  document.body.appendChild(error);
  setTimeout(() => error.remove(), 3000);
}

/**
 * Calculate bot score
 */
function calculateBotScore(playlist) {
  const factors = [];
  let score = 0;

  const followers = playlist.followers?.total || 0;
  const tracks = playlist.tracks?.total || 0;

  if (tracks > 0) {
    const ratio = followers / tracks;
    if (ratio < 10) {
      factors.push({ label: 'Low follower ratio', level: 'warning' });
      score += 15;
    } else if (ratio > 10000) {
      factors.push({ label: 'Suspiciously high ratio', level: 'danger' });
      score += 25;
    }
  }

  if (!playlist.description || playlist.description.length < 10) {
    factors.push({ label: 'No description', level: 'warning' });
    score += 10;
  }

  if (followers > 1000 && followers % 1000 === 0) {
    factors.push({ label: 'Round follower count', level: 'warning' });
    score += 15;
  }

  const genericNames = ['chill', 'vibes', 'lofi', 'study', 'sleep', 'workout'];
  const nameLower = playlist.name.toLowerCase();
  if (genericNames.some(n => nameLower.includes(n)) && followers > 50000) {
    factors.push({ label: 'Generic name pattern', level: 'warning' });
    score += 10;
  }

  let level = 'low';
  if (score >= 50) level = 'high';
  else if (score >= 25) level = 'medium';

  if (factors.length === 0) {
    factors.push({ label: 'No red flags', level: '' });
  }

  return { score: Math.min(score, 100), level, factors };
}

/**
 * Observe URL changes (Spotify SPA navigation)
 */
function observeUrlChanges() {
  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handleUrlChange();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Handle URL change
 */
function handleUrlChange() {
  const playlistId = extractPlaylistId(window.location.href);

  if (playlistId && playlistId !== currentPlaylistId) {
    currentPlaylistId = playlistId;

    const badge = document.getElementById('spot-checker-badge');
    if (badge) badge.remove();

    const popover = document.getElementById('spot-checker-popover');
    if (popover) popover.remove();

    if (!document.getElementById('spot-checker-btn')) {
      injectFloatingButton();
    }
  } else if (!playlistId) {
    const btn = document.getElementById('spot-checker-btn');
    if (btn) btn.style.display = 'none';
  }
}

/**
 * Inject styles
 */
function injectStyles() {
  if (document.getElementById('spot-checker-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'spot-checker-styles';
  styles.textContent = `
    .spot-checker-float-btn {
      position: fixed;
      bottom: 100px;
      right: 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #1DB954;
      border: none;
      border-radius: 24px;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      transition: all 0.2s;
    }
    .spot-checker-float-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
    }
    .spot-checker-float-btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }
    .spot-checker-float-btn .spinner {
      animation: spot-checker-spin 1s linear infinite;
    }
    @keyframes spot-checker-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .spot-checker-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      margin-left: 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      vertical-align: middle;
    }
    .spot-checker-badge.low {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    .spot-checker-badge.medium {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .spot-checker-badge.high {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .spot-checker-popover {
      position: fixed;
      bottom: 160px;
      right: 24px;
      z-index: 10000;
      width: 320px;
      background: #282828;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      animation: spot-checker-slide-up 0.2s ease-out;
    }
    @keyframes spot-checker-slide-up {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .spot-checker-popover-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #333;
    }
    .spot-checker-popover-image {
      width: 48px;
      height: 48px;
      border-radius: 4px;
      object-fit: cover;
    }
    .spot-checker-popover-info {
      flex: 1;
      min-width: 0;
    }
    .spot-checker-popover-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .spot-checker-popover-curator {
      margin: 4px 0 0;
      font-size: 12px;
      color: #b3b3b3;
    }
    .spot-checker-popover-close {
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 50%;
      color: #b3b3b3;
      font-size: 18px;
      cursor: pointer;
    }
    .spot-checker-popover-close:hover {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
    .spot-checker-popover-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 16px;
    }
    .spot-checker-metric {
      text-align: center;
    }
    .spot-checker-metric-value {
      display: block;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .spot-checker-metric-label {
      display: block;
      font-size: 11px;
      color: #727272;
      margin-top: 4px;
    }
    .spot-checker-popover-score {
      margin: 0 16px 16px;
      padding: 14px;
      background: #333;
      border-radius: 8px;
    }
    .spot-checker-score-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 13px;
      color: #b3b3b3;
    }
    .spot-checker-score-value {
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .spot-checker-popover-score.low .spot-checker-score-value {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    .spot-checker-popover-score.medium .spot-checker-score-value {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .spot-checker-popover-score.high .spot-checker-score-value {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .spot-checker-score-bar {
      height: 6px;
      background: #404040;
      border-radius: 3px;
      overflow: hidden;
    }
    .spot-checker-score-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s;
    }
    .spot-checker-popover-score.low .spot-checker-score-fill {
      background: #22c55e;
    }
    .spot-checker-popover-score.medium .spot-checker-score-fill {
      background: #f59e0b;
    }
    .spot-checker-popover-score.high .spot-checker-score-fill {
      background: #ef4444;
    }
    .spot-checker-score-factors {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .spot-checker-factor {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #404040;
      color: #b3b3b3;
    }
    .spot-checker-factor.warning {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .spot-checker-factor.danger {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .spot-checker-popover-footer {
      padding: 12px 16px;
      border-top: 1px solid #404040;
      text-align: center;
    }
    .spot-checker-branding {
      font-size: 11px;
      color: #727272;
      text-decoration: none;
    }
    .spot-checker-branding:hover {
      color: #1DB954;
    }
    .spot-checker-error {
      position: fixed;
      bottom: 160px;
      right: 24px;
      z-index: 10000;
      padding: 12px 16px;
      background: #ef4444;
      color: #fff;
      border-radius: 8px;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      animation: spot-checker-slide-up 0.2s ease-out;
    }
  `;

  document.head.appendChild(styles);
}

/**
 * Format number helper
 */
function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
