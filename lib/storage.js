/**
 * Storage Utility
 * Cross-browser compatible storage abstraction
 * Works with Chrome, Firefox, Safari, Arc, Opera
 */

// Cross-browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Storage keys
const KEYS = {
  DAILY_USAGE: 'dailyUsage',
  USAGE_DATE: 'usageDate',
  API_DAILY_USAGE: 'apiDailyUsage',
  API_USAGE_DATE: 'apiUsageDate',
  TRACKED_PLAYLISTS: 'trackedPlaylists',
  USER_TIER: 'userTier',
  USER_EMAIL: 'userEmail',
  SETTINGS: 'settings',
  PLAYLIST_HISTORY: 'playlistHistory',
};

export const Storage = {
  /**
   * Get a value from storage
   * @param {string} key
   * @param {*} defaultValue
   * @returns {Promise<*>}
   */
  async get(key, defaultValue = null) {
    try {
      const result = await browserAPI.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      console.error('Storage get error:', error);
      return defaultValue;
    }
  },

  /**
   * Set a value in storage
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    try {
      await browserAPI.storage.local.set({ [key]: value });
    } catch (error) {
      console.error('Storage set error:', error);
    }
  },

  /**
   * Remove a value from storage
   * @param {string} key
   * @returns {Promise<void>}
   */
  async remove(key) {
    try {
      await browserAPI.storage.local.remove(key);
    } catch (error) {
      console.error('Storage remove error:', error);
    }
  },

  /**
   * Clear all storage
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await browserAPI.storage.local.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
    }
  },

  /**
   * Get daily usage count (resets each day)
   * @returns {Promise<number>}
   */
  async getDailyUsage() {
    const today = new Date().toDateString();
    const usageDate = await this.get(KEYS.USAGE_DATE);

    // Reset if new day
    if (usageDate !== today) {
      await this.set(KEYS.USAGE_DATE, today);
      await this.set(KEYS.DAILY_USAGE, 0);
      return 0;
    }

    return await this.get(KEYS.DAILY_USAGE, 0);
  },

  /**
   * Increment daily usage
   * @returns {Promise<number>}
   */
  async incrementDailyUsage() {
    const current = await this.getDailyUsage();
    const newValue = current + 1;
    await this.set(KEYS.DAILY_USAGE, newValue);
    return newValue;
  },

  /**
   * Get daily API usage count (resets each day)
   * @returns {Promise<number>}
   */
  async getApiDailyUsage() {
    const today = new Date().toDateString();
    const usageDate = await this.get(KEYS.API_USAGE_DATE);

    // Reset if new day
    if (usageDate !== today) {
      await this.set(KEYS.API_USAGE_DATE, today);
      await this.set(KEYS.API_DAILY_USAGE, 0);
      return 0;
    }

    return await this.get(KEYS.API_DAILY_USAGE, 0);
  },

  /**
   * Increment daily API usage
   * @returns {Promise<number>}
   */
  async incrementApiDailyUsage() {
    const current = await this.getApiDailyUsage();
    const newValue = current + 1;
    await this.set(KEYS.API_DAILY_USAGE, newValue);
    return newValue;
  },

  /**
   * Get tracked playlists
   * @returns {Promise<Array>}
   */
  async getTrackedPlaylists() {
    return await this.get(KEYS.TRACKED_PLAYLISTS, []);
  },

  /**
   * Track a playlist
   * @param {Object} playlist - { id, name, image, followers, timestamp }
   * @returns {Promise<void>}
   */
  async trackPlaylist(playlist) {
    const tracked = await this.getTrackedPlaylists();

    // Find existing or create new
    const existingIndex = tracked.findIndex(p => p.id === playlist.id);

    if (existingIndex >= 0) {
      // Update existing - add to history
      const existing = tracked[existingIndex];
      const history = existing.history || [];

      // Add current data to history (keep last 30 entries)
      history.unshift({
        followers: playlist.followers,
        timestamp: playlist.timestamp,
      });

      if (history.length > 30) {
        history.pop();
      }

      tracked[existingIndex] = {
        ...existing,
        ...playlist,
        history,
      };
    } else {
      // Add new (limit to 50 tracked playlists)
      tracked.unshift({
        ...playlist,
        history: [
          {
            followers: playlist.followers,
            timestamp: playlist.timestamp,
          },
        ],
      });

      if (tracked.length > 50) {
        tracked.pop();
      }
    }

    await this.set(KEYS.TRACKED_PLAYLISTS, tracked);
  },

  /**
   * Remove a tracked playlist
   * @param {string} playlistId
   * @returns {Promise<void>}
   */
  async untrackPlaylist(playlistId) {
    const tracked = await this.getTrackedPlaylists();
    const filtered = tracked.filter(p => p.id !== playlistId);
    await this.set(KEYS.TRACKED_PLAYLISTS, filtered);
  },

  /**
   * Get playlist history
   * @param {string} playlistId
   * @returns {Promise<Array>}
   */
  async getPlaylistHistory(playlistId) {
    const tracked = await this.getTrackedPlaylists();
    const playlist = tracked.find(p => p.id === playlistId);
    return playlist?.history || [];
  },

  /**
   * Store playlist history from backend (for premium users)
   * @param {string} playlistId
   * @param {Array} history
   * @returns {Promise<void>}
   */
  async setPlaylistHistory(playlistId, history) {
    const allHistory = await this.get(KEYS.PLAYLIST_HISTORY, {});
    allHistory[playlistId] = history;
    await this.set(KEYS.PLAYLIST_HISTORY, allHistory);
  },

  /**
   * Get settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    return await this.get(KEYS.SETTINGS, {
      autoCheck: true,
      showBadge: true,
      theme: 'dark',
    });
  },

  /**
   * Update settings
   * @param {Object} settings
   * @returns {Promise<void>}
   */
  async updateSettings(settings) {
    const current = await this.getSettings();
    await this.set(KEYS.SETTINGS, { ...current, ...settings });
  },

  /**
   * Sync data with cloud (for premium users)
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async syncWithCloud(userId) {
    try {
      const tracked = await this.getTrackedPlaylists();

      const response = await fetch('https://spot-checker.totalaudiopromo.com/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          trackedPlaylists: tracked,
        }),
      });

      if (response.ok) {
        const cloudData = await response.json();

        // Merge cloud data with local
        if (cloudData.trackedPlaylists) {
          await this.set(KEYS.TRACKED_PLAYLISTS, cloudData.trackedPlaylists);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  },

  /**
   * Export all data
   * @returns {Promise<Object>}
   */
  async exportAll() {
    const tracked = await this.getTrackedPlaylists();
    const settings = await this.getSettings();

    return {
      trackedPlaylists: tracked,
      settings,
      exportedAt: new Date().toISOString(),
    };
  },

  /**
   * Import data
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async importData(data) {
    if (data.trackedPlaylists) {
      await this.set(KEYS.TRACKED_PLAYLISTS, data.trackedPlaylists);
    }
    if (data.settings) {
      await this.set(KEYS.SETTINGS, data.settings);
    }
  },
};
