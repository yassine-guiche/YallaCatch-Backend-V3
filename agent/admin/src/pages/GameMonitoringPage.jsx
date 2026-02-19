import React, { useState, useEffect, useCallback } from 'react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  Award,
  Battery,
  Clock,
  Cpu,
  Gamepad2,
  Gauge,
  MapPin,
  Play,
  RefreshCw,
  Settings,
  Shield,
  StopCircle,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import gameControlService from '@/services/gameControl';
import { toast } from 'sonner';

const GameMonitoringPage = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState({ active: false, message: '' });
  const [maintenanceModal, setMaintenanceModal] = useState({ open: false });
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const [terminateModal, setTerminateModal] = useState({ open: false, session: null });
  const [terminateReason, setTerminateReason] = useState('');

  const [realTimeStats, setRealTimeStats] = useState({
    activePlayers: 0,
    activeSessions: 0,
    claimsLastHour: 0,
    prizesDistributed: 0
  });

  const [activeSessions, setActiveSessions] = useState({ items: [], pagination: {} });
  const [leaderboard, setLeaderboard] = useState({ items: [] });
  const [leaderboardType, setLeaderboardType] = useState('points');
  const [dailyChallenges, setDailyChallenges] = useState({ items: [] });
  const [gameSettings, setGameSettings] = useState({});
  const [unityMetrics, setUnityMetrics] = useState({});
  const [historyStats, setHistoryStats] = useState([]);
  const [unityHistory, setUnityHistory] = useState([]);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['stats_update', 'user_active', 'game_session_start', 'game_session_end', 'capture_created'],
    onMessage: (event) => {
      fetchData();
      if (event === 'game_session_start') {
        toast.info('Nouvelle session de jeu démarrée');
      } else if (event === 'capture_created') {
        toast.info('Nouvelle capture effectuée');
      }
    }
  });

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        mStatus,
        rtStats,
        sessions,
        lb,
        challenges,
        settings,
        metrics
      ] = await Promise.all([
        gameControlService.getMaintenanceStatus(),
        gameControlService.getRealTimeStats(),
        gameControlService.getActiveSessions({ limit: 10 }),
        gameControlService.getLeaderboard({ type: leaderboardType, limit: 10 }),
        gameControlService.getDailyChallenges(),
        gameControlService.getGameSettings(),
        gameControlService.getUnityPerformanceReport()
      ]);

      setMaintenanceStatus(mStatus);
      if (mStatus.message) setMaintenanceMessage(mStatus.message);

      setRealTimeStats(rtStats);
      setActiveSessions(sessions);
      setLeaderboard(lb);
      setDailyChallenges(challenges);
      setGameSettings(settings);
      setUnityMetrics(metrics);

      // Fetch real history for charts
      const [historyUsers, historySessions] = await Promise.all([
        gameControlService.getMetricsHistory('business.users.active_count', '1h'),
        gameControlService.getMetricsHistory('game.sessions.active_count', '1h')
      ]);

      // Merge data for chart (align timestamps)
      // If no history exists yet (empty Redis), fallback to current stats as a single point
      let mergedHistory = [];
      if (historyUsers.length > 0 || historySessions.length > 0) {
        const timeMap = new Map();

        historyUsers.forEach(item => {
          const timeStr = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (!timeMap.has(timeStr)) timeMap.set(timeStr, { time: timeStr, players: 0, sessions: 0 });
          timeMap.get(timeStr).players = item.value;
        });

        historySessions.forEach(item => {
          const timeStr = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (!timeMap.has(timeStr)) timeMap.set(timeStr, { time: timeStr, players: 0, sessions: 0 });
          timeMap.get(timeStr).sessions = item.value;
        });

        mergedHistory = Array.from(timeMap.values()).sort((a, b) => a.time.localeCompare(b.time));
      } else {
        // Fallback for immediate display if no history yet
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        mergedHistory = [{ time: timeStr, players: rtStats.activePlayers || 0, sessions: rtStats.activeSessions || 0 }];
      }

      setHistoryStats(mergedHistory);

      // Fetch Unity specific history
      const [fpsHistory, latencyHistory] = await Promise.all([
        gameControlService.getMetricsHistory('game.performance.fps', '1h'),
        gameControlService.getMetricsHistory('game.performance.latency', '1h')
      ]);

      let mergedUnityHistory = [];
      if (fpsHistory.length > 0 || latencyHistory.length > 0) {
        const timeMap = new Map();

        fpsHistory.forEach(item => {
          const timeStr = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (!timeMap.has(timeStr)) timeMap.set(timeStr, { time: timeStr, fps: 0, latency: 0 });
          timeMap.get(timeStr).fps = item.value;
        });

        latencyHistory.forEach(item => {
          const timeStr = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (!timeMap.has(timeStr)) timeMap.set(timeStr, { time: timeStr, fps: 0, latency: 0 });
          timeMap.get(timeStr).latency = item.value;
        });

        mergedUnityHistory = Array.from(timeMap.values()).sort((a, b) => a.time.localeCompare(b.time));
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        mergedUnityHistory = [{ time: timeStr, fps: unityMetrics?.averageFrameRate || 60, latency: unityMetrics?.averageLatency || 45 }];
      }
      setUnityHistory(mergedUnityHistory);

    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
      toast.error('Erreur lors du chargement du tableau de bord');
    } finally {
      setRefreshing(false);
    }
  }, [leaderboardType]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => fetchData();

  const handleMaintenanceToggle = async () => {
    try {
      if (maintenanceStatus.active) {
        await gameControlService.stopMaintenance();
        toast.warning('Mode maintenance désactivé');
      } else {
        await gameControlService.startMaintenance(maintenanceMessage);
        toast.success('Mode maintenance activé');
      }
      setMaintenanceModal({ open: false });
      fetchData();
    } catch (error) {
      console.error('Maintenance toggle failed', error);
      toast.error('Erreur lors du changement de mode maintenance');
    }
  };

  const handleTerminateSession = async () => {
    if (!terminateModal.session) return;
    try {
      await gameControlService.forceEndSession(terminateModal.session._id, terminateReason);
      toast.success('Session terminée avec succès');
      setTerminateModal({ open: false, session: null });
      setTerminateReason('');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la terminaison de la session');
    }
  };

  const handleLeaderboardTypeChange = (value) => {
    setLeaderboardType(value);
  };

  return (
    <div className="space-y-6 p-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 tracking-tight">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Gamepad2 className="h-8 w-8 text-primary" />
            </div>
            Monitoring du Jeu
          </h1>
          <p className="text-muted-foreground mt-1">
            Contrôle en temps réel des sessions, classements et paramètres
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="hidden sm:flex"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button
            variant={maintenanceStatus.active ? 'destructive' : 'default'}
            className="shadow-md transition-all hover:scale-105"
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

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* LEFT COLUMN - Main Content (3/4) */}
        <div className="xl:col-span-3 space-y-6">

          {/* Maintenance Alert */}
          {maintenanceStatus.active && (
            <Card className="border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 backdrop-blur-sm animate-in slide-in-from-top-2">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-bold text-orange-800 dark:text-orange-300">
                    Mode Maintenance Actif
                  </p>
                  <p className="text-sm text-orange-700 dark:text-orange-400">
                    {maintenanceStatus.message || 'Le jeu est temporairement indisponible pour les joueurs.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Real-time Stats Cards - Premium Logic */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Joueurs Actifs</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-3xl font-bold">{realTimeStats?.activePlayers || 0}</p>
                      <span className="text-xs text-green-500 font-medium flex items-center">
                        <TrendingUp className="h-3 w-3 mr-1" /> + Live
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Sessions</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-3xl font-bold">{realTimeStats?.activeSessions || 0}</p>
                      <span className="text-xs text-muted-foreground font-medium flex items-center">
                        en cours
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <Gamepad2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Captures (1h)</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-3xl font-bold">{realTimeStats?.claimsLastHour || 0}</p>
                      <span className="text-xs text-purple-500 font-medium flex items-center">
                        <Zap className="h-3 w-3 mr-1" /> High
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                    <Target className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Prix Distribués</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-3xl font-bold">{realTimeStats?.prizesDistributed || 0}</p>
                      <span className="text-xs text-muted-foreground font-medium">total</span>
                    </div>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                    <Trophy className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto bg-background border p-1 h-auto gap-2 rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Activity className="h-4 w-4 mr-2" />
                Vue d'ensemble
              </TabsTrigger>
              <TabsTrigger value="sessions" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Gamepad2 className="h-4 w-4 mr-2" />
                Sessions
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Trophy className="h-4 w-4 mr-2" />
                Classement
              </TabsTrigger>
              <TabsTrigger value="challenges" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Target className="h-4 w-4 mr-2" />
                Défis
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Settings className="h-4 w-4 mr-2" />
                Paramètres
              </TabsTrigger>
              <TabsTrigger value="unity" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 shadow-none">
                <Cpu className="h-4 w-4 mr-2" />
                Unity Performance
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Activity Graph */}
                <Card className="lg:col-span-2 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Tendance d'Activité
                    </CardTitle>
                    <CardDescription>Joueurs et sessions actives (Dernières 20 min)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyStats}>
                        <defs>
                          <linearGradient id="colorPlayers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="players" name="Joueurs" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPlayers)" strokeWidth={2} />
                        <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#10b981" fillOpacity={1} fill="url(#colorSessions)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Recent Sessions */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-green-500" />
                        Sessions Récentes
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('sessions')}>Voir tout</Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                      <div className="divide-y">
                        {activeSessions.items.slice(0, 5).map((session, idx) => (
                          <div key={session._id || idx} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border-2 border-background">
                                <AvatarImage src={session.user?.avatar} />
                                <AvatarFallback>{session.user?.displayName?.substring(0, 2).toUpperCase() || 'P'}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{session.user?.displayName || session.username || 'Joueur'}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {session.city || session.initialLocation?.city || 'En ligne'}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-background">
                              {session.claimCount || 0} captures
                            </Badge>
                          </div>
                        ))}
                        {activeSessions.items.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                            <Gamepad2 className="h-8 w-8 mb-2 opacity-50" />
                            <p>Aucune session active</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Top Players */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        Classement du Jour
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('leaderboard')}>Voir tout</Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                      <div className="divide-y">
                        {leaderboard.items.slice(0, 5).map((player, idx) => (
                          <div key={player._id || idx} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-background ${idx === 0 ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' :
                                idx === 1 ? 'bg-slate-400 text-white' :
                                  idx === 2 ? 'bg-amber-600 text-white' :
                                    'bg-muted text-muted-foreground'
                                }`}>
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{player.username || player.name}</p>
                                <p className="text-xs text-muted-foreground">Niveau {player.level || 1}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-sm block">
                                {typeof player.points === 'object' ? (player.points?.total || player.points?.available || 0) : (player.points || player.score || 0)}
                              </span>
                              <span className="text-xs text-muted-foreground">pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Sessions Tab */}
            <TabsContent value="sessions" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Sessions Actives</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                      Actualiser
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Joueur</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Durée</TableHead>
                        <TableHead>Captures</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeSessions.items.map((session) => (
                        <TableRow key={session._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={session.user?.avatar} />
                                <AvatarFallback>{session.user?.displayName?.substring(0, 2).toUpperCase() || 'P'}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{session.user?.displayName || session.username}</p>
                                <p className="text-xs text-muted-foreground">{session.user?.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="flex items-center gap-1 w-fit font-normal">
                              <MapPin className="h-3 w-3" />
                              {session.city || 'Localisé'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 font-mono text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {session.duration || '0:00'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold">{session.claimCount || 0}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-green-600 font-bold">+{session.pointsEarned || 0}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="success" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse" />
                              Actif
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8"
                              onClick={() => setTerminateModal({ open: true, session })}
                            >
                              <StopCircle className="h-3 w-3 mr-1" />
                              Stop
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {activeSessions.items.length === 0 && (
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
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${idx === 0 ? 'bg-yellow-500 text-white' :
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
            <TabsContent value="unity" className="space-y-6 mt-6">
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* FPS & Latency Chart */}
                <Card className="lg:col-span-2 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-primary" />
                      Performance Temps Réel (Unity)
                    </CardTitle>
                    <CardDescription>
                      FPS et Latence des 20 dernières minutes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={unityHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="fps" name="FPS (Moy)" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="latency" name="Latence (ms)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

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
                      <div className="p-4 border rounded-lg bg-muted/20">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge className="bg-slate-900 text-white hover:bg-slate-800">iOS</Badge>
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
                      <div className="p-4 border rounded-lg bg-muted/20">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary" className="bg-green-600 text-white hover:bg-green-700">Android</Badge>
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
                  <StopCircle className="h-5 w-5 text-destructive" />
                  Terminer la Session
                </DialogTitle>
                <DialogDescription>
                  Cette action forcera la déconnexion du joueur. Êtes-vous sûr?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Raison (optionnel)</label>
                  <Textarea
                    value={terminateReason}
                    onChange={(e) => setTerminateReason(e.target.value)}
                    placeholder="ex: Comportement suspect, Maintenance..."
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTerminateModal({ open: false, session: null })}>
                  Annuler
                </Button>
                <Button variant="destructive" onClick={handleTerminateSession}>
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
      </div>
    </div>
  );
};

export default GameMonitoringPage;
