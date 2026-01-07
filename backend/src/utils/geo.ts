import { Coordinates, BoundingBox, GeofenceArea } from '@/types';
import { TUNISIA_BOUNDS, TUNISIA_CITIES } from '@/config';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Calculate geodesic distance between two coordinates using Haversine formula
 */
export function calculateGeodesicDistance(
  coord1: Coordinates, 
  coord2: Coordinates
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1.lat * Math.PI) / 180;
  const φ2 = (coord2.lat * Math.PI) / 180;
  const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Calculate bearing (direction) from one coordinate to another
 */
export function calculateBearing(
  coord1: Coordinates, 
  coord2: Coordinates
): number {
  const φ1 = (coord1.lat * Math.PI) / 180;
  const φ2 = (coord2.lat * Math.PI) / 180;
  const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - 
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return ((θ * 180 / Math.PI) + 360) % 360; // Bearing in degrees
}

/**
 * Calculate destination coordinate given start point, bearing and distance
 */
export function calculateDestination(
  start: Coordinates,
  bearing: number,
  distance: number
): Coordinates {
  const R = 6371e3; // Earth's radius in meters
  const δ = distance / R; // Angular distance
  const θ = (bearing * Math.PI) / 180; // Bearing in radians

  const φ1 = (start.lat * Math.PI) / 180;
  const λ1 = (start.lng * Math.PI) / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );

  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  return {
    lat: (φ2 * 180) / Math.PI,
    lng: ((λ2 * 180) / Math.PI + 540) % 360 - 180 // Normalize longitude
  };
}

/**
 * Check if a coordinate is within a circular geofence
 */
export function isWithinGeofence(
  point: Coordinates,
  geofence: GeofenceArea
): boolean {
  const distance = calculateGeodesicDistance(point, geofence.center);
  return distance <= geofence.radius;
}

/**
 * Check if a coordinate is within a polygon (using ray casting algorithm)
 */
export function isWithinPolygon(
  point: Coordinates,
  polygon: Coordinates[]
): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if coordinates are within Tunisia bounds (with optional tolerance buffer)
 */
export function isWithinTunisia(coord: Coordinates, toleranceDegrees: number = 0.1): boolean {
  return coord.lat >= (TUNISIA_BOUNDS.south - toleranceDegrees) &&
         coord.lat <= (TUNISIA_BOUNDS.north + toleranceDegrees) &&
         coord.lng >= (TUNISIA_BOUNDS.west - toleranceDegrees) &&
         coord.lng <= (TUNISIA_BOUNDS.east + toleranceDegrees);
}

/**
 * Clamp coordinates to Tunisia bounds
 */
export function clampToTunisia(coord: Coordinates): Coordinates {
  return {
    lat: Math.max(TUNISIA_BOUNDS.south, Math.min(TUNISIA_BOUNDS.north, coord.lat)),
    lng: Math.max(TUNISIA_BOUNDS.west, Math.min(TUNISIA_BOUNDS.east, coord.lng)),
  };
}

/**
 * Find the nearest Tunisian city to given coordinates
 */
export function findNearestCity(coord: Coordinates): string {
  let nearestCity = 'Tunis';
  let minDistance = Infinity;

  Object.entries(TUNISIA_CITIES).forEach(([city, cityCoord]) => {
    const distance = calculateGeodesicDistance(coord, cityCoord);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });

  return nearestCity;
}

/**
 * Get city coordinates
 */
export function getCityCoordinates(city: string): Coordinates | null {
  return TUNISIA_CITIES[city] || null;
}

/**
 * Calculate bounding box for a given center and radius
 */
export function calculateBoundingBox(
  center: Coordinates,
  radiusKm: number
): BoundingBox {
  const radiusM = radiusKm * 1000;
  
  // Calculate approximate degree offsets
  const latOffset = (radiusM / 111320); // 1 degree lat ≈ 111.32 km
  const lngOffset = radiusM / (111320 * Math.cos(center.lat * Math.PI / 180));

  return {
    north: center.lat + latOffset,
    south: center.lat - latOffset,
    east: center.lng + lngOffset,
    west: center.lng - lngOffset
  };
}

