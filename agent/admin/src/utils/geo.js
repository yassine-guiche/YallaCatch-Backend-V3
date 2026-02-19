/**
 * YallaCatch! Geolocation Utilities
 * Utilitaires pour la géolocalisation et les conversions GeoJSON
 */

/**
 * Convertir des coordonnées {lat, lng} vers GeoJSON
 */
export const toGeoJSON = (lat, lng) => {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  
  return {
    type: 'Point',
    coordinates: [lng, lat] // GeoJSON: [longitude, latitude]
  };
};

/**
 * Convertir GeoJSON vers {lat, lng}
 */
export const fromGeoJSON = (geoJSON) => {
  if (!geoJSON || !geoJSON.coordinates || !Array.isArray(geoJSON.coordinates)) {
    return null;
  }
  
  return {
    lng: geoJSON.coordinates[0],
    lat: geoJSON.coordinates[1]
  };
};

/**
 * Calculer la distance entre deux points (en mètres)
 * Utilise la formule de Haversine
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance en mètres
};

/**
 * Convertir des degrés en radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Formater une distance (mètres → km si > 1000m)
 */
export const formatDistance = (meters) => {
  if (typeof meters !== 'number' || meters < 0) return '0 m';
  
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  } else {
    return `${(meters / 1000).toFixed(2)} km`;
  }
};

/**
 * Vérifier si un point est dans un rayon
 */
export const isWithinRadius = (lat1, lng1, lat2, lng2, radius) => {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return distance <= radius;
};

/**
 * Obtenir les bounds (limites) d'une zone autour d'un point
 */
export const getBounds = (lat, lng, radiusMeters) => {
  const latDelta = radiusMeters / 111000; // 1 degré de latitude ≈ 111 km
  const lngDelta = radiusMeters / (111000 * Math.cos(toRadians(lat)));
  
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta
  };
};

/**
 * Vérifier si des coordonnées sont valides
 */
export const isValidCoordinates = (lat, lng) => {
  return typeof lat === 'number' &&
         typeof lng === 'number' &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180;
};

/**
 * Obtenir le centre d'un groupe de points
 */
export const getCenterOfPoints = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }
  
  let totalLat = 0;
  let totalLng = 0;
  
  points.forEach(point => {
    totalLat += point.lat;
    totalLng += point.lng;
  });
  
  return {
    lat: totalLat / points.length,
    lng: totalLng / points.length
  };
};

/**
 * Mapper une location backend vers frontend
 */
export const mapLocation = (location) => {
  if (!location) return null;
  
  // Si c'est déjà au format {lat, lng}
  if (location.lat !== undefined && location.lng !== undefined) {
    return location;
  }
  
  // Si c'est au format GeoJSON
  if (location.coordinates && Array.isArray(location.coordinates)) {
    return fromGeoJSON(location);
  }
  
  return null;
};

/**
 * Villes de Tunisie avec coordonnées (pour le panel admin)
 */
export const TUNISIA_CITIES = [
  { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
  { name: 'Sfax', lat: 34.7406, lng: 10.7603 },
  { name: 'Sousse', lat: 35.8256, lng: 10.6369 },
  { name: 'Kairouan', lat: 35.6781, lng: 10.0963 },
  { name: 'Bizerte', lat: 37.2746, lng: 9.8739 },
  { name: 'Gabès', lat: 33.8815, lng: 10.0982 },
  { name: 'Ariana', lat: 36.8625, lng: 10.1956 },
  { name: 'Gafsa', lat: 34.4250, lng: 8.7842 },
  { name: 'Monastir', lat: 35.7774, lng: 10.8264 },
  { name: 'Ben Arous', lat: 36.7539, lng: 10.2192 },
  { name: 'Kasserine', lat: 35.1676, lng: 8.8369 },
  { name: 'Médenine', lat: 33.3549, lng: 10.5055 },
  { name: 'Nabeul', lat: 36.4561, lng: 10.7376 },
  { name: 'Tataouine', lat: 32.9297, lng: 10.4517 },
  { name: 'Beja', lat: 36.7256, lng: 9.1817 },
  { name: 'Jendouba', lat: 36.5011, lng: 8.7803 },
  { name: 'Mahdia', lat: 35.5047, lng: 11.0622 },
  { name: 'Sidi Bouzid', lat: 35.0381, lng: 9.4858 },
  { name: 'Zaghouan', lat: 36.4028, lng: 10.1425 },
  { name: 'Siliana', lat: 36.0850, lng: 9.3706 },
  { name: 'Kef', lat: 36.1742, lng: 8.7050 },
  { name: 'Tozeur', lat: 33.9197, lng: 8.1339 },
  { name: 'Kebili', lat: 33.7047, lng: 8.9692 },
  { name: 'Manouba', lat: 36.8103, lng: 10.0964 }
];

/**
 * Obtenir la ville la plus proche
 */
export const getNearestCity = (lat, lng) => {
  if (!isValidCoordinates(lat, lng)) return null;
  
  let nearestCity = null;
  let minDistance = Infinity;
  
  TUNISIA_CITIES.forEach(city => {
    const distance = calculateDistance(lat, lng, city.lat, city.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });
  
  return nearestCity;
};

/**
 * Obtenir les coordonnées par défaut (Tunis)
 */
export const getDefaultCoordinates = () => {
  return {
    lat: parseFloat(import.meta.env.VITE_MAP_DEFAULT_CENTER_LAT) || 36.8065,
    lng: parseFloat(import.meta.env.VITE_MAP_DEFAULT_CENTER_LNG) || 10.1815
  };
};

/**
 * Obtenir le zoom par défaut
 */
export const getDefaultZoom = () => {
  return parseInt(import.meta.env.VITE_MAP_DEFAULT_ZOOM) || 13;
};

export default {
  toGeoJSON,
  fromGeoJSON,
  calculateDistance,
  formatDistance,
  isWithinRadius,
  getBounds,
  isValidCoordinates,
  getCenterOfPoints,
  mapLocation,
  TUNISIA_CITIES,
  getNearestCity,
  getDefaultCoordinates,
  getDefaultZoom,
};

