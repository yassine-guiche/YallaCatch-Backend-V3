import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { RefreshCw, Save, Settings as SettingsIcon } from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  getSettings,
  updateSettings,
  getProgressionSettings,
  updateProgressionSettings,
  getAntiCheatSettings,
  updateAntiCheatSettings,
  getGameSettings,
  updateGameSettings,
  getOfflineSettings,
  updateOfflineSettings,
  clearCache
} from '../services/settings';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [progression, setProgression] = useState({ levels: [] });
  const [antiCheat, setAntiCheat] = useState(null);
  const [game, setGame] = useState(null);
  const [offline, setOffline] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getSettings();
      const prog = await getProgressionSettings();
      const ac = await getAntiCheatSettings();
      const gm = await getGameSettings();
      const off = await getOfflineSettings();
      setSettings(data || {});
      setProgression(prog || { levels: [] });
      setAntiCheat(ac || {});
      setGame(gm || {});
      setOffline(off || {});
    } catch (err) {
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['settings_update'],
    onMessage: (event, data) => {
      loadSettings();
      toast.info('Paramètres mis à jour');
    }
  });

  const handleSave = async () => {
    try {
      await updateSettings(settings);
      toast.success('Paramètres généraux sauvegardés');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  };

  const handleSaveProgression = async () => {
    await updateProgressionSettings(progression);
    toast.success('Progression sauvegardée');
  };

  const handleSaveAntiCheat = async () => {
    await updateAntiCheatSettings(antiCheat);
    toast.success('Anti-cheat sauvegardé');
  };

  const handleSaveGame = async () => {
    await updateGameSettings(game);
    toast.success('Configuration jeu sauvegardée');
  };

  const handleSaveOffline = async () => {
    await updateOfflineSettings(offline);
    toast.success('Offline sauvegardé');
  };

  const handleClearCache = async () => {
    await clearCache();
    toast.success('Cache vidé');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSettings} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Sauvegarder
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Générale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom de l'Application</label>
            <Input
              value={settings.appName || 'YallaCatch!'}
              onChange={(e) => setSettings({...settings, appName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Points par Capture</label>
            <Input
              type="number"
              value={settings.pointsPerCapture || 10}
              onChange={(e) => setSettings({...settings, pointsPerCapture: parseInt(e.target.value)})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rayon de Détection (mètres)</label>
            <Input
              type="number"
              value={settings.detectionRadius || 50}
              onChange={(e) => setSettings({...settings, detectionRadius: parseInt(e.target.value)})}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Push</h3>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={settings?.notifications?.pushNotifications?.enabled ?? true}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...(settings.notifications || {}),
                      pushNotifications: {
                        ...(settings.notifications?.pushNotifications || {}),
                        enabled: e.target.checked,
                      }
                    }
                  })}
                />
                Activer les notifications push
              </label>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <label>Batch</label>
                  <Input
                    type="number"
                    value={settings?.notifications?.pushNotifications?.batchSize ?? 100}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        pushNotifications: {
                          ...(settings.notifications?.pushNotifications || {}),
                          batchSize: parseInt(e.target.value) || 0,
                        }
                      }
                    })}
                  />
                </div>
                <div>
                  <label>Retries</label>
                  <Input
                    type="number"
                    value={settings?.notifications?.pushNotifications?.retryAttempts ?? 3}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        pushNotifications: {
                          ...(settings.notifications?.pushNotifications || {}),
                          retryAttempts: parseInt(e.target.value) || 0,
                        }
                      }
                    })}
                  />
                </div>
                <div>
                  <label>Retry Delay (ms)</label>
                  <Input
                    type="number"
                    value={settings?.notifications?.pushNotifications?.retryDelayMs ?? 1000}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        pushNotifications: {
                          ...(settings.notifications?.pushNotifications || {}),
                          retryDelayMs: parseInt(e.target.value) || 0,
                        }
                      }
                    })}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Email</h3>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={settings?.notifications?.emailNotifications?.enabled ?? false}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...(settings.notifications || {}),
                      emailNotifications: {
                        ...(settings.notifications?.emailNotifications || {}),
                        enabled: e.target.checked,
                      }
                    }
                  })}
                />
                Activer les emails
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <label>From</label>
                  <Input
                    value={settings?.notifications?.emailNotifications?.fromAddress ?? ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        emailNotifications: {
                          ...(settings.notifications?.emailNotifications || {}),
                          fromAddress: e.target.value,
                        }
                      }
                    })}
                  />
                </div>
                <div>
                  <label>Reply-To</label>
                  <Input
                    value={settings?.notifications?.emailNotifications?.replyToAddress ?? ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        emailNotifications: {
                          ...(settings.notifications?.emailNotifications || {}),
                          replyToAddress: e.target.value,
                        }
                      }
                    })}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">SMS</h3>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  checked={settings?.notifications?.smsNotifications?.enabled ?? false}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...(settings.notifications || {}),
                      smsNotifications: {
                        ...(settings.notifications?.smsNotifications || {}),
                        enabled: e.target.checked,
                      }
                    }
                  })}
                />
                Activer les SMS
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <label>Provider</label>
                  <Input
                    value={settings?.notifications?.smsNotifications?.provider ?? ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        smsNotifications: {
                          ...(settings.notifications?.smsNotifications || {}),
                          provider: e.target.value,
                        }
                      }
                    })}
                  />
                </div>
                <div>
                  <label>Max Length</label>
                  <Input
                    type="number"
                    value={settings?.notifications?.smsNotifications?.maxLength ?? 160}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: {
                        ...(settings.notifications || {}),
                        smsNotifications: {
                          ...(settings.notifications?.smsNotifications || {}),
                          maxLength: parseInt(e.target.value) || 0,
                        }
                      }
                    })}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gestion des Partenaires</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Fonctionnalité en cours de développement. Les services backend sont prêts.</p>
        </CardContent>
      </Card>

      {/* Progression */}
      <Card>
        <CardHeader>
          <CardTitle>Progression (seuils de niveau)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(progression.levels || []).map((lvl, idx) => (
            <div className="grid grid-cols-2 gap-3" key={idx}>
              <Input
                value={lvl.name}
                onChange={(e) => {
                  const arr = [...(progression.levels || [])];
                  arr[idx] = { ...arr[idx], name: e.target.value };
                  setProgression({ ...progression, levels: arr });
                }}
                placeholder="Nom du niveau"
              />
              <Input
                type="number"
                value={lvl.threshold}
                onChange={(e) => {
                  const arr = [...(progression.levels || [])];
                  arr[idx] = { ...arr[idx], threshold: parseInt(e.target.value) || 0 };
                  setProgression({ ...progression, levels: arr });
                }}
                placeholder="Points requis"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => setProgression({
              ...progression,
              levels: [...(progression.levels || []), { name: 'nouveau', threshold: 0 }]
            })}>Ajouter un niveau</Button>
            <Button onClick={handleSaveProgression}>Sauvegarder progression</Button>
          </div>
        </CardContent>
      </Card>

      {/* Anti-cheat */}
      <Card>
        <CardHeader>
          <CardTitle>Anti-cheat capture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Captures/min</label>
              <Input type="number" value={antiCheat?.captureFrequencyPerMinute ?? 10}
                onChange={(e) => setAntiCheat({ ...antiCheat, captureFrequencyPerMinute: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-sm">Vitesse max (m/s)</label>
              <Input type="number" value={antiCheat?.maxSpeedMps ?? 50}
                onChange={(e) => setAntiCheat({ ...antiCheat, maxSpeedMps: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-sm">Score min</label>
              <Input type="number" step="0.01" value={antiCheat?.validationScoreFloor ?? 0.3}
                onChange={(e) => setAntiCheat({ ...antiCheat, validationScoreFloor: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-sm">Précision GPS max</label>
              <Input type="number" value={antiCheat?.gpsAccuracyThreshold ?? 50}
                onChange={(e) => setAntiCheat({ ...antiCheat, gpsAccuracyThreshold: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm">Pénalité changement device</label>
              <Input type="number" step="0.01" value={antiCheat?.penalties?.deviceChange ?? 0.1}
                onChange={(e) => setAntiCheat({
                  ...antiCheat,
                  penalties: { ...(antiCheat?.penalties || {}), deviceChange: parseFloat(e.target.value) || 0 }
                })} />
            </div>
            <div>
              <label className="text-sm">Pénalité tracking off</label>
              <Input type="number" step="0.01" value={antiCheat?.penalties?.trackingNotTracking ?? 0.2}
                onChange={(e) => setAntiCheat({
                  ...antiCheat,
                  penalties: { ...(antiCheat?.penalties || {}), trackingNotTracking: parseFloat(e.target.value) || 0 }
                })} />
            </div>
            <div>
              <label className="text-sm">Pénalité faible lumière</label>
              <Input type="number" step="0.01" value={antiCheat?.penalties?.lowLight ?? 0.1}
                onChange={(e) => setAntiCheat({
                  ...antiCheat,
                  penalties: { ...(antiCheat?.penalties || {}), lowLight: parseFloat(e.target.value) || 0 }
                })} />
            </div>
            <div>
              <label className="text-sm">Pénalité faible précision</label>
              <Input type="number" step="0.01" value={antiCheat?.penalties?.lowAccuracy ?? 0.1}
                onChange={(e) => setAntiCheat({
                  ...antiCheat,
                  penalties: { ...(antiCheat?.penalties || {}), lowAccuracy: parseFloat(e.target.value) || 0 }
                })} />
            </div>
          </div>
          <Button onClick={handleSaveAntiCheat}>Sauvegarder anti-cheat</Button>
        </CardContent>
      </Card>

      {/* Game tuning */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Jeu</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Rayon de capture (m)</label>
            <Input type="number" value={game?.claimRadiusMeters ?? 50}
              onChange={(e) => setGame({ ...game, claimRadiusMeters: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Captures max / jour</label>
            <Input type="number" value={game?.maxDailyClaims ?? 50}
              onChange={(e) => setGame({ ...game, maxDailyClaims: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Vitesse max (km/h)</label>
            <Input type="number" value={game?.speedLimitKmh ?? 120}
              onChange={(e) => setGame({ ...game, speedLimitKmh: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Cooldown (s)</label>
            <Input type="number" value={game?.cooldownSeconds ?? 60}
              onChange={(e) => setGame({ ...game, cooldownSeconds: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Multiplicateur de level-up</label>
            <Input type="number" step="0.1" value={game?.levelUpMultiplier ?? 1.5}
              onChange={(e) => setGame({ ...game, levelUpMultiplier: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="col-span-2">
            <Button onClick={handleSaveGame}>Sauvegarder config jeu</Button>
          </div>
        </CardContent>
      </Card>

      {/* Offline */}
      <Card>
        <CardHeader>
          <CardTitle>Offline</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Âge max file (minutes)</label>
            <Input type="number" value={offline?.maxQueueAgeMinutes ?? 1440}
              onChange={(e) => setOffline({ ...offline, maxQueueAgeMinutes: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Batch max</label>
            <Input type="number" value={offline?.maxBatchSize ?? 100}
              onChange={(e) => setOffline({ ...offline, maxBatchSize: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Retry max</label>
            <Input type="number" value={offline?.retryLimit ?? 5}
              onChange={(e) => setOffline({ ...offline, retryLimit: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm">Backoff (ms)</label>
            <Input type="number" value={offline?.retryBackoffMs ?? 2000}
              onChange={(e) => setOffline({ ...offline, retryBackoffMs: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="col-span-2">
            <Button onClick={handleSaveOffline}>Sauvegarder offline</Button>
          </div>
        </CardContent>
      </Card>

      {/* Ops */}
      <Card>
        <CardHeader>
          <CardTitle>Opérations</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" onClick={handleClearCache}>Vider le cache</Button>
        </CardContent>
      </Card>
    </div>
  );
}
