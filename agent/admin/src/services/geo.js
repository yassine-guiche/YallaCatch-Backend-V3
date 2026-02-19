/**
 * Geo Service
 * Handles interactions with external geolocation APIs (OpenStreetMap/Nominatim)
 */

class GeoService {
    constructor() {
        this.nominatimBaseUrl = 'https://nominatim.openstreetmap.org';
    }

    /**
     * Reverse geocode coordinates to get address details
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<object>} Address details
     */
    async reverseGeocode(lat, lng) {
        if (!lat || !lng) return null;

        try {
            const response = await fetch(
                `${this.nominatimBaseUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
                {
                    headers: {
                        'User-Agent': 'YallaCatch-Admin/1.0',
                        'Accept-Language': 'fr'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Geocoding failed: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            throw error;
        }
    }

    /**
     * Search for a location by query string
     * @param {string} query - Address or place to search for
     * @returns {Promise<Array>} List of matching locations
     */
    async search(query) {
        if (!query) return [];

        try {
            const response = await fetch(
                `${this.nominatimBaseUrl}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`,
                {
                    headers: {
                        'User-Agent': 'YallaCatch-Admin/1.0',
                        'Accept-Language': 'fr'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Location search error:', error);
            throw error;
        }
    }
}

export default new GeoService();
