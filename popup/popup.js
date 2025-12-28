/**
 * Spot Checker - Popup Script
 * Main UI controller for the Chrome extension
 * Cross-browser compatible (Chrome, Firefox, Safari, Arc, Opera)
 */

import { SpotifyAPI } from '../lib/spotify-api.js';
import { Storage } from '../lib/storage.js';
import { Premium } from '../lib/premium.js';
import {
  createElement,
  clearChildren,
  setText,
  createTableRow,
  createLink,
  createBadge,
  createTrackedItem,
  createFactorBadge,
  formatNumber,
  truncate,
} from '../lib/dom-utils.js';

// Cross-browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM Elements
const elements = {
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Single check
  playlistUrl: document.getElementById('playlistUrl'),
  checkBtn: document.getElementById('checkBtn'),
  usageCounter: document.getElementById('usageCounter'),
  checksUsed: document.getElementById('checksUsed'),
  usageFill: document.getElementById('usageFill'),
  results: document.getElementById('results'),
  errorState: document.getElementById('errorState'),

  // Result fields
  playlistImage: document.getElementById('playlistImage'),
  playlistName: document.getElementById('playlistName'),
  curatorLink: document.getElementById('curatorLink'),
  curatorName: document.getElementById('curatorName'),
  statusBadge: document.getElementById('statusBadge'),
  followers: document.getElementById('followers'),
  tracks: document.getElementById('tracks'),
  lastUpdated: document.getElementById('lastUpdated'),
  visibility: document.getElementById('visibility'),
  followerTrend: document.getElementById('followerTrend'),
  botScoreSection: document.getElementById('botScoreSection'),
  botScore: document.getElementById('botScore'),
  botScoreFill: document.getElementById('botScoreFill'),
  botScoreFactors: document.getElementById('botScoreFactors'),

  // Actions
  openPlaylistBtn: document.getElementById('openPlaylistBtn'),
  trackPlaylistBtn: document.getElementById('trackPlaylistBtn'),
  exportBtn: document.getElementById('exportBtn'),

  // Bulk
  bulkPremiumGate: document.getElementById('bulkPremiumGate'),
  bulkContent: document.getElementById('bulkContent'),
  bulkUrls: document.getElementById('bulkUrls'),
  bulkCount: document.getElementById('bulkCount'),
  bulkCheckBtn: document.getElementById('bulkCheckBtn'),
  bulkProgress: document.getElementById('bulkProgress'),
  bulkProgressFill: document.getElementById('bulkProgressFill'),
  bulkProgressText: document.getElementById('bulkProgressText'),
  bulkResults: document.getElementById('bulkResults'),
  bulkResultsBody: document.getElementById('bulkResultsBody'),
  exportBulkBtn: document.getElementById('exportBulkBtn'),

  // History
  historyPremiumGate: document.getElementById('historyPremiumGate'),
  historyContent: document.getElementById('historyContent'),
  trackedPlaylists: document.getElementById('trackedPlaylists'),
  historyEmpty: document.getElementById('historyEmpty'),

  // User info
  userTier: document.getElementById('userTier'),

  // Modals
  upgradeModal: document.getElementById('upgradeModal'),
  settingsModal: document.getElementById('settingsModal'),

  // Footer
  settingsLink: document.getElementById('settingsLink'),
  upgradeLink: document.getElementById('upgradeLink'),
};

// State
let currentPlaylist = null;
let bulkResults = [];

// Initialise
async function init() {
  // Load user tier
  const tier = await Premium.getTier();
  updateTierUI(tier);

  // Load usage
  await updateUsageUI();

  // Load tracked playlists
  await loadTrackedPlaylists();

  // Setup event listeners
  setupEventListeners();

  // Check if on Spotify page
  checkActiveTab();
}

