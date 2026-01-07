import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from 'sonner';
import { QrCode, MapPin, RefreshCw, BarChart2, Save, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getPartnerStats, updatePartnerLocation, getMyPartnerLocations } from '../services/redemptions-partner';
import PartnerRedemptions from './PartnerRedemptions';
import { formatDate } from '../utils/dates';

// Fix Leaflet default icon path in bundler context
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function PartnerPortal() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentLimit, setRecentLimit] = useState('5');
  const [locationForm, setLocationForm] = useState({
    locationId: '',
    name: '',
    address: '',
    city: '',
    lat: '',
    lng: '',
    phone: '',
    isActive: true,
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locations, setLocations] = useState([]);
  const [mapCenter, setMapCenter] = useState([33.5731, -7.5898]); // default Casablanca

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const data = await getPartnerStats({ limitRecent: Number(recentLimit) });
      setStats(data);
    } catch (err) {
      toast.error('Impossible de charger les stats partenaire', { description: err?.message });
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [recentLimit]);

  useEffect(() => {
    loadLocations();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setMapCenter([coords.latitude, coords.longitude]),
        () => {}
      );
    }
  }, []);

  const loadLocations = async () => {
    try {
      const data = await getMyPartnerLocations();
      setLocations(data);
      if (data?.length) {
        const first = data[0];
        if (first.coordinates?.length === 2) {
          setMapCenter([first.coordinates[1], first.coordinates[0]]);
        }
      }
    } catch (err) {
      toast.error('Impossible de charger les emplacements', { description: err?.message });
    }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locationForm.name || !locationForm.address || !locationForm.city) {
      toast.error('Nom, adresse et ville sont requis');
      return;
    }
    try {
      setSavingLocation(true);
      await updatePartnerLocation({
        ...locationForm,
        lat: parseFloat(locationForm.lat),
        lng: parseFloat(locationForm.lng),
      });
      toast.success('Emplacement sauvegardé');
      setLocationForm({
        locationId: '',
        name: '',
        address: '',
        city: '',
        lat: '',
        lng: '',
        phone: '',
        isActive: true,
      });
      loadStats();
      loadLocations();
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde', { description: err?.message });
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portail Partenaire</h1>
          <p className="text-gray-600">Suivi des validations, QR et emplacements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadStats} disabled={loadingStats}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingStats ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          <TabsTrigger value="locations">Emplacements</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Card className="min-w-[180px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">En attente</CardTitle>
                  <CardDescription>Redemptions</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {stats?.totals?.pending ?? '—'}
                </CardContent>
              </Card>
              <Card className="min-w-[180px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Validées</CardTitle>
                  <CardDescription>Redemptions</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {stats?.totals?.fulfilled ?? '—'}
                </CardContent>
              </Card>
              <Card className="min-w-[180px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                  <CardDescription>Toutes redemptions</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {stats?.totals?.total ?? '—'}
                </CardContent>
              </Card>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Derniers</span>
              <Select value={recentLimit} onValueChange={setRecentLimit}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4" />
                Par catégorie
              </CardTitle>
              <CardDescription>Répartition des redemptions par catégorie de récompense.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.byCategory?.length ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {stats.byCategory.map((c) => (
                    <div key={c.category} className="border rounded-md p-3">
                      <div className="text-sm text-gray-600">{c.category}</div>
                      <div className="text-xl font-semibold">{c.count}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Aucune donnée</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                Dernières redemptions
              </CardTitle>
              <CardDescription>Chronologie des dernières validations ou demandes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
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
                    {stats?.recent?.length ? (
                      stats.recent.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{r.reward?.name || '—'}</div>
                            <div className="text-xs text-gray-500">{r.reward?.category || ''}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{r.user?.displayName || '—'}</div>
                            <div className="text-xs text-gray-500">{r.user?.email || ''}</div>
                          </TableCell>
                          <TableCell>
                            <Badge>{r.status}</Badge>
                          </TableCell>
                          <TableCell>{r.createdAt ? formatDate(r.createdAt) : '—'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-500 py-4">
                          Aucune redemption récente
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redemptions">
          <PartnerRedemptions />
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nouvel emplacement / mise à jour</CardTitle>
              <CardDescription>Mettre à jour les coordonnées du point de vente pour les scans.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveLocation} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Nom" value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} required />
                <Input placeholder="Téléphone" value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} />
                <Input placeholder="Adresse" value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} required className="md:col-span-2" />
                <Input placeholder="Ville" value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} required />
                <Input placeholder="Latitude" value={locationForm.lat} onChange={(e) => setLocationForm({ ...locationForm, lat: e.target.value })} required />
                <Input placeholder="Longitude" value={locationForm.lng} onChange={(e) => setLocationForm({ ...locationForm, lng: e.target.value })} required />
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="submit" disabled={savingLocation}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingLocation ? 'Sauvegarde...' : 'Sauvegarder'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Emplacements existants
              </CardTitle>
              <CardDescription>Vos points visibles sur la carte.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                {locations?.length ? locations.map((loc) => (
                  <div key={loc._id} className="border rounded-md p-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{loc.name}</div>
                      <div className="text-sm text-gray-600">{loc.address}</div>
                      <div className="text-xs text-gray-500">{loc.city}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Navigation className="h-3 w-3" />
                        {loc.coordinates?.[1]?.toFixed(5)}, {loc.coordinates?.[0]?.toFixed(5)}
                      </div>
                      <div className="text-xs mt-1">
                        <Badge variant={loc.isActive ? 'default' : 'secondary'}>
                          {loc.isActive ? 'Actif' : 'Inactif'}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocationForm({
                        locationId: loc._id,
                        name: loc.name,
                        address: loc.address,
                        city: loc.city,
                        lat: loc.coordinates?.[1] ?? '',
                        lng: loc.coordinates?.[0] ?? '',
                        phone: loc.phone || '',
                        isActive: loc.isActive !== false,
                      })}
                    >
                      Modifier
                    </Button>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">Aucun emplacement défini.</p>
                )}
              </div>
              <div className="h-[320px] rounded-md overflow-hidden border">
                <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  {locations?.map((loc) => loc.coordinates?.length === 2 && (
                    <Marker key={loc._id} position={[loc.coordinates[1], loc.coordinates[0]]}>
                      <Popup>
                        <div className="font-semibold">{loc.name}</div>
                        <div className="text-sm">{loc.address}</div>
                        <div className="text-xs text-gray-500">{loc.city}</div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
