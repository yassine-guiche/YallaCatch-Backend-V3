/**
 * Lightweight Map Component for Circle Selection
 * Optimized for batch prize distribution - no markers, fast loading
 */
import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { MapContainer, TileLayer, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Tunisia center and bounds
const TUNISIA_CENTER = [36.8065, 10.1815];
const TUNISIA_BOUNDS = [
  [30.2407, 7.5244], // Southwest
  [37.5439, 11.5998] // Northeast
];

// Component to handle circle drawing
const CircleDrawHandler = memo(({ onCircleDrawn, setSelectedArea }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState(null);

  useMapEvents({
    click: useCallback((e) => {
      if (!isSelecting) {
        // Start circle selection
        setIsSelecting(true);
        setStartPoint(e.latlng);
        setSelectedArea({
          center: { lat: e.latlng.lat, lng: e.latlng.lng },
          radius: 500 // Default 500m radius
        });
      } else {
        // Finish circle selection
        const distance = startPoint.distanceTo(e.latlng);
        const finalArea = {
          center: { lat: startPoint.lat, lng: startPoint.lng },
          radius: Math.max(distance, 100) // Minimum 100m
        };
        setSelectedArea(finalArea);
        onCircleDrawn?.(finalArea);
        setIsSelecting(false);
        setStartPoint(null);
      }
    }, [isSelecting, startPoint, onCircleDrawn, setSelectedArea]),
    
    mousemove: useCallback((e) => {
      if (isSelecting && startPoint) {
        const distance = startPoint.distanceTo(e.latlng);
        setSelectedArea({
          center: { lat: startPoint.lat, lng: startPoint.lng },
          radius: Math.max(distance, 100)
        });
      }
    }, [isSelecting, startPoint, setSelectedArea])
  });

  return null;
});

CircleDrawHandler.displayName = 'CircleDrawHandler';

// City quick selector
const CITIES = [
  { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
  { name: 'Sfax', lat: 34.7398, lng: 10.7598 },
  { name: 'Sousse', lat: 35.8288, lng: 10.6405 },
  { name: 'Kairouan', lat: 35.6781, lng: 10.0963 },
  { name: 'Bizerte', lat: 37.2744, lng: 9.8739 },
  { name: 'Gabès', lat: 33.8815, lng: 10.0982 },
  { name: 'Monastir', lat: 35.7643, lng: 10.8113 },
  { name: 'Nabeul', lat: 36.4561, lng: 10.7376 },
  { name: 'Hammamet', lat: 36.4000, lng: 10.6167 },
  { name: 'Djerba', lat: 33.8076, lng: 10.8451 },
];

// Map navigator to fly to city
const MapNavigator = memo(({ targetCity }) => {
  const map = useMap();
  
  useEffect(() => {
    if (targetCity) {
      map.flyTo([targetCity.lat, targetCity.lng], 13, { duration: 0.5 });
    }
  }, [targetCity, map]);
  
  return null;
});

MapNavigator.displayName = 'MapNavigator';

// Main Component
const CircleSelectionMap = memo(({ 
  onCircleDrawn, 
  selectedArea, 
  height = '300px',
  showCitySelector = true,
  initialCity = null 
}) => {
  const [localArea, setLocalArea] = useState(selectedArea);
  const [targetCity, setTargetCity] = useState(initialCity);
  const mapRef = useRef();

  // Sync local area with parent
  useEffect(() => {
    setLocalArea(selectedArea);
  }, [selectedArea]);

  const handleCitySelect = useCallback((city) => {
    setTargetCity(city);
    // Pre-set area at city center
    const newArea = {
      center: { lat: city.lat, lng: city.lng },
      radius: 500
    };
    setLocalArea(newArea);
    onCircleDrawn?.(newArea);
  }, [onCircleDrawn]);

  const handleCircleDrawn = useCallback((area) => {
    setLocalArea(area);
    onCircleDrawn?.(area);
  }, [onCircleDrawn]);

  return (
    <div className="space-y-2">
      {/* City Quick Selector */}
      {showCitySelector && (
        <div className="flex flex-wrap gap-1">
          {CITIES.map(city => (
            <button
              key={city.name}
              type="button"
              onClick={() => handleCitySelect(city)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                targetCity?.name === city.name 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {city.name}
            </button>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
        💡 <strong>Instructions:</strong> Cliquez sur la carte pour définir le centre, puis cliquez à nouveau pour définir le rayon du cercle.
      </div>

      {/* Map */}
      <div style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }} className="border">
        <MapContainer
          center={TUNISIA_CENTER}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          scrollWheelZoom={true}
          maxBounds={TUNISIA_BOUNDS}
          minZoom={6}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <CircleDrawHandler 
            onCircleDrawn={handleCircleDrawn}
            selectedArea={localArea}
            setSelectedArea={setLocalArea}
          />
          
          <MapNavigator targetCity={targetCity} />
          
          {/* Show the circle */}
          {localArea && localArea.center && (
            <Circle
              center={[localArea.center.lat, localArea.center.lng]}
              radius={localArea.radius}
              pathOptions={{
                color: '#F97316',
                fillColor: '#F97316',
                fillOpacity: 0.2,
                weight: 2
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Area Info */}
      {localArea && (
        <div className="p-2 bg-green-50 rounded text-sm flex items-center justify-between">
          <span>
            <strong>Zone:</strong> Centre ({localArea.center.lat.toFixed(4)}, {localArea.center.lng.toFixed(4)})
          </span>
          <span className="font-medium text-green-700">
            Rayon: {Math.round(localArea.radius)}m
          </span>
        </div>
      )}
    </div>
  );
});

CircleSelectionMap.displayName = 'CircleSelectionMap';

export default CircleSelectionMap;
