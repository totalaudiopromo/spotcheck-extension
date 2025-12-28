/**
 * Spotify API Wrapper
 * Handles authentication and playlist data fetching
 */

// API Configuration
const CONFIG = {
  API_BASE: 'https://api.spotify.com/v1',
  TOKEN_ENDPOINT: 'https://spot-checker.totalaudiopromo.com/api/spotify-token',
  // Fallback to direct Spotify auth for development
  CLIENT_ID: 'YOUR_SPOTIFY_CLIENT_ID', // Replace in production
};

// Token cache
let accessToken = null;
let tokenExpiry = 0;

export const SpotifyAPI = {
  /**
   * Extract playlist ID from various Spotify URL formats
   * @param {string} url - Spotify playlist URL
   * @returns {string|null} - Playlist ID or null if invalid
   */
  extractPlaylistId(url) {
    if (!url) return null;

    // Handle various URL formats
    const patterns = [
      // Standard web URL: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      // With query params: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=xxx
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)\?/,
      // Spotify URI: spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
      /spotify:playlist:([a-zA-Z0-9]+)/,
      // Just the ID (22 chars alphanumeric)
      /^([a-zA-Z0-9]{22})$/,
      // Embed URL
      /embed\/playlist\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  },

  /**
   * Get a valid access token
   * Uses backend proxy to avoid exposing client secret
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (accessToken && Date.now() < tokenExpiry - 300000) {
      return accessToken;
    }

    try {
      const response = await fetch(CONFIG.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get access token');
      }

      const data = await response.json();
      accessToken = data.access_token;
      tokenExpiry = Date.now() + data.expires_in * 1000;

      return accessToken;
    } catch (error) {
      console.error('Token fetch failed:', error);
      throw error;
    }
  },

  /**
   * Fetch playlist data from Spotify API
   * @param {string} playlistId
   * @returns {Promise<Object>}
   */
  async getPlaylist(playlistId) {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${CONFIG.API_BASE}/playlists/${playlistId}?fields=id,name,description,public,collaborative,followers,tracks(total),images,owner(id,display_name,external_urls),external_urls,snapshot_id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = new Error('Failed to fetch playlist');
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  /**
   * Fetch full track list (for premium users)
   * @param {string} playlistId
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object>}
   */
  async getPlaylistTracks(playlistId, limit = 100, offset = 0) {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${CONFIG.API_BASE}/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = new Error('Failed to fetch tracks');
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  /**
   * Fetch all tracks from a playlist (handles pagination)
   * @param {string} playlistId
   * @returns {Promise<Array>}
   */
  async getAllPlaylistTracks(playlistId) {
    const tracks = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const data = await this.getPlaylistTracks(playlistId, limit, offset);
      tracks.push(...data.items);

      if (data.items.length < limit || tracks.length >= data.total) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    return tracks;
  },

  /**
   * Get curator/user profile
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUser(userId) {
    const token = await this.getAccessToken();

    const response = await fetch(`${CONFIG.API_BASE}/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = new Error('Failed to fetch user');
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  /**
   * Get curator's public playlists
   * @param {string} userId
   * @param {number} limit
   * @returns {Promise<Object>}
   */
  async getUserPlaylists(userId, limit = 50) {
    const token = await this.getAccessToken();

    const response = await fetch(`${CONFIG.API_BASE}/users/${userId}/playlists?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = new Error('Failed to fetch user playlists');
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  /**
   * Validate multiple playlists in parallel
   * @param {Array<string>} playlistIds
   * @param {number} concurrency
   * @returns {Promise<Array>}
   */
  async validateBatch(playlistIds, concurrency = 5) {
    const results = [];

    // Process in batches
    for (let i = 0; i < playlistIds.length; i += concurrency) {
      const batch = playlistIds.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async id => {
          try {
            const playlist = await this.getPlaylist(id);
            return { success: true, data: playlist };
          } catch (error) {
            return { success: false, error: error.message, id };
          }
        })
      );

      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + concurrency < playlistIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  },
};
