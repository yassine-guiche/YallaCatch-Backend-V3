/**
 * Service Achievements - Gestion des achievements/succès
 * APIs: 4 endpoints
 */

import apiService from './api';

/**
 * Récupérer la liste de tous les achievements
 */
export async function getAllAchievements(params = {}) {
  try {
    const response = await apiService.get('/admin/achievements', params);
    return {
      achievements:
        response?.data?.achievements ||
        response?.achievements ||
        response?.data?.data?.achievements ||
        response?.data ||
        [],
      total: response?.total || response?.data?.total || 0,
      page: response?.page || params.page || 1,
      limit: response?.limit || params.limit || 20,
    };
  } catch (error) {
    console.error('Erreur getAllAchievements:', error);
    throw error;
  }
}

/**
 * Récupérer un achievement par ID
 */
export async function getAchievementById(achievementId) {
  try {
    const response = await apiService.get(`/admin/achievements/${achievementId}`);
    return response?.data?.achievement || response?.achievement || response?.data || response;
  } catch (error) {
    console.error('Erreur getAchievementById:', error);
    throw error;
  }
}

/**
 * Créer un nouvel achievement
 */
export async function createAchievement(achievementData) {
  try {
    const response = await apiService.post('/admin/achievements', achievementData);
    return response.data?.achievement || response.data || response;
  } catch (error) {
    console.error('Erreur createAchievement:', error);
    throw error;
  }
}

/**
 * Mettre à jour un achievement
 */
export async function updateAchievement(achievementId, achievementData) {
  try {
    const response = await apiService.put(`/admin/achievements/${achievementId}`, achievementData);
    return response.data?.achievement || response.data || response;
  } catch (error) {
    console.error('Erreur updateAchievement:', error);
    throw error;
  }
}

/**
 * Supprimer un achievement
 */
export async function deleteAchievement(achievementId) {
  try {
    await apiService.delete(`/admin/achievements/${achievementId}`);
    return { success: true };
  } catch (error) {
    console.error('Erreur deleteAchievement:', error);
    throw error;
  }
}

/**
 * Récupérer les achievements d'un utilisateur
 */
export async function getUserAchievements(userId) {
  try {
    const response = await apiService.get(`/admin/achievements/user/${userId}`);
    const payload = response.data || response;
    return payload.data || payload.achievements || [];
  } catch (error) {
    console.error('Erreur getUserAchievements:', error);
    throw error;
  }
}

/**
 * Débloquer un achievement pour un utilisateur (admin)
 */
export async function unlockAchievement(userId, achievementId) {
  try {
    const response = await apiService.post(`/admin/achievements/unlock`, {
      userId,
      achievementId
    });
    return response.data?.data || response.data;
  } catch (error) {
    console.error('Erreur unlockAchievement:', error);
    throw error;
  }
}

export default {
  getAllAchievements,
  getAchievementById,
  createAchievement,
  updateAchievement,
  deleteAchievement,
  getUserAchievements,
  unlockAchievement
};
