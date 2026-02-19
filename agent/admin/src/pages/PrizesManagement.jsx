import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { usePrizesUpdates } from '../hooks/useRealtimeUpdates';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { MapPin, Plus, Trash2, RefreshCw, Trophy, Search, Map, List, Upload, Edit, Eye } from 'lucide-react';
import { getPrizes, createPrize, deletePrize, updatePrize, addPrizesBatch } from '../services/prizes';
import { getRewards } from '../services/rewards';
import { formatDate } from '../utils/dates';
import { TUNISIA_CITIES } from '../utils/geo';
import MapComponent from '../components/MapComponent';

const CATEGORY_OPTIONS = [
  { value: 'electronics', label: 'Electronique' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'food', label: 'Food' },
  { value: 'entertainment', label: 'Divertissement' },
];

const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'captured', label: 'Capturé' },
  { value: 'expired', label: 'Expiré' },
  { value: 'revoked', label: 'Révoqué' },
];

const TYPE_OPTIONS = [
  { value: 'physical', label: 'Physique' },
  { value: 'digital', label: 'Digital' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'mystery', label: 'Mystere' },
];

const CONTENT_TYPES = [
  { value: 'points', label: 'Points uniquement' },
  { value: 'reward', label: 'Recompense directe' },
  { value: 'hybrid', label: 'Mystery Box (Points + chance recompense)' },
];

const DISPLAY_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'mystery_box', label: 'Boite Mystere' },
  { value: 'treasure', label: 'Coffre' },
  { value: 'bonus', label: 'Bonus/Power-up' },
  { value: 'special', label: 'Evenement Special' },
];

const DEFAULT_FORM = {
  name: '',
  description: 'Recompense YallaCatch!',
  contentType: 'points',
  displayType: 'standard',
  category: 'electronics',
  rarity: 'common',
  status: 'active',
  points: 100,
  bonusMultiplier: 1,
  rewardId: '',
  probability: 0,
  type: 'physical',
  city: 'Tunis',
  latitude: 36.8065,
  longitude: 10.1815,
  radius: 50,
};

const ALLOWED_TYPES = TYPE_OPTIONS.map((t) => t.value);
const ALLOWED_CATEGORIES = CATEGORY_OPTIONS.map((c) => c.value);
const ALLOWED_RARITIES = RARITY_OPTIONS.map((r) => r.value);

