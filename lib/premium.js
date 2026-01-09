/**
 * Premium Feature Management
 * Handles subscription status, tier checks, and feature gating
 */

import { Storage } from './storage.js';

// Cross-browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Tier definitions
const TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  PRO: 'pro',
};

// Feature limits by tier
const LIMITS = {
  [TIERS.FREE]: {
    dailyChecks: 5,
    bulkLimit: 0,
    tracking: false,
    export: false,
    botScore: false,
    api: false,
  },
  [TIERS.PREMIUM]: {
    dailyChecks: Infinity,
    bulkLimit: 50,
    tracking: true,
    export: true,
    botScore: true,
    api: false,
  },
  [TIERS.PRO]: {
    dailyChecks: Infinity,
    bulkLimit: 50,
    tracking: true,
    export: true,
    botScore: true,
    api: true,
    apiDailyLimit: 100,
  },
};

// Storage keys
const KEYS = {
  TIER: 'userTier',
  EMAIL: 'userEmail',
  SUBSCRIPTION_ID: 'subscriptionId',
  TIER_EXPIRY: 'tierExpiry',
  LAST_VERIFIED: 'lastVerified',
};

export const Premium = {
  /**
   * Get current user tier
   * @returns {Promise<string>}
   */
  async getTier() {
    // Check cached tier first
    const tier = await Storage.get(KEYS.TIER, TIERS.FREE);
    const expiry = await Storage.get(KEYS.TIER_EXPIRY, 0);

    // If tier is premium/pro, verify it's still valid
    if (tier !== TIERS.FREE && expiry > 0) {
      if (Date.now() > expiry) {
        // Expired - reverify with server
        return await this.verifySubscription();
      }
    }

    return tier;
  },

  /**
   * Get feature limits for current tier
   * @returns {Promise<Object>}
   */
  async getLimits() {
    const tier = await this.getTier();
    return LIMITS[tier] || LIMITS[TIERS.FREE];
  },

  /**
   * Check if a feature is available
   * @param {string} feature
   * @returns {Promise<boolean>}
   */
  async hasFeature(feature) {
    const limits = await this.getLimits();
    return limits[feature] === true || limits[feature] === Infinity || limits[feature] > 0;
  },

  /**
   * Check if user can perform action (respects daily limits)
   * @param {string} action - 'check', 'bulk', 'api'
   * @returns {Promise<{allowed: boolean, remaining: number}>}
   */
  async canPerform(action) {
    const tier = await this.getTier();
    const limits = LIMITS[tier];

    if (action === 'check') {
      if (limits.dailyChecks === Infinity) {
        return { allowed: true, remaining: Infinity };
      }

      const usage = await Storage.getDailyUsage();
      const remaining = Math.max(0, limits.dailyChecks - usage);

      return {
        allowed: remaining > 0,
        remaining,
      };
    }

    if (action === 'bulk') {
      return {
        allowed: limits.bulkLimit > 0,
        remaining: limits.bulkLimit,
      };
    }

    if (action === 'api') {
      if (!limits.api) {
        return { allowed: false, remaining: 0 };
      }

      const apiUsage = await Storage.getApiDailyUsage();
      const remaining = Math.max(0, limits.apiDailyLimit - apiUsage);

      return {
        allowed: remaining > 0,
        remaining,
      };
    }

    return { allowed: false, remaining: 0 };
  },

  /**
   * Verify subscription status with backend
   * @returns {Promise<string>} - Current tier
   */
  async verifySubscription() {
    const email = await Storage.get(KEYS.EMAIL);
    const subscriptionId = await Storage.get(KEYS.SUBSCRIPTION_ID);

    if (!email && !subscriptionId) {
      await this.setTier(TIERS.FREE);
      return TIERS.FREE;
    }

    try {
      const response = await fetch(
        'https://spot-checker.totalaudiopromo.com/api/subscription/verify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, subscriptionId }),
        }
      );

      if (!response.ok) {
        throw new Error('Verification failed');
      }

      const data = await response.json();

      if (data.active) {
        await this.setTier(data.tier, data.expiresAt);
        return data.tier;
      } else {
        await this.setTier(TIERS.FREE);
        return TIERS.FREE;
      }
    } catch (error) {
      console.error('Subscription verification failed:', error);

      // On error, keep current tier but mark for reverification
      const currentTier = await Storage.get(KEYS.TIER, TIERS.FREE);
      return currentTier;
    }
  },

  /**
   * Set user tier
   * @param {string} tier
   * @param {number} expiresAt - Unix timestamp (optional)
   */
  async setTier(tier, expiresAt = null) {
    await Storage.set(KEYS.TIER, tier);
    await Storage.set(KEYS.LAST_VERIFIED, Date.now());

    if (expiresAt) {
      await Storage.set(KEYS.TIER_EXPIRY, expiresAt);
    }
  },

  /**
   * Handle successful payment
   * @param {Object} data - { email, subscriptionId, tier }
   */
  async handlePaymentSuccess(data) {
    await Storage.set(KEYS.EMAIL, data.email);
    await Storage.set(KEYS.SUBSCRIPTION_ID, data.subscriptionId);
    await this.setTier(data.tier, data.expiresAt);

    // Sync tracked playlists to cloud
    await Storage.syncWithCloud(data.email);
  },

  /**
   * Sign out user
   */
  async signOut() {
    await Storage.remove(KEYS.EMAIL);
    await Storage.remove(KEYS.SUBSCRIPTION_ID);
    await Storage.remove(KEYS.TIER_EXPIRY);
    await this.setTier(TIERS.FREE);
  },

  /**
   * Get user email
   * @returns {Promise<string|null>}
   */
  async getEmail() {
    return await Storage.get(KEYS.EMAIL);
  },

  /**
   * Check if user is signed in
   * @returns {Promise<boolean>}
   */
  async isSignedIn() {
    const email = await this.getEmail();
    return !!email;
  },

  /**
   * Get checkout URL for a plan
   * @param {string} plan - 'premium' or 'pro'
   * @returns {string}
   */
  getCheckoutUrl(plan) {
    const baseUrl = 'https://spot-checker.totalaudiopromo.com/checkout';
    return `${baseUrl}?plan=${plan}`;
  },

  /**
   * Get customer portal URL
   * @returns {string}
   */
  getPortalUrl() {
    return 'https://spot-checker.totalaudiopromo.com/portal';
  },

  /**
   * Listen for subscription updates from backend
   */
  setupSubscriptionListener() {
    // Listen for messages from background script
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SUBSCRIPTION_UPDATED') {
        this.handlePaymentSuccess(message.data);
        sendResponse({ success: true });
      }
      return true;
    });
  },
};

// Tier constants export
export { TIERS, LIMITS };
