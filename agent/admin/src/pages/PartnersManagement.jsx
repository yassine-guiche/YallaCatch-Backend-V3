import { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../utils/dates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ImageUpload } from '../components/ui/ImageUpload';
import { uploadPartnerLogo } from '../services/upload';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MultiSelect } from '../components/ui/multi-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  MapPin,
  Phone,
  Mail,
  Map,
  List,
  Navigation,
  BarChart3,
  KeyRound,
  MoreHorizontal,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPartners, createPartner, updatePartner, deletePartner, resetPartnerCredentials, getPartnerCredentials, addPartnerLocation, approvePartner } from '../services/partners';
import { getPartnerStats } from '../services/redemptions-partner';
import { usePartnersUpdates } from '../hooks/useRealtimeUpdates';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom partner marker icon
const partnerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Map center component (for dynamic map centering)
function MapCenterHandler({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 13);
    }
  }, [center, map]);
  return null;
}

function FitToLocations({ locations }) {
  const map = useMap();
  useEffect(() => {
    if (!locations || locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((loc) => loc.position));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [locations, map]);
  return null;
}

export default function PartnersManagement() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [mapCenter, setMapCenter] = useState([33.5731, -7.5898]); // Casablanca default
  const [userLocation, setUserLocation] = useState(null);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [selectedPartnerForLocation, setSelectedPartnerForLocation] = useState(null);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingDeleteName, setPendingDeleteName] = useState('');
  const [locationFormData, setLocationFormData] = useState({
    name: '',
    address: '',
    city: '',
    coordinates: [0, 0],
    phone: '',
    isActive: true,
    features: [],
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    categories: ['food'],
    features: [],
    contactEmail: '',
    contactPhone: '',
    website: '',
    logo: '',
    isActive: true,
    locations: [],
    commissionRate: 10,
  });

  // WebSocket real-time updates
  usePartnersUpdates({
    onPartnerUpdate: (data) => {
      console.log('Partner update received:', data);
      loadPartners(); // Refresh partners list
      toast.info('Partenaire mis à jour');
    },
    onRedemptionCreated: () => {
      // Refresh stats if stats dialog is open
      if (showStatsDialog && statsData) {
        handleShowStats(statsData.partner);
      }
    },
  });

  const categories = [
    { value: 'food', label: 'Restauration' },
    { value: 'shopping', label: 'Shopping' },
    { value: 'entertainment', label: 'Divertissement' },
    { value: 'travel', label: 'Voyage' },
    { value: 'technology', label: 'Technologie' },
    { value: 'health', label: 'Santé' },
    { value: 'education', label: 'Éducation' },
    { value: 'services', label: 'Services' },
  ];

  const featureOptions = [
    { value: 'parking', label: 'Parking' },
    { value: 'wifi', label: 'Wi‑Fi' },
    { value: 'accessibility', label: 'Accès PMR' },
    { value: 'delivery', label: 'Livraison' },
    { value: 'takeaway', label: 'À emporter' },
    { value: 'outdoor_seating', label: 'Terrasse' },
    { value: 'air_conditioning', label: 'Climatisation' },
  ];

  useEffect(() => {
    loadPartners();
    // Get user's location for map
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          setMapCenter([latitude, longitude]);
        },
        (error) => {
          console.log('Geolocation error:', error);
        }
      );
    }
  }, []);

  const loadPartners = async () => {
    try {
      setLoading(true);
      const response = await getPartners({
        page: 1,
        limit: 100,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchTerm || undefined
      });
      setPartners(response.items || []);
    } catch (error) {
      toast.error('Erreur lors du chargement des partenaires');
      console.error('Load partners error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Optimistic insert to show newly created partner immediately
  const insertPartnerOptimistic = (partner) => {
    if (!partner) return;
    setPartners(prev => [partner, ...prev]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanedEmail = (formData.contactEmail || '').trim().toLowerCase();
      const cleanedPhone = (formData.contactPhone || '').trim();
      if (!emailRegex.test(cleanedEmail)) {
        toast.error('Email de contact invalide');
        return;
      }
      if (!cleanedPhone) {
        toast.error('Le téléphone est requis');
        return;
      }

      const payload = {
        ...formData,
        contactEmail: cleanedEmail,
        contactPhone: cleanedPhone,
        features: formData.features || [],
        categories: formData.categories?.length ? formData.categories : ['food'],
        commissionRate: Number.isFinite(formData.commissionRate) ? formData.commissionRate : 0,
      };

      if (editingPartner) {
        await updatePartner(editingPartner.id || editingPartner._id, payload);
        toast.success('Partenaire mis à jour avec succès');
        setCreatedCredentials(null);
      } else {
        const result = await createPartner(payload);
        insertPartnerOptimistic(result?.partner || result);
        toast.success('Partenaire créé avec succès');
        if (result?.credentials) {
          setCreatedCredentials(result.credentials);
          toast.info('Accès partenaire généré', {
            description: `${result.credentials.email} / ${result.credentials.password}`,
          });
        }
      }
      setShowAddDialog(false);
      setEditingPartner(null);
      resetForm();
      loadPartners();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
      console.error('Save partner error:', error);
    }
  };

  const handleEdit = (partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      description: partner.description,
      categories: partner.categories || (partner.category ? [partner.category] : ['food']),
      features: partner.features || [],
      contactEmail: partner.contactEmail || '',
      contactPhone: partner.contactPhone || '',
      website: partner.website || '',
      logo: partner.logo || '',
      isActive: partner.isActive,
      locations: partner.locations || [],
      commissionRate: partner.commissionRate ?? 10,
    });
    setShowAddDialog(true);
  };

  const handleDeleteClick = (partnerId, partnerName) => {
    setPendingDeleteId(partnerId);
    setPendingDeleteName(partnerName || 'ce partenaire');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    try {
      await deletePartner(pendingDeleteId);
      toast.success('Partenaire supprimé avec succès');
      loadPartners();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
      console.error('Delete partner error:', error);
    }
    setPendingDeleteId(null);
    setPendingDeleteName('');
  };

  const handleShowStats = async (partner) => {
    try {
      setStatsLoading(true);
      setShowStatsDialog(true);
      const stats = await getPartnerStats({ partnerId: partner.id || partner._id, limitRecent: 10 });
      setStatsData({
        partner,
        totals: stats?.totals || {},
        byCategory: stats?.byCategory || [],
        recent: stats?.recent || []
      });
    } catch (error) {
      toast.error('Impossible de charger les statistiques partenaire', { description: error?.message });
      setShowStatsDialog(false);
    } finally {
      setStatsLoading(false);
    }
  };


  const handleResetCredentials = async (partner, regenerate = true) => {
    try {
      const partnerId = partner.id || partner._id;
      const creds = regenerate
        ? await resetPartnerCredentials(partnerId)
        : await getPartnerCredentials(partnerId);
      if (creds && creds.email) {
        setCreatedCredentials(creds);
        toast.success(regenerate ? 'Nouveaux accès générés' : 'Identifiants récupérés', {
          description: `${creds.email}${creds.password ? ' / ' + creds.password : ''}`,
        });
      } else {
        toast.error('Identifiants non disponibles pour ce partenaire');
      }
    } catch (error) {
      toast.error('Impossible de récupérer les identifiants');
      console.error('Reset credentials error:', error);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials?.email) return;
    const text = `${createdCredentials.email}${createdCredentials.password ? ' / ' + createdCredentials.password : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Identifiants copiés');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      categories: ['food'],
      features: [],
      contactEmail: '',
      contactPhone: '',
      website: '',
      logo: '',
      isActive: true,
      locations: [],
      commissionRate: 10,
    });
  };

  const filteredPartners = partners.filter(partner => {
    const matchesSearch =
      (partner.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (partner.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && partner.isActive) ||
      (filterStatus === 'inactive' && !partner.isActive);
    return matchesSearch && matchesStatus;
  });

  const stats = {
    totalPartners: partners.length,
    activePartners: partners.filter(p => p.isActive).length,
    totalLocations: partners.reduce((sum, p) => sum + (p.locations?.length || 0), 0),
    totalRedemptions: partners.reduce((sum, p) => sum + (p.stats?.totalRedemptions || p.redemptionsCount || 0), 0),
  };

  // Get all locations from all partners for the map
  const allLocations = useMemo(() => {
    const locations = [];
    filteredPartners.forEach(partner => {
      if (partner.locations && partner.locations.length > 0) {
        partner.locations.forEach(location => {
          if (location.isActive && location.coordinates && location.coordinates.length === 2) {
            locations.push({
              ...location,
              partnerId: partner._id || partner.id,
              partnerName: partner.name,
              partnerLogo: partner.logo,
              partnerCategory: partner.category,
              // Coordinates are [longitude, latitude] in DB, but Leaflet needs [latitude, longitude]
              position: [location.coordinates[1], location.coordinates[0]]
            });
          }
        });
      }
    });
    return locations;
  }, [filteredPartners]);

  // Handle adding a new location
  const handleAddLocation = (partner) => {
    setSelectedPartnerForLocation(partner);
    setLocationFormData({
      name: '',
      address: '',
      city: '',
      coordinates: mapCenter[1] ? [mapCenter[1], mapCenter[0]] : [0, 0], // [lng, lat] format for DB
      phone: '',
      isActive: true,
    });
    setShowLocationDialog(true);
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.state || '';
      const street = addr.road || addr.pedestrian || addr.suburb || '';
      setLocationFormData((prev) => ({
        ...prev,
        address: street || prev.address,
        city: city || prev.city,
        name: prev.name || addr.shop || addr.amenity || street || city || `Emplacement ${lat.toFixed(3)}, ${lng.toFixed(3)}`
      }));
    } catch (err) {
      console.log('Reverse geocode failed', err);
    }
  };

  // Save location
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    try {
      const partnerId = selectedPartnerForLocation?._id || selectedPartnerForLocation?.id;
      if (!partnerId) {
        toast.error('Partenaire introuvable pour ajouter un emplacement');
        return;
      }
      const payload = {
        ...locationFormData,
        coordinates: locationFormData.coordinates,
      };
      await addPartnerLocation(partnerId, payload);
      toast.success('Emplacement ajouté avec succès');
      setShowLocationDialog(false);
      setSelectedPartnerForLocation(null);
      loadPartners();
    } catch (error) {
      toast.error("Erreur lors de l'ajout de l'emplacement");
      console.error('Add location error:', error);
    }
  };

  // Center map on a specific partner's location
  const centerMapOnPartner = (partner) => {
    if (partner.locations && partner.locations.length > 0) {
      const firstLocation = partner.locations[0];
      if (firstLocation.coordinates && firstLocation.coordinates.length === 2) {
        // Coordinates are [longitude, latitude] in DB, Leaflet needs [latitude, longitude]
        setMapCenter([firstLocation.coordinates[1], firstLocation.coordinates[0]]);
        setActiveTab('map');
      }
    } else {
      toast.info('Ce partenaire n\'a pas encore d\'emplacements');
    }
  };

  const handleApprovePartner = async (partner) => {
    const partnerId = partner.id || partner._id;
    try {
      setLoading(true);
      const response = await approvePartner(partnerId);
      if (response?.credentials) {
        setCreatedCredentials(response.credentials);
      }
      toast.success('Partenaire approuvé avec succès');
      loadPartners();
    } catch (error) {
      console.error('Approval error:', error);
      toast.error('Erreur lors de l\'approbation du partenaire', { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer le partenaire"
        description={`Êtes-vous sûr de vouloir supprimer "${pendingDeleteName}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Tableau de bord</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/partners">Commerce</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink variant="active">Partenaires</BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Partenaires</h1>
            <p className="text-gray-500 mt-1">Gérer les partenaires commerciaux</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau Partenaire
        </Button>
      </div>



      {createdCredentials && (
        <Card className="mb-6 border-blue-100 bg-blue-50">
          <CardHeader>
            <CardTitle>Identifiants générés pour le partenaire</CardTitle>
            <CardDescription>Transmettez ces accès au partenaire pour le portail et le scan des QR codes.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Email / login</div>
              <Input readOnly value={createdCredentials.email} />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Mot de passe</div>
              <Input readOnly value={createdCredentials.password || '—'} />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={copyCredentials} className="w-full">
                Copier les identifiants
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Partenaires</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPartners}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partenaires Actifs</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePartners}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emplacements</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLocations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redemptions Total</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRedemptions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Rechercher un partenaire..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
            <Button variant="outline" onClick={loadPartners}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for List/Map View */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-80 grid-cols-2">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Liste
          </TabsTrigger>
          <TabsTrigger value="map" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            Carte ({allLocations.length})
          </TabsTrigger>
        </TabsList>

        {/* List View */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Partenaires ({filteredPartners.length})</CardTitle>
              <CardDescription>Liste de tous les partenaires commerciaux</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Emplacements</TableHead>
                      <TableHead>Récompenses</TableHead>
                      <TableHead>Redemptions</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPartners.map((partner) => (
                      <TableRow key={partner.id || partner._id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-gray-500" />
                            </div>
                            <div>
                              <div className="font-medium">{partner.name}</div>
                              <div className="text-sm text-gray-500">{(partner.description || '').substring(0, 40)}...</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {categories.find(c => c.value === partner.category)?.label || partner.category || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {partner.contactEmail || '—'}
                            </div>
                            <div className="flex items-center gap-1 text-gray-500">
                              <Phone className="h-3 w-3" />
                              {partner.contactPhone || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex items-center gap-1"
                              onClick={() => centerMapOnPartner(partner)}
                              title="Voir sur la carte"
                            >
                              <MapPin className="h-4 w-4 text-gray-500" />
                              {partner.locations?.length || 0}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddLocation(partner)}
                              title="Ajouter un emplacement"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{partner.stats?.rewardsCount || partner.rewardsCount || 0}</TableCell>
                        <TableCell>{partner.stats?.totalRedemptions || partner.redemptionsCount || 0}</TableCell>
                        <TableCell>
                          {partner.status === 'pending' ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">En attente</Badge>
                          ) : partner.isActive || partner.status === 'active' ? (
                            <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Actif</Badge>
                          ) : (
                            <Badge variant="secondary">Inactif</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="hidden sm:flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(partner)}
                              aria-label="Modifier le partenaire"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowStats(partner)}
                              aria-label="Voir les statistiques"
                            >
                              <BarChart3 className="h-4 w-4 text-indigo-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResetCredentials(partner, true)}
                              title="Réinitialiser et afficher les accès portail"
                              aria-label="Réinitialiser les accès portail"
                            >
                              <KeyRound className="h-4 w-4 text-amber-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(partner.id || partner._id, partner.name)}
                              aria-label="Supprimer le partenaire"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>

                            {partner.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleApprovePartner(partner)}
                                className="border-green-500 text-green-600 hover:bg-green-50 ml-1"
                                title="Approuver le partenaire"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEdit(partner)}>Modifier</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleShowStats(partner)}>Statistiques</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleResetCredentials(partner, true)}>
                                  Réinitialiser accès
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteClick(partner.id || partner._id, partner.name)}>
                                  Supprimer
                                </DropdownMenuItem>
                                {partner.status === 'pending' && (
                                  <DropdownMenuItem
                                    className="text-green-600 font-medium"
                                    onClick={() => handleApprovePartner(partner)}
                                  >
                                    Approuver le partenaire
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Map View */}
        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                Carte des Emplacements
              </CardTitle>
              <CardDescription>
                {allLocations.length} emplacements de {filteredPartners.filter(p => p.locations?.length > 0).length} partenaires
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] w-full rounded-lg overflow-hidden border">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {/* Center to user location when no markers, otherwise fit to all partner locations */}
                  {allLocations.length === 0 && <MapCenterHandler center={mapCenter} />}
                  {allLocations.length > 0 && <FitToLocations locations={allLocations} />}

                  {/* User location marker */}
                  {userLocation && (
                    <Marker
                      position={userLocation}
                      icon={new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                      })}
                    >
                      <Popup>
                        <div className="text-center">
                          <Navigation className="h-4 w-4 mx-auto text-red-500" />
                          <strong>Votre position</strong>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Partner location markers */}
                  {allLocations.map((location, index) => (
                    <Marker
                      key={`${location.partnerId}-${index}`}
                      position={location.position}
                      icon={partnerIcon}
                    >
                      <Popup>
                        <div className="min-w-[200px]">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-blue-600" />
                            <strong>{location.partnerName}</strong>
                          </div>
                          <div className="text-sm space-y-1">
                            <p className="font-medium">{location.name}</p>
                            <p className="text-gray-600">{location.address}</p>
                            <p className="text-gray-500">{location.city}</p>
                            {location.phone && (
                              <p className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {location.phone}
                              </p>
                            )}
                            <Badge variant="outline" className="mt-2">
                              {location.partnerCategory}
                            </Badge>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              {/* Map Legend */}
              <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                  <span>Emplacements partenaires ({allLocations.length})</span>
                </div>
                {userLocation && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                    <span>Votre position</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0">
          <div className="p-6 overflow-y-auto space-y-4 max-h-[75vh]">
            <DialogHeader>
              <DialogTitle>
                {editingPartner ? 'Modifier le Partenaire' : 'Nouveau Partenaire'}
              </DialogTitle>
              <DialogDescription>
                {editingPartner ? 'Modifier les informations du partenaire' : 'Ajouter un nouveau partenaire commercial'}
              </DialogDescription>
            </DialogHeader>
            {!editingPartner && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md p-2">
                Les identifiants partenaire (email/mot de passe) seront générés automatiquement après création et affichés en haut de page.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-sm font-semibold text-gray-700">Informations générales</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Catégories</label>
                  <MultiSelect
                    options={categories}
                    value={formData.categories}
                    onChange={(vals) => setFormData({ ...formData, categories: vals })}
                    placeholder="Sélectionnez une ou plusieurs catégories"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Commission (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="flex items-end text-xs text-gray-500">
                  Taux utilisé pour le partage de revenus marketplace/sponsor (0-100%).
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Services / Attributs</label>
                <MultiSelect
                  options={featureOptions}
                  value={formData.features || []}
                  onChange={(vals) => setFormData({ ...formData, features: vals })}
                  placeholder="Parking, Wi‑Fi, accessibilité..."
                />
              </div>

              <div className="text-sm font-semibold text-gray-700">Contact</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <Input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Téléphone</label>
                  <Input
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="text-sm font-semibold text-gray-700">Média & statut</div>
              <div>
                <label className="block text-sm font-medium mb-1">Site Web</label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div>
                <ImageUpload
                  label="Logo du partenaire"
                  value={formData.logo}
                  onChange={(url) => setFormData({ ...formData, logo: url })}
                  onUpload={uploadPartnerLogo}
                  placeholder="Cliquez ou déposez le logo"
                />
                <p className="text-xs text-gray-500 mt-1">Utilisez un logo carré (512x512) pour un meilleur rendu.</p>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Actif</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false);
                    setEditingPartner(null);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit">
                  {editingPartner ? 'Mettre à jour' : 'Créer'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Location Dialog */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden p-0">
          <div className="p-6 overflow-y-auto space-y-4 max-h-[75vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Nouvel Emplacement
              </DialogTitle>
              <DialogDescription>
                Ajouter un emplacement pour {selectedPartnerForLocation?.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom de l'emplacement</label>
                <Input
                  value={locationFormData.name}
                  onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })}
                  placeholder="Ex: Magasin Centre-Ville"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Adresse</label>
                <Input
                  value={locationFormData.address}
                  onChange={(e) => setLocationFormData({ ...locationFormData, address: e.target.value })}
                  placeholder="123 Rue Example"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ville</label>
                <Input
                  value={locationFormData.city}
                  onChange={(e) => setLocationFormData({ ...locationFormData, city: e.target.value })}
                  placeholder="Casablanca"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Longitude</label>
                  <Input
                    type="number"
                    step="any"
                    value={locationFormData.coordinates[0]}
                    onChange={(e) => {
                      const lng = parseFloat(e.target.value) || 0;
                      setLocationFormData({
                        ...locationFormData,
                        coordinates: [lng, locationFormData.coordinates[1]]
                      });
                    }}
                    placeholder="-7.5898"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Latitude</label>
                  <Input
                    type="number"
                    step="any"
                    value={locationFormData.coordinates[1]}
                    onChange={(e) => {
                      const lat = parseFloat(e.target.value) || 0;
                      setLocationFormData({
                        ...locationFormData,
                        coordinates: [locationFormData.coordinates[0], lat]
                      });
                    }}
                    placeholder="33.5731"
                    required
                  />
                </div>
              </div>

              <div className="h-64 border rounded-md overflow-hidden">
                <MapContainer
                  center={[locationFormData.coordinates[1] || 0, locationFormData.coordinates[0] || 0]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  whenReady={(map) => {
                    map.target.on('click', (e) => {
                      const { lat, lng } = e.latlng;
                      setLocationFormData((prev) => ({
                        ...prev,
                        coordinates: [lng, lat],
                      }));
                      reverseGeocode(lat, lng);
                    });
                  }}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapCenterHandler center={[locationFormData.coordinates[1] || 0, locationFormData.coordinates[0] || 0]} />
                  <Marker position={[locationFormData.coordinates[1] || 0, locationFormData.coordinates[0] || 0]} icon={partnerIcon}>
                    <Popup>{locationFormData.name || 'Emplacement'}</Popup>
                  </Marker>
                </MapContainer>
              </div>
              <div className="text-xs text-gray-600">
                Adresse détectée: {locationFormData.address || '—'} {locationFormData.city ? `(${locationFormData.city})` : ''}
              </div>

              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Navigation className="h-3 w-3" />
                {userLocation ? (
                  <button
                    type="button"
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setLocationFormData({
                        ...locationFormData,
                        coordinates: [userLocation[1], userLocation[0]] // [lng, lat] for DB
                      });
                      reverseGeocode(userLocation[0], userLocation[1]);
                    }}
                  >
                    Utiliser ma position actuelle
                  </button>
                ) : (
                  'Activez la géolocalisation pour utiliser votre position'
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Téléphone (optionnel)</label>
                <Input
                  value={locationFormData.phone}
                  onChange={(e) => setLocationFormData({ ...locationFormData, phone: e.target.value })}
                  placeholder="+212 5XX XXX XXX"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={locationFormData.isActive}
                    onChange={(e) => setLocationFormData({ ...locationFormData, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Emplacement actif</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowLocationDialog(false);
                    setSelectedPartnerForLocation(null);
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter l'emplacement
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Statistiques partenaire</DialogTitle>
            <DialogDescription>
              Aperçu des redemptions pour {statsData?.partner?.name || '...'}
            </DialogDescription>
          </DialogHeader>
          {statsLoading ? (
            <div className="p-4 text-center text-gray-600">Chargement...</div>
          ) : statsData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">En attente</CardTitle>
                    <CardDescription>Redemptions</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {statsData.totals?.pending ?? 0}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Validées</CardTitle>
                    <CardDescription>Redemptions</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {statsData.totals?.fulfilled ?? 0}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Annulées</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {statsData.totals?.cancelled ?? 0}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {statsData.totals?.total ?? 0}
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Par catégorie</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {statsData.byCategory?.length ? statsData.byCategory.map((c) => (
                    <div key={c.category} className="border rounded-md p-3">
                      <div className="text-xs text-gray-500">{c.category}</div>
                      <div className="text-lg font-semibold">{c.count}</div>
                    </div>
                  )) : <p className="text-sm text-gray-500">Aucune donnée</p>}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Dernières redemptions</h4>
                <div className="rounded-md border max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Récompense</TableHead>
                        <TableHead>Utilisateur</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statsData.recent?.length ? statsData.recent.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.reward?.name || '—'}</TableCell>
                          <TableCell>{r.user?.displayName || '—'}</TableCell>
                          <TableCell><Badge>{r.status}</Badge></TableCell>
                          <TableCell>{r.createdAt ? formatDate(r.createdAt) : '—'}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-gray-500">
                            Aucune entrée
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatsDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