export default function PrizesManagement() {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchArea, setBatchArea] = useState(null);
  const [batchPreviews, setBatchPreviews] = useState([]);
  const [batchForm, setBatchForm] = useState({
    name: '',
    description: 'Distribution en lot',
    category: 'electronics',
    rarity: 'common',
    type: 'physical',
    points: 100,
    count: 10,
    areaRadius: 500,  // Distribution area radius in meters (can be large)
    prizeRadius: 50,  // Prize detection radius (max 500m per backend validation)
    latitude: 36.8065,
    longitude: 10.1815,
    city: 'Tunis',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPrizes, setTotalPrizes] = useState(0);
  const [viewMode, setViewMode] = useState('list');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapResetToken, setMapResetToken] = useState(0);
  const [availableRewards, setAvailableRewards] = useState([]);
  const prizesPerPage = 20;

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [editingPrize, setEditingPrize] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const [stats, setStats] = useState({ active: 0, captured: 0, expired: 0, inactive: 0, revoked: 0, total: 0 });
  const [allPrizesForMap, setAllPrizesForMap] = useState([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Load ALL prizes for map view (no pagination)
  const loadAllPrizesForMap = useCallback(async () => {
    try {
      setLoadingMap(true);
      // Load all prizes with a large limit
      const result = await getPrizes({ limit: 10000 });
      setAllPrizesForMap(result.items || []);
    } catch (err) {
      console.error('Erreur chargement prix pour carte:', err);
    } finally {
      setLoadingMap(false);
    }
  }, [viewMode]);

  const loadPrizes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filters = { page: currentPage, limit: prizesPerPage };
      if (searchTerm) filters.search = searchTerm;
      if (filterStatus !== 'all') filters.status = filterStatus;
      const result = await getPrizes(filters);
      setPrizes(result.items || []);
      setTotalPrizes(result.total || 0);
      setTotalPages(Math.max(1, Math.ceil((result.total || 0) / prizesPerPage)));
      // Set stats from API response (global counts, not page counts)
      if (result.stats) {
        setStats({
          active: result.stats.active || 0,
          captured: result.stats.captured || 0,
          expired: result.stats.expired || 0,
          inactive: result.stats.inactive || 0,
          revoked: result.stats.revoked || 0,
          total: result.total || 0
        });
      }
    } catch (err) {
      console.error('Erreur chargement prix:', err);
      setError(err.message);
      toast.error('Erreur lors du chargement des prix');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterStatus, prizesPerPage]);

  // WebSocket real-time updates
  usePrizesUpdates({
    onPrizeUpdate: () => {
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
    },
    onCaptureCreated: () => {
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
      toast.info('Nouvelle capture de prix détectée');
    },
    onStatsUpdate: (data) => {
      if (data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
    }
  });

  const loadRewards = async () => {
    try {
      const result = await getRewards({ limit: 100 });
      setAvailableRewards(result.items || []);
    } catch (err) {
      console.error('Erreur chargement recompenses:', err);
    }
  };



  useEffect(() => {
    loadPrizes();
    loadRewards();
  }, []); // Initial load only

  // Handle pagination changes
  useEffect(() => {
    if (currentPage > 0) {
      loadPrizes();
    }
  }, [currentPage]);

  // Handle filter status changes - reset to page 1
  useEffect(() => {
    if (currentPage === 1) {
      loadPrizes();
    } else {
      setCurrentPage(1);
    }
  }, [filterStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) loadPrizes();
      else setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load all prizes when switching to map view
  useEffect(() => {
    if (viewMode === 'map') {
      loadAllPrizesForMap();
    }
  }, [viewMode]);

  const normalizeCityCoords = (cityName) => {
    const city = TUNISIA_CITIES.find((c) => c.name === cityName);
    if (city) {
      return { lat: city.lat, lng: city.lng, city: city.name };
    }
    return {
      lat: formData.latitude || 36.8065,
      lng: formData.longitude || 10.1815,
      city: cityName || 'Tunis',
    };
  };

  const handleAddPrize = async (e) => {
    e.preventDefault();
    setError(null);

    const safeName = (formData.name || '').trim();
    const safeDescription = (formData.description || '').trim() || 'Recompense YallaCatch!';
    if (safeName.length < 2) {
      setError('Nom requis (min 2 caracteres).');
      toast.error('Nom requis (min 2 caractères)');
      return;
    }
    if (safeDescription.length < 10) {
      setError('Description requise (min 10 caracteres).');
      toast.error('Description requise (min 10 caractères)');
      return;
    }

    const safeType = ALLOWED_TYPES.includes(formData.type) ? formData.type : 'physical';
    const safeCategory = ALLOWED_CATEGORIES.includes(formData.category) ? formData.category : 'lifestyle';
    const safeRarity = ALLOWED_RARITIES.includes(formData.rarity) ? formData.rarity : 'common';
    const coords = selectedLocation || normalizeCityCoords(formData.city);

    try {
      await createPrize({
        ...formData,
        name: safeName,
        description: safeDescription,
        type: safeType,
        category: safeCategory,
        rarity: safeRarity,
        city: coords.city,
        latitude: Number(coords.lat),
        longitude: Number(coords.lng),
        radius: Number(formData.radius || 50),
        points: Math.max(1, Number(formData.points || 0)),
        bonusMultiplier: Number(formData.bonusMultiplier || 1),
        probability: Number(formData.probability || 0),
        quantity: Number(formData.quantity || 1),
      });
      toast.success('Prix créé avec succès');
      setShowAddDialog(false);
      setFormData(DEFAULT_FORM);
      setSelectedLocation(null);
      setMapResetToken((t) => t + 1);
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
    } catch (err) {
      console.error('Erreur creation prix:', err);
      setError(err.message);
      toast.error(err.message || 'Erreur lors de la création du prix');
    }
  };

  const handleDeletePrizeClick = (prizeId) => {
    setPendingDeleteId(prizeId);
    setDeleteConfirmOpen(true);
  };

  const handleDeletePrizeConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await deletePrize(pendingDeleteId);
      toast.success('Prix supprimé avec succès');
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
    } catch (err) {
      console.error('Erreur suppression prix:', err);
      setError(err.message);
      toast.error(err.message || 'Erreur lors de la suppression');
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleEditPrize = (prize) => {
    setEditingPrize(prize);
    setFormData({
      name: prize.name || '',
      description: prize.description || 'Recompense YallaCatch!',
      contentType: prize.contentType || 'points',
      displayType: prize.displayType || 'standard',
      category: prize.category || 'electronics',
      rarity: prize.rarity || 'common',
      status: prize.status || 'active',
      points: prize.points || 100,
      bonusMultiplier: prize.metadata?.bonusMultiplier || 1,
      rewardId: prize.metadata?.rewardId || '',
      probability: prize.metadata?.probability || 0,
      type: prize.type || 'physical',
      city: prize.city || prize.location?.city || 'Tunis',
      latitude: prize.latitude || prize.location?.lat || 36.8065,
      longitude: prize.longitude || prize.location?.lng || 10.1815,
      radius: prize.radius || prize.location?.radius || 50,
      quantity: prize.quantity || 1,
    });
    setSelectedLocation({
      lat: prize.latitude || prize.location?.lat || 36.8065,
      lng: prize.longitude || prize.location?.lng || 10.1815
    });
    setShowAddDialog(true);
  };

  const handleUpdatePrize = async (e) => {
    e.preventDefault();
    setError(null);

    const safeName = (formData.name || '').trim();
    const safeDescription = (formData.description || '').trim() || 'Recompense YallaCatch!';
    if (safeName.length < 2) {
      setError('Nom requis (min 2 caracteres).');
      toast.error('Nom requis (min 2 caractères)');
      return;
    }
    if (safeDescription.length < 10) {
      setError('Description requise (min 10 caracteres).');
      toast.error('Description requise (min 10 caractères)');
      return;
    }

    const safeType = ALLOWED_TYPES.includes(formData.type) ? formData.type : 'physical';
    const safeCategory = ALLOWED_CATEGORIES.includes(formData.category) ? formData.category : 'lifestyle';
    const safeRarity = ALLOWED_RARITIES.includes(formData.rarity) ? formData.rarity : 'common';
    const coords = selectedLocation || normalizeCityCoords(formData.city);

    try {
      await updatePrize(editingPrize.id, {
        name: safeName,
        description: safeDescription,
        type: safeType,
        category: safeCategory,
        rarity: safeRarity,
        city: coords.city,
        latitude: Number(coords.lat),
        longitude: Number(coords.lng),
        radius: Number(formData.radius || 50),
        value: Math.max(1, Number(formData.points || 0)),
        quantity: Number(formData.quantity || 1),
        status: formData.status,
      });
      toast.success('Prix mis à jour avec succès');
      setShowAddDialog(false);
      setFormData(DEFAULT_FORM);
      setEditingPrize(null);
      setSelectedLocation(null);
      setMapResetToken((t) => t + 1);
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
    } catch (err) {
      console.error('Erreur mise a jour prix:', err);
      setError(err.message);
      toast.error(err.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleViewPrize = (prize) => {
    setSelectedPrize(prize);
    setShowDetailsDialog(true);
  };

  const handleCityChange = (cityName) => {
    const city = TUNISIA_CITIES.find((c) => c.name === cityName);
    if (!city) return;
    setFormData((prev) => ({
      ...prev,
      city: cityName,
      latitude: city.lat,
      longitude: city.lng,
    }));
    setSelectedLocation({ lat: city.lat, lng: city.lng });
  };

  const handleMapClick = (location) => {
    setFormData((prev) => ({
      ...prev,
      latitude: location.lat,
      longitude: location.lng,
    }));
    setSelectedLocation(location);
  };

  const generateBatchLocations = (count, center, radiusMeters) => {
    const locations = [];
    const radiusInDegrees = radiusMeters / 111320;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.sqrt(Math.random()) * radiusInDegrees;
      const lat = center.lat + distance * Math.cos(angle);
      const lng = center.lng + distance * Math.sin(angle);
      locations.push({ lat, lng });
    }
    return locations;
  };

  const handleBatchSubmit = async () => {
    setError(null);
    const center = batchArea?.center || { lat: Number(batchForm.latitude), lng: Number(batchForm.longitude) };
    const areaRadius = batchArea?.radius || Number(batchForm.areaRadius || 500);
    const prizeRadius = Math.min(500, Math.max(10, Number(batchForm.prizeRadius || 50))); // Clamp to 10-500m
    const count = Math.max(1, Number(batchForm.count || 1));

    if (!batchForm.name.trim()) {
      setError('Nom de base requis.');
      toast.error('Nom de base requis');
      return;
    }
    const safeDesc = (batchForm.description || 'Distribution en lot').trim();
    if (safeDesc.length < 10) {
      setError('Description (min 10 caracteres) requise.');
      toast.error('Description (min 10 caractères) requise');
      return;
    }
    if (!center.lat || !center.lng) {
      setError('Selectionnez une zone ou saisissez des coordonnees valides.');
      toast.error('Sélectionnez une zone valide');
      return;
    }

    const safeType = ALLOWED_TYPES.includes(batchForm.type) ? batchForm.type : 'physical';
    const safeCategory = ALLOWED_CATEGORIES.includes(batchForm.category) ? batchForm.category : 'lifestyle';
    const safeRarity = ALLOWED_RARITIES.includes(batchForm.rarity) ? batchForm.rarity : 'common';
    const safeCity = batchForm.city || 'Tunis';

    const locations = batchArea
      ? batchPreviews.map((p) => ({ lat: p.lat, lng: p.lng }))
      : generateBatchLocations(count, center, areaRadius);

    const payload = locations.map((loc, idx) => ({
      name: `${batchForm.name} #${idx + 1}`,
      description: safeDesc,
      points: Math.max(1, Number(batchForm.points || 0)),
      latitude: loc.lat,
      longitude: loc.lng,
      radius: prizeRadius,  // Use prize detection radius (max 500m)
      category: safeCategory,
      rarity: safeRarity,
      type: safeType,
      status: 'active',
      contentType: batchForm.contentType || 'points',
      displayType: batchForm.displayType || 'standard',
      city: safeCity,
      imageUrl: 'https://picsum.photos/200',
    }));

    try {
      await addPrizesBatch(payload);
      toast.success(`${locations.length} prix ajoutés avec succès`);
      setShowBatchDialog(false);
      setBatchPreviews([]);
      setBatchArea(null);
      loadPrizes();
      if (viewMode === 'map') loadAllPrizesForMap();
    } catch (err) {
      console.error(err);
      const errMsg = err.message || 'Erreur ajout en lot';
      setError(errMsg);
      toast.error(errMsg);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      active: { label: 'Actif', className: 'bg-green-100 text-green-800' },
      claimed: { label: 'Capturé', className: 'bg-blue-100 text-blue-800' },
      captured: { label: 'Capturé', className: 'bg-blue-100 text-blue-800' },
      expired: { label: 'Expiré', className: 'bg-gray-100 text-gray-800' },
      inactive: { label: 'Inactif', className: 'bg-slate-200 text-slate-700' },
      revoked: { label: 'Révoqué', className: 'bg-red-100 text-red-700' },
    };
    const variant = variants[status] || variants.active;
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  const getTypeLabel = (type) => {
    const labels = {
      physical: 'Physique',
      digital: 'Digital',
      voucher: 'Voucher',
      mystery: 'Mystère',
    };
    return labels[type] || type;
  };

  // Use all prizes for map view (no pagination limit)
  // MapComponent expects zone.coordinates format
  const prizesForMap = allPrizesForMap.map((prize) => ({
    id: prize.id,
    name: prize.name,
    description: prize.description,
    type: prize.type,
    status: prize.status,
    pointsReward: prize.points,
    quantity: prize.quantity || 1,
    available: (prize.quantity || 1) - (prize.claimedCount || 0),
    capturedCount: prize.claimedCount || 0,
    // Zone format expected by MapComponent
    zone: {
      coordinates: {
        lat: prize.location?.lat || prize.latitude,
        lng: prize.location?.lng || prize.longitude,
      },
      value: prize.location?.city || prize.city || 'Unknown',
      radius: prize.radius || prize.location?.radius || 50,
    },
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer le prix"
        description="Êtes-vous sûr de vouloir supprimer ce prix ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeletePrizeConfirm}
      />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Prix</h1>
          <p className="text-gray-500 mt-1">{totalPrizes} prix au total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPrizes} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" onClick={() => setShowBatchDialog(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Lot
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un Prix
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Actifs</CardTitle>
            <CardDescription>Prix disponibles</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Capturés</CardTitle>
            <CardDescription>Total capturés</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{stats.captured}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expirés</CardTitle>
            <CardDescription>Non disponibles</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-600">{stats.expired}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>Nombre total</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Input
              placeholder="Rechercher un prix..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="all">Tous les statuts</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>
              <List className="mr-2 h-4 w-4" />
              Liste
            </Button>
            <Button variant={viewMode === 'map' ? 'default' : 'outline'} onClick={() => setViewMode('map')}>
              <Map className="mr-2 h-4 w-4" />
              Carte
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'map' && (
        <Card>
          <CardContent>
            {loadingMap ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2">Chargement de {stats.total || totalPrizes} prix sur la carte...</span>
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-500 mb-2">
                  {allPrizesForMap.length} prix affichés sur la carte
                </div>
                <MapComponent prizes={prizesForMap} showPrizes />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-md">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2">Chargement des prix...</span>
        </div>
      )}

      {!loading && viewMode === 'list' && (
        <div className="grid md:grid-cols-3 gap-4">
          {prizes.map((prize) => (
            <Card key={prize.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{prize.name}</CardTitle>
                    <CardDescription>{prize.description}</CardDescription>
                  </div>
                  {getStatusBadge(prize.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold">{prize.points} points</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <span>{prize.city || prize.location?.city || 'Localisation inconnue'}</span>
                </div>
                <div className="text-xs text-gray-500">Animation: <span className="font-medium text-purple-600 capitalize">{prize.displayType || 'Standard'}</span></div>
                <div className="text-xs text-gray-500">Type: {getTypeLabel(prize.type)}</div>
                <div className="text-xs text-gray-500">Catégorie: {prize.category || 'N/A'}</div>
                <div className="text-xs text-gray-500">Rareté: {prize.rarity || 'common'}</div>
                <div className="text-xs text-gray-500">Quantité: {prize.quantity || 1} (Réclamés: {prize.claimedCount || 0})</div>
                <div className="text-xs text-gray-500">Créé le {formatDate(prize.createdAt)}</div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewPrize(prize)} title="Voir details" aria-label="Voir les détails">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditPrize(prize)} title="Modifier" aria-label="Modifier">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-red-500 hover:text-red-700" onClick={() => handleDeletePrizeClick(prize.id)} title="Supprimer" aria-label="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center pt-4">
        <span className="text-sm text-gray-500">
          Page {currentPage} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
            Précédent
          </Button>
          <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
            Suivant
          </Button>
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) {
          setEditingPrize(null);
          setFormData(DEFAULT_FORM);
          setSelectedLocation(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPrize ? 'Modifier le prix' : 'Ajouter un prix'}</DialogTitle>
            <DialogDescription>
              {editingPrize ? 'Modifiez les informations du prix.' : 'Configurez le prix et sa localisation.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={editingPrize ? handleUpdatePrize : handleAddPrize}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Catégorie</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rareté</label>
                <select value={formData.rarity} onChange={(e) => setFormData({ ...formData, rarity: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  {RARITY_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Animation (Display)</label>
                <select
                  value={formData.displayType}
                  onChange={(e) => setFormData({ ...formData, displayType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-blue-50"
                >
                  {DISPLAY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type de Contenu</label>
                <select
                  value={formData.contentType}
                  onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {CONTENT_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Statut</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Points</label>
                <Input type="number" value={formData.points} onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value, 10) || 0 })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantit�</label>
                <Input type="number" value={formData.quantity || 1} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })} />
              </div>
            </div>

            {formData.contentType !== 'points' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Recompense (ID)</label>
                  <select
                    value={formData.rewardId}
                    onChange={(e) => setFormData({ ...formData, rewardId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Aucune</option>
                    {availableRewards.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.pointsCost} pts)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Probabilit� (%)</label>
                  <Input
                    type="number"
                    value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Ville</label>
                <select value={formData.city} onChange={(e) => handleCityChange(e.target.value)} className="w-full px-3 py-2 border rounded-md">
                  {TUNISIA_CITIES.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rayon de détection (m)</label>
                <Input
                  type="number"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value, 10) || 0 })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Position sur la carte</label>
              <p className="text-xs text-gray-500 mb-2">Cliquez sur la carte pour selectionner la position exacte</p>
              <MapComponent
                prizes={[]}
                onMapClick={handleMapClick}
                selectedLocation={selectedLocation}
                height="400px"
                center={[formData.latitude, formData.longitude]}
                zoom={12}
                showPrizes={false}
                interactive
                mode="single"
                resetToken={mapResetToken}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.latitude}
                  onChange={(e) => {
                    const lat = parseFloat(e.target.value);
                    setFormData({ ...formData, latitude: lat });
                    setSelectedLocation({ lat, lng: formData.longitude });
                  }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.longitude}
                  onChange={(e) => {
                    const lng = parseFloat(e.target.value);
                    setFormData({ ...formData, longitude: lng });
                    setSelectedLocation({ lat: formData.latitude, lng });
                  }}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setSelectedLocation(null);
                  setEditingPrize(null);
                  setFormData(DEFAULT_FORM);
                  setMapResetToken((t) => t + 1);
                }}
              >
                Annuler
              </Button>
              <Button type="submit">{editingPrize ? 'Mettre à jour' : 'Créer le Prix'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajout en lot (zone circulaire)</DialogTitle>
            <DialogDescription>
              Selectionnez une zone sur la carte et configurez le lot. Nous genererons les positions automatiquement.
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom de base</label>
              <Input value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} placeholder="Ex: Coffre promo" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Input value={batchForm.description || ''} onChange={(e) => setBatchForm({ ...batchForm, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Catégorie</label>
              <select value={batchForm.category} onChange={(e) => setBatchForm({ ...batchForm, category: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rareté</label>
              <select value={batchForm.rarity} onChange={(e) => setBatchForm({ ...batchForm, rarity: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                {RARITY_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={batchForm.type} onChange={(e) => setBatchForm({ ...batchForm, type: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Animation (Display)</label>
              <select
                value={batchForm.displayType || 'standard'}
                onChange={(e) => setBatchForm({ ...batchForm, displayType: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-blue-50"
              >
                {DISPLAY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type de Contenu</label>
              <select
                value={batchForm.contentType || 'points'}
                onChange={(e) => setBatchForm({ ...batchForm, contentType: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {CONTENT_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Points</label>
              <Input type="number" value={batchForm.points} onChange={(e) => setBatchForm({ ...batchForm, points: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nombre de prix</label>
              <Input type="number" value={batchForm.count} onChange={(e) => setBatchForm({ ...batchForm, count: parseInt(e.target.value, 10) || 1 })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Zone de distribution (m)</label>
              <Input type="number" value={batchForm.areaRadius} onChange={(e) => setBatchForm({ ...batchForm, areaRadius: parseInt(e.target.value, 10) || 500 })} />
              <p className="text-xs text-gray-400 mt-1">Rayon de la zone où les prix seront dispersés</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rayon de détection (m)</label>
              <Input type="number" min="10" max="500" value={batchForm.prizeRadius} onChange={(e) => setBatchForm({ ...batchForm, prizeRadius: Math.min(500, Math.max(10, parseInt(e.target.value, 10) || 50)) })} />
              <p className="text-xs text-gray-400 mt-1">Distance pour capturer chaque prix (10-500m)</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <Input type="number" step="0.0001" value={batchForm.latitude} onChange={(e) => setBatchForm({ ...batchForm, latitude: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <Input type="number" step="0.0001" value={batchForm.longitude} onChange={(e) => setBatchForm({ ...batchForm, longitude: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4">
            <p className="text-sm text-gray-500">Cliquez une premi�re fois pour le centre, une seconde fois pour fixer le rayon.</p>
            <MapComponent
              prizes={[]}
              onAreaSelect={(area) => {
                setBatchArea(area);
                setBatchPreviews(generateBatchLocations(Number(batchForm.count || 1), { lat: area.center.lat, lng: area.center.lng }, area.radius));
              }}
              selectedArea={batchArea}
              setSelectedArea={setBatchArea}
              batchPreviews={batchPreviews}
              height="420px"
              center={[batchForm.latitude, batchForm.longitude]}
              zoom={11}
              showPrizes={false}
              interactive
              mode="area"
            />
          </div>

          {batchPreviews.length > 0 && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800">
              {batchPreviews.length} positions generees. Centre: {batchArea?.center.lat.toFixed(4)}, {batchArea?.center.lng.toFixed(4)} | Rayon: {(batchArea?.radius || 0) / 1000} km
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowBatchDialog(false);
                setBatchArea(null);
                setBatchPreviews([]);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleBatchSubmit}>Generer et creer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prize Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Details du Prix</DialogTitle>
            <DialogDescription>Informations completes sur le prix selectionne</DialogDescription>
          </DialogHeader>

          {selectedPrize && (
            <div className="space-y-4">
              {/* Header with status */}
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold">{selectedPrize.name}</h3>
                  <p className="text-gray-500">{selectedPrize.description}</p>
                </div>
                {getStatusBadge(selectedPrize.status)}
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-yellow-600">{selectedPrize.points}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quantite</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{selectedPrize.quantity || 1}</p>
                    <p className="text-xs text-gray-500">Reclames: {selectedPrize.claimedCount || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Classification */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Classification</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-xs text-gray-500">Type</span>
                    <p className="font-medium">{getTypeLabel(selectedPrize.type)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Catégorie</span>
                    <p className="font-medium capitalize">{selectedPrize.category || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Rareté</span>
                    <p className="font-medium capitalize">{selectedPrize.rarity || 'common'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Location */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    Localisation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-gray-500">Ville</span>
                      <p className="font-medium">{selectedPrize.city || selectedPrize.location?.city || 'Inconnue'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Rayon de détection</span>
                      <p className="font-medium">{selectedPrize.radius || selectedPrize.location?.radius || 50}m</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-gray-500">Latitude</span>
                      <p className="font-mono text-sm">{selectedPrize.latitude || selectedPrize.location?.lat || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Longitude</span>
                      <p className="font-mono text-sm">{selectedPrize.longitude || selectedPrize.location?.lng || 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timestamps */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Historique</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-gray-500">Créé le</span>
                    <p>{formatDate(selectedPrize.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Mis à jour</span>
                    <p>{formatDate(selectedPrize.updatedAt) || 'N/A'}</p>
                  </div>
                  {selectedPrize.expiresAt && (
                    <div>
                      <span className="text-xs text-gray-500">Expire le</span>
                      <p>{formatDate(selectedPrize.expiresAt)}</p>
                    </div>
                  )}
                  {selectedPrize.claimedAt && (
                    <div>
                      <span className="text-xs text-gray-500">Reclame le</span>
                      <p>{formatDate(selectedPrize.claimedAt)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                  Fermer
                </Button>
                <Button onClick={() => {
                  setShowDetailsDialog(false);
                  handleEditPrize(selectedPrize);
                }}>
                  <Edit className="mr-2 h-4 w-4" />
                  Modifier
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