// Event Listeners
function setupEventListeners() {
  // Tabs
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Single check
  elements.checkBtn.addEventListener('click', handleSingleCheck);
  elements.playlistUrl.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSingleCheck();
  });
  elements.playlistUrl.addEventListener('paste', handlePaste);

  // Result actions
  elements.openPlaylistBtn.addEventListener('click', () => {
    if (currentPlaylist) {
      browserAPI.tabs.create({ url: currentPlaylist.external_urls.spotify });
    }
  });

  elements.trackPlaylistBtn.addEventListener('click', handleTrackPlaylist);
  elements.exportBtn.addEventListener('click', () => exportResults([currentPlaylist]));

  // Bulk
  elements.bulkUrls.addEventListener('input', updateBulkCount);
  elements.bulkCheckBtn.addEventListener('click', handleBulkCheck);
  elements.exportBulkBtn.addEventListener('click', () => exportResults(bulkResults));

  // Upgrade buttons
  document.querySelectorAll('.btn-upgrade').forEach(btn => {
    btn.addEventListener('click', e => {
      const plan = e.target.dataset.plan;
      if (plan) {
        openCheckout(plan);
      } else {
        showUpgradeModal();
      }
    });
  });

  // Footer links
  elements.settingsLink.addEventListener('click', e => {
    e.preventDefault();
    showSettingsModal();
  });

  elements.upgradeLink.addEventListener('click', e => {
    e.preventDefault();
    showUpgradeModal();
  });

  // Modal close
  document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', closeModals);
  });

  // Settings
  document.getElementById('clearDataBtn')?.addEventListener('click', handleClearData);
  document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);

  // Checkboxes
  document.getElementById('autoCheck')?.addEventListener('change', e => {
    Storage.set('autoCheck', e.target.checked);
  });
  document.getElementById('showBadge')?.addEventListener('change', e => {
    Storage.set('showBadge', e.target.checked);
  });
}

// Tab switching
function switchTab(tabId) {
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });
}

// Single playlist check
async function handleSingleCheck() {
  const url = elements.playlistUrl.value.trim();

  if (!url) {
    showError('Please enter a Spotify playlist URL');
    return;
  }

  const playlistId = SpotifyAPI.extractPlaylistId(url);
  if (!playlistId) {
    showError(
      'Invalid Spotify playlist URL',
      'Please enter a valid playlist link (e.g., open.spotify.com/playlist/...)'
    );
    return;
  }

  // Check usage limit for free tier
  const tier = await Premium.getTier();
  if (tier === 'free') {
    const usage = await Storage.getDailyUsage();
    if (usage >= 5) {
      showUpgradeModal();
      return;
    }
  }

  // Show loading
  setLoading(true);
  hideResults();

  try {
    const playlist = await SpotifyAPI.getPlaylist(playlistId);
    currentPlaylist = playlist;

    // Increment usage for free tier
    if (tier === 'free') {
      await Storage.incrementDailyUsage();
      await updateUsageUI();
    }

    // Calculate bot score (premium feature)
    let botData = null;
    if (tier !== 'free') {
      botData = await calculateBotScore(playlist);
    }

    // Check for historical data
    const history = await Storage.getPlaylistHistory(playlistId);

    displayResults(playlist, botData, history);
  } catch (error) {
    console.error('Check failed:', error);
    if (error.status === 404) {
      showError('Playlist not found', 'This playlist may be private or no longer exists.');
    } else if (error.status === 429) {
      showError('Rate limited', 'Too many requests. Please try again in a moment.');
    } else {
      showError('Check failed', error.message || 'Something went wrong. Please try again.');
    }
  } finally {
    setLoading(false);
  }
}

// Handle paste event for auto-check
function handlePaste(e) {
  setTimeout(async () => {
    const text = elements.playlistUrl.value.trim();
    if (SpotifyAPI.extractPlaylistId(text)) {
      await handleSingleCheck();
    }
  }, 100);
}

