import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { RefreshCw, TrendingUp, Users, Target, DollarSign, AlertCircle, Download } from "lucide-react";
import { getAnalytics, getUserAnalytics, getPrizeAnalytics, getRevenueAnalytics } from "../services/analytics";
import { useRealtimeUpdates } from "../hooks/useRealtimeUpdates";
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsPage() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [prizes, setPrizes] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("week");
  const [activeTab, setActiveTab] = useState("overview");

  const loadAllAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [ovData, usersData, prizesData, revData] = await Promise.all([
        getAnalytics(period),
        getUserAnalytics(period),
        getPrizeAnalytics(period),
        getRevenueAnalytics(period)
      ]);
      setOverview(ovData);
      setUsers(usersData);
      setPrizes(prizesData);
      setRevenue(revData);
    } catch (err) {
      console.error('Error loading analytics:', err);
      toast.error('Erreur lors du chargement des analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadAllAnalytics();
  }, [period]);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['stats_update', 'capture_created', 'redemption_created', 'user_created'],
    onMessage: (event, data) => {
      if (event === 'stats_update' && data.stats) {
        setOverview(prev => prev ? { ...prev, ...data.stats } : data.stats);
      } else {
        // Reload on significant events
        loadAllAnalytics();
      }
    }
  });

  const exportData = useCallback(() => {
    const data = { overview, users, prizes, revenue, period, timestamp: new Date() };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${period}-${Date.now()}.json`;
    a.click();
    toast.success('Analytics exportées avec succès');
  }, [overview, users, prizes, revenue, period]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <div className="flex gap-2">
          <select 
            value={period} 
            onChange={e => setPeriod(e.target.value)} 
            className="px-4 py-2 border rounded-md bg-white"
          >
            <option value="day">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="year">Cette année</option>
          </select>
          <Button onClick={loadAllAnalytics} disabled={loading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button onClick={exportData} disabled={loading} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
        </div>
      </div>

      {loading && <div className="text-center py-8">Chargement des données...</div>}

      {!loading && overview && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" /> Utilisateurs Actifs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.activeUsers ?? 0}</div>
                <p className="text-xs text-gray-500 mt-1">+{overview?.newUsers ?? 0} nouveaux</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" /> Captures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.totalCaptures ?? 0}</div>
                <p className="text-xs text-gray-500 mt-1">Tentatives réussies</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Conversion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.conversionRate ?? 0}%</div>
                <p className="text-xs text-gray-500 mt-1">Taux de succès</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Revenus
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overview?.revenue ?? 0).toLocaleString()} TND</div>
                <p className="text-xs text-gray-500 mt-1">Rédemptions</p>
              </CardContent>
            </Card>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-b">
            {['overview', 'users', 'prizes', 'revenue'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
                  activeTab === tab 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Activité Quotidienne</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview?.dailyActivity && overview.dailyActivity.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={overview.dailyActivity}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="captures" stroke="#3b82f6" name="Captures" isAnimationActive={false} />
                        <Line type="monotone" dataKey="users" stroke="#10b981" name="Utilisateurs" isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-500">Aucune donnée</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Croissance des Utilisateurs</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview?.userGrowth && overview.userGrowth.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={overview.userGrowth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="total" fill="#3b82f6" name="Total" isAnimationActive={false} />
                        <Bar dataKey="new" fill="#10b981" name="Nouveaux" isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-500">Aucune donnée</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Utilisateurs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{users?.totalUsers ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Nouveaux (Période)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{users?.newUsers ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Actifs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{users?.activeUsers ?? 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Top 10 Utilisateurs</CardTitle>
                </CardHeader>
                <CardContent>
                  {users?.topUsers && users.topUsers.length > 0 ? (
                    <div className="space-y-2">
                      {users.topUsers.map((user, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="font-medium">#{idx + 1} {user.username}</span>
                          <span className="text-sm text-gray-600">{user.captures} captures</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500">Aucune donnée</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Prizes Tab */}
          {activeTab === 'prizes' && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Prix Totaux</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{prizes?.totalPrizes ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Capturés</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{prizes?.capturedPrizes ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Taux Capture</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{prizes?.captureRate ?? 0}%</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Distribution des Prix par Catégorie</CardTitle>
                </CardHeader>
                <CardContent>
                  {prizes?.byCategory && prizes.byCategory.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={prizes.byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                          {prizes.byCategory.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-500">Aucune donnée</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Revenue Tab */}
          {activeTab === 'revenue' && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Revenus Totaux</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{(revenue?.total ?? 0).toLocaleString()} TND</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Revenu Moyen/Utilisateur</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{(revenue?.averagePerUser ?? 0).toFixed(2)} TND</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Rédemptions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{revenue?.redemptions ?? 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Tendance Revenus</CardTitle>
                </CardHeader>
                <CardContent>
                  {revenue?.dailyRevenue && revenue.dailyRevenue.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={revenue.dailyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={value => `${value.toLocaleString()} TND`} />
                        <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Revenus" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-500">Aucune donnée</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
