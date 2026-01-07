import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Users, 
  Trophy, 
  CreditCard, 
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  ClipboardList,
  Zap,
  MapPin,
  Clock,
  Target,
  Gift,
  ShoppingBag,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { getDashboardStats, getRecentActivity, getSystemHealth } from '../services/dashboard';
import ActivityLogDialog from '../components/ActivityLogDialog';
import { formatDate, formatRelativeDate } from '../utils/dates';
import { toast } from 'sonner';
import wsService from '../services/websocket';

// Color palette for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Stat Card with trend indicator
function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'blue', loading }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    pink: 'bg-pink-50 text-pink-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 bg-gray-200 animate-pulse rounded w-24"></div>
        ) : (
          <>
            <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              {trend && (
                <div className={`flex items-center text-xs ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span>{trendValue}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Live Activity Feed Component
function LiveActivityFeed({ activities, wsConnected }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activite en Direct
            </CardTitle>
            <CardDescription>Dernieres actions sur la plateforme</CardDescription>
          </div>
          <Badge variant={wsConnected ? 'default' : 'secondary'} className="flex items-center gap-1">
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? 'Live' : 'Polling'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
          {activities && activities.length > 0 ? (
            activities.map((item, index) => (
              <div 
                key={item._id || index} 
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                  item.success !== false ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.action || item.message || 'Action'}
                    </p>
                    {item.category && (
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.description || item.resource || ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatRelativeDate(item.createdAt || item.timestamp)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-12">
              <Activity className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p>Aucune activite recente</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// System Health Component
function SystemHealth({ health, loading }) {
  const statusColors = {
    healthy: 'text-green-600 bg-green-100',
    degraded: 'text-yellow-600 bg-yellow-100',
    error: 'text-red-600 bg-red-100',
    unknown: 'text-gray-600 bg-gray-100',
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          Etat du Systeme
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-6 bg-gray-200 animate-pulse rounded"></div>
            <div className="h-6 bg-gray-200 animate-pulse rounded w-3/4"></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status</span>
              <Badge className={statusColors[health?.status || 'unknown']}>
                {health?.status === 'healthy' ? (
                  <CheckCircle className="h-3 w-3 mr-1" />
                ) : (
                  <AlertCircle className="h-3 w-3 mr-1" />
                )}
                {health?.status || 'Inconnu'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Uptime</span>
              <span className="text-sm font-medium">{formatUptime(health?.uptime)}</span>
            </div>
            {health?.services && Object.entries(health.services).map(([service, status]) => (
              <div key={service} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{service}</span>
                <div className={`w-2 h-2 rounded-full ${status ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  // Load dashboard data
  const loadDashboard = useCallback(async (showToast = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const [dashboardStats, recentActivity, systemHealth] = await Promise.all([
        getDashboardStats(selectedPeriod),
        getRecentActivity(15),
        getSystemHealth(),
      ]);
      
      setStats(dashboardStats);
      setActivity(recentActivity);
      setHealth(systemHealth);
      setLastUpdate(new Date());
      
      if (showToast) {
        toast.success('Dashboard actualise');
      }
    } catch (err) {
      console.error('Erreur chargement dashboard:', err);
      setError(err.message);
      if (showToast) {
        toast.error('Erreur lors de l actualisation');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  // WebSocket setup for real-time updates
  useEffect(() => {
    loadDashboard();
    
    // Setup WebSocket listeners
    const handleStatsUpdate = (data) => {
      console.log('Stats update received:', data);
      if (data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
      setLastUpdate(new Date());
    };

    const handleCaptureCreated = (data) => {
      console.log('Capture created:', data);
      setActivity(prev => [
        { 
          action: 'Nouvelle capture', 
          description: data.prize?.name || 'Prix capture',
          createdAt: new Date(),
          success: true,
          category: 'capture'
        },
        ...prev.slice(0, 14)
      ]);
      setStats(prev => prev ? {
        ...prev,
        captures: {
          ...prev.captures,
          total: (prev.captures?.total || 0) + 1,
          today: (prev.captures?.today || 0) + 1,
        }
      } : prev);
    };

    const handleRedemptionCreated = (data) => {
      console.log('Redemption created:', data);
      setActivity(prev => [
        { 
          action: 'Nouvelle redemption', 
          description: data.reward?.name || 'Recompense echangee',
          createdAt: new Date(),
          success: true,
          category: 'redemption'
        },
        ...prev.slice(0, 14)
      ]);
    };

    const handleUserUpdate = (data) => {
      console.log('User update:', data);
      if (data.type === 'new_user') {
        setStats(prev => prev ? {
          ...prev,
          users: {
            ...prev.users,
            total: (prev.users?.total || 0) + 1,
            new: (prev.users?.new || 0) + 1,
          }
        } : prev);
      }
    };

    const handleConnectionStatus = (data) => {
      setWsConnected(data.connected);
      if (data.connected) {
        console.log('WebSocket connected to dashboard');
        wsService.subscribeToDashboard();
      }
    };

    // Register WebSocket listeners
    const unsubStats = wsService.on('stats_update', handleStatsUpdate);
    const unsubCapture = wsService.on('capture_created', handleCaptureCreated);
    const unsubRedemption = wsService.on('redemption_created', handleRedemptionCreated);
    const unsubUser = wsService.on('user_update', handleUserUpdate);
    const unsubConnection = wsService.on('connection_status', handleConnectionStatus);

    // Subscribe to dashboard updates
    if (wsService.isConnected()) {
      setWsConnected(true);
      wsService.subscribeToDashboard();
    }

    // Fallback polling if WebSocket not available
    const pollInterval = setInterval(() => {
      if (!wsService.isConnected()) {
        loadDashboard();
      }
    }, 60000);

    return () => {
      unsubStats();
      unsubCapture();
      unsubRedemption();
      unsubUser();
      unsubConnection();
      if (wsService.isConnected()) {
        wsService.unsubscribeFromDashboard();
      }
      clearInterval(pollInterval);
    };
  }, [loadDashboard]);

  // Reload on period change
  useEffect(() => {
    loadDashboard();
  }, [selectedPeriod, loadDashboard]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!stats?.dailyActivity) return [];
    return stats.dailyActivity.map(day => ({
      ...day,
      date: new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
    }));
  }, [stats?.dailyActivity]);

  // Category distribution for pie chart
  const categoryData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Captures', value: stats.captures?.total || 0 },
      { name: 'Redemptions', value: stats.redemptions?.total || 0 },
      { name: 'Marketplace', value: stats.purchases?.total || 0 },
    ].filter(item => item.value > 0);
  }, [stats]);

  // Extract stats with defaults
  const userStats = stats?.users || { total: 0, active: 0, new: 0, online: 0 };
  const prizeStats = stats?.prizes || { total: 0, active: 0, captured: 0 };
  const captureStats = stats?.captures || { total: 0, today: 0 };
  const rewardStats = stats?.rewards || { total: 0, active: 0 };
  const redemptionStats = stats?.redemptions || { total: 0, core: 0, marketplace: 0 };
  const purchaseStats = stats?.purchases || { total: 0, unredeemed: 0, redeemed: 0 };

  if (error && !stats) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Erreur de chargement
            </CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => loadDashboard(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            Vue d ensemble de YallaCatch!
            {lastUpdate && (
              <span className="text-xs text-gray-400">
                - Mis a jour {formatRelativeDate(lastUpdate)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="1d">Aujourd hui</option>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="90d">90 jours</option>
          </select>
          
          <Badge variant={wsConnected ? 'default' : 'outline'} className="hidden sm:flex items-center gap-1">
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? 'Temps reel' : 'Hors ligne'}
          </Badge>
          
          <Button onClick={() => loadDashboard(true)} disabled={loading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Utilisateurs Total"
          value={userStats.total}
          subtitle={`${userStats.active} actifs - ${userStats.new} nouveaux`}
          icon={Users}
          color="blue"
          trend={userStats.new > 0 ? 'up' : undefined}
          trendValue={userStats.new > 0 ? `+${userStats.new}` : undefined}
          loading={loading && !stats}
        />
        <StatCard
          title="Prix Distribues"
          value={prizeStats.total}
          subtitle={`${prizeStats.active} actifs - ${prizeStats.captured} capturés`}
          icon={Trophy}
          color="orange"
          loading={loading && !stats}
        />
        <StatCard
          title="Captures"
          value={captureStats.total}
          subtitle={`${captureStats.today} aujourd hui`}
          icon={Target}
          color="green"
          trend={captureStats.today > 0 ? 'up' : undefined}
          trendValue={captureStats.today > 0 ? `+${captureStats.today}` : undefined}
          loading={loading && !stats}
        />
        <StatCard
          title="Recompenses"
          value={rewardStats.total}
          subtitle={`${rewardStats.active} actives`}
          icon={Gift}
          color="purple"
          loading={loading && !stats}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Redemptions Core"
          value={redemptionStats.core || 0}
          subtitle="Echanges directs"
          icon={Zap}
          color="pink"
          loading={loading && !stats}
        />
        <StatCard
          title="Achats Marketplace"
          value={purchaseStats.total || 0}
          subtitle={`${purchaseStats.unredeemed || 0} en attente`}
          icon={ShoppingBag}
          color="green"
          loading={loading && !stats}
        />
        <StatCard
          title="Redemptions Total"
          value={redemptionStats.total || 0}
          subtitle={`Core: ${redemptionStats.core || 0} - MP: ${redemptionStats.marketplace || 0}`}
          icon={ClipboardList}
          color="blue"
          loading={loading && !stats}
        />
        <StatCard
          title="Taux de Conversion"
          value={userStats.total > 0 ? `${Math.round((captureStats.total / userStats.total) * 100)}%` : '0%'}
          subtitle="Captures / Utilisateurs"
          icon={TrendingUp}
          color="orange"
          loading={loading && !stats}
        />
      </div>

      {/* Charts and Activity Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Activite sur {selectedPeriod === '1d' ? 'les dernieres 24h' : `les ${selectedPeriod.replace('d', '')} derniers jours`}
                </CardTitle>
                <CardDescription>Evolution des captures et redemptions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCaptures" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRedemptions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="captures" 
                    stroke="#3b82f6" 
                    fillOpacity={1}
                    fill="url(#colorCaptures)"
                    strokeWidth={2}
                    name="Captures"
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="redemptions" 
                    stroke="#10b981" 
                    fillOpacity={1}
                    fill="url(#colorRedemptions)"
                    strokeWidth={2}
                    name="Redemptions"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>Aucune donnee disponible pour cette periode</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <LiveActivityFeed activities={activity} wsConnected={wsConnected} />
      </div>

      {/* Distribution and System Health Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Distribution par Type
            </CardTitle>
            <CardDescription>Repartition des activites principales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6 items-center">
              {categoryData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPie>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPie>
                  </ResponsiveContainer>
                  <div className="space-y-4">
                    {categoryData.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          ></div>
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <span className="text-sm text-gray-600">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="col-span-2 h-[200px] flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <PieChart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>Pas assez de donnees</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <SystemHealth health={health} loading={loading && !health} />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Actions Rapides
          </CardTitle>
          <CardDescription>Acces rapide aux fonctionnalites principales</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => window.location.href = '/users'}>
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-xs">Utilisateurs</span>
            </Button>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => window.location.href = '/prizes'}>
              <Trophy className="h-5 w-5 text-orange-600" />
              <span className="text-xs">Prix</span>
            </Button>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => window.location.href = '/rewards'}>
              <Gift className="h-5 w-5 text-purple-600" />
              <span className="text-xs">Recompenses</span>
            </Button>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => window.location.href = '/partners'}>
              <MapPin className="h-5 w-5 text-green-600" />
              <span className="text-xs">Partenaires</span>
            </Button>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => window.location.href = '/analytics'}>
              <TrendingUp className="h-5 w-5 text-pink-600" />
              <span className="text-xs">Analytics</span>
            </Button>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" onClick={() => setShowActivityDialog(true)}>
              <Activity className="h-5 w-5 text-gray-600" />
              <span className="text-xs">Journal</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <ActivityLogDialog open={showActivityDialog} onOpenChange={setShowActivityDialog} />
    </div>
  );
}