// Display results
function displayResults(playlist, botData, history) {
  elements.results.classList.remove('hidden');
  elements.errorState.classList.add('hidden');

  // Basic info
  elements.playlistImage.src = playlist.images?.[0]?.url || '';
  setText(elements.playlistName, playlist.name);
  setText(elements.curatorName, playlist.owner.display_name);
  elements.curatorLink.href = playlist.owner.external_urls?.spotify || '#';

  // Status
  const statusBadge = elements.statusBadge;
  const statusText = statusBadge.querySelector('.status-text');
  if (playlist.public === false) {
    statusBadge.className = 'status-badge private';
    setText(statusText, 'Private');
  } else {
    statusBadge.className = 'status-badge';
    setText(statusText, 'Active');
  }

  // Metrics
  setText(elements.followers, formatNumber(playlist.followers?.total || 0));
  setText(elements.tracks, String(playlist.tracks?.total || 0));
  setText(elements.visibility, playlist.public ? 'Public' : 'Private');

  // Last updated from snapshot_id
  const lastUpdated = parseSnapshotDate(playlist.snapshot_id);
  setText(elements.lastUpdated, lastUpdated ? formatDate(lastUpdated) : 'Unknown');

  // Historical trend (premium)
  if (history && history.length > 1) {
    const trend = calculateTrend(history);
    elements.followerTrend.classList.remove('hidden');
    elements.followerTrend.className = `metric-trend ${trend.direction}`;
    setText(elements.followerTrend.querySelector('.trend-value'), trend.text);
    elements.followerTrend.querySelector('.trend-icon').className = `trend-icon ${trend.direction}`;
  } else {
    elements.followerTrend.classList.add('hidden');
  }

  // Bot score (premium)
  if (botData) {
    displayBotScore(botData);
  }
}

// Display bot score
function displayBotScore(botData) {
  const { score, level, factors } = botData;

  setText(elements.botScore, `${score}%`);
  elements.botScore.className = `bot-score-value ${level}`;

  elements.botScoreFill.style.width = `${score}%`;
  elements.botScoreFill.className = `bot-score-fill ${level}`;

  // Display factors using safe DOM methods
  clearChildren(elements.botScoreFactors);
  factors.forEach(factor => {
    elements.botScoreFactors.appendChild(createFactorBadge(factor));
  });
}

// Calculate bot score
async function calculateBotScore(playlist) {
  const factors = [];
  let score = 0;

  const followers = playlist.followers?.total || 0;
  const tracks = playlist.tracks?.total || 0;

  // Factor 1: Followers to tracks ratio
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

  // Factor 2: Very new playlist with high followers
  const snapshotDate = parseSnapshotDate(playlist.snapshot_id);
  if (snapshotDate) {
    const daysSinceCreation = Math.floor((Date.now() - snapshotDate) / (1000 * 60 * 60 * 24));
    if (daysSinceCreation < 30 && followers > 10000) {
      factors.push({ label: 'New playlist, high followers', level: 'danger' });
      score += 30;
    }
  }

  // Factor 3: Generic name patterns
  const genericNames = ['chill', 'vibes', 'lofi', 'study', 'sleep', 'workout'];
  const nameLower = playlist.name.toLowerCase();
  if (genericNames.some(n => nameLower.includes(n)) && followers > 50000) {
    factors.push({ label: 'Generic name pattern', level: 'warning' });
    score += 10;
  }

  // Factor 4: No description
  if (!playlist.description || playlist.description.length < 10) {
    factors.push({ label: 'No description', level: 'warning' });
    score += 10;
  }

  // Factor 5: Round follower numbers
  if (followers > 1000 && followers % 1000 === 0) {
    factors.push({ label: 'Round follower count', level: 'warning' });
    score += 15;
  }

  // Determine level
  let level = 'low';
  if (score >= 50) level = 'high';
  else if (score >= 25) level = 'medium';

  // Add positive factor if low risk
  if (factors.length === 0) {
    factors.push({ label: 'No red flags detected', level: '' });
  }

  return { score: Math.min(score, 100), level, factors };
}

// Bulk check
async function handleBulkCheck() {
  const urls = elements.bulkUrls.value
    .split('\n')
    .map(u => u.trim())
    .filter(u => u);

  if (urls.length === 0) {
    return;
  }

  if (urls.length > 50) {
    alert('Maximum 50 playlists at once');
    return;
  }

  // Show progress
  elements.bulkProgress.classList.remove('hidden');
  elements.bulkResults.classList.add('hidden');
  elements.bulkCheckBtn.disabled = true;

  bulkResults = [];
  let completed = 0;

  // Process in batches of 5
  const batchSize = 5;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async url => {
        const id = SpotifyAPI.extractPlaylistId(url);
        if (!id) return { error: 'Invalid URL', url };

        try {
          const playlist = await SpotifyAPI.getPlaylist(id);
          const botData = await calculateBotScore(playlist);
          return { ...playlist, botData };
        } catch (e) {
          return { error: e.message, url };
        }
      })
    );

    bulkResults.push(...results);
    completed += batch.length;

    // Update progress
    const progress = (completed / urls.length) * 100;
    elements.bulkProgressFill.style.width = `${progress}%`;
    setText(elements.bulkProgressText, `${completed}/${urls.length} checked`);
  }

  // Display results
  displayBulkResults();
  elements.bulkCheckBtn.disabled = false;
}

