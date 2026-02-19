/**
 * Upload Service - Handles file uploads to the backend
 */

import apiService from './api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file before upload
 */
export function validateFile(file) {
    if (!file) {
        return { valid: false, error: 'No file selected' };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
        return {
            valid: false,
            error: `Invalid file type. Allowed: ${ALLOWED_TYPES.map(t => t.split('/')[1]).join(', ')}`
        };
    }

    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
        };
    }

    return { valid: true };
}

/**
 * Upload image to the server
 * @param {File} file - The file to upload
 * @param {string} type - Upload type: 'avatar' | 'partner-logo' | 'reward-image' | 'prize-image' | 'marketplace-item'
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadImage(file, type = 'reward-image', onProgress = null) {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    try {
        const formData = new FormData();
        formData.append('image', file);

        // Use XMLHttpRequest for progress tracking
        if (onProgress) {
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        onProgress(percent);
                    }
                });

                xhr.addEventListener('load', () => {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300 && response.success) {
                            resolve({ success: true, url: response.url });
                        } else {
                            resolve({ success: false, error: response.error || 'Upload failed' });
                        }
                    } catch {
                        resolve({ success: false, error: 'Invalid server response' });
                    }
                });

                xhr.addEventListener('error', () => {
                    resolve({ success: false, error: 'Network error' });
                });

                const token = localStorage.getItem('access_token');
                xhr.open('POST', `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/upload/${type}`);
                if (token) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }
                xhr.send(formData);
            });
        }

        // Use fetch for simple uploads without progress
        const response = await apiService.uploadFile(`/upload/${type}`, formData);

        if (response?.success && response?.url) {
            return { success: true, url: response.url };
        }

        return { success: false, error: response?.error || 'Upload failed' };
    } catch (error) {
        console.error('Upload error:', error);
        return { success: false, error: error?.message || 'Upload failed' };
    }
}

/**
 * Upload partner logo
 */
export async function uploadPartnerLogo(file, onProgress = null) {
    return uploadImage(file, 'partner-logo', onProgress);
}

/**
 * Upload reward image
 */
export async function uploadRewardImage(file, onProgress = null) {
    return uploadImage(file, 'reward-image', onProgress);
}

/**
 * Upload prize image
 */
export async function uploadPrizeImage(file, onProgress = null) {
    return uploadImage(file, 'prize-image', onProgress);
}

/**
 * Upload marketplace item image
 */
export async function uploadMarketplaceImage(file, onProgress = null) {
    return uploadImage(file, 'marketplace-item', onProgress);
}

/**
 * Upload user avatar
 */
export async function uploadAvatar(file, onProgress = null) {
    return uploadImage(file, 'avatar', onProgress);
}

export default {
    validateFile,
    uploadImage,
    uploadPartnerLogo,
    uploadRewardImage,
    uploadPrizeImage,
    uploadMarketplaceImage,
    uploadAvatar,
};
