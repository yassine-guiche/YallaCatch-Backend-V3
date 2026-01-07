import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';
import { Slider } from './ui/slider';
import { 
  Target, 
  Zap, 
  MapPin, 
  Package, 
  Shuffle,
  Eye,
  EyeOff,
  RotateCcw,
  CheckCircle
} from 'lucide-react';
import MapComponent from './MapComponent';

const BatchPrizeCreator = ({ onCreateBatch, onClose }) => {
  const [batchConfig, setBatchConfig] = useState({
    baseName: '',
    type: 'mystery',
    category: 'mystery_box',
    description: '',
    imageUrl: '',
    pointsReward: 500,           // Points gagnés en capturant
    value: 100,
    quantity: 100,
    distributionMode: 'random', // 'random', 'grid', 'cluster'
    tags: []
  });

  const [selectedArea, setSelectedArea] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [batchPreviews, setBatchPreviews] = useState([]);
  const [showPreviews, setShowPreviews] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate random positions within the selected area
  const generateRandomPositions = (center, radius, count) => {
    const positions = [];
    const radiusInDegrees = radius / 111320; // Convert meters to degrees (approximate)

    for (let i = 0; i < count; i++) {
      // Generate random point within circle
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.sqrt(Math.random()) * radiusInDegrees;
      
      const lat = center.lat + distance * Math.cos(angle);
      const lng = center.lng + distance * Math.sin(angle);
      
      positions.push({ lat, lng });
    }

    return positions;
  };

  // Generate grid positions within the selected area
  const generateGridPositions = (center, radius, count) => {
    const positions = [];
    const radiusInDegrees = radius / 111320;
    const gridSize = Math.ceil(Math.sqrt(count));
    const step = (radiusInDegrees * 2) / gridSize;

    let generated = 0;
    for (let i = 0; i < gridSize && generated < count; i++) {
      for (let j = 0; j < gridSize && generated < count; j++) {
        const lat = center.lat - radiusInDegrees + (i * step);
        const lng = center.lng - radiusInDegrees + (j * step);
        
        // Check if position is within circle
        const distance = Math.sqrt(
          Math.pow(lat - center.lat, 2) + Math.pow(lng - center.lng, 2)
        );
        
        if (distance <= radiusInDegrees) {
          positions.push({ lat, lng });
          generated++;
        }
      }
    }

    return positions;
  };

  // Generate cluster positions within the selected area
  const generateClusterPositions = (center, radius, count) => {
    const positions = [];
    const radiusInDegrees = radius / 111320;
    const clusterCount = Math.min(5, Math.ceil(count / 20)); // Max 5 clusters
    const prizesPerCluster = Math.ceil(count / clusterCount);

    for (let cluster = 0; cluster < clusterCount; cluster++) {
      // Generate cluster center
      const clusterAngle = (cluster / clusterCount) * 2 * Math.PI;
      const clusterDistance = (Math.random() * 0.7 + 0.3) * radiusInDegrees; // 30-100% of radius
      
      const clusterLat = center.lat + clusterDistance * Math.cos(clusterAngle);
      const clusterLng = center.lng + clusterDistance * Math.sin(clusterAngle);
      
      // Generate prizes around cluster center
      const clusterRadius = radiusInDegrees * 0.1; // 10% of main radius
      for (let i = 0; i < prizesPerCluster && positions.length < count; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * clusterRadius;
        
        const lat = clusterLat + distance * Math.cos(angle);
        const lng = clusterLng + distance * Math.sin(angle);
        
        positions.push({ lat, lng });
      }
    }

    return positions.slice(0, count);
  };

  // Generate preview positions
  const generatePreviews = () => {
    if (!selectedArea) return;

    setIsGenerating(true);
    
    setTimeout(() => {
      let positions = [];
      
      switch (batchConfig.distributionMode) {
        case 'grid':
          positions = generateGridPositions(selectedArea.center, selectedArea.radius, batchConfig.quantity);
          break;
        case 'cluster':
          positions = generateClusterPositions(selectedArea.center, selectedArea.radius, batchConfig.quantity);
          break;
        default: // random
          positions = generateRandomPositions(selectedArea.center, selectedArea.radius, batchConfig.quantity);
      }
      
      setBatchPreviews(positions);
      setIsGenerating(false);
    }, 500);
  };

  // Auto-generate previews when area or config changes
  useEffect(() => {
    if (selectedArea && batchConfig.quantity > 0) {
      generatePreviews();
    }
  }, [selectedArea, batchConfig.quantity, batchConfig.distributionMode]);

  // Handle area selection
  const handleAreaSelect = (area) => {
    setSelectedArea(area);
  };

  // Create batch prizes
  const handleCreateBatch = () => {
    if (!selectedArea || batchPreviews.length === 0) {
      alert('Veuillez sélectionner une zone et générer les positions');
      return;
    }

    if (!batchConfig.baseName) {
      alert('Veuillez saisir un nom de base pour les prix');
      return;
    }

    const prizes = batchPreviews.map((position, index) => ({
      id: `batch_${Date.now()}_${index}`,
      name: `${batchConfig.baseName} #${index + 1}`,
      type: batchConfig.type,
      category: batchConfig.category,
      description: batchConfig.description || `${batchConfig.baseName} distribué par lot`,
      imageUrl: batchConfig.imageUrl,
      pointsReward: batchConfig.pointsReward,
      value: batchConfig.value,
      quantity: 1, // Each batch prize has quantity 1
      available: 1,
      zone: {
        type: 'coordinates',
        value: `Lot ${Math.floor(index / 20) + 1}`, // Group by 20s
        coordinates: position
      },
      createdAt: new Date().toISOString().split('T')[0],
      isActive: true,
      isFeatured: false,
      capturedCount: 0,
      viewCount: 0,
      tags: batchConfig.tags.length > 0 ? batchConfig.tags : [batchConfig.category, batchConfig.type, 'batch']
    }));

    onCreateBatch(prizes);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Package className="h-5 w-5 mr-2" />
              Informations de Base
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="baseName">Nom de Base *</Label>
              <Input
                id="baseName"
                value={batchConfig.baseName}
                onChange={(e) => setBatchConfig(prev => ({ ...prev, baseName: e.target.value }))}
                placeholder="Ex: iPhone 15 Pro"
              />
              <p className="text-xs text-gray-500 mt-1">
                Sera suivi de #1, #2, #3...
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select value={batchConfig.type} onValueChange={(value) => setBatchConfig(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mystery">Prix Mystère</SelectItem>
                    <SelectItem value="physical">Physique</SelectItem>
                    <SelectItem value="digital">Numérique</SelectItem>
                    <SelectItem value="voucher">Bon d'achat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Catégorie</Label>
                <Select value={batchConfig.category} onValueChange={(value) => setBatchConfig(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mystery_box">Boîte Mystère</SelectItem>
                    <SelectItem value="electronics">Électronique</SelectItem>
                    <SelectItem value="fashion">Mode</SelectItem>
                    <SelectItem value="food">Alimentation</SelectItem>
                    <SelectItem value="entertainment">Divertissement</SelectItem>
                    <SelectItem value="sports">Sport</SelectItem>
                    <SelectItem value="beauty">Beauté</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={batchConfig.description}
                onChange={(e) => setBatchConfig(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description commune à tous les prix"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="imageUrl">URL de l'Image</Label>
              <Input
                id="imageUrl"
                value={batchConfig.imageUrl}
                onChange={(e) => setBatchConfig(prev => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Distribution Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Target className="h-5 w-5 mr-2" />
              Configuration Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="quantity">Quantité de Prix</Label>
              <div className="space-y-2">
                <Slider
                  value={[batchConfig.quantity]}
                  onValueChange={(value) => setBatchConfig(prev => ({ ...prev, quantity: value[0] }))}
                  max={500}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>1</span>
                  <span className="font-medium">{batchConfig.quantity} prix</span>
                  <span>500</span>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="distributionMode">Mode de Distribution</Label>
              <Select value={batchConfig.distributionMode} onValueChange={(value) => setBatchConfig(prev => ({ ...prev, distributionMode: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Aléatoire</SelectItem>
                  <SelectItem value="grid">Grille</SelectItem>
                  <SelectItem value="cluster">Clusters</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {batchConfig.distributionMode === 'random' && 'Distribution aléatoire dans la zone'}
                {batchConfig.distributionMode === 'grid' && 'Distribution en grille régulière'}
                {batchConfig.distributionMode === 'cluster' && 'Distribution en groupes concentrés'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="points">Points Gagnés</Label>
                <Input
                  id="points"
                  type="number"
                  value={batchConfig.pointsReward}
                  onChange={(e) => setBatchConfig(prev => ({ ...prev, pointsReward: parseInt(e.target.value) }))}
                  placeholder="Points gagnés en capturant"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Points que l'utilisateur gagne en capturant chaque prix
                </p>
              </div>

              <div>
                <Label htmlFor="value">Valeur (DT)</Label>
                <Input
                  id="value"
                  type="number"
                  value={batchConfig.value}
                  onChange={(e) => setBatchConfig(prev => ({ ...prev, value: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            {selectedArea && (
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-800">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Zone sélectionnée: {(selectedArea.radius / 1000).toFixed(2)} km de rayon
                </p>
                <p className="text-xs text-orange-600">
                  Centre: {selectedArea.center.lat.toFixed(4)}, {selectedArea.center.lng.toFixed(4)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Eye className="h-5 w-5 mr-2" />
              Aperçu et Contrôles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Afficher l'aperçu</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreviews(!showPreviews)}
              >
                {showPreviews ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={generatePreviews}
              disabled={!selectedArea || isGenerating}
            >
              <Shuffle className="h-4 w-4 mr-2" />
              {isGenerating ? 'Génération...' : 'Régénérer Positions'}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSelectedArea(null);
                setBatchPreviews([]);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Réinitialiser Zone
            </Button>

            {batchPreviews.length > 0 && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  {batchPreviews.length} positions générées
                </p>
                <p className="text-xs text-green-600">
                  Mode: {batchConfig.distributionMode}
                </p>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Valeur totale:</strong> {(batchConfig.value * batchConfig.quantity).toLocaleString()} DT</p>
                <p><strong>Points totaux distribués:</strong> {(batchConfig.pointsReward * batchConfig.quantity).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MapPin className="h-5 w-5 mr-2" />
            Sélection de Zone de Distribution
          </CardTitle>
          <p className="text-sm text-gray-600">
            Cliquez une fois pour définir le centre, puis cliquez à nouveau pour définir le rayon de distribution
          </p>
        </CardHeader>
        <CardContent>
          {!showMap && (
            <div className="h-[140px] rounded-lg border border-dashed flex items-center justify-between px-4 text-gray-600">
              <div>Sélectionnez une zone sur la carte pour distribuer les prix.</div>
              <Button type="button" variant="outline" onClick={() => setShowMap(true)}>Afficher la carte</Button>
            </div>
          )}
          {showMap && (
            <>
              <div className="flex items-center justify-end gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={() => { setSelectedArea(null); setResetToken(t => t + 1); }}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Annuler la sélection
                </Button>
              </div>
              <MapComponent
                prizes={[]}
                onAreaSelect={handleAreaSelect}
                selectedArea={selectedArea}
                setSelectedArea={setSelectedArea}
                batchPreviews={showPreviews ? batchPreviews : []}
                height="500px"
                center={[36.8065, 10.1815]}
                zoom={7}
                showPrizes={false}
                interactive={true}
                mode="area"
                resetToken={resetToken}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button 
          onClick={handleCreateBatch}
          disabled={!selectedArea || batchPreviews.length === 0 || !batchConfig.baseName}
        >
          <Zap className="h-4 w-4 mr-2" />
          Créer {batchConfig.quantity} Prix
        </Button>
      </div>
    </div>
  );
};

export default BatchPrizeCreator;