/**
 * Generate random coordinates within a bounding box
 */
export function generateRandomCoordinates(bounds: BoundingBox): Coordinates {
  const lat = bounds.south + Math.random() * (bounds.north - bounds.south);
  const lng = bounds.west + Math.random() * (bounds.east - bounds.west);
  
  return { lat, lng };
}

/**
 * Generate coordinates with minimum spacing (rejection sampling)
 */
export function generateSpacedCoordinates(
  bounds: BoundingBox,
  existingPoints: Coordinates[],
  minSpacing: number,
  maxAttempts: number = 100
): Coordinates | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateRandomCoordinates(bounds);
    
    // Check if candidate is far enough from existing points
    const tooClose = existingPoints.some(point => 
      calculateGeodesicDistance(candidate, point) < minSpacing
    );
    
    if (!tooClose && isWithinTunisia(candidate)) {
      return candidate;
    }
  }
  
  typedLogger.warn('Failed to generate spaced coordinates', {
    bounds,
    existingPointsCount: existingPoints.length,
    minSpacing,
    maxAttempts
  });
  
  return null;
}

/**
 * Calculate speed between two points with timestamps
 */
export function calculateSpeed(
  point1: Coordinates & { timestamp: Date },
  point2: Coordinates & { timestamp: Date }
): number {
  const distance = calculateGeodesicDistance(point1, point2);
  const timeDiff = Math.abs(point2.timestamp.getTime() - point1.timestamp.getTime()) / 1000; // seconds
  
  if (timeDiff === 0) return 0;
  
  return distance / timeDiff; // meters per second
}

/**
 * Convert speed from m/s to km/h
 */
export function msToKmh(speedMs: number): number {
  return speedMs * 3.6;
}

/**
 * Convert speed from km/h to m/s
 */
export function kmhToMs(speedKmh: number): number {
  return speedKmh / 3.6;
}

/**
 * Validate coordinate format and range
 */
export function validateCoordinates(coord: Coordinates): boolean {
  return typeof coord.lat === 'number' &&
         typeof coord.lng === 'number' &&
         coord.lat >= -90 && coord.lat <= 90 &&
         coord.lng >= -180 && coord.lng <= 180 &&
         !isNaN(coord.lat) && !isNaN(coord.lng);
}

/**
 * Normalize longitude to [-180, 180] range
 */
export function normalizeLongitude(lng: number): number {
  return ((lng + 540) % 360) - 180;
}

/**
 * Clamp latitude to [-90, 90] range
 */
export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Calculate area of a polygon in square meters
 */
export function calculatePolygonArea(polygon: Coordinates[]): number {
  if (polygon.length < 3) return 0;
  
  const R = 6371e3; // Earth's radius in meters
  let area = 0;
  
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const lat1 = polygon[i].lat * Math.PI / 180;
    const lat2 = polygon[j].lat * Math.PI / 180;
    const lng1 = polygon[i].lng * Math.PI / 180;
    const lng2 = polygon[j].lng * Math.PI / 180;
    
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  return Math.abs(area * R * R / 2);
}

/**
 * Get center point of a polygon
 */
export function getPolygonCenter(polygon: Coordinates[]): Coordinates {
  if (polygon.length === 0) {
    throw new Error('Polygon must have at least one point');
  }
  
  let totalLat = 0;
  let totalLng = 0;
  
  polygon.forEach(point => {
    totalLat += point.lat;
    totalLng += point.lng;
  });
  
  return {
    lat: totalLat / polygon.length,
    lng: totalLng / polygon.length
  };
}

/**
 * Simplify polygon using Douglas-Peucker algorithm
 */
