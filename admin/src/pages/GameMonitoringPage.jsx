/**
 * Game Monitoring Page
 * Real-time game control dashboard for admins
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Activity,
  Users,
  Gamepad2,
  Trophy,
  Target,
  Clock,
  MapPin,
  AlertTriangle,
  RefreshCw,
  StopCircle,
  Play,
  Settings,
  TrendingUp,
  Zap,
  Shield,
  Calendar,
  Award,
  Cpu,
  Gauge,
  Battery,
  Wifi,
} from 'lucide-react';

import gameControlService from '@/services/gameControl';

const GameMonitoringPage = () => {
  const { t } = useTranslation();
  
  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [realTimeStats, setRealTimeStats] = useState(null);
  const [activeSessions, setActiveSessions] = useState({ items: [], pagination: {} });
  const [leaderboard, setLeaderboard] = useState({ items: [], type: 'points' });
  const [dailyChallenges, setDailyChallenges] = useState({ items: [] });
  const [gameSettings, setGameSettings] = useState({});
  const [maintenanceStatus, setMaintenanceStatus] = useState({ active: false });
  const [unityMetrics, setUnityMetrics] = useState(null);
  
  // Modal states
  const [terminateModal, setTerminateModal] = useState({ open: false, session: null });
  const [maintenanceModal, setMaintenanceModal] = useState({ open: false });
  const [terminateReason, setTerminateReason] = useState('');
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  
  // Filters
  const [leaderboardType, setLeaderboardType] = useState('points');
  const [sessionFilter, setSessionFilter] = useState('');

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['capture_created', 'capture_update', 'stats_update', 'ar_session_started', 'ar_session_ended'],
    onMessage: (event, data) => {
      if (event === 'stats_update') {
        setRealTimeStats(prev => ({ ...prev, ...data.stats }));
      } else if (event === 'capture_created' || event === 'capture_update') {
        loadData();
      } else if (event.includes('ar_session')) {
        loadData();
      }
    }
  });

  // Load all data
  const loadData = useCallback(async () => {
    try {
      const [
        statsData,
        sessionsData,
        leaderboardData,
        challengesData,
        settingsData,
        maintenanceData,
        unityData,
      ] = await Promise.all([
        gameControlService.getRealTimeStats(),
        gameControlService.getActiveSessions(),
        gameControlService.getLeaderboard({ type: leaderboardType }),
        gameControlService.getDailyChallenges(),
        gameControlService.getGameSettings(),
        gameControlService.getMaintenanceStatus(),
        gameControlService.getUnityPerformanceReport(),
      ]);
      
      setRealTimeStats(statsData);
      setActiveSessions(sessionsData);
      setLeaderboard(leaderboardData);
      setDailyChallenges(challengesData);
      setGameSettings(settingsData);
      setMaintenanceStatus(maintenanceData);
      setUnityMetrics(unityData);
    } catch (error) {
      console.error('Error loading game data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [leaderboardType]);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success('Données actualisées');
  };

  // Terminate session
  const handleTerminateSession = async () => {
    if (!terminateModal.session) return;
    
    try {
      await gameControlService.forceEndSession(terminateModal.session._id, terminateReason);
      toast.success('Session terminée avec succès');
      setTerminateModal({ open: false, session: null });
      setTerminateReason('');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la terminaison');
    }
  };

  // Maintenance toggle
  const handleMaintenanceToggle = async () => {
    try {
      if (maintenanceStatus.active) {
        await gameControlService.stopMaintenance();
        toast.success('Maintenance désactivée');
      } else {
        await gameControlService.startMaintenance(maintenanceMessage);
        toast.success('Maintenance activée');
        setMaintenanceModal({ open: false });
      }
      loadData();
    } catch (error) {
      toast.error(error.message || 'Erreur de maintenance');
    }
  };

  // Leaderboard type change
  const handleLeaderboardTypeChange = async (type) => {
    setLeaderboardType(type);
    try {
      const data = await gameControlService.getLeaderboard({ type });
      setLeaderboard(data);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  // Filter sessions
  const filteredSessions = activeSessions.items.filter(session => {
    if (!sessionFilter) return true;
    const search = sessionFilter.toLowerCase();
    return (
      session.userId?.toLowerCase().includes(search) ||
      session.username?.toLowerCase().includes(search) ||
      session.city?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Chargement des données de jeu...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gamepad2 className="h-8 w-8" />
            Monitoring du Jeu
          </h1>
          <p className="text-muted-foreground">
            Contrôle en temps réel des sessions, classements et paramètres
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button
            variant={maintenanceStatus.active ? 'destructive' : 'secondary'}
            onClick={() => maintenanceStatus.active ? handleMaintenanceToggle() : setMaintenanceModal({ open: true })}
          >
            {maintenanceStatus.active ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                Arrêter Maintenance
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Mode Maintenance
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Maintenance Alert */}
      {maintenanceStatus.active && (
        <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            <div>
              <p className="font-medium text-orange-700 dark:text-orange-400">
                Mode Maintenance Actif
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-500">
                {maintenanceStatus.message || 'Le jeu est temporairement indisponible'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Joueurs Actifs</p>
                <p className="text-3xl font-bold">{realTimeStats?.activePlayers || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sessions Actives</p>
                <p className="text-3xl font-bold">{realTimeStats?.activeSessions || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Captures (1h)</p>
                <p className="text-3xl font-bold">{realTimeStats?.claimsLastHour || 0}</p>
              </div>
              <Target className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Prix Distribués</p>
                <p className="text-3xl font-bold">{realTimeStats?.prizesDistributed || 0}</p>
              </div>
              <Trophy className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Classement
          </TabsTrigger>
          <TabsTrigger value="challenges" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Défis
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Paramètres
          </TabsTrigger>
          <TabsTrigger value="unity" className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Unity Performance
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Sessions Récentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeSessions.items.slice(0, 5).map((session, idx) => (
                    <div key={session._id || idx} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <div>
                          <p className="font-medium">{session.user?.displayName || session.username || 'Joueur'}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.city || session.initialLocation?.city || 'En ligne'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {session.claimCount || 0} captures
                      </Badge>
                    </div>
                  ))}
                  {activeSessions.items.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      Aucune session active
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Players */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Top Joueurs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.items.slice(0, 5).map((player, idx) => (
                    <div key={player._id || idx} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-yellow-500 text-white' :
                          idx === 1 ? 'bg-gray-400 text-white' :
                          idx === 2 ? 'bg-amber-600 text-white' :
                          'bg-muted-foreground/20'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-medium">{player.username || player.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Niveau {player.level || 1}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {typeof player.points === 'object' ? (player.points?.total || player.points?.available || 0) : (typeof player.score === 'object' ? (player.score?.total || 0) : (player.points || player.score || 0))} pts
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Game Settings Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Paramètres Actuels
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Rayon de capture</p>
                    <p className="text-lg font-bold">{gameSettings.claimRadiusMeters || 50}m</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Captures max/jour</p>
                    <p className="text-lg font-bold">{gameSettings.maxDailyClaims || 50}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Limite vitesse</p>
                    <p className="text-lg font-bold">{gameSettings.speedLimitKmh || 30} km/h</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Cooldown</p>
                    <p className="text-lg font-bold">{gameSettings.cooldownSeconds || 60}s</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Challenges */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Défis Actifs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dailyChallenges.items.slice(0, 3).map((challenge, idx) => (
                    <div key={challenge._id || `challenge-${idx}`} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{challenge.title}</p>
                        <Badge>{typeof challenge.reward === 'object' ? (challenge.reward?.points || challenge.reward?.total || 0) : (challenge.reward || 0)} pts</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{challenge.description}</p>
                    </div>
                  ))}
                  {dailyChallenges.items.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      Aucun défi configuré
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Sessions de Jeu Actives</CardTitle>
                  <CardDescription>
                    {activeSessions.items.length} sessions en cours
                  </CardDescription>
                </div>
                <Input
                  placeholder="Filtrer par nom, ID ou ville..."
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className="w-64"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Joueur</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Captures</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => (
                    <TableRow key={session._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{session.user?.displayName || session.username || 'Anonyme'}</p>
                          <p className="text-xs text-muted-foreground">{session.user?.email || session.userId}</p>
                        </div>
                      </TableCell>
                      <TableCell>{session.city || session.initialLocation?.city || 'Localisé(e)'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {session.duration || '0:00'}
                        </div>
                      </TableCell>
                      <TableCell>{session.claimCount || 0}</TableCell>
                      <TableCell>{session.pointsEarned || 0}</TableCell>
                      <TableCell>
                        <Badge variant="success" className="bg-green-500/20 text-green-700">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                          Actif
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setTerminateModal({ open: true, session })}
                        >
                          <StopCircle className="h-4 w-4 mr-1" />
                          Terminer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Aucune session active trouvée
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Classement Global</CardTitle>
                <Select value={leaderboardType} onValueChange={handleLeaderboardTypeChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="points">Par Points</SelectItem>
                    <SelectItem value="claims">Par Captures</SelectItem>
                    <SelectItem value="level">Par Niveau</SelectItem>
                    <SelectItem value="distance">Par Distance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rang</TableHead>
                    <TableHead>Joueur</TableHead>
                    <TableHead>Niveau</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Captures</TableHead>
                    <TableHead>Distance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.items.map((player, idx) => (
                    <TableRow key={player._id || idx}>
                      <TableCell>
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                          idx === 0 ? 'bg-yellow-500 text-white' :
                          idx === 1 ? 'bg-gray-400 text-white' :
                          idx === 2 ? 'bg-amber-600 text-white' :
                          'bg-muted'
                        }`}>
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{player.username || player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Nv. {player.level || 1}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{typeof player.points === 'object' ? (player.points?.total || player.points?.available || 0) : (player.points || 0)}</TableCell>
                      <TableCell>{player.totalClaims || 0}</TableCell>
                      <TableCell>{player.totalDistance || 0} km</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Challenges Tab */}
        <TabsContent value="challenges">
          <Card>
            <CardHeader>
              <CardTitle>Défis Quotidiens</CardTitle>
              <CardDescription>
                Configurez les défis quotidiens pour les joueurs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dailyChallenges.items.map((challenge, idx) => (
                  <Card key={challenge._id || `challenge-card-${idx}`} className="border-2">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <Badge variant={challenge.active ? 'default' : 'secondary'}>
                          {challenge.type}
                        </Badge>
                        <Award className="h-5 w-5 text-yellow-500" />
                      </div>
                      <CardTitle className="text-lg">{challenge.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">
                        {challenge.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Objectif: {typeof challenge.target === 'object' ? JSON.stringify(challenge.target) : (challenge.target || 0)}</span>
                        <Badge variant="outline">{typeof challenge.reward === 'object' ? (challenge.reward?.points || challenge.reward?.total || 0) : (challenge.reward || 0)} pts</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {dailyChallenges.items.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    Aucun défi configuré
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" />
                  Paramètres de Jeu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Rayon de capture (mètres)</label>
                  <Input 
                    type="number" 
                    value={gameSettings.claimRadiusMeters || 50}
                    className="mt-1 bg-muted"
                    readOnly
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Captures max par jour</label>
                  <Input 
                    type="number" 
                    value={gameSettings.maxDailyClaims || 50}
                    className="mt-1 bg-muted"
                    readOnly
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Limite de vitesse (km/h)</label>
                  <Input 
                    type="number" 
                    value={gameSettings.speedLimitKmh || 30}
                    className="mt-1 bg-muted"
                    readOnly
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cooldown entre captures (secondes)</label>
                  <Input 
                    type="number" 
                    value={gameSettings.cooldownSeconds || 60}
                    className="mt-1 bg-muted"
                    readOnly
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Ces paramètres sont en lecture seule. Modifiez-les dans la page Paramètres.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.location.href = '/settings'}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Aller aux Paramètres
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Paramètres Anti-Triche
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Détection GPS Spoofing</p>
                    <p className="text-xs text-muted-foreground">Vérifie la cohérence GPS</p>
                  </div>
                  <Badge variant="success" className="bg-green-500">Actif</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Limite de Vitesse</p>
                    <p className="text-xs text-muted-foreground">Détecte les déplacements impossibles</p>
                  </div>
                  <Badge variant="success" className="bg-green-500">Actif</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Détection Multi-Compte</p>
                    <p className="text-xs text-muted-foreground">Vérifie les empreintes uniques</p>
                  </div>
                  <Badge variant="success" className="bg-green-500">Actif</Badge>
                </div>
                <Button variant="outline" className="w-full">
                  <Shield className="h-4 w-4 mr-2" />
                  Configurer Anti-Triche
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Unity Performance Tab */}
        <TabsContent value="unity" className="space-y-4">
          {/* Unity Performance Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">FPS Moyen</p>
                    <p className="text-3xl font-bold">{unityMetrics?.averageFrameRate?.toFixed(1) || '0'}</p>
                    <p className="text-xs text-muted-foreground">images/seconde</p>
                  </div>
                  <Gauge className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Latence Réseau</p>
                    <p className="text-3xl font-bold">{unityMetrics?.averageLatency?.toFixed(0) || '0'}</p>
                    <p className="text-xs text-muted-foreground">ms</p>
                  </div>
                  <Wifi className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Usage Batterie</p>
                    <p className="text-3xl font-bold">{unityMetrics?.averageBatteryUsage?.toFixed(1) || '0'}%</p>
                    <p className="text-xs text-muted-foreground">par heure</p>
                  </div>
                  <Battery className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taux de Crash</p>
                    <p className="text-3xl font-bold">{unityMetrics?.crashRate?.toFixed(2) || '0'}%</p>
                    <p className="text-xs text-muted-foreground">des sessions</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Session Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Métriques de Session
                </CardTitle>
                <CardDescription>Statistiques globales des sessions Unity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Sessions Totales</p>
                    <p className="text-xs text-muted-foreground">Dernières 24h</p>
                  </div>
                  <Badge variant="outline" className="text-lg font-bold">
                    {unityMetrics?.totalSessions || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Durée Moyenne</p>
                    <p className="text-xs text-muted-foreground">Par session</p>
                  </div>
                  <Badge variant="outline" className="text-lg font-bold">
                    {Math.round((unityMetrics?.averageSessionDuration || 0) / 60)} min
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Distance Moyenne</p>
                    <p className="text-xs text-muted-foreground">Par session</p>
                  </div>
                  <Badge variant="outline" className="text-lg font-bold">
                    {((unityMetrics?.averageDistance || 0) / 1000).toFixed(1)} km
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Crashes Totaux</p>
                    <p className="text-xs text-muted-foreground">Dernières 24h</p>
                  </div>
                  <Badge variant={unityMetrics?.totalCrashes > 10 ? 'destructive' : 'outline'} className="text-lg font-bold">
                    {unityMetrics?.totalCrashes || 0}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Performance by Platform */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Performance par Plateforme
                </CardTitle>
                <CardDescription>Comparaison iOS vs Android</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* iOS */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge>iOS</Badge>
                      <span className="text-sm text-muted-foreground">Apple Devices</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">FPS Moyen</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.ios?.fps?.toFixed(1) || '60'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Latence</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.ios?.latency?.toFixed(0) || '45'} ms</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Batterie</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.ios?.battery?.toFixed(1) || '12'}%/h</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Crashes</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.ios?.crashes || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Android */}
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary">Android</Badge>
                      <span className="text-sm text-muted-foreground">Google Devices</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">FPS Moyen</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.android?.fps?.toFixed(1) || '55'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Latence</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.android?.latency?.toFixed(0) || '60'} ms</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Batterie</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.android?.battery?.toFixed(1) || '15'}%/h</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Crashes</p>
                        <p className="font-bold">{unityMetrics?.performanceByPlatform?.android?.crashes || 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Alertes de Performance
              </CardTitle>
              <CardDescription>Problèmes détectés nécessitant une attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(unityMetrics?.averageFrameRate || 60) < 30 && (
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-400">FPS Bas Détecté</p>
                      <p className="text-sm text-red-600 dark:text-red-500">Le framerate moyen est inférieur à 30 FPS. Vérifiez les performances du jeu.</p>
                    </div>
                  </div>
                )}
                {(unityMetrics?.averageLatency || 0) > 200 && (
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <Wifi className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">Latence Élevée</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-500">La latence réseau moyenne dépasse 200ms. Vérifiez les serveurs.</p>
                    </div>
                  </div>
                )}
                {(unityMetrics?.crashRate || 0) > 5 && (
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-400">Taux de Crash Élevé</p>
                      <p className="text-sm text-red-600 dark:text-red-500">Plus de 5% des sessions se terminent par un crash. Investigation requise.</p>
                    </div>
                  </div>
                )}
                {(unityMetrics?.averageFrameRate || 60) >= 30 && (unityMetrics?.averageLatency || 0) <= 200 && (unityMetrics?.crashRate || 0) <= 5 && (
                  <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <Shield className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">Tout va bien!</p>
                      <p className="text-sm text-green-600 dark:text-green-500">Aucune alerte de performance. Le jeu fonctionne correctement.</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Terminate Session Modal */}
      <Dialog open={terminateModal.open} onOpenChange={(open) => setTerminateModal({ open, session: terminateModal.session })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Terminer la Session
            </DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de terminer la session de {terminateModal.session?.username || 'ce joueur'}.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Raison de la terminaison</label>
              <Textarea
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                placeholder="Entrez la raison..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateModal({ open: false, session: null })}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleTerminateSession}>
              <StopCircle className="h-4 w-4 mr-2" />
              Terminer la Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance Modal */}
      <Dialog open={maintenanceModal.open} onOpenChange={(open) => setMaintenanceModal({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Activer le Mode Maintenance
            </DialogTitle>
            <DialogDescription>
              Le jeu sera temporairement indisponible pour tous les joueurs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message pour les joueurs</label>
              <Textarea
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="ex: Maintenance en cours, retour prévu à 15h00..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceModal({ open: false })}>
              Annuler
            </Button>
            <Button onClick={handleMaintenanceToggle}>
              <Settings className="h-4 w-4 mr-2" />
              Activer Maintenance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GameMonitoringPage;
