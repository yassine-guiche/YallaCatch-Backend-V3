/**
 * Utility to construct full image URLs.
 * It handles relative paths from the backend, absolute URLs, and base64 strings.
 * This corrected version ensures that static asset paths are resolved relative
 * to the API server's origin, not the full API endpoint path.
 */
export const getImageUrl = (imagePath) => {
    if (!imagePath) {
        return '';
    }

    // If it's already a full URL or a data URI, return it as is.
    if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
        return imagePath;
    }

    // Get the base API URL from environment variables, with a fallback for development.
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

    let origin;
    try {
        // Correctly extract the origin (e.g., "http://localhost:3000") from the full API URL.
        origin = new URL(apiUrl).origin;
    } catch (error) {
        console.error('Invalid VITE_API_URL:', apiUrl, error);
        // Fallback to a sensible default if the URL is malformed.
        origin = 'http://localhost:3000';
    }

    // Ensure the path starts with a slash for correct URL construction.
    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;

    // Combine the origin and the path to create the full, correct URL.
    return `${origin}${normalizedPath}`;
};