export function simplifyPolygon(
  polygon: Coordinates[],
  tolerance: number = 0.001
): Coordinates[] {
  if (polygon.length <= 2) return polygon;
  
  // Find the point with maximum distance from line between first and last points
  let maxDistance = 0;
  let maxIndex = 0;
  const start = polygon[0];
  const end = polygon[polygon.length - 1];
  
  for (let i = 1; i < polygon.length - 1; i++) {
    const distance = pointToLineDistance(polygon[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = simplifyPolygon(polygon.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(polygon.slice(maxIndex), tolerance);
    
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

/**
 * Calculate perpendicular distance from point to line
 */
function pointToLineDistance(
  point: Coordinates,
  lineStart: Coordinates,
  lineEnd: Coordinates
): number {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    return calculateGeodesicDistance(point, lineStart);
  }
  
  const param = dot / lenSq;
  let xx: number, yy: number;
  
  if (param < 0) {
    xx = lineStart.lat;
    yy = lineStart.lng;
  } else if (param > 1) {
    xx = lineEnd.lat;
    yy = lineEnd.lng;
  } else {
    xx = lineStart.lat + param * C;
    yy = lineStart.lng + param * D;
  }
  
  return calculateGeodesicDistance(point, { lat: xx, lng: yy });
}

/**
 * Create a grid of coordinates within bounds
 */
export function createCoordinateGrid(
  bounds: BoundingBox,
  spacing: number // in meters
): Coordinates[] {
  const grid: Coordinates[] = [];
  
  // Calculate degree spacing
  const latSpacing = spacing / 111320; // 1 degree lat ≈ 111.32 km
  const avgLat = (bounds.north + bounds.south) / 2;
  const lngSpacing = spacing / (111320 * Math.cos(avgLat * Math.PI / 180));
  
  for (let lat = bounds.south; lat <= bounds.north; lat += latSpacing) {
    for (let lng = bounds.west; lng <= bounds.east; lng += lngSpacing) {
      const coord = { lat, lng };
      if (isWithinTunisia(coord)) {
        grid.push(coord);
      }
    }
  }
  
  return grid;
}

/**
 * Filter coordinates by city boundaries (approximate)
 */
export function filterByCity(
  coordinates: Coordinates[],
  city: string,
  radiusKm: number = 20
): Coordinates[] {
  const cityCoord = getCityCoordinates(city);
  if (!cityCoord) return [];
  
  return coordinates.filter(coord => 
    calculateGeodesicDistance(coord, cityCoord) <= radiusKm * 1000
  );
}

/**
 * Cluster nearby coordinates
 */
export function clusterCoordinates(
  coordinates: Coordinates[],
  maxDistance: number = 100 // meters
): Coordinates[][] {
  const clusters: Coordinates[][] = [];
  const visited = new Set<number>();
  
  coordinates.forEach((coord, index) => {
    if (visited.has(index)) return;
    
    const cluster = [coord];
    visited.add(index);
    
    // Find all nearby coordinates
    coordinates.forEach((otherCoord, otherIndex) => {
      if (visited.has(otherIndex)) return;
      
      if (calculateGeodesicDistance(coord, otherCoord) <= maxDistance) {
        cluster.push(otherCoord);
        visited.add(otherIndex);
      }
    });
    
    clusters.push(cluster);
  });
  
  return clusters;
}

/**
 * Calculate optimal distribution spacing for a given area
 */
export function calculateOptimalSpacing(
  area: number, // in square meters
  targetCount: number
): number {
  if (targetCount <= 0) return 0;
  
  // Assume hexagonal packing for optimal distribution
  const areaPerPoint = area / targetCount;
  return Math.sqrt(areaPerPoint * 2 / Math.sqrt(3));
}

/**
 * Generate heatmap data from coordinates
 */
export function generateHeatmapData(
  coordinates: Coordinates[],
  gridSize: number = 0.01 // degrees
): Array<{ lat: number; lng: number; count: number }> {
  const grid = new Map<string, number>();
  
  coordinates.forEach(coord => {
    const gridLat = Math.round(coord.lat / gridSize) * gridSize;
    const gridLng = Math.round(coord.lng / gridSize) * gridSize;
    const key = `${gridLat},${gridLng}`;
    
    grid.set(key, (grid.get(key) || 0) + 1);
  });
  
  return Array.from(grid.entries()).map(([key, count]) => {
    const [lat, lng] = key.split(',').map(Number);
    return { lat, lng, count };
  });
}