// Display bulk results using safe DOM methods
function displayBulkResults() {
  elements.bulkResults.classList.remove('hidden');
  elements.bulkProgress.classList.add('hidden');

  clearChildren(elements.bulkResultsBody);

  bulkResults.forEach(result => {
    let row;

    if (result.error) {
      row = createTableRow([
        {
          content: `${result.error}: ${result.url}`,
          colspan: 4,
          style: { color: 'var(--error-red)' },
        },
      ]);
    } else {
      const link = createLink(result.external_urls?.spotify || '#', truncate(result.name, 25), {
        target: '_blank',
        style: 'color: var(--text-primary); text-decoration: none;',
      });

      const badge = createBadge(`${result.botData?.score || 0}%`, result.botData?.level || 'low');

      row = createTableRow([
        { content: link },
        formatNumber(result.followers?.total || 0),
        String(result.tracks?.total || 0),
        { content: badge },
      ]);
    }

    elements.bulkResultsBody.appendChild(row);
  });
}

// Update bulk URL count
function updateBulkCount() {
  const count = elements.bulkUrls.value.split('\n').filter(u => u.trim()).length;
  setText(elements.bulkCount, String(count));
}

// Track playlist
async function handleTrackPlaylist() {
  if (!currentPlaylist) return;

  await Storage.trackPlaylist({
    id: currentPlaylist.id,
    name: currentPlaylist.name,
    image: currentPlaylist.images?.[0]?.url,
    followers: currentPlaylist.followers?.total,
    timestamp: Date.now(),
  });

  await loadTrackedPlaylists();

  // Show confirmation
  setText(elements.trackPlaylistBtn, 'Tracked ✓');
  setTimeout(() => {
    elements.trackPlaylistBtn.textContent = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute(
      'd',
      'M2 2.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z'
    );
    svg.appendChild(path);
    elements.trackPlaylistBtn.appendChild(svg);
    elements.trackPlaylistBtn.appendChild(document.createTextNode(' Track'));
  }, 2000);
}

// Load tracked playlists using safe DOM methods
async function loadTrackedPlaylists() {
  const tracked = await Storage.getTrackedPlaylists();

  if (tracked.length === 0) {
    elements.historyEmpty.classList.remove('hidden');
    clearChildren(elements.trackedPlaylists);
    return;
  }

  elements.historyEmpty.classList.add('hidden');
  clearChildren(elements.trackedPlaylists);

  tracked.forEach(p => {
    const history = p.history || [];
    let trend = null;

    if (history.length > 1) {
      trend = calculateTrend(history);
    }

    const item = createTrackedItem(p, trend);

    // Add click handler
    item.addEventListener('click', () => {
      elements.playlistUrl.value = `https://open.spotify.com/playlist/${p.id}`;
      switchTab('single');
      handleSingleCheck();
    });

    elements.trackedPlaylists.appendChild(item);
  });
}

// Export results
function exportResults(results) {
  const data = results
    .filter(r => r && !r.error)
    .map(r => ({
      name: r.name,
      curator: r.owner?.display_name,
      followers: r.followers?.total,
      tracks: r.tracks?.total,
      public: r.public,
      url: r.external_urls?.spotify,
      botScore: r.botData?.score,
      botLevel: r.botData?.level,
    }));

  if (data.length === 0) return;

  // CSV format
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(',')),
  ].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spot-checker-export-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// UI Helpers
