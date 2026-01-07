import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  Eye,
  TrendingUp,
  Users,
  Video,
  Settings,
  Calendar,
  Award,
} from 'lucide-react';
import admobService from '../services/admob';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function AdMobDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30');
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({});
  const [configMeta, setConfigMeta] = useState({ updatedAt: null, updatedBy: null });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const [analyticsData, configData] = await Promise.all([
        admobService.getAnalytics({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          groupBy: 'day',
        }),
        admobService.getConfig(),
      ]);

      setAnalytics(analyticsData.data);
      const cfg = configData.data || {};
      const normalizedConfig = {
        maxRewardedAdsPerDay: cfg.maxRewardedAdsPerDay ?? cfg.MAX_REWARDED_ADS_PER_DAY ?? 0,
        maxInterstitialAdsPerDay: cfg.maxInterstitialAdsPerDay ?? cfg.MAX_INTERSTITIAL_ADS_PER_DAY ?? 0,
        rewardedVideoPoints: cfg.rewardedVideoPoints ?? cfg.REWARDED_VIDEO_POINTS ?? 0,
        interstitialPoints: cfg.interstitialPoints ?? cfg.INTERSTITIAL_POINTS ?? 0,
        rewardedCooldown: cfg.rewardedCooldown ?? cfg.REWARDED_COOLDOWN ?? 0,
        interstitialCooldown: cfg.interstitialCooldown ?? cfg.INTERSTITIAL_COOLDOWN ?? 0,
        rewardedVideoEcpm: cfg.rewardedVideoEcpm ?? cfg.REWARDED_VIDEO_ECPM ?? 0,
        interstitialEcpm: cfg.interstitialEcpm ?? cfg.INTERSTITIAL_ECPM ?? 0,
        bannerEcpm: cfg.bannerEcpm ?? cfg.BANNER_ECPM ?? 0,
      };
      setConfig(normalizedConfig);
      setConfigForm(normalizedConfig);
      setConfigMeta({
        updatedAt: cfg.updatedAt || null,
        updatedBy: cfg.updatedBy || null,
      });
    } catch (err) {
      console.error('Error loading AdMob data:', err);
      const errMsg = err.response?.data?.message || 'Failed to load AdMob data';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['ad_impression', 'ad_click', 'stats_update'],
    onMessage: (event, data) => {
      if (event === 'stats_update' && data.stats?.admob) {
        setMetrics(prev => ({ ...prev, ...data.stats.admob }));
      } else if (event === 'ad_impression' || event === 'ad_click') {
        // Reload for precise metrics
        loadData();
      }
    }
  });

  const handleConfigUpdate = async () => {
    try {
      setLoading(true);
      setError(null);

      await admobService.updateConfig(configForm);
      toast.success('Configuration mise à jour avec succès');
      await loadData();
      setShowConfig(false);
    } catch (err) {
      console.error('Error updating config:', err);
      const errMsg = err.response?.data?.message || 'Failed to update configuration';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading AdMob Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const { overall, byAdType, dailyTrend, topUsers } = analytics || {};

  // Prepare chart data
  const adTypeData = byAdType?.map((item) => ({
    name: item._id,
    views: item.views,
    completed: item.completed,
    revenue: item.revenue.toFixed(2),
  })) || [];

  const dailyData = dailyTrend?.map((item) => ({
    date: item._id,
    views: item.views,
    revenue: item.revenue.toFixed(2),
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AdMob Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor ad performance and revenue
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setShowConfig(!showConfig)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </Button>
        </div>
      </div>

      {/* Configuration Panel */}
      {showConfig && config && (
        <Card>
          <CardHeader>
            <CardTitle>AdMob Configuration</CardTitle>
            <CardDescription>
              Configure ad limits, rewards, and cooldowns
              {configMeta.updatedAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  Last updated {new Date(configMeta.updatedAt).toLocaleString()} by {configMeta.updatedBy || 'unknown'}
                </div>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Max Rewarded Ads Per Day</Label>
                <Input
                  type="number"
                  value={configForm.maxRewardedAdsPerDay ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      maxRewardedAdsPerDay: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Interstitial Ads Per Day</Label>
                <Input
                  type="number"
                  value={configForm.maxInterstitialAdsPerDay ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      maxInterstitialAdsPerDay: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Rewarded Video Points</Label>
                <Input
                  type="number"
                  value={configForm.rewardedVideoPoints ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      rewardedVideoPoints: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Interstitial Points</Label>
                <Input
                  type="number"
                  value={configForm.interstitialPoints ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      interstitialPoints: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Rewarded Cooldown (seconds)</Label>
                <Input
                  type="number"
                  value={configForm.rewardedCooldown ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      rewardedCooldown: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Interstitial Cooldown (seconds)</Label>
                <Input
                  type="number"
                  value={configForm.interstitialCooldown ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      interstitialCooldown: parseInt(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Rewarded eCPM ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={configForm.rewardedVideoEcpm ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      rewardedVideoEcpm: parseFloat(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Interstitial eCPM ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={configForm.interstitialEcpm ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      interstitialEcpm: parseFloat(e.target.value || '0'),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Banner eCPM ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={configForm.bannerEcpm ?? ''}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      bannerEcpm: parseFloat(e.target.value || '0'),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowConfig(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfigUpdate}>Save Configuration</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall?.totalViews?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overall?.totalCompleted?.toLocaleString() || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${overall?.totalRevenue?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              eCPM: ${overall?.avgEcpm?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Completion Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall?.totalViews
                ? (
                    (overall.totalCompleted / overall.totalViews) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">
              {overall?.totalCompleted || 0} / {overall?.totalViews || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Rewards
            </CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall?.totalRewards?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">Points distributed</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Trend</CardTitle>
            <CardDescription>Views and revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="views"
                  stroke="#8884d8"
                  name="Views"
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#82ca9d"
                  name="Revenue ($)"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ad Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Ad Type Performance</CardTitle>
            <CardDescription>Views and revenue by ad type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={adTypeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="views" fill="#8884d8" name="Views" isAnimationActive={false} />
                <Bar dataKey="completed" fill="#82ca9d" name="Completed" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Users */}
      <Card>
        <CardHeader>
          <CardTitle>Top Ad Viewers</CardTitle>
          <CardDescription>Users who watched the most ads</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Rewards Earned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUsers?.map((user, index) => (
                <TableRow key={user.userId}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.views}</TableCell>
                  <TableCell>{user.rewards.toLocaleString()} pts</TableCell>
                </TableRow>
              ))}
              {(!topUsers || topUsers.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
