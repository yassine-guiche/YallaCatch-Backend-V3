import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from 'sonner';
import { QrCode, RefreshCw, BarChart2, Clock, CheckCircle, ShoppingBag } from 'lucide-react';
import { getPartnerStats } from '../services/redemptions-partner';
import { usePartnerUpdates } from '../hooks/useRealtimeUpdates';
import { useAuth } from '../contexts/AuthContext';
import PartnerRedemptions from './PartnerRedemptions';
import { formatDate } from '../utils/dates';

// PartnerPortal component handles dashboard stats and location management

export default function PartnerPortal() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentLimit, setRecentLimit] = useState('5');

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

  // Subscribe to real-time updates
  usePartnerUpdates(user?.partnerId, {
    onRedemptionCreated: () => loadStats(),
    onRedemptionFulfilled: () => loadStats(),
    onMarketplaceUpdate: () => loadStats(),
  });

  useEffect(() => {
    loadStats();
  }, [recentLimit]);

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
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">En attente</CardTitle>
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                    <Clock className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totals?.pending ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">Redemptions à valider</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Validées</CardTitle>
                  <div className="p-2 rounded-lg bg-green-50 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totals?.fulfilled ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">Redemptions complétées</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total</CardTitle>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totals?.total ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">Volume total</p>
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
      </Tabs>
    </div>
  );
}