function setLoading(loading) {
  elements.checkBtn.disabled = loading;
  elements.checkBtn.querySelector('.btn-text').classList.toggle('hidden', loading);
  elements.checkBtn.querySelector('.btn-loading').classList.toggle('hidden', !loading);
}

function hideResults() {
  elements.results.classList.add('hidden');
  elements.errorState.classList.add('hidden');
}

function showError(title, message = '') {
  elements.results.classList.add('hidden');
  elements.errorState.classList.remove('hidden');
  setText(document.getElementById('errorTitle'), title);
  setText(document.getElementById('errorMessage'), message);
}

async function updateUsageUI() {
  const tier = await Premium.getTier();

  if (tier !== 'free') {
    elements.usageCounter.classList.add('hidden');
    return;
  }

  const usage = await Storage.getDailyUsage();
  setText(elements.checksUsed, String(usage));

  const percent = (usage / 5) * 100;
  elements.usageFill.style.width = `${percent}%`;
  elements.usageFill.classList.toggle('warning', percent >= 60 && percent < 100);
  elements.usageFill.classList.toggle('danger', percent >= 100);
}

function updateTierUI(tier) {
  const badge = elements.userTier.querySelector('.tier-badge');
  badge.className = `tier-badge ${tier}`;
  setText(badge, tier.charAt(0).toUpperCase() + tier.slice(1));

  document.body.classList.remove('free', 'premium', 'pro');
  document.body.classList.add(tier);

  // Show/hide premium gates
  const isPremium = tier !== 'free';
  elements.bulkPremiumGate.classList.toggle('hidden', isPremium);
  elements.bulkContent.classList.toggle('hidden', !isPremium);
  elements.historyPremiumGate.classList.toggle('hidden', isPremium);
  elements.historyContent.classList.toggle('hidden', !isPremium);

  // Hide upgrade link for paid users
  elements.upgradeLink.classList.toggle('hidden', isPremium);
}

// Modals
function showUpgradeModal() {
  elements.upgradeModal.classList.remove('hidden');
}

function showSettingsModal() {
  elements.settingsModal.classList.remove('hidden');
  loadSettings();
}

function closeModals() {
  elements.upgradeModal.classList.add('hidden');
  elements.settingsModal.classList.add('hidden');
}

async function loadSettings() {
  const autoCheck = await Storage.get('autoCheck', true);
  const showBadge = await Storage.get('showBadge', true);

  document.getElementById('autoCheck').checked = autoCheck;
  document.getElementById('showBadge').checked = showBadge;

  const tier = await Premium.getTier();
  setText(document.getElementById('accountPlan'), tier.charAt(0).toUpperCase() + tier.slice(1));
}

// Actions
function openCheckout(plan) {
  // Open Stripe checkout
  const checkoutUrl = `https://spot-checker.totalaudiopromo.com/checkout?plan=${plan}`;
  browserAPI.tabs.create({ url: checkoutUrl });
}

async function handleClearData() {
  if (confirm('Clear all local data? This cannot be undone.')) {
    await Storage.clear();
    location.reload();
  }
}

async function handleSignOut() {
  await Premium.signOut();
  location.reload();
}

// Check if current tab is Spotify
async function checkActiveTab() {
  try {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.url?.includes('open.spotify.com/playlist/')) {
      const playlistId = SpotifyAPI.extractPlaylistId(tab.url);
      if (playlistId) {
        elements.playlistUrl.value = tab.url;
        // Don't auto-check to save API calls, just pre-fill
      }
    }
  } catch (e) {
    // Permission not granted, ignore
  }
}

// Utility functions
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function parseSnapshotDate(snapshotId) {
  // Spotify snapshot_id format: base62 encoded, not reliable for dates
  // Return null - we'll use other methods to estimate
  return null;
}

function calculateTrend(history) {
  if (history.length < 2) return { direction: '', text: '' };

  const latest = history[0].followers;
  const previous = history[1].followers;
  const diff = latest - previous;
  const percent = previous > 0 ? ((diff / previous) * 100).toFixed(1) : 0;

  return {
    direction: diff >= 0 ? 'up' : 'down',
    text: `${diff >= 0 ? '+' : ''}${percent}%`,
  };
}

// Initialise on load
document.addEventListener('DOMContentLoaded', init);
