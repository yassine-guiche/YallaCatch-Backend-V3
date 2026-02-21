/**
 * Unified Prize & Distribution Management Page
 * Combines prize management with distribution features and interactive map
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Slider } from '../components/ui/slider';
import {
  MapPin,
  Plus,
  Trash2,
  RefreshCw,
  Trophy,
  Search,
  Map,
  List,
  Upload,
  Edit,
  Eye,
  Zap,
  Target,
  Circle,
  BarChart3,
  Settings2,
  Play,
  Pause,
  X,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { getPrizes, createPrize, deletePrize, updatePrize, addPrizesBatch } from '../services/prizes';
import { listRewards } from '../services/rewards';
import {
  autoDistribution,
  getDistributionAnalytics,
} from '../services/distribution';
import { formatDate } from '../utils/dates';
import { TUNISIA_CITIES } from '../utils/geo';
import MapComponent from '../components/MapComponent';
import CircleSelectionMap from '../components/CircleSelectionMap';
import { toast } from 'sonner';
import { usePrizesUpdates } from '../hooks/useRealtimeUpdates';
import { getImageUrl } from '../utils/images';
import { ImageUpload } from '../components/ui/ImageUpload';
import { uploadPrizeImage } from '../services/upload';

// Constants
const CATEGORY_OPTIONS = [
  { value: 'electronics', label: 'Électronique' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'food', label: 'Food' },
  { value: 'entertainment', label: 'Divertissement' },
  { value: 'special', label: 'Spécial' },
];

const RARITY_OPTIONS = [
  { value: 'common', label: 'Common', color: 'bg-gray-500' },
  { value: 'uncommon', label: 'Uncommon', color: 'bg-green-500' },
  { value: 'rare', label: 'Rare', color: 'bg-blue-500' },
  { value: 'epic', label: 'Épique', color: 'bg-purple-500' },
  { value: 'legendary', label: 'Légendaire', color: 'bg-yellow-500' },
];

const TYPE_OPTIONS = [
  { value: 'physical', label: 'Physique' },
  { value: 'standard', label: 'Standard' },
  { value: 'coupon', label: 'Coupon' },
  { value: 'nft', label: 'NFT' },
  { value: 'geo_crypto', label: 'Géo Crypto' },
];

// Content type - what the prize actually contains
const CONTENT_TYPE_OPTIONS = [
  { value: 'points', label: 'Points', description: 'Récompense en points uniquement' },
  { value: 'reward', label: 'Récompense Directe', description: 'Coupon, cadeau ou bon d\'achat' },
  { value: 'hybrid', label: 'Hybride', description: 'Points + chance de récompense' },
];

const DISPLAY_TYPE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'mystery_box', label: 'Boîte Mystère' },
  { value: 'treasure', label: 'Coffre' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'special', label: 'Spécial' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Actif', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactif', color: 'bg-gray-100 text-gray-800' },
  { value: 'captured', label: 'Capturé', color: 'bg-blue-100 text-blue-800' },
  { value: 'expired', label: 'Expiré', color: 'bg-red-100 text-red-800' },
  { value: 'revoked', label: 'Révoqué', color: 'bg-orange-100 text-orange-800' },
];

const DEFAULT_FORM = {
  name: '',
  description: 'Récompense YallaCatch !',
  displayType: 'standard',
  category: 'lifestyle',
  rarity: 'common',
  type: 'physical',
  contentType: 'points',
  points: 100,
  city: 'Tunis',
  latitude: 36.8065,
  longitude: 10.1815,
  radius: 50,
  quantity: 1,
  imageUrl: '',
  rewardId: null, // For direct reward
  probability: 1, // For hybrid probabilities (0-1)
};

export default function PrizeDistributionPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState('map');

  // Prize states
  const [prizes, setPrizes] = useState([]);
  const [allPrizesForMap, setAllPrizesForMap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const prizesPerPage = 20;

  // Distribution states
  const [analytics, setAnalytics] = useState(null);

  // Form states
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [distributionArea, setDistributionArea] = useState(null);
  const [mapResetToken, setMapResetToken] = useState(0);

  // Dialog states
  const [showCreationTypeDialog, setShowCreationTypeDialog] = useState(false);
  const [showSingleDialog, setShowSingleDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const [editingPrize, setEditingPrize] = useState(null);
  const [rewardsOptions, setRewardsOptions] = useState([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);

  // Map visibility state (lazy loading)
  const [showMap, setShowMap] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Bulk selection state
  const [selectedPrizes, setSelectedPrizes] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Confirm dialog states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Batch form
  const [batchForm, setBatchForm] = useState({
    name: '',
    description: 'Distribution en lot',
    category: 'lifestyle',
    rarity: 'common',
    type: 'mystery_box',
    displayType: 'standard',
    points: 100,
    count: 10,
    prizeRadius: 50,
    city: 'Tunis',
  });

  // Auto distribution form
  const [autoForm, setAutoForm] = useState({
    title: '',
    description: 'Distribution automatique',
    category: 'special',
    rarity: 'rare',
    type: 'treasure',
    displayType: 'standard',
    points: 100,
    density: 10, // prizes per km²
    minDistance: 50, // minimum distance between prizes
  });

  // Stats
  const [stats, setStats] = useState({ active: 0, captured: 0, expired: 0, inactive: 0, revoked: 0, total: 0 });

  // Load functions
  const loadAnalytics = useCallback(async () => {
    try {
      const analyticsData = await getDistributionAnalytics('30d');
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }, []);

  const loadPrizes = useCallback(async () => {
    try {
      setLoading(true);
      const filters = { page: currentPage, limit: prizesPerPage };
      if (searchTerm) filters.search = searchTerm;
      if (filterStatus !== 'all') filters.status = filterStatus;

      const result = await getPrizes(filters);
      setPrizes(result.items || []);
      setTotalPages(Math.max(1, Math.ceil((result.total || 0) / prizesPerPage)));

      if (result.stats) {
        setStats({
          active: result.stats.active || 0,
          captured: result.stats.captured || 0,
          expired: result.stats.expired || 0,
          inactive: result.stats.inactive || 0,
          revoked: result.stats.revoked || 0,
          total: result.total || 0,
        });
      }
    } catch (err) {
      console.error('Error loading prizes:', err);
      toast.error('Erreur lors du chargement des prix');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterStatus]);

  const loadAllPrizesForMap = useCallback(async () => {
    try {
      setLoadingMap(true);
      const result = await getPrizes({ limit: 10000 });
      setAllPrizesForMap(result.items || []);
    } catch (err) {
      console.error('Error loading prizes for map:', err);
    } finally {
      setLoadingMap(false);
    }
  }, []);

  // WebSocket real-time updates
  usePrizesUpdates({
    onPrizeUpdate: (data) => {
      console.log('Prize update received:', data);
      loadPrizes();
      if (showMap) {
        loadAllPrizesForMap();
      }
      toast.info('Prix mis à jour');
    },
    onCaptureCreated: (data) => {
      console.log('Capture created:', data);
      loadPrizes();
      loadAnalytics();
    },
    onDistributionUpdate: (data) => {
      console.log('Distribution update:', data);
      loadAnalytics();
    },
  });

  // Load active rewards for direct/hybrid selection
  const loadRewardsOptions = useCallback(async () => {
    try {
      setRewardsLoading(true);
      const res = await listRewards({ pageSize: 100 });
      const items = res.items || [];
      const active = items.filter(r => r.isActive !== false);
      setRewardsOptions(active.map(r => ({
        value: r.id,
        label: r.name,
        stock: r.stockAvailable ?? r.stockQuantity,
        pointsCost: r.pointsCost,
      })));
    } catch (err) {
      console.error('loadRewardsOptions error:', err);
    } finally {
      setRewardsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPrizes();
    loadAnalytics();
    // Don't auto-load map prizes - wait for user to show map
    loadRewardsOptions();
  }, []);

  // Load map prizes only when map is shown for the first time
  useEffect(() => {
    if (showMap && !mapLoaded) {
      loadAllPrizesForMap();
      setMapLoaded(true);
    }
  }, [showMap, mapLoaded, loadAllPrizesForMap]);

  // Toggle map visibility
  const handleToggleMap = () => {
    setShowMap(prev => !prev);
  };

  // Load prizes when filters change
  useEffect(() => {
    loadPrizes();
  }, [currentPage, filterStatus]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) loadPrizes();
      else setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // When switching to direct/hybrid, make sure reward options are available
  useEffect(() => {
    if ((formData.contentType === 'reward' || formData.contentType === 'hybrid') && rewardsOptions.length === 0 && !rewardsLoading) {
      loadRewardsOptions();
    }
  }, [formData.contentType, rewardsOptions.length, rewardsLoading, loadRewardsOptions]);

  // Handle map click
  const handleMapClick = (location) => {
    setFormData(prev => ({
      ...prev,
      latitude: location.lat,
      longitude: location.lng,
    }));
    setSelectedLocation(location);
  };

  // Handle area selection for batch/auto distribution
  const handleAreaSelect = (area) => {
    setDistributionArea(area);
    setFormData(prev => ({
      ...prev,
      latitude: area.center.lat,
      longitude: area.center.lng,
    }));
  };

  // Alias for circle drawn handler
  const handleCircleDrawn = handleAreaSelect;

  // City change handler
  const handleCityChange = (cityName) => {
    const city = TUNISIA_CITIES.find(c => c.name === cityName);
    if (!city) return;
    setFormData(prev => ({
      ...prev,
      city: cityName,
      latitude: city.lat,
      longitude: city.lng,
    }));
    setSelectedLocation({ lat: city.lat, lng: city.lng });
  };

  // Create single prize
  const handleCreatePrize = async (e) => {
    e.preventDefault();

    // User-friendly validation
    if (!formData.name?.trim() || formData.name.trim().length < 2) {
      toast.error('Le nom est requis (minimum 2 caractères)');
      return;
    }
    if (!formData.description?.trim() || formData.description.trim().length < 10) {
      toast.error('La description est requise (minimum 10 caractères)');
      return;
    }
    if (!formData.points || formData.points < 1) {
      toast.error('Les points doivent être au moins 1');
      return;
    }
    if ((formData.contentType === 'reward' || formData.contentType === 'hybrid') && !formData.rewardId) {
      toast.error('Sélectionnez une récompense existante pour un prix direct ou hybride');
      return;
    }
    if (formData.contentType === 'hybrid' && (formData.probability === undefined || formData.probability === null)) {
      toast.error('Définissez la probabilité pour un prix hybride');
      return;
    }

    const coords = selectedLocation || { lat: formData.latitude, lng: formData.longitude };
    const latNum = Number(coords?.lat);
    const lngNum = Number(coords?.lng);
    const safeLat = Number.isFinite(latNum) ? latNum : 36.8065;
    const safeLng = Number.isFinite(lngNum) ? lngNum : 10.1815;
    const safeRadius = Number.isFinite(Number(formData.radius)) ? Number(formData.radius) : 50;
    const safeValue = Math.max(1, Number(formData.points || 100));
    const safeQuantity = Number.isFinite(Number(formData.quantity)) ? Number(formData.quantity) : 1;
    const safeProbability = Math.min(1, Math.max(0, Number(formData.probability ?? (formData.contentType === 'hybrid' ? 0.5 : 1))));

    try {
      if (editingPrize) {
        await updatePrize(editingPrize.id, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          type: formData.type,
          category: formData.category,
          rarity: formData.rarity,
          displayType: formData.displayType,
          contentType: formData.contentType,
          city: formData.city,
          latitude: safeLat,
          longitude: safeLng,
          radius: safeRadius,
          value: safeValue,
          quantity: safeQuantity,
          ...(formData.rewardId ? { directReward: { rewardId: formData.rewardId, probability: safeProbability, autoRedeem: true } } : { directReward: undefined }),
        });
        toast.success('✅ Prix mis à jour avec succès !');
      } else {
        await createPrize({
          ...formData,
          name: formData.name.trim(),
          description: formData.description.trim(),
          contentType: formData.contentType,
          displayType: formData.displayType,
          city: formData.city,
          latitude: safeLat,
          longitude: safeLng,
          radius: safeRadius,
          value: safeValue,
          quantity: safeQuantity,
          probability: safeProbability,
        });
        toast.success('🎉 Prix créé avec succès !');
      }

      setShowSingleDialog(false);
      setFormData(DEFAULT_FORM);
      setSelectedLocation(null);
      setEditingPrize(null);
      setMapResetToken(t => t + 1);
      loadPrizes();
      loadAllPrizesForMap();
      loadAnalytics();
    } catch (err) {
      console.error('Error creating/updating prize:', err);
      // Parse error for user-friendly message
      let message = 'Erreur lors de la création du prix';
      if (err.message?.includes('COORDINATES_OUT_OF_BOUNDS')) {
        message = 'Les coordonnées sont en dehors de la zone autorisée (Tunisie)';
      } else if (err.message) {
        message = err.message;
      }
      toast.error(message);
    }
  };

  // Batch distribution
  const handleBatchDistribution = async () => {
    // User-friendly validation
    if (!batchForm.name?.trim()) {
      toast.error('Le nom du lot est requis');
      return;
    }
    if (!distributionArea) {
      toast.error('Veuillez sélectionner une zone sur la carte en dessinant un cercle');
      return;
    }
    if (!batchForm.count || batchForm.count < 1) {
      toast.error('Le nombre de prix doit être au moins 1');
      return;
    }
    if (batchForm.count > 100) {
      toast.error('Maximum 100 prix par lot pour éviter les surcharges');
      return;
    }

    // Tunisia bounds for validation
    const TUNISIA_BOUNDS = {
      north: 37.5439,
      south: 30.2407,
      east: 11.5998,
      west: 7.5244
    };

    // Helper to clamp coordinates to Tunisia bounds
    const clampToTunisia = (lat, lng) => ({
      lat: Math.max(TUNISIA_BOUNDS.south, Math.min(TUNISIA_BOUNDS.north, lat)),
      lng: Math.max(TUNISIA_BOUNDS.west, Math.min(TUNISIA_BOUNDS.east, lng))
    });

    const count = Math.max(1, Math.min(100, Number(batchForm.count || 1)));
    const center = distributionArea.center;
    const areaRadius = distributionArea.radius || 500;

    // Generate random locations within the circle, clamped to Tunisia bounds
    const locations = [];
    const radiusInDegreesLat = areaRadius / 111320;
    const radiusInDegreesLng = areaRadius / (111320 * Math.cos(center.lat * Math.PI / 180));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.sqrt(Math.random());
      const rawLat = center.lat + distance * radiusInDegreesLat * Math.cos(angle);
      const rawLng = center.lng + distance * radiusInDegreesLng * Math.sin(angle);
      const clamped = clampToTunisia(rawLat, rawLng);
      locations.push({ lat: clamped.lat, lng: clamped.lng });
    }

    const payload = locations.map((loc, idx) => ({
      name: `${batchForm.name.trim()} #${idx + 1}`,
      description: batchForm.description?.trim() || 'Distribution en lot',
      points: Math.max(1, Number(batchForm.points || 100)),
      latitude: loc.lat,
      longitude: loc.lng,
      radius: Math.min(500, Math.max(10, Number(batchForm.prizeRadius || 50))),
      category: batchForm.category || 'lifestyle',
      rarity: batchForm.rarity || 'common',
      type: batchForm.type || 'physical',
      status: 'active',
      contentType: 'points',
      displayType: batchForm.displayType || 'standard',
      city: batchForm.city || 'Tunis',
    }));

    try {
      await addPrizesBatch(payload);
      toast.success(`🎉 ${count} prix distribués avec succès dans la zone sélectionnée !`);
      setShowBatchDialog(false);
      setDistributionArea(null);
      loadPrizes();
      loadAllPrizesForMap();
      loadAnalytics();
    } catch (err) {
      console.error('Error batch distribution:', err);
      // Parse error for user-friendly message
      let message = 'Erreur lors de la distribution en lot';
      if (err.message?.includes('COORDINATES_OUT_OF_BOUNDS')) {
        message = 'La zone sélectionnée est en dehors de la Tunisie. Veuillez sélectionner une zone valide.';
      } else if (err.message) {
        message = err.message;
      }
      toast.error(message);
    }
  };

  // Auto distribution
  const handleAutoDistribution = async () => {
    // Validate required fields with user-friendly messages
    if (!distributionArea) {
      toast.error('Veuillez sélectionner une zone sur la carte en dessinant un cercle');
      return;
    }

    if (!autoForm.title?.trim()) {
      toast.error('Le titre est requis pour la distribution automatique');
      return;
    }

    if (!autoForm.density || autoForm.density < 1) {
      toast.error('La densité doit être au moins 1 prix/km²');
      return;
    }

    if (!autoForm.rarity) {
      toast.error('Veuillez sélectionner une rareté');
      return;
    }

    const radiusKm = Math.max(0.1, (distributionArea.radius || 500) / 1000);
    const density = Math.max(1, Number(autoForm.density) || 10);

    // Build payload matching backend AutoDistributionSchema
    const payload = {
      region: {
        center: {
          latitude: distributionArea.center.lat,
          longitude: distributionArea.center.lng
        },
        radiusKm: radiusKm
      },
      density: density,
      prizeTemplate: {
        title: autoForm.title.trim(),
        description: autoForm.description || 'Distribution automatique',
        category: autoForm.category || 'special',
        type: autoForm.type || 'treasure',
        rarity: autoForm.rarity,
        displayType: autoForm.displayType || 'standard',
        content: {
          points: Math.max(1, Number(autoForm.points) || 100)
        }
      }
    };

    try {
      await autoDistribution(payload);
      toast.success(`Distribution automatique lancée avec succès ! (~${Math.ceil(Math.PI * radiusKm * radiusKm * density)} prix)`);
      setShowAutoDialog(false);
      setDistributionArea(null);
      loadPrizes();
      loadAllPrizesForMap();
      loadAnalytics();
    } catch (err) {
      console.error('Error auto distribution:', err);
      // Parse validation errors for user-friendly messages
      let message = 'Erreur lors de la distribution automatique';
      if (err.message) {
        try {
          const errors = JSON.parse(err.message);
          if (Array.isArray(errors)) {
            const errorMessages = errors.map(e => {
              const field = e.path?.join('.') || 'champ';
              return `${field}: ${e.message}`;
            });
            message = errorMessages.join('\\n');
          } else {
            message = err.message;
          }
        } catch {
          message = err.message;
        }
      }
      toast.error(message);
    }
  };

  // Delete prize
  const handleDeletePrizeClick = (prizeId) => {
    setPendingDeleteId(prizeId);
    setDeleteConfirmOpen(true);
  };

  const handleDeletePrizeConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await deletePrize(pendingDeleteId);
      toast.success('Prix supprimé');
      loadPrizes();
      loadAllPrizesForMap();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la suppression');
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Bulk selection handlers
  const handleSelectPrize = (prizeId) => {
    setSelectedPrizes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(prizeId)) {
        newSet.delete(prizeId);
      } else {
        newSet.add(prizeId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPrizes.size === prizes.length) {
      setSelectedPrizes(new Set());
    } else {
      setSelectedPrizes(new Set(prizes.map(p => p.id)));
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedPrizes.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  };

  const handleBulkDeleteConfirm = async () => {
    setIsDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const deletePromises = Array.from(selectedPrizes).map(async (prizeId) => {
        try {
          await deletePrize(prizeId);
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Erreur suppression ${prizeId}:`, err);
        }
      });

      await Promise.all(deletePromises);

      if (successCount > 0) {
        toast.success(`${successCount} prix supprimés avec succès`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} prix n'ont pas pu être supprimés`);
      }

      setSelectedPrizes(new Set());
      loadPrizes();
      loadAllPrizesForMap();
    } catch (err) {
      toast.error('Erreur lors de la suppression en lot');
    } finally {
      setIsDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  // Clear selection when page changes
  useEffect(() => {
    setSelectedPrizes(new Set());
  }, [currentPage, filterStatus, searchTerm]);

  // Edit prize
  const handleEditPrize = (prize) => {
    setEditingPrize(prize);
    setFormData({
      name: prize.name || '',
      description: prize.description || '',
      category: prize.category || 'lifestyle',
      rarity: prize.rarity || 'common',
      type: prize.type || 'mystery_box',
      points: prize.points || prize.value || 100,
      city: prize.city || prize.location?.city || 'Tunis',
      latitude: prize.latitude || prize.location?.lat || 36.8065,
      longitude: prize.longitude || prize.location?.lng || 10.1815,
      radius: prize.radius || prize.location?.radius || 50,
      quantity: prize.quantity || 1,
      displayType: prize.displayType || 'standard',
      contentType: prize.contentType || 'points',
      rewardId: prize.directReward?.rewardId || prize.metadata?.rewardId || null,
      probability: prize.directReward?.probability ?? prize.metadata?.probability ?? (prize.contentType === 'hybrid' ? 0.5 : 1),
    });
    setSelectedLocation({
      lat: prize.latitude || prize.location?.lat || 36.8065,
      lng: prize.longitude || prize.location?.lng || 10.1815,
    });
    setShowSingleDialog(true);
  };



  // Prepare prizes for map
  const prizesForMap = useMemo(() =>
    allPrizesForMap.map(prize => ({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      type: prize.type,
      status: prize.status,
      pointsReward: prize.points,
      quantity: prize.quantity || 1,
      available: (prize.quantity || 1) - (prize.claimedCount || 0),
      capturedCount: prize.claimedCount || 0,
      zone: {
        coordinates: {
          lat: prize.location?.lat || prize.latitude,
          lng: prize.location?.lng || prize.longitude,
        },
        value: prize.location?.city || prize.city || 'Unknown',
        radius: prize.radius || prize.location?.radius || 50,
      },
    })),
    [allPrizesForMap]
  );

  // Status badge
  const getStatusBadge = (status) => {
    const option = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
    return <Badge className={option.color}>{option.label}</Badge>;
  };

  // Rarity badge
  const getRarityBadge = (rarity) => {
    const option = RARITY_OPTIONS.find(r => r.value === rarity) || RARITY_OPTIONS[0];
    return <Badge className={`${option.color} text-white`}>{option.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer le prix"
        description="Êtes-vous sûr de vouloir supprimer ce prix ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeletePrizeConfirm}
      />
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        title="Supprimer les prix sélectionnés"
        description={`Êtes-vous sûr de vouloir supprimer ${selectedPrizes.size} prix sélectionnés ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleBulkDeleteConfirm}
        loading={isDeleting}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Tableau de bord</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/prizes">Prix</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink variant="active">Distribution</BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Trophy className="h-8 w-8 text-yellow-500" />
              Prix & Distribution
            </h1>
            <p className="text-muted-foreground mt-1">
              Gérez vos prix et distributions depuis une seule interface
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { loadPrizes(); loadAnalytics(); if (showMap) loadAllPrizesForMap(); }} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={() => { setEditingPrize(null); setFormData(DEFAULT_FORM); setShowCreationTypeDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau Prix
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Actifs</div>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Capturés</div>
            <div className="text-2xl font-bold text-blue-600">{stats.captured}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Expirés</div>
            <div className="text-2xl font-bold text-gray-600">{stats.expired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Taux Capture</div>
            <div className="text-2xl font-bold text-purple-600">{analytics?.claimRate || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="text-sm text-muted-foreground">Distributions</div>
            <div className="text-2xl font-bold text-orange-600">0</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="map" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            Carte & Distribution
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Liste des Prix
          </TabsTrigger>
        </TabsList>

        {/* Map Tab */}
        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Aperçu des Prix
                </span>
                <div className="flex items-center gap-3">
                  {showMap && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {loadingMap ? 'Chargement...' : `${allPrizesForMap.length} prix affichés`}
                    </span>
                  )}
                  <Button
                    variant={showMap ? "secondary" : "default"}
                    size="sm"
                    onClick={handleToggleMap}
                  >
                    <Map className="h-4 w-4 mr-2" />
                    {showMap ? 'Masquer' : 'Afficher'}
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Visualisation des prix sur la carte. Utilisez les boutons ci-dessous pour créer des prix.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showMap ? (
                <>
                  <div className="h-[400px] rounded-lg overflow-hidden border">
                    <MapComponent
                      key={mapResetToken}
                      prizes={prizesForMap}
                      selectedLocation={null}
                      selectedArea={null}
                      mode="view"
                      allowPanZoomInView
                      showControls
                      defaultCenter={{ lat: formData.latitude, lng: formData.longitude }}
                      defaultZoom={11}
                    />
                  </div>
                </>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed">
                  <Map className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">Carte masquée</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    Cliquez sur "Afficher la carte" pour charger la carte interactive et visualiser les prix distribués.
                  </p>
                  <Button onClick={handleToggleMap}>
                    <Map className="h-4 w-4 mr-2" />
                    Afficher la carte
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* List Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-lg shadow-sm">
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
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Prize List */}
          <Card>
            <CardContent className="p-0">
              {/* Bulk Actions Bar */}
              {selectedPrizes.size > 0 && (
                <div className="bg-blue-50 border-b border-blue-200 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">
                      {selectedPrizes.size} prix sélectionné{selectedPrizes.size > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedPrizes(new Set())}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Désélectionner
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleBulkDeleteClick}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      Supprimer ({selectedPrizes.size})
                    </Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium w-12">
                        <button
                          onClick={handleSelectAll}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title={selectedPrizes.size === prizes.length ? 'Désélectionner tout' : 'Sélectionner tout'}
                        >
                          {selectedPrizes.size === 0 ? (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          ) : selectedPrizes.size === prizes.length ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <MinusSquare className="h-5 w-5 text-blue-600" />
                          )}
                        </button>
                      </th>
                      <th className="text-left p-3 font-medium w-[60px]">Image</th>
                      <th className="text-left p-3 font-medium">Nom</th>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Rareté</th>
                      <th className="text-left p-3 font-medium">Points</th>
                      <th className="text-left p-3 font-medium">Ville</th>
                      <th className="text-left p-3 font-medium">Statut</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prizes.map(prize => (
                      <tr
                        key={prize.id}
                        className={`border-t hover:bg-muted/30 ${selectedPrizes.has(prize.id) ? 'bg-blue-50' : ''}`}
                      >
                        <td className="p-3">
                          <button
                            onClick={() => handleSelectPrize(prize.id)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                          >
                            {selectedPrizes.has(prize.id) ? (
                              <CheckSquare className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Square className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="w-10 h-10 rounded border bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                            {prize.imageUrl ? (
                              <img
                                src={getImageUrl(prize.imageUrl)}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Trophy className="w-5 h-5 text-gray-300" />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{prize.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {prize.description}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{prize.type}</Badge>
                        </td>
                        <td className="p-3">{getRarityBadge(prize.rarity)}</td>
                        <td className="p-3 font-mono">{prize.points}</td>
                        <td className="p-3">{prize.city || prize.location?.city || '—'}</td>
                        <td className="p-3">{getStatusBadge(prize.status)}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setSelectedPrize(prize); setShowDetailsDialog(true); }} aria-label="Voir les détails">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleEditPrize(prize)} aria-label="Modifier">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeletePrizeClick(prize.id)} aria-label="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {prizes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          Aucun prix trouvé
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 p-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Single Prize Dialog */}
      <Dialog open={showSingleDialog} onOpenChange={setShowSingleDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPrize ? 'Modifier le Prix' : 'Nouveau Prix'}</DialogTitle>
            <DialogDescription>
              Cliquez sur la carte pour sélectionner l'emplacement du prix
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePrize} className="space-y-4">
            {/* Map for location selection */}
            <div className="h-[250px] rounded-lg overflow-hidden border">
              <MapComponent
                prizes={[]}
                onMapClick={handleMapClick}
                selectedLocation={selectedLocation}
                mode="click"
                showControls
                defaultCenter={{ lat: formData.latitude, lng: formData.longitude }}
                defaultZoom={13}
              />
            </div>

            {selectedLocation && (
              <div className="p-2 bg-blue-50 rounded text-sm">
                <strong>Position:</strong> {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nom *</label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nom du prix"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Points</label>
                <Input
                  type="number"
                  value={formData.points}
                  onChange={e => setFormData(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
                  min={1}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description du prix"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Contenu</label>
                <select
                  value={formData.contentType}
                  onChange={e => setFormData(prev => ({ ...prev, contentType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {CONTENT_TYPE_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Animation</label>
                <select
                  value={formData.displayType}
                  onChange={e => setFormData(prev => ({ ...prev, displayType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-blue-50"
                >
                  {DISPLAY_TYPE_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {TYPE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Rareté</label>
                <select
                  value={formData.rarity}
                  onChange={e => setFormData(prev => ({ ...prev, rarity: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {RARITY_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {(formData.contentType === 'reward' || formData.contentType === 'hybrid') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center justify-between">
                    <span>Récompense associée *</span>
                    <Button type="button" variant="ghost" size="sm" onClick={loadRewardsOptions} disabled={rewardsLoading}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${rewardsLoading ? 'animate-spin' : ''}`} />
                      Rafraîchir
                    </Button>
                  </label>
                  <select
                    value={formData.rewardId || ''}
                    onChange={e => setFormData(prev => ({ ...prev, rewardId: e.target.value || null }))}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">-- Choisir une récompense --</option>
                    {rewardsOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} {opt.stock !== undefined ? `(stock: ${opt.stock})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sélectionnez une récompense existante pour les prix directs ou hybrides.
                  </p>
                </div>
                {formData.contentType === 'hybrid' && (
                  <div>
                    <label className="text-sm font-medium">Probabilité de récompense</label>
                    <div className="px-1">
                      <Slider
                        value={[Math.round((formData.probability ?? 0.5) * 100)]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={val => setFormData(prev => ({ ...prev, probability: (val?.[0] ?? 50) / 100 }))}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Chance: {Math.round((formData.probability ?? 0.5) * 100)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="text-sm font-medium mb-2 block">Image du Prix</label>
                <div className="bg-gray-50/50 p-4 rounded-md border border-dashed border-gray-200">
                  <ImageUpload
                    value={formData.imageUrl}
                    onChange={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
                    onUpload={uploadPrizeImage}
                    placeholder="Image du prix"
                  />
                  <p className="text-[11px] text-gray-400 mt-2">Visible par les utilisateurs sur la carte et dans leur inventaire.</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Ville</label>
                <select
                  value={formData.city}
                  onChange={e => handleCityChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {TUNISIA_CITIES.map(city => (
                    <option key={city.name} value={city.name}>{city.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Rayon (m)</label>
                <Input
                  type="number"
                  value={formData.radius}
                  onChange={e => setFormData(prev => ({ ...prev, radius: parseInt(e.target.value) || 50 }))}
                  min={10}
                  max={500}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Quantité</label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={e => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  min={1}
                  max={100}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSingleDialog(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!selectedLocation && !editingPrize}>
                {editingPrize ? 'Mettre à jour' : 'Créer le Prix'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Distribution Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-orange-500" />
              Distribution en Lot
            </DialogTitle>
            <DialogDescription>
              Sélectionnez une ville puis dessinez un cercle sur la carte pour définir la zone de distribution
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Lightweight Circle Selection Map */}
            <CircleSelectionMap
              onCircleDrawn={handleCircleDrawn}
              selectedArea={distributionArea}
              height="300px"
              showCitySelector={true}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nom de base *</label>
                <Input
                  value={batchForm.name}
                  onChange={e => setBatchForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Event Noël"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={batchForm.description}
                  onChange={e => setBatchForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Distribution en lot"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Nombre de prix</label>
                <Input
                  type="number"
                  value={batchForm.count}
                  onChange={e => setBatchForm(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Points par prix</label>
                <Input
                  type="number"
                  value={batchForm.points}
                  onChange={e => setBatchForm(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Rayon capture (m)</label>
                <Input
                  type="number"
                  value={batchForm.prizeRadius}
                  onChange={e => setBatchForm(prev => ({ ...prev, prizeRadius: parseInt(e.target.value) || 50 }))}
                  min={10}
                  max={500}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium">Animation</label>
                <select
                  value={batchForm.displayType || 'standard'}
                  onChange={e => setBatchForm(prev => ({ ...prev, displayType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-orange-50"
                >
                  {DISPLAY_TYPE_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <select
                  value={batchForm.category}
                  onChange={e => setBatchForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Rareté</label>
                <select
                  value={batchForm.rarity}
                  onChange={e => setBatchForm(prev => ({ ...prev, rarity: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {RARITY_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  value={batchForm.type}
                  onChange={e => setBatchForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {TYPE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview of distribution */}
            {distributionArea && batchForm.count > 0 && (
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <h4 className="font-medium text-orange-800 mb-2">Aperçu de la distribution</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>📍 <strong>{batchForm.count}</strong> prix seront créés</div>
                  <div>🎯 Zone de <strong>{Math.round(distributionArea.radius)}m</strong> de rayon</div>
                  <div>⭐ <strong>{batchForm.points}</strong> points chacun</div>
                  <div>📦 Rareté: <strong>{RARITY_OPTIONS.find(r => r.value === batchForm.rarity)?.label}</strong></div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleBatchDistribution}
              disabled={!distributionArea || !batchForm.name?.trim()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Circle className="h-4 w-4 mr-2" />
              Distribuer {batchForm.count} prix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Distribution Dialog */}
      <Dialog open={showAutoDialog} onOpenChange={setShowAutoDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Distribution Automatique
            </DialogTitle>
            <DialogDescription>
              Sélectionnez une ville puis dessinez un cercle pour définir la zone de distribution automatique
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Lightweight Circle Selection Map */}
            <CircleSelectionMap
              onCircleDrawn={handleCircleDrawn}
              selectedArea={distributionArea}
              height="300px"
              showCitySelector={true}
            />

            {distributionArea && (
              <div className="p-2 bg-yellow-50 rounded text-sm border border-yellow-200">
                <strong>Estimation:</strong> ~{((Math.PI * Math.pow(distributionArea.radius / 1000, 2)) * autoForm.density).toFixed(0)} prix seront créés dans cette zone
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Titre *</label>
                <Input
                  value={autoForm.title}
                  onChange={e => setAutoForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex: Distribution Centre-Ville"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={autoForm.description}
                  onChange={e => setAutoForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Distribution automatique"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Densité (prix/km²)</label>
                <Input
                  type="number"
                  value={autoForm.density}
                  onChange={e => setAutoForm(prev => ({ ...prev, density: parseInt(e.target.value) || 10 }))}
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Distance min (m)</label>
                <Input
                  type="number"
                  value={autoForm.minDistance}
                  onChange={e => setAutoForm(prev => ({ ...prev, minDistance: parseInt(e.target.value) || 50 }))}
                  min={10}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Points</label>
                <Input
                  type="number"
                  value={autoForm.points}
                  onChange={e => setAutoForm(prev => ({ ...prev, points: parseInt(e.target.value) || 100 }))}
                  min={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Animation</label>
                <select
                  value={autoForm.displayType || 'standard'}
                  onChange={e => setAutoForm(prev => ({ ...prev, displayType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md bg-yellow-50"
                >
                  {DISPLAY_TYPE_OPTIONS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <select
                  value={autoForm.category}
                  onChange={e => setAutoForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Rareté</label>
                <select
                  value={autoForm.rarity}
                  onChange={e => setAutoForm(prev => ({ ...prev, rarity: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {RARITY_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview */}
            {distributionArea && autoForm.title && (
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="font-medium text-yellow-800 mb-2">Aperçu de la distribution</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>📍 ~<strong>{((Math.PI * Math.pow(distributionArea.radius / 1000, 2)) * autoForm.density).toFixed(0)}</strong> prix estimés</div>
                  <div>🎯 Zone de <strong>{Math.round(distributionArea.radius)}m</strong> de rayon</div>
                  <div>⭐ <strong>{autoForm.points}</strong> points chacun</div>
                  <div>📦 Rareté: <strong>{RARITY_OPTIONS.find(r => r.value === autoForm.rarity)?.label}</strong></div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAutoDistribution}
              disabled={!distributionArea || !autoForm.title?.trim()}
              className="bg-yellow-500 hover:bg-yellow-600"
            >
              <Zap className="h-4 w-4 mr-2" />
              Lancer Distribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prize Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails du Prix</DialogTitle>
          </DialogHeader>
          {selectedPrize && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Nom</label>
                  <p className="font-medium">{selectedPrize.name}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Statut</label>
                  <p>{getStatusBadge(selectedPrize.status)}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <p>{selectedPrize.description || '—'}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Type</label>
                  <p>{selectedPrize.type}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Rareté</label>
                  <p>{getRarityBadge(selectedPrize.rarity)}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Points</label>
                  <p className="font-mono">{selectedPrize.points}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Ville</label>
                  <p>{selectedPrize.city || selectedPrize.location?.city || '—'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Rayon</label>
                  <p>{selectedPrize.radius || selectedPrize.location?.radius || 50}m</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Coordonnées</label>
                <p className="font-mono text-sm">
                  {selectedPrize.latitude || selectedPrize.location?.lat}, {selectedPrize.longitude || selectedPrize.location?.lng}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Créé le</label>
                  <p>{formatDate(selectedPrize.createdAt)}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Réclamations</label>
                  <p>{selectedPrize.claimedCount || 0} / {selectedPrize.quantity || 1}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Fermer
            </Button>
            <Button onClick={() => { setShowDetailsDialog(false); handleEditPrize(selectedPrize); }}>
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creation Type Selection Dialog */}
      <Dialog open={showCreationTypeDialog} onOpenChange={setShowCreationTypeDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-500" />
              Nouveau Prix
            </DialogTitle>
            <DialogDescription>
              Choisissez le mode de création de prix
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            {/* Single Prize */}
            <button
              onClick={() => {
                setShowCreationTypeDialog(false);
                setSelectedLocation(null);
                setShowSingleDialog(true);
              }}
              className="flex flex-col items-center p-6 border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                <MapPin className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-lg">Prix Unique</h3>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Créer un prix à un emplacement précis sur la carte
              </p>
            </button>

            {/* Batch Prize */}
            <button
              onClick={() => {
                setShowCreationTypeDialog(false);
                setDistributionArea(null);
                setShowBatchDialog(true);
              }}
              className="flex flex-col items-center p-6 border-2 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all group"
            >
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-3 group-hover:bg-orange-200 transition-colors">
                <Circle className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="font-semibold text-lg">Distribution Lot</h3>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Distribuer plusieurs prix dans une zone circulaire
              </p>
            </button>

            {/* Auto Distribution */}
            <button
              onClick={() => {
                setShowCreationTypeDialog(false);
                setDistributionArea(null);
                setShowAutoDialog(true);
              }}
              className="flex flex-col items-center p-6 border-2 rounded-xl hover:border-yellow-500 hover:bg-yellow-50 transition-all group"
            >
              <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mb-3 group-hover:bg-yellow-200 transition-colors">
                <Zap className="h-8 w-8 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-lg">Auto Distribution</h3>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Distribution automatique par densité de prix
              </p>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreationTypeDialog(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
