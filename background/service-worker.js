/**
 * Spot Checker - Service Worker (Background Script)
 * Handles background tasks, message passing, and alarms
 * Cross-browser compatible
 */

// Cross-browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Constants
const ALARM_NAMES = {
  DAILY_RESET: 'dailyReset',
  SYNC_TRACKED: 'syncTracked',
  VERIFY_SUBSCRIPTION: 'verifySubscription',
};

/**
 * Initialise service worker
 */
async function init() {
  console.log('Spot Checker service worker initialised');

  // Set up alarms
  await setupAlarms();

  // Check subscription status on startup
  await verifySubscription();
}

/**
 * Setup recurring alarms
 */
async function setupAlarms() {
  // Daily reset alarm (resets usage counter)
  browserAPI.alarms.create(ALARM_NAMES.DAILY_RESET, {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60, // Daily
  });

  // Sync tracked playlists every 6 hours (premium only)
  browserAPI.alarms.create(ALARM_NAMES.SYNC_TRACKED, {
    periodInMinutes: 6 * 60,
  });

  // Verify subscription every 24 hours
  browserAPI.alarms.create(ALARM_NAMES.VERIFY_SUBSCRIPTION, {
    periodInMinutes: 24 * 60,
  });
}

/**
 * Get timestamp for next midnight
 */
function getNextMidnight() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * Handle alarm events
 */
browserAPI.alarms.onAlarm.addListener(async alarm => {
  console.log('Alarm triggered:', alarm.name);

  switch (alarm.name) {
    case ALARM_NAMES.DAILY_RESET:
      await handleDailyReset();
      break;
    case ALARM_NAMES.SYNC_TRACKED:
      await handleSyncTracked();
      break;
    case ALARM_NAMES.VERIFY_SUBSCRIPTION:
      await verifySubscription();
      break;
  }
});

/**
 * Reset daily usage counter
 */
async function handleDailyReset() {
  await browserAPI.storage.local.set({
    dailyUsage: 0,
    usageDate: new Date().toDateString(),
  });
  console.log('Daily usage reset');
}

/**
 * Sync tracked playlists with cloud
 */
async function handleSyncTracked() {
  const { userTier, userEmail, trackedPlaylists } = await browserAPI.storage.local.get([
    'userTier',
    'userEmail',
    'trackedPlaylists',
  ]);

  // Only sync for premium users
  if (userTier === 'free' || !userEmail) {
    return;
  }

  try {
    // Update follower counts for tracked playlists
    const token = await getAccessToken();

    if (!token || !trackedPlaylists?.length) return;

    const updatedPlaylists = await Promise.all(
      trackedPlaylists.slice(0, 10).map(async playlist => {
        try {
          const response = await fetch(
            `https://api.spotify.com/v1/playlists/${playlist.id}?fields=followers`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.ok) {
            const data = await response.json();
            const newFollowers = data.followers?.total;

            // Add to history
            const history = playlist.history || [];
            history.unshift({
              followers: newFollowers,
              timestamp: Date.now(),
            });

            // Keep last 30 entries
            if (history.length > 30) {
              history.pop();
            }

            return {
              ...playlist,
              followers: newFollowers,
              history,
              lastUpdated: Date.now(),
            };
          }
        } catch (e) {
          console.error('Failed to update playlist:', playlist.id, e);
        }
        return playlist;
      })
    );

    await browserAPI.storage.local.set({ trackedPlaylists: updatedPlaylists });
    console.log('Tracked playlists synced');

    // Sync to cloud
    await fetch('https://spot-checker.totalaudiopromo.com/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userEmail,
        trackedPlaylists: updatedPlaylists,
      }),
    });
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

/**
 * Verify subscription status
 */
async function verifySubscription() {
  const { userEmail, subscriptionId } = await browserAPI.storage.local.get([
    'userEmail',
    'subscriptionId',
  ]);

  if (!userEmail && !subscriptionId) {
    return;
  }

  try {
    const response = await fetch(
      'https://spot-checker.totalaudiopromo.com/api/subscription/verify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, subscriptionId }),
      }
    );

    if (response.ok) {
      const data = await response.json();

      await browserAPI.storage.local.set({
        userTier: data.active ? data.tier : 'free',
        tierExpiry: data.expiresAt || 0,
        lastVerified: Date.now(),
      });

      console.log('Subscription verified:', data.tier);
    }
  } catch (error) {
    console.error('Subscription verification failed:', error);
  }
}

/**
 * Get Spotify access token
 */
async function getAccessToken() {
  try {
    const response = await fetch('https://spot-checker.totalaudiopromo.com/api/spotify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      return data.access_token;
    }
  } catch (error) {
    console.error('Token fetch failed:', error);
  }
  return null;
}

/**
 * Handle messages from popup/content scripts
 */
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type);

  switch (message.type) {
    case 'GET_PLAYLIST':
      handleGetPlaylist(message.playlistId).then(sendResponse);
      return true;

    case 'CHECK_SUBSCRIPTION':
      verifySubscription().then(() => sendResponse({ success: true }));
      return true;

    case 'SYNC_NOW':
      handleSyncTracked().then(() => sendResponse({ success: true }));
      return true;

    case 'PAYMENT_SUCCESS':
      handlePaymentSuccess(message.data).then(sendResponse);
      return true;
  }
});

/**
 * Handle playlist fetch request
 */
async function handleGetPlaylist(playlistId) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { error: 'No access token' };
    }

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,public,collaborative,followers,tracks(total),images,owner,external_urls,snapshot_id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(data) {
  await browserAPI.storage.local.set({
    userEmail: data.email,
    subscriptionId: data.subscriptionId,
    userTier: data.tier,
    tierExpiry: data.expiresAt,
    lastVerified: Date.now(),
  });

  // Notify popup
  browserAPI.runtime
    .sendMessage({
      type: 'SUBSCRIPTION_UPDATED',
      data,
    })
    .catch(() => {
      // Popup might not be open
    });

  return { success: true };
}

/**
 * Handle extension install/update
 */
browserAPI.runtime.onInstalled.addListener(details => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First install - set defaults
    browserAPI.storage.local.set({
      userTier: 'free',
      dailyUsage: 0,
      usageDate: new Date().toDateString(),
      trackedPlaylists: [],
      settings: {
        autoCheck: true,
        showBadge: true,
      },
    });

    // Open welcome page
    browserAPI.tabs.create({
      url: 'https://spot-checker.totalaudiopromo.com/welcome',
    });
  }
});

/**
 * Handle browser action click (when no popup)
 */
browserAPI.action?.onClicked?.addListener(tab => {
  // If on Spotify playlist page, auto-check
  if (tab.url?.includes('open.spotify.com/playlist/')) {
    browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/spotify-injector.js'],
    });
  }
});

// Initialise
init();
