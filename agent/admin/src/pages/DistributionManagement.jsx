import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { MapPin, RefreshCw, Zap, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeUpdates } from "../hooks/useRealtimeUpdates";
import {
  placePrize,
  autoDistribution,
  getDistributionAnalytics,
  getActiveDistributions,
  manageDistribution,
} from "../services/distribution";
import { TUNISIA_CITIES } from "../utils/geo";

export default function DistributionManagement() {
  const [analytics, setAnalytics] = useState(null);
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    prizeType: "mystery_box",
    points: 100,
    city: "Tunis",
    latitude: 36.8065,
    longitude: 10.1815,
    radius: 100,
    rarity: "rare",
    category: "special",
    title: "",
    description: ""
  });

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await getDistributionAnalytics("30d");
      setAnalytics(data);
      const activeResult = await getActiveDistributions();
      setActive(activeResult.items || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['prize_distributed', 'distribution_started', 'distribution_stopped', 'stats_update'],
    onMessage: (event) => {
      loadAnalytics();
      if (event === 'prize_distributed') {
        toast.info('Nouveau prix distribué');
      }
    }
  });

  const handlePlacePrize = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        location: {
          latitude: formData.latitude,
          longitude: formData.longitude,
          city: formData.city,
          radius: formData.radius,
        },
        prizeConfig: {
          title: formData.title || `Drop ${formData.city}`,
          description: formData.description || "Placement manuel",
          category: formData.category || "special",
          type: formData.prizeType || "treasure",
          rarity: formData.rarity || "rare",
          content: { points: formData.points },
        },
        distribution: {
          spawnRadius: formData.radius || 50,
          quantity: 1,
          maxClaims: 1,
          respawnInterval: 0,
          duration: 86400,
        },
        targeting: {},
        metadata: { source: "manual_form" },
      };
      await placePrize(payload);
      toast.success("Prix placé avec succès !");
      await loadAnalytics();
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const [autoDistConfirmOpen, setAutoDistConfirmOpen] = useState(false);

  const handleAutoDistClick = () => {
    setAutoDistConfirmOpen(true);
  };

  const handleAutoDistConfirm = async () => {
    setAutoDistConfirmOpen(false);
    try {
      setLoading(true);
      const radiusKm = (formData.radius || 100) / 1000;
      const prizesPerKm2 = 10 / (Math.PI * radiusKm * radiusKm);
      const payload = {
        region: {
          center: { latitude: formData.latitude, longitude: formData.longitude },
          radius: radiusKm,
        },
        density: {
          prizesPerKm2,
          minDistance: formData.radius ? formData.radius / 5 : 10,
          adaptToDensity: true,
        },
        prizeTemplate: {
          prizeConfig: {
            title: formData.title || `Auto ${formData.city}`,
            description: formData.description || "Distribution auto",
            category: formData.category || "special",
            type: formData.prizeType || "treasure",
            rarity: formData.rarity || "rare",
            content: { points: formData.points },
          },
          distribution: {
            spawnRadius: formData.radius || 50,
            quantity: 1,
            maxClaims: 1,
            respawnInterval: 0,
            duration: 86400,
          },
          targeting: {},
          metadata: { source: "auto_circle" },
        },
      };
      await autoDistribution(payload);
      toast.success("Distribution automatique lancée !");
      await loadAnalytics();
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Auto Distribution Confirm Dialog */}
      <ConfirmDialog
        open={autoDistConfirmOpen}
        onOpenChange={setAutoDistConfirmOpen}
        title="Lancer la distribution automatique"
        description="Êtes-vous sûr de vouloir lancer une distribution automatique sur le cercle sélectionné ?"
        confirmLabel="Lancer"
        variant="warning"
        onConfirm={handleAutoDistConfirm}
      />

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Distribution des Prix</h1>
        <Button variant="outline" onClick={loadAnalytics}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualiser
        </Button>
      </div>

      {analytics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Prix Actifs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.activePrizes || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Prix Réclamés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.claimedPrizes || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Taux de Réclamation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.claimRate || 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Zones Couvertes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.coveredZones || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {active && active.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distributions actives</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {active.map((d) => (
                <li key={d.distributionId} className="flex justify-between items-center gap-2">
                  <span className="font-mono text-xs">{d.distributionId}</span>
                  <span className="flex-1 text-right">{d.remaining} restant(s) • villes: {(d.cities || []).join(', ') || 'n/a'}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => manageDistribution(d.distributionId, 'pause')}
                    >
                      <Pause className="h-3 w-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => manageDistribution(d.distributionId, 'resume')}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => manageDistribution(d.distributionId, 'terminate')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Placement Manuel (cercle)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePlacePrize} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Titre</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Drop Tunis centre"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Placement manuel"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type de Prix</label>
                <select
                  value={formData.prizeType}
                  onChange={(e) => setFormData({ ...formData, prizeType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="mystery_box">Boîte Mystère</option>
                  <option value="points">Points</option>
                  <option value="reward">Récompense</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Points</label>
                  <Input
                    type="number"
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value || '0') })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rareté</label>
                  <select
                    value={formData.rarity}
                    onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="common">Common</option>
                    <option value="uncommon">Uncommon</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ville</label>
                <select
                  value={formData.city}
                  onChange={(e) => {
                    const city = TUNISIA_CITIES.find((c) => c.name === e.target.value);
                    setFormData({
                      ...formData,
                      city: e.target.value,
                      latitude: city.lat,
                      longitude: city.lng,
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {TUNISIA_CITIES.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Latitude</label>
                  <Input
                    type="number"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value || '0') })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Longitude</label>
                  <Input
                    type="number"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value || '0') })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rayon (m)</label>
                <Input
                  type="number"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value || '0') })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                <MapPin className="mr-2 h-4 w-4" />
                Placer le Prix
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribution Automatique (cercle)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleAutoDistClick} className="w-full" disabled={loading}>
              <Zap className="mr-2 h-4 w-4" />
              Lancer la distribution auto
            </Button>
            <p className="text-sm text-gray-500">
              Utilise le centre et le rayon sélectionnés pour générer plusieurs prix automatiquement.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

