import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { 
  RefreshCw, Server, Database, HardDrive, Cpu, Download, AlertTriangle,
  Smartphone, Wifi, WifiOff, Trash2, Clock, User, Apple, MonitorSmartphone
} from 'lucide-react';
import { toast } from 'sonner';
import { getSystemHealth, getSystemMetrics, createBackup, startMaintenance, stopMaintenance } from '../services/system';
import { getOfflineQueue, clearResolvedQueue } from '../services/offlineQueue';
import { getDeviceTokens, getDeviceTokenStats, revokeDeviceToken } from '../services/deviceTokens';

export default function SystemManagement() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  
  // Offline Queue State
  const [offlineQueue, setOfflineQueue] = useState({ items: [], total: 0 });
  const [offlineFilter, setOfflineFilter] = useState('');
  const [offlinePage, setOfflinePage] = useState(1);
  
  // Device Tokens State
  const [deviceTokens, setDeviceTokens] = useState({ tokens: [], total: 0 });
  const [tokenStats, setTokenStats] = useState({ total: 0, byPlatform: [] });
  const [platformFilter, setPlatformFilter] = useState('');
  const [tokenPage, setTokenPage] = useState(1);

  // Confirm dialog states
  const [backupConfirmOpen, setBackupConfirmOpen] = useState(false);
  const [clearQueueConfirmOpen, setClearQueueConfirmOpen] = useState(false);
  const [revokeTokenConfirmOpen, setRevokeTokenConfirmOpen] = useState(false);
  const [pendingRevokeTokenId, setPendingRevokeTokenId] = useState(null);

  const loadSystemData = async () => {
    try {
      setLoading(true);
      const [healthData, metricsData] = await Promise.all([
        getSystemHealth(),
        getSystemMetrics()
      ]);
      setHealth(healthData || {});
      setMetrics(metricsData || {});
      setMaintenance(healthData?.maintenance || false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineQueue = async () => {
    try {
      const params = { page: offlinePage, limit: 20 };
      if (offlineFilter) params.status = offlineFilter;
      const data = await getOfflineQueue(params);
      setOfflineQueue(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDeviceTokens = async () => {
    try {
      const params = { page: tokenPage, limit: 20 };
      if (platformFilter) params.platform = platformFilter;
      const [tokensData, statsData] = await Promise.all([
        getDeviceTokens(params),
        getDeviceTokenStats()
      ]);
      setDeviceTokens(tokensData);
      setTokenStats(statsData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSystemData();
    loadOfflineQueue();
    loadDeviceTokens();
    const interval = setInterval(loadSystemData, 30000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['stats_update', 'maintenance_started', 'maintenance_stopped', 'system_alert'],
    onMessage: (event, data) => {
      if (event === 'stats_update' && data.stats) {
        setMetrics(prev => ({ ...prev, ...data.stats }));
      } else if (event.includes('maintenance')) {
        loadSystemData();
      } else if (event === 'system_alert') {
        toast.warning('Alerte système: ' + (data.message || 'Vérifier les métriques'));
      }
    }
  });

  useEffect(() => {
    loadOfflineQueue();
  }, [offlinePage, offlineFilter]);

  useEffect(() => {
    loadDeviceTokens();
  }, [tokenPage, platformFilter]);

  const handleBackupClick = () => {
    setBackupConfirmOpen(true);
  };

  const handleBackupConfirm = async () => {
    try {
      setLoading(true);
      await createBackup();
      toast.success('Backup créé avec succès !');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setLoading(false);
      setBackupConfirmOpen(false);
    }
  };

  const handleMaintenance = async () => {
    try {
      setLoading(true);
      if (maintenance) {
        await stopMaintenance();
        toast.success('Mode maintenance désactivé');
      } else {
        await startMaintenance('Maintenance planifiée');
        toast.success('Mode maintenance activé');
      }
      await loadSystemData();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearResolvedQueueClick = () => {
    setClearQueueConfirmOpen(true);
  };

  const handleClearResolvedQueueConfirm = async () => {
    try {
      const result = await clearResolvedQueue();
      toast.success(`${result.deleted || 0} éléments supprimés`);
      loadOfflineQueue();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setClearQueueConfirmOpen(false);
    }
  };

  const handleRevokeTokenClick = (tokenId) => {
    setPendingRevokeTokenId(tokenId);
    setRevokeTokenConfirmOpen(true);
  };

  const handleRevokeTokenConfirm = async () => {
    if (!pendingRevokeTokenId) return;
    try {
      await revokeDeviceToken(pendingRevokeTokenId);
      toast.success('Token révoqué');
      loadDeviceTokens();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setRevokeTokenConfirmOpen(false);
      setPendingRevokeTokenId(null);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      healthy: 'bg-green-500',
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
      pending: 'bg-blue-500',
      resolved: 'bg-green-500',
      failed: 'bg-red-500'
    };
    return <Badge className={variants[status] || 'bg-gray-500'}>{status}</Badge>;
  };

  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'ios': return <Apple className="h-4 w-4" />;
      case 'android': return <MonitorSmartphone className="h-4 w-4" />;
      default: return <Smartphone className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={backupConfirmOpen}
        onOpenChange={setBackupConfirmOpen}
        title="Créer un backup"
        description="Êtes-vous sûr de vouloir créer un backup complet du système ?"
        confirmLabel="Créer backup"
        variant="default"
        onConfirm={handleBackupConfirm}
      />
      <ConfirmDialog
        open={clearQueueConfirmOpen}
        onOpenChange={setClearQueueConfirmOpen}
        title="Vider la file d'attente"
        description="Supprimer tous les éléments résolus de la file d'attente hors ligne ?"
        confirmLabel="Supprimer"
        variant="warning"
        onConfirm={handleClearResolvedQueueConfirm}
      />
      <ConfirmDialog
        open={revokeTokenConfirmOpen}
        onOpenChange={setRevokeTokenConfirmOpen}
        title="Révoquer le token"
        description="Êtes-vous sûr de vouloir révoquer ce token de notification ? L'appareil ne recevra plus de notifications."
        confirmLabel="Révoquer"
        variant="danger"
        onConfirm={handleRevokeTokenConfirm}
      />

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gestion Système</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSystemData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" onClick={handleBackupClick} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Backup
          </Button>
          <Button
            variant={maintenance ? 'destructive' : 'default'}
            onClick={handleMaintenance}
            disabled={loading}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            {maintenance ? 'Désactiver' : 'Activer'} Maintenance
          </Button>
        </div>
      </div>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList>
          <TabsTrigger value="health">
            <Server className="h-4 w-4 mr-2" />
            Santé Système
          </TabsTrigger>
          <TabsTrigger value="offline-queue">
            <WifiOff className="h-4 w-4 mr-2" />
            File Hors Ligne ({offlineQueue.total})
          </TabsTrigger>
          <TabsTrigger value="device-tokens">
            <Smartphone className="h-4 w-4 mr-2" />
            Tokens Push ({tokenStats.total})
          </TabsTrigger>
        </TabsList>

        {/* Health Tab */}
        <TabsContent value="health" className="space-y-4">
          {health && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">API</CardTitle>
                  <Server className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  {getStatusBadge(health.api?.status || 'unknown')}
                  <p className="text-xs text-gray-500 mt-2">
                    Uptime: {health.api?.uptime || 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">MongoDB</CardTitle>
                  <Database className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  {getStatusBadge(health.mongodb?.status || 'unknown')}
                  <p className="text-xs text-gray-500 mt-2">
                    Connexions: {health.mongodb?.connections || 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Redis</CardTitle>
                  <HardDrive className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  {getStatusBadge(health.redis?.status || 'unknown')}
                  <p className="text-xs text-gray-500 mt-2">
                    Mémoire: {health.redis?.memory || 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">CPU</CardTitle>
                  <Cpu className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics?.cpu?.usage || 0}%</div>
                  <p className="text-xs text-gray-500 mt-2">
                    Cores: {metrics?.cpu?.cores || 0}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {metrics && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Mémoire</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Utilisée</span>
                      <span className="font-medium">{metrics.memory?.used || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Total</span>
                      <span className="font-medium">{metrics.memory?.total || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pourcentage</span>
                      <span className="font-medium">{metrics.memory?.percentage || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Disque</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Utilisé</span>
                      <span className="font-medium">{metrics.disk?.used || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Total</span>
                      <span className="font-medium">{metrics.disk?.total || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pourcentage</span>
                      <span className="font-medium">{metrics.disk?.percentage || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Réseau</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Entrant</span>
                      <span className="font-medium">{metrics.network?.inbound || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Sortant</span>
                      <span className="font-medium">{metrics.network?.outbound || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Latence</span>
                      <span className="font-medium">{metrics.network?.latency || 0}ms</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Offline Queue Tab */}
        <TabsContent value="offline-queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <WifiOff className="h-5 w-5" />
                  File d'attente Hors Ligne
                </CardTitle>
                <div className="flex gap-2">
                  <select
                    className="border rounded px-3 py-1.5 text-sm"
                    value={offlineFilter}
                    onChange={(e) => { setOfflineFilter(e.target.value); setOfflinePage(1); }}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="pending">En attente</option>
                    <option value="processing">En cours</option>
                    <option value="resolved">Résolus</option>
                    <option value="failed">Échoués</option>
                  </select>
                  <Button variant="outline" onClick={loadOfflineQueue}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Actualiser
                  </Button>
                  <Button variant="destructive" onClick={handleClearResolvedQueueClick}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Vider Résolus
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {offlineQueue.items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wifi className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun élément dans la file d'attente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {offlineQueue.items.map((item, index) => (
                    <div key={item._id || index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="bg-gray-100 p-2 rounded">
                          <Clock className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <div className="font-medium">{item.action || item.type || 'Action'}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {item.userId?.email || item.userId?.username || item.userId || 'Unknown User'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(item.status || 'pending')}
                        {item.retryCount > 0 && (
                          <span className="text-xs text-gray-500">
                            Tentatives: {item.retryCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {offlineQueue.total > 20 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offlinePage === 1}
                    onClick={() => setOfflinePage(p => p - 1)}
                  >
                    Précédent
                  </Button>
                  <span className="px-4 py-2 text-sm">
                    Page {offlinePage} / {Math.ceil(offlineQueue.total / 20)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offlinePage >= Math.ceil(offlineQueue.total / 20)}
                    onClick={() => setOfflinePage(p => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Device Tokens Tab */}
        <TabsContent value="device-tokens" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tokenStats.total}</div>
              </CardContent>
            </Card>
            {tokenStats.byPlatform.map((stat, index) => (
              <Card key={stat._id || index}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium capitalize">{stat._id || 'Unknown'}</CardTitle>
                  {getPlatformIcon(stat._id)}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.count}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Tokens de Notification Push
                </CardTitle>
                <div className="flex gap-2">
                  <select
                    className="border rounded px-3 py-1.5 text-sm"
                    value={platformFilter}
                    onChange={(e) => { setPlatformFilter(e.target.value); setTokenPage(1); }}
                  >
                    <option value="">Toutes les plateformes</option>
                    <option value="ios">iOS</option>
                    <option value="android">Android</option>
                    <option value="web">Web</option>
                  </select>
                  <Button variant="outline" onClick={loadDeviceTokens}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Actualiser
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {deviceTokens.tokens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun token de notification enregistré</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deviceTokens.tokens.map((token, index) => (
                    <div key={token._id || index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="bg-gray-100 p-2 rounded">
                          {getPlatformIcon(token.platform)}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <span className="capitalize">{token.platform || 'Unknown'}</span>
                            <Badge variant="outline" className="text-xs">
                              {token.token?.slice(0, 20)}...
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {token.userId?.email || token.userId?.username || token.userId || 'Unknown User'}
                          </div>
                          <div className="text-xs text-gray-400">
                            Enregistré: {token.createdAt ? new Date(token.createdAt).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleRevokeTokenClick(token._id)}
                        aria-label="Révoquer le token"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {deviceTokens.total > 20 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tokenPage === 1}
                    onClick={() => setTokenPage(p => p - 1)}
                  >
                    Précédent
                  </Button>
                  <span className="px-4 py-2 text-sm">
                    Page {tokenPage} / {Math.ceil(deviceTokens.total / 20)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tokenPage >= Math.ceil(deviceTokens.total / 20)}
                    onClick={() => setTokenPage(p => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
