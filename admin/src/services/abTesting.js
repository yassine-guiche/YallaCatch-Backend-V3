/**
 * YallaCatch! A/B Testing Service
 * Manages A/B tests for features, UI, mechanics, rewards, and pricing
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Get all A/B tests with optional filters
 * @param {Object} params - { status?: string, type?: string }
 */
export async function getTests(params = {}) {
  try {
    const response = await apiService.get('/admin/ab-testing', params);
    return {
      items: response.data || response.tests || [],
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getTests error:', error);
    throwNormalized(error, 'Impossible de récupérer les tests A/B');
  }
}

/**
 * Get a single A/B test by ID
 * @param {string} testId 
 */
export async function getTestById(testId) {
  try {
    const response = await apiService.get(`/admin/ab-testing/${testId}`);
    return response.data || response.test || response;
  } catch (error) {
    console.error('getTestById error:', error);
    throwNormalized(error, 'Impossible de récupérer le test A/B');
  }
}

/**
 * Create a new A/B test
 * @param {Object} testData - { name, description?, type, variants[], startDate, sampleSize?, confidenceLevel? }
 */
export async function createTest(testData) {
  try {
    // Convert startDate to ISO 8601 format
    const payload = { ...testData };
    if (payload.startDate) {
      // Ensure we have a valid ISO 8601 datetime string
      const dateObj = new Date(payload.startDate);
      if (!isNaN(dateObj.getTime())) {
        payload.startDate = dateObj.toISOString();
      } else {
        // If invalid date, use current time + 1 hour
        payload.startDate = new Date(Date.now() + 3600000).toISOString();
      }
    } else {
      // Default to now if no startDate provided
      payload.startDate = new Date().toISOString();
    }
    const response = await apiService.post('/admin/ab-testing', payload);
    return response.data || response.test || response;
  } catch (error) {
    console.error('createTest error:', error);
    throwNormalized(error, 'Impossible de créer le test A/B');
  }
}

/**
 * Update an existing A/B test
 * @param {string} testId 
 * @param {Object} testData 
 */
export async function updateTest(testId, testData) {
  try {
    const response = await apiService.patch(`/admin/ab-testing/${testId}`, testData);
    return response.data || response.test || response;
  } catch (error) {
    console.error('updateTest error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le test A/B');
  }
}

/**
 * Delete an A/B test
 * @param {string} testId 
 */
export async function deleteTest(testId) {
  try {
    await apiService.delete(`/admin/ab-testing/${testId}`);
    return { success: true };
  } catch (error) {
    console.error('deleteTest error:', error);
    throwNormalized(error, 'Impossible de supprimer le test A/B');
  }
}

/**
 * Start an A/B test
 * @param {string} testId 
 */
export async function startTest(testId) {
  try {
    const response = await apiService.post(`/admin/ab-testing/${testId}/start`);
    return response.data || response.test || response;
  } catch (error) {
    console.error('startTest error:', error);
    throwNormalized(error, 'Impossible de démarrer le test A/B');
  }
}

/**
 * Pause an A/B test
 * @param {string} testId 
 */
export async function pauseTest(testId) {
  try {
    const response = await apiService.post(`/admin/ab-testing/${testId}/pause`);
    return response.data || response.test || response;
  } catch (error) {
    console.error('pauseTest error:', error);
    throwNormalized(error, 'Impossible de mettre en pause le test A/B');
  }
}

/**
 * End an A/B test
 * @param {string} testId 
 */
export async function endTest(testId) {
  try {
    const response = await apiService.post(`/admin/ab-testing/${testId}/end`);
    return response.data || response.test || response;
  } catch (error) {
    console.error('endTest error:', error);
    throwNormalized(error, 'Impossible de terminer le test A/B');
  }
}

/**
 * Get metrics for an A/B test
 * @param {string} testId 
 */
export async function getTestMetrics(testId) {
  try {
    const response = await apiService.get(`/admin/ab-testing/${testId}/metrics`);
    return response.data || response.metrics || {};
  } catch (error) {
    console.error('getTestMetrics error:', error);
    return {};
  }
}

/**
 * Get results for an A/B test
 * @param {string} testId 
 */
export async function getTestResults(testId) {
  try {
    const response = await apiService.get(`/admin/ab-testing/${testId}/results`);
    return response.data || response.results || {};
  } catch (error) {
    console.error('getTestResults error:', error);
    return {};
  }
}

/**
 * Get all active A/B tests
 */
export async function getActiveTests() {
  try {
    const response = await apiService.get('/admin/ab-testing/active/list');
    return {
      items: response.data || response.tests || [],
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getActiveTests error:', error);
    return { items: [], success: false };
  }
}

/**
 * A/B test types enum for UI
 */
export const AB_TEST_TYPES = {
  FEATURE: 'feature',
  UI: 'ui',
  MECHANICS: 'mechanics',
  REWARDS: 'rewards',
  PRICING: 'pricing',
};

/**
 * A/B test statuses enum for UI
 * Aligned with backend model: draft | active | paused | ended
 */
export const AB_TEST_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
};

export default {
  getTests,
  getTestById,
  createTest,
  updateTest,
  deleteTest,
  startTest,
  pauseTest,
  endTest,
  getTestMetrics,
  getTestResults,
  getActiveTests,
  AB_TEST_TYPES,
  AB_TEST_STATUSES,
};
