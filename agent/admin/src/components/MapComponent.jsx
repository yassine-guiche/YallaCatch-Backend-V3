import { useEffect, useRef, useState, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom cluster icon
const createClusterCustomIcon = (cluster) => {
  const count = cluster.getChildCount();
  let size = 'small';
  let color = '#3B82F6';
  
  if (count >= 100) {
    size = 'large';
    color = '#EF4444';
  } else if (count >= 50) {
    size = 'medium';
    color = '#F59E0B';
  }
  
  const sizeMap = { small: 35, medium: 45, large: 55 };
  const pixelSize = sizeMap[size];
  
  return L.divIcon({
    html: `<div style="
      background-color: ${color};
      width: ${pixelSize}px;
      height: ${pixelSize}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${pixelSize * 0.35}px;
      color: white;
      font-weight: bold;
    ">${count}</div>`,
    className: 'custom-cluster-marker',
    iconSize: [pixelSize, pixelSize],
    iconAnchor: [pixelSize / 2, pixelSize / 2],
  });
};

// Custom icons for different prize types
const createCustomIcon = (type, color = '#3B82F6', size = 30) => {
  const iconHtml = `
    <div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${size * 0.5}px;
      color: white;
      font-weight: bold;
    ">
      ${getIconSymbolSafe(type)}
    </div>
  `;
  
  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
};

// Safe icon letters (avoid encoding issues)
const getIconSymbolSafe = (type) => {
  switch (type) {
    // Display types
    case 'mystery_box': return '?';
    case 'treasure': return '$';
    case 'bonus': return '+';
    case 'special': return '*';
    case 'standard': return 'S';
    
    // Legacy/Core types
    case 'physical': return 'P';
    case 'voucher': return 'V';
    case 'mystery': return '?';
    case 'digital': return 'D';
    case 'new': return 'N';
    case 'batch': return 'B';
    default: return '#';
  }
};


const getTypeColor = (type) => {
  switch (type) {
    case 'mystery_box': return '#8B5CF6';
    case 'treasure': return '#D97706';
    case 'bonus': return '#059669';
    case 'special': return '#DB2777';
    case 'physical': return '#10B981';
    case 'voucher': return '#F59E0B';
    case 'mystery': return '#8B5CF6';
    case 'digital': return '#3B82F6';
    case 'new': return '#EF4444';
    case 'batch': return '#F97316';
    default: return '#6B7280';
  }
};

// Component to handle map clicks and area selection
const MapClickHandler = ({ onMapClick, onAreaSelect, onCircleDrawn, mode, setSelectedArea }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  // Use local state if setSelectedArea is not provided
  const updateSelectedArea = (area) => {
    if (typeof setSelectedArea === 'function') {
      setSelectedArea(area);
    }
  };

  useMapEvents({
    click: (e) => {
      // For 'click' mode - simple location selection
      if ((mode === 'single' || mode === 'click') && onMapClick) {
        onMapClick(e.latlng);
      } 
      // For 'area' or 'circle' mode - draw circles
      else if ((mode === 'area' || mode === 'circle') && (onAreaSelect || onCircleDrawn)) {
        if (!isSelecting) {
          // Start area selection
          setIsSelecting(true);
          setStartPoint(e.latlng);
          updateSelectedArea({
            center: e.latlng,
            radius: 1000 // Default 1km radius
          });
        } else {
          // Calculate radius based on distance from start point
          const distance = startPoint.distanceTo(e.latlng);
          const updatedArea = {
            center: startPoint,
            radius: Math.max(distance, 100) // Minimum 100m radius
          };
          updateSelectedArea(updatedArea);
          if (onAreaSelect) onAreaSelect(updatedArea);
          if (onCircleDrawn) onCircleDrawn(updatedArea);
          setIsSelecting(false);
          setStartPoint(null);
        }
      }
    },
    mousemove: (e) => {
      if (isSelecting && startPoint && (mode === 'area' || mode === 'circle')) {
        const distance = startPoint.distanceTo(e.latlng);
        updateSelectedArea({
          center: startPoint,
          radius: Math.max(distance, 100)
        });
      }
    }
  });

  return null;
};

const MapComponent = ({ 
  prizes = [], 
  onMapClick, 
  onAreaSelect,
  onCircleDrawn,
  selectedLocation, 
  selectedArea,
  setSelectedArea,
  batchPreviews = [],
  height = '400px',
  center = [36.8065, 10.1815], // Tunis center
  defaultCenter,
  zoom = 7,
  defaultZoom,
  showPrizes = true,
  showControls = true,
  interactive = true,
  mode = 'single', // 'single', 'click', 'area', 'circle', 'view'
  resetToken = 0,
  allowPanZoomInView = false,
}) => {
  const mapRef = useRef();
  
  // Support both center and defaultCenter props
  const mapCenter = defaultCenter ? [defaultCenter.lat, defaultCenter.lng] : center;
  const mapZoom = defaultZoom || zoom;
  
  // In 'view' mode, disable click/shape interactions but optionally allow pan/zoom
  const isViewOnly = mode === 'view';
  const panZoomEnabled = allowPanZoomInView || !isViewOnly;
  const clickInteractionsEnabled = !isViewOnly && interactive;
  
  useEffect(() => {
    // Ensure map resizes properly
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current.invalidateSize();
      }, 100);
    }
  }, []);

  return (
    <div style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        scrollWheelZoom={panZoomEnabled && interactive}
        dragging={panZoomEnabled && interactive}
        touchZoom={panZoomEnabled && interactive}
        doubleClickZoom={panZoomEnabled && interactive}
        zoomControl={showControls && panZoomEnabled && interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {clickInteractionsEnabled && (onMapClick || onAreaSelect || onCircleDrawn) && (
          <MapClickHandler 
            key={resetToken}
            onMapClick={onMapClick} 
            onAreaSelect={onAreaSelect}
            onCircleDrawn={onCircleDrawn}
            mode={mode}
            selectedArea={selectedArea}
            setSelectedArea={setSelectedArea}
          />
        )}
        
        {/* Show existing prizes with clustering for performance */}
        {showPrizes && prizes.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            disableClusteringAtZoom={16}
            iconCreateFunction={createClusterCustomIcon}
          >
            {prizes.map((prize) => {
              const zoneCoords = prize.zone?.coordinates;
              const loc = prize.location;
              const lat =
                zoneCoords?.lat ??
                zoneCoords?.[1] ??
                loc?.lat ??
                loc?.coordinates?.[1] ??
                prize.latitude;
              const lng =
                zoneCoords?.lng ??
                zoneCoords?.[0] ??
                loc?.lng ??
                loc?.coordinates?.[0] ??
                prize.longitude;

              if (typeof lat !== 'number' || typeof lng !== 'number') return null;
              
              const visualType = prize.displayType || prize.type || 'standard';
              const icon = createCustomIcon(visualType, getTypeColor(visualType), 24);
              
              return (
                <Marker
                  key={prize.id}
                  position={[lat, lng]}
                  icon={icon}
                >
                  <Popup>
                    <div className="p-2 min-w-[180px]">
                      <h3 className="font-bold text-base mb-1">{prize.name}</h3>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Display:</span>
                          <span className="font-medium capitalize">{prize.displayType || 'Standard'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Type:</span>
                          <span className="font-medium capitalize">{prize.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Points:</span>
                          <span className="font-medium text-blue-600">
                            {prize.pointsReward ?? prize.points ?? prize.value ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Zone:</span>
                          <span className="font-medium">
                            {prize.zone?.value || prize.location?.city || prize.city || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        )}
        
        {/* Show selected location for single prize */}
        {selectedLocation && (mode === 'single' || mode === 'click') && (
          <Marker
            position={[selectedLocation.lat, selectedLocation.lng]}
            icon={createCustomIcon('new', '#EF4444')}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold text-red-600">Nouveau Prix</h3>
                <p className="text-sm">Position sélectionnée</p>
                <p className="text-xs text-gray-600">
                  Lat: {selectedLocation.lat.toFixed(6)}<br/>
                  Lng: {selectedLocation.lng.toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Show selected area for batch prizes */}
        {selectedArea && (mode === 'area' || mode === 'circle') && (
          <>
            <Circle
              center={[selectedArea.center.lat, selectedArea.center.lng]}
              radius={selectedArea.radius}
              pathOptions={{
                color: '#F97316',
                fillColor: '#F97316',
                fillOpacity: 0.2,
                weight: 2
              }}
            />
            <Marker
              position={[selectedArea.center.lat, selectedArea.center.lng]}
              icon={createCustomIcon('batch', '#F97316', 40)}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-bold text-orange-600">Zone de Diffusion</h3>
                  <p className="text-sm">Centre de distribution</p>
                  <p className="text-xs text-gray-600">
                    Rayon: {(selectedArea.radius / 1000).toFixed(2)} km<br/>
                    Centre: {selectedArea.center.lat.toFixed(6)}, {selectedArea.center.lng.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Show batch preview markers */}
        {batchPreviews.map((preview, index) => (
          <Marker
            key={`preview-${index}`}
            position={[preview.lat, preview.lng]}
            icon={createCustomIcon('batch', '#F97316', 20)}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold text-orange-600">Prix #{index + 1}</h3>
                <p className="text-xs text-gray-600">
                  Position: {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default memo(MapComponent);
