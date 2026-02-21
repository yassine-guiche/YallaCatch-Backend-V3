import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  QrCode, RefreshCw, BarChart2, Clock, CheckCircle, ShoppingBag, 
  TrendingUp, Target, Layers, Zap, User, ArrowUpRight, ChevronRight,
  Monitor, Activity
} from 'lucide-react';
import { getPartnerStats } from '../services/redemptions-partner';
import { usePartnerUpdates } from '../hooks/useRealtimeUpdates';
import { useAuth } from '../contexts/AuthContext';
import PartnerRedemptions from './PartnerRedemptions';
import { formatDate, formatRelativeDate } from '../utils/dates';
import { getImageUrl } from '../utils/images';

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
      toast.error('Erreur statistiques');
    } finally {
      setLoadingStats(false);
    }
  };

  usePartnerUpdates(user?.partnerId, {
    onRedemptionCreated: () => loadStats(),
    onRedemptionFulfilled: () => { toast.success('Validation réussie !'); loadStats(); },
    onMarketplaceUpdate: () => loadStats(),
  });

  useEffect(() => { loadStats(); }, [recentLimit]);

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Premium Welcome Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Station de Contrôle</h1>
          <p className="text-gray-500 font-medium flex items-center gap-2 uppercase text-xs tracking-widest">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Flux de données en direct • {user?.partnerName || 'Partenaire Officiel'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadStats} className="h-12 border-gray-200 bg-white shadow-sm hover:bg-gray-50 px-6 font-bold">
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingStats ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button className="h-12 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 font-black px-8 rounded-xl">
            <QrCode className="h-5 w-5 mr-2" /> SCANNER QR
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-8">
        <TabsList className="bg-gray-100/50 p-1 ring-1 ring-gray-200 shadow-inner rounded-2xl w-fit">
          <TabsTrigger value="dashboard" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">Aperçu Global</TabsTrigger>
          <TabsTrigger value="redemptions" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">Validations Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 space-y-8 animate-in fade-in duration-500">
          {/* High-Impact Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'En Attente', value: stats?.totals?.pending ?? 0, sub: 'À valider', icon: Clock, color: 'orange' },
              { label: 'Validées', value: stats?.totals?.fulfilled ?? 0, sub: 'Succès total', icon: CheckCircle, color: 'emerald' },
              { label: 'Total Flux', value: stats?.totals?.total ?? 0, sub: 'Volume global', icon: Layers, color: 'indigo' },
              { label: 'Aujourd\'hui', value: stats?.totals?.todayFulfilled ?? 0, sub: 'Live signal', icon: Zap, color: 'amber' },
              { label: 'Conversion', value: stats?.totals?.conversionRate ? stats.totals.conversionRate + '%' : '84%', sub: 'Efficacité', icon: TrendingUp, color: 'blue' },
            ].map((s, i) => (
              <Card key={i} className="border-none shadow-sm ring-1 ring-gray-100 bg-white/60 backdrop-blur-sm group hover:shadow-xl transition-all duration-300 rounded-3xl">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-2xl bg-${s.color}-50 text-${s.color}-600 group-hover:scale-110 transition-transform`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    {i === 4 && <Badge className="bg-emerald-100 text-emerald-700 border-none font-black text-[9px] uppercase tracking-tighter px-2">+4.2%</Badge>}
                  </div>
                  <div className="mt-5 space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tighter">{s.value}</h2>
                    <p className="text-xs font-bold text-gray-500/70">{s.sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Category Performance */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-none shadow-xl ring-1 ring-gray-100 rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-gray-900 to-indigo-950 text-white">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <BarChart2 className="h-5 w-5 text-indigo-400" /> Top Segments
                  </CardTitle>
                  <CardDescription className="text-indigo-200/60 font-bold text-xs uppercase tracking-widest">Performance par catégorie</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats?.byCategory?.length ? stats.byCategory.map((c, i) => (
                    <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-sm uppercase tracking-tight text-indigo-100">{c.category}</span>
                        <span className="font-black text-indigo-400">{c.count} <small className="text-[8px] opacity-50 uppercase">red.</small></span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full group-hover:bg-indigo-400 transition-all" style={{ width: `${Math.min(100, (c.count / (stats?.totals?.total || 1)) * 100)}%` }}></div>
                      </div>
                    </div>
                  )) : <p className="text-center py-12 text-indigo-300 font-bold opacity-40 uppercase tracking-widest text-xs">Aucun segment détecté</p>}
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity Table */}
            <div className="lg:col-span-2">
              <Card className="border-none shadow-xl ring-1 ring-gray-100 rounded-[2.5rem] overflow-hidden bg-white">
                <CardHeader className="border-b border-gray-50 flex flex-row items-center justify-between bg-white/50 backdrop-blur-sm px-8 py-6">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                      <Activity className="h-5 w-5 text-indigo-600" /> Signal Activité
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase text-gray-400 tracking-widest mt-1">Dernières interactions joueurs en temps réel</CardDescription>
                  </div>
                  <Select value={recentLimit} onValueChange={setRecentLimit}>
                    <SelectTrigger className="w-[100px] h-9 border-none bg-gray-50 font-black text-[10px] uppercase rounded-xl ring-1 ring-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">TOP 5</SelectItem>
                      <SelectItem value="10">TOP 10</SelectItem>
                      <SelectItem value="20">TOP 20</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-gray-50/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-black text-[10px] uppercase text-gray-400 pl-8">Produit</TableHead>
                        <TableHead className="font-black text-[10px] uppercase text-gray-400 text-center">Joueur</TableHead>
                        <TableHead className="font-black text-[10px] uppercase text-gray-400">Statut</TableHead>
                        <TableHead className="font-black text-[10px] uppercase text-gray-400 text-right pr-8">Chronologie</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats?.recent?.length ? stats.recent.map((r) => (
                        <TableRow key={r.id} className="hover:bg-indigo-50/20 border-gray-50 transition-colors group">
                          <TableCell className="pl-8">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden flex items-center justify-center p-1 group-hover:scale-105 transition-transform duration-300">
                                {r.reward?.imageUrl || r.reward?.image ? (
                                  <img src={getImageUrl(r.reward.imageUrl || r.reward.image)} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <ShoppingBag className="h-5 w-5 text-gray-200" />
                                )}
                              </div>
                              <div className="space-y-0.5">
                                <div className="font-bold text-gray-900 line-clamp-1 uppercase text-xs">{r.reward?.name || 'Item Inconnu'}</div>
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{r.reward?.category || 'Marketplace'}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-center">
                               <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs border-2 border-white shadow-sm mb-1">
                                  {r.user?.displayName?.[0] || 'U'}
                               </div>
                               <span className="text-[10px] font-black text-gray-600 truncate max-w-[80px] uppercase">{r.user?.displayName || 'Joueur'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${r.status === 'fulfilled' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'} border-none font-black text-[9px] uppercase tracking-widest px-2.5 h-6`}>
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <div className="text-[10px] font-black text-gray-900 uppercase">{formatRelativeDate(r.createdAt)}</div>
                            <div className="text-[9px] font-bold text-gray-400">{formatDate(r.createdAt)}</div>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-64 text-center">
                            <div className="flex flex-col items-center justify-center opacity-30 space-y-3">
                               <RefreshCw className="h-10 w-10 animate-spin-slow" />
                               <p className="font-black uppercase text-xs tracking-[0.2em]">Signal Silencieux</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="redemptions" className="animate-in slide-in-from-right-4 duration-500">
          <PartnerRedemptions />
        </TabsContent>
      </Tabs>
    </div>
  );
}
