import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getImageUrl } from '../utils/images';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ImageUpload } from '../components/ui/ImageUpload';
import { uploadRewardImage } from '../services/upload';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Plus, Edit, Trash2, RefreshCw, CreditCard, Star, History, FolderOpen, ShieldCheck, LayoutGrid, List, Eye, CheckCircle, Layers, Activity, AlertTriangle, Clock, Search, Gift } from 'lucide-react';
import { toast } from 'sonner';
import {
  listRewardsFiltered,
  addReward,
  updateReward,
  removeReward,
  getMarketplaceCategories,
  getFeaturedRewards,
  getMarketplaceHistory,
  getRewardCounts
} from '../services/rewards';
import { getPartners } from '../services/partners';
import { formatDate } from '../utils/dates';
import { useRewardsUpdates } from '../hooks/useRealtimeUpdates';

export default function RewardsManagement() {
  const [rewards, setRewards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [featuredRewards, setFeaturedRewards] = useState([]);
  const [exchangeHistory, setExchangeHistory] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const [activeTab, setActiveTab] = useState('rewards');
  const [showDialog, setShowDialog] = useState(false);
  const [editingReward, setEditingReward] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedReward, setSelectedReward] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pointsRequired: 100,
    category: 'voucher',
    quantity: 10,
    imageUrl: '',
    isActive: true,
    isPopular: false,
    terms: '',
    isSponsored: false,
    partnerId: '',
    sponsorName: '',
    sponsorLogo: '',
    sponsorNotes: '',
  });

  const [stats, setStats] = useState({ total: 0, active: 0 });

  useRewardsUpdates({
    onRewardUpdate: () => {
      loadRewards();
      loadStats();
      toast.info('Récompense mise à jour');
    },
    onRedemptionCreated: () => {
      loadExchangeHistory();
    },
    onMarketplaceUpdate: () => {
      loadRewards();
      loadStats();
    },
  });

  const loadStats = useCallback(async () => {
    try {
      const counts = await getRewardCounts();
      setStats(counts);
    } catch (err) {
      console.error('Erreur chargement stats récompenses:', err);
    }
  }, []);

  const loadRewards = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listRewardsFiltered({
        category: filterCategory,
        status: filterStatus,
        pageSize: 100,
        listingType: 'GAME_REWARD'
      });
      setRewards(result.items || []);
    } catch (err) {
      console.error('Erreur chargement récompenses:', err);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus]);

  const filteredRewards = useMemo(() => {
    return rewards.filter(reward =>
      reward.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reward.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rewards, searchTerm]);

  const loadCategories = async () => {
    try {
      const cats = await getMarketplaceCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Erreur chargement catégories:', err);
    }
  };

  const loadFeaturedRewards = async () => {
    try {
      const featured = await getFeaturedRewards();
      setFeaturedRewards(featured);
    } catch (err) {
      console.error('Erreur chargement récompenses vedettes:', err);
    }
  };

  const loadExchangeHistory = async () => {
    try {
      const result = await getMarketplaceHistory({ limit: 50 });
      setExchangeHistory(result.items || []);
      // Optimistically tracking total exchanges if backend provides it in the future or via separate stat
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    }
  };

  const loadPartnersList = async () => {
    try {
      const res = await getPartners({ page: 1, limit: 100, status: 'active' });
      setPartners(res.items || res.partners || []);
    } catch (err) {
      console.error('Erreur chargement partenaires:', err);
    }
  };

  useEffect(() => {
    loadRewards();
    loadStats();
    loadCategories();
    loadFeaturedRewards();
    loadExchangeHistory();
    loadPartnersList();
  }, [filterCategory, filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const sponsorPartner = formData.isSponsored
        ? partners.find((p) => (p._id || p.id) === formData.partnerId)
        : null;
      const payload = {
        ...formData,
        metadata: {
          ...(formData.metadata || {}),
          isSponsored: formData.isSponsored,
          sponsorName: formData.sponsorName || undefined,
          sponsorLogo: formData.sponsorLogo || undefined,
          sponsorNotes: formData.sponsorNotes || undefined,
          commissionRate: sponsorPartner?.commissionRate,
        },
        partnerId: formData.isSponsored ? formData.partnerId : undefined,
        listingType: 'GAME_REWARD'
      };
      let savedReward;
      if (editingReward) {
        savedReward = await updateReward(editingReward.id, payload);
        toast.success('Récompense mise à jour');
        // Optimistic local update
        setRewards(prev =>
          prev.map(r => (r.id === editingReward.id ? { ...r, ...savedReward } : r))
        );
      } else {
        savedReward = await addReward(payload);
        toast.success('Récompense ajoutée');
        setRewards(prev => [savedReward, ...prev]);
      }
      setShowDialog(false);
      setEditingReward(null);
      resetForm();
      await loadRewards();
      await loadFeaturedRewards();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  };

  const handleEdit = (reward) => {
    setEditingReward(reward);
    setFormData({
      name: reward.name || '',
      description: reward.description || '',
      pointsRequired: reward.pointsRequired || 100,
      category: reward.category || 'voucher',
      quantity: reward.quantity || 0,
      imageUrl: reward.imageUrl || '',
      isActive: reward.isActive !== false,
      isPopular: reward.isPopular || false,
      terms: reward.terms || '',
      isSponsored: reward.metadata?.isSponsored || false,
      partnerId: (typeof reward.partnerId === 'object' && reward.partnerId !== null) ? (reward.partnerId._id || reward.partnerId.id) : (reward.partnerId || reward.metadata?.partnerId || ''),
      sponsorName: reward.metadata?.sponsorName || '',
      sponsorLogo: reward.metadata?.sponsorLogo || '',
      sponsorNotes: reward.metadata?.sponsorNotes || '',
    });
    setShowDialog(true);
  };

  const handleViewDetails = (reward) => {
    setSelectedReward(reward);
    setShowDetailsDialog(true);
  };

  const handleDeleteClick = (id) => {
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await removeReward(pendingDeleteId);
      toast.success('Récompense supprimée');
      await loadRewards();
      await loadFeaturedRewards();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      pointsRequired: 100,
      category: 'voucher',
      quantity: 10,
      imageUrl: '',
      isActive: true,
      isPopular: false,
      terms: '',
      isSponsored: false,
      partnerId: '',
      sponsorName: '',
      sponsorLogo: '',
      sponsorNotes: '',
    });
  };

  const getCategoryBadge = (category) => {
    const categoryConfig = {
      voucher: { color: 'bg-pink-100 text-pink-800 border-pink-200', label: "Bon d'achat" },
      gift_card: { color: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Carte cadeau' },
      physical: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Physique' },
      digital: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Numérique' },
      experience: { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Expérience' }
    };
    const config = categoryConfig[category] || { color: 'bg-gray-100 text-gray-800 border-gray-200', label: category };
    return <Badge variant="outline" className={`${config.color} font-medium`}>{config.label}</Badge>;
  };

  const sponsoredBadge = (reward) => {
    if (!(reward.metadata?.isSponsored || reward.partnerId)) return null;
    
    // Extract partner info from flattened fields or metadata fallback
    const partnerName = reward.partnerName || (typeof reward.partnerId === 'object' ? reward.partnerId?.name : null) || reward.metadata?.sponsorName || '';
    const partnerLogo = reward.partnerLogo || (typeof reward.partnerId === 'object' ? reward.partnerId?.logo : null) || reward.metadata?.sponsorLogo;

    return (
      <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1.5 pl-1 pr-2 py-0.5 border border-amber-200 hover:bg-amber-200 transition-colors">
        {partnerLogo ? (
           <img 
             src={getImageUrl(partnerLogo)} 
             alt={partnerName} 
             className="h-4 w-4 rounded-full object-cover bg-white"
             onError={(e) => {
               e.target.style.display = 'none';
               e.target.nextSibling?.classList.remove('hidden');
             }} 
           />
        ) : (
           <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
        )}
        <ShieldCheck className={`h-3.5 w-3.5 text-amber-600 ${partnerLogo ? 'hidden' : ''}`} />
        <span className="font-semibold">{partnerName ? `Sponsorisé - ${partnerName}` : 'Sponsorisé'}</span>
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer la récompense"
        description="Êtes-vous sûr de vouloir supprimer cette récompense ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Récompenses</h1>
          <p className="text-gray-500 mt-1">
            {rewards.length} récompense{rewards.length > 1 ? 's' : ''} disponible{rewards.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { loadRewards(); loadCategories(); loadFeaturedRewards(); loadExchangeHistory(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Total Récompenses</CardTitle>
            <Layers className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || rewards.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Disponibles en boutique</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Actives</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.active || rewards.filter(r => r.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Visibles par les joueurs</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Catégories</CardTitle>
            <FolderOpen className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Types de produits</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Echanges</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exchangeHistory.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Dernières transactions</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rewards">
            <CreditCard className="mr-2 h-4 w-4" />
            Récompenses
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderOpen className="mr-2 h-4 w-4" />
            Catégories ({categories.length})
          </TabsTrigger>
          <TabsTrigger value="featured">
            <Star className="mr-2 h-4 w-4" />
            Vedettes ({featuredRewards.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            Historique ({exchangeHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rewards" className="space-y-6">
          <Card className="shadow-sm border-none bg-gray-50/50">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full relative">
                  <Input
                    placeholder="Chercher une récompense..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-white"
                  />
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="flex-1 md:min-w-[180px] px-3 py-2 border rounded-md bg-white text-sm"
                  >
                    <option value="all">Toutes catégories</option>
                    {categories.map(cat => (
                      <option key={cat.id || cat.name} value={cat.name}>
                        {cat.name} ({cat.count || 0})
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="flex-1 md:min-w-[140px] px-3 py-2 border rounded-md bg-white text-sm"
                  >
                    <option value="all">Tous statuts</option>
                    <option value="active">Actives</option>
                    <option value="inactive">Inactives</option>
                  </select>

                  <div className="flex border rounded-md overflow-hidden shrink-0 bg-white shadow-sm">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      className="rounded-none px-3 h-9"
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'table' ? 'default' : 'ghost'}
                      size="sm"
                      className="rounded-none px-3 h-9"
                      onClick={() => setViewMode('table')}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30 rounded-xl border border-dashed">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-4" />
              <p className="text-gray-500 font-medium font-sans uppercase tracking-widest text-xs">Chargement des récompenses...</p>
            </div>
          ) : filteredRewards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30 rounded-xl border border-dashed">
              <div className="bg-gray-100 p-4 rounded-full mb-4">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Aucune récompense trouvée</p>
              <p className="text-sm text-gray-400 mt-1">Essayez de modifier vos filtres ou lancez une recherche.</p>
              <Button variant="outline" className="mt-6" onClick={() => { setSearchTerm(''); setFilterCategory('all'); setFilterStatus('all'); }}>
                Réinitialiser les filtres
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRewards.map(reward => (
                <Card key={reward.id} className={`group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${!reward.isActive ? 'opacity-70 grayscale-[0.5]' : 'border-t-4 border-t-transparent hover:border-t-blue-500'}`}>
                  <div className="aspect-video bg-gray-100 relative overflow-hidden">
                    {reward.imageUrl ? (
                      <img
                        src={getImageUrl(reward.imageUrl)}
                        alt={reward.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/placeholder-reward.png';
                          e.target.className = 'w-16 h-16 mx-auto mt-8 opacity-20';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Plus className="h-12 w-12 opacity-50" />
                      </div>
                    )}

                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                      {getCategoryBadge(reward.category)}
                      {reward.isPopular && (
                        <Badge className="bg-orange-500 text-white border-none flex items-center gap-1 shadow-md scale-105 origin-left">
                          <Star className="h-3 w-3 fill-current" />
                          Populaire
                        </Badge>
                      )}
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2">
                      {reward.isActive ? (
                        <Badge className="bg-green-500/90 text-white backdrop-blur-sm border-none shadow-sm">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-500/90 text-white backdrop-blur-sm border-none shadow-sm">Inactive</Badge>
                      )}
                    </div>
                  </div>

                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <CardTitle className="text-xl font-bold line-clamp-1 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{reward.name}</CardTitle>
                    </div>
                    {sponsoredBadge(reward)}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-500 line-clamp-2 h-10 italic leading-relaxed">
                      {reward.description || 'Aucune description fournie.'}
                    </p>

                    <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-50">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Prix</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="bg-blue-100 p-1 rounded">
                            <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <span className="font-bold text-lg text-blue-600">{reward.pointsRequired} <small className="text-[10px] font-normal text-gray-400">PTS</small></span>
                        </div>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Quantité</span>
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <span className={`font-bold text-lg ${reward.quantity <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-700'}`}>{reward.quantity}</span>
                          <div className={`p-1 rounded ${reward.quantity <= 5 ? 'bg-red-100' : 'bg-gray-100'}`}>
                            <Layers className={`h-3.5 w-3.5 ${reward.quantity <= 5 ? 'text-red-600' : 'text-gray-500'}`} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{reward.validityPeriod || 30} jours</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <History className="h-3 w-3" />
                        <span>{reward.redemptionCount || 0} échanges</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleViewDetails(reward)}
                        className="flex-1 rounded-lg font-semibold h-9"
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        Détails
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(reward)}
                        className="flex-1 rounded-lg border-gray-200 hover:bg-gray-100 font-semibold h-9"
                      >
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        Gérer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClick(reward.id)}
                        className="rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors w-9 p-0 h-9"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-none shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-[80px]">Image</TableHead>
                    <TableHead>Récompense</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRewards.map(reward => (
                    <TableRow key={reward.id} className={`group hover:bg-blue-50/30 transition-colors ${!reward.isActive ? 'opacity-70 bg-gray-50/50' : ''}`}>
                      <TableCell>
                        <div className="relative w-12 h-12 rounded-lg border bg-white overflow-hidden shadow-sm flex items-center justify-center">
                          {reward.imageUrl ? (
                            <img
                              src={getImageUrl(reward.imageUrl)}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Plus className="w-5 h-5 text-gray-200" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <div className="font-bold text-gray-900 line-clamp-1">{reward.name}</div>
                        <div className="text-xs text-gray-400 truncate mt-1 italic leading-tight">{reward.description}</div>
                      </TableCell>
                      <TableCell>{getCategoryBadge(reward.category)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-bold text-blue-600">
                          <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                          {reward.pointsRequired}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${reward.quantity === 0 ? 'bg-red-500' : reward.quantity <= 5 ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                          <span className={`font-mono font-bold ${reward.quantity <= 5 ? 'text-red-600 underline decoration-wavy' : 'text-gray-700'}`}>
                            {reward.quantity}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {reward.isActive ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 flex w-fit gap-1 items-center px-2 py-0.5">
                            <CheckCircle className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-400 border-gray-200 flex w-fit gap-1 items-center px-2 py-0.5">
                            <Clock className="h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleViewDetails(reward)} className="h-8 w-8 hover:bg-blue-100 hover:text-blue-600 text-gray-400">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(reward)} className="h-8 w-8 hover:bg-gray-100 text-gray-400">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(reward.id)} className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Catégories du Marketplace</CardTitle>
              <CardDescription>Organisation des récompenses par catégorie</CardDescription>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Aucune catégorie disponible
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categories.map(category => (
                    <Card key={category.id || category.name}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{category.name}</h3>
                            <p className="text-sm text-gray-500">
                              {category.count || 0} récompense{(category.count || 0) > 1 ? 's' : ''}
                            </p>
                          </div>
                          {getCategoryBadge(category.name)}
                        </div>
                        {category.description && (
                          <p className="text-xs text-gray-600 mt-2">{category.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="featured" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Récompenses Vedettes</CardTitle>
              <CardDescription>Récompenses mises en avant dans le marketplace</CardDescription>
            </CardHeader>
            <CardContent>
              {featuredRewards.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Aucune récompense vedette
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {featuredRewards.map(reward => (
                    <Card key={reward.id} className="border-2 border-yellow-400">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                          <CardTitle className="text-lg">{reward.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {reward.imageUrl && (
                            <img
                              src={getImageUrl(reward.imageUrl)}
                              alt={reward.name}
                              className="w-full h-32 object-cover rounded-md"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/placeholder-reward.png';
                                e.target.className = 'w-10 h-10 mx-auto opacity-20';
                              }}
                            />
                          )}
                          <p className="text-sm text-gray-600 line-clamp-2">{reward.description}</p>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span className="font-medium">{reward.pointsRequired} points</span>
                          </div>
                          {getCategoryBadge(reward.category)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des échanges</CardTitle>
              <CardDescription>Derniers échanges de récompenses</CardDescription>
            </CardHeader>
            <CardContent>
              {exchangeHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Aucun échange enregistré
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Image</TableHead>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Récompense</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exchangeHistory.map(exchange => (
                      <TableRow key={exchange.id}>
                        <TableCell>
                          <div className="w-10 h-10 rounded border bg-gray-50 overflow-hidden flex items-center justify-center">
                            {exchange.rewardImageUrl ? (
                              <img
                                src={getImageUrl(exchange.rewardImageUrl)}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <FolderOpen className="w-5 h-5 text-gray-300" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{exchange.userName || exchange.userId}</div>
                            <div className="text-xs text-gray-500">{exchange.userEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{exchange.rewardName}</div>
                            <div className="text-xs text-gray-500">{exchange.category}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{exchange.pointsCost} pts</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(exchange.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          {['fulfilled', 'completed'].includes(exchange.status) ? (
                            <Badge variant="default">Complété</Badge>
                          ) : exchange.status === 'pending' ? (
                            <Badge variant="secondary">En attente</Badge>
                          ) : (
                            <Badge variant="destructive">Annulé</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs >

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 border-none shadow-2xl">
          <div className="bg-blue-600 p-6 text-white shrink-0">
            <DialogTitle className="text-2xl font-bold">
              {editingReward ? 'Modifier la Récompense' : 'Nouvelle Récompense'}
            </DialogTitle>
            <DialogDescription className="text-blue-100 opacity-90">
              {editingReward ? 'Mettez à jour les informations essentielles et les paramètres de stock.' : 'Ajoutez une nouvelle offre attrayante pour vos joueurs.'}
            </DialogDescription>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Section 1: Informations Générales */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                  <h3 className="font-bold text-gray-700 uppercase tracking-wider text-xs">Informations Générales</h3>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600">Nom de la récompense</label>
                  <Input
                    placeholder="ex: Bon d'achat 50 TND"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="bg-gray-50 border-gray-200"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600">Catégorie</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-gray-50 border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  >
                    <option value="voucher">Bon d'achat</option>
                    <option value="gift_card">Carte cadeau</option>
                    <option value="physical">Produit physique</option>
                    <option value="digital">Produit numérique</option>
                    <option value="experience">Expérience</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600">Description</label>
                  <textarea
                    placeholder="Décrivez ce que le joueur reçoit..."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-gray-50 border-gray-200 text-sm h-24 focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600">Conditions d'utilisation</label>
                  <textarea
                    placeholder="Validité, restrictions, etc."
                    value={formData.terms}
                    onChange={e => setFormData({ ...formData, terms: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-gray-50 border-gray-200 text-sm h-20 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Section 2: Inventaire & Visuel */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <CreditCard className="h-4 w-4 text-blue-500" />
                    <h3 className="font-bold text-gray-700 uppercase tracking-wider text-xs">Prix & Stock</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-600">Points requis</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          value={formData.pointsRequired}
                          onChange={e => setFormData({ ...formData, pointsRequired: parseInt(e.target.value) || 0 })}
                          required
                          className="bg-gray-50 border-gray-200 pl-8"
                        />
                        <Star className="absolute left-2.5 top-2.5 h-4 w-4 text-amber-500" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-600">Stock initial</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          value={formData.quantity}
                          onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                          required
                          className="bg-gray-50 border-gray-200 pl-8"
                        />
                        <Layers className="absolute left-2.5 top-2.5 h-4 w-4 text-blue-500" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Star className="h-4 w-4 text-blue-500" />
                    <h3 className="font-bold text-gray-700 uppercase tracking-wider text-xs">Visuel & Visibilité</h3>
                  </div>

                  <ImageUpload
                    label="Image de la récompense"
                    value={formData.imageUrl}
                    onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                    onUpload={uploadRewardImage}
                    placeholder="Cliquez ou déposez l'image"
                  />

                  <div className="flex flex-col gap-3 pt-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-700">Mettre en vedette</span>
                        <span className="text-[10px] text-gray-400 font-medium">Sera affiché en haut du marketplace</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.isPopular || false}
                        onChange={e => setFormData({ ...formData, isPopular: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer group pt-2 border-t">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-700">Statut Actif</span>
                        <span className="text-[10px] text-gray-400 font-medium">Visible par les utilisateurs</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Partenariat (Optionnel) */}
            <div className="space-y-4 pt-6 border-t border-dashed">
              <label className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.isSponsored}
                  onChange={e => setFormData({ ...formData, isSponsored: e.target.checked })}
                  className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 shadow-sm"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-amber-900">Activer le Sponsoring / Partenariat</span>
                  <span className="text-[10px] text-amber-700/70 font-medium uppercase tracking-tighter">Lier cette récompense à une marque ou un partenaire professionnel</span>
                </div>
              </label>

              {formData.isSponsored && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-white border rounded-xl shadow-inner animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-tighter">Partenaire Système</label>
                    <select
                      value={formData.partnerId}
                      onChange={e => setFormData({ ...formData, partnerId: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                      required
                    >
                      <option value="">Lier à un partenaire...</option>
                      {partners.map(p => (
                        <option key={p._id || p.id} value={p._id || p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-tighter">Nom d'affichage Sponsor</label>
                    <Input
                      placeholder="ex: Ooredoo"
                      value={formData.sponsorName}
                      onChange={e => setFormData({ ...formData, sponsorName: e.target.value })}
                      className="bg-gray-50 border-gray-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-tighter">Note interne sponsor</label>
                    <Input
                      placeholder="ex: Campagne Ramadan"
                      value={formData.sponsorNotes}
                      onChange={e => setFormData({ ...formData, sponsorNotes: e.target.value })}
                      className="bg-gray-50 border-gray-200"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-6 border-t font-bold">
              <Button type="submit" className="flex-1 h-12 text-lg bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
                {editingReward ? 'Enregistrer les modifications' : 'Créer la récompense'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDialog(false);
                  setEditingReward(null);
                  resetForm();
                }}
                className="w-32 h-12 border-gray-200 text-gray-400 hover:text-gray-900 transition-all font-semibold"
              >
                Annuler
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>


      {showDetailsDialog && selectedReward && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-3xl overflow-hidden p-0 border-none shadow-2xl rounded-2xl">
            <div className="relative aspect-video bg-gray-900 group">
              {selectedReward.imageUrl ? (
                <img
                  src={getImageUrl(selectedReward.imageUrl)}
                  alt={selectedReward.name}
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Gift className="h-20 w-20 text-blue-500/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex gap-2 mb-3">
                  {getCategoryBadge(selectedReward.category)}
                  {selectedReward.isActive ? (
                    <Badge className="bg-green-500/90 text-white backdrop-blur-sm border-none font-bold">ACTIVE</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-500/90 text-white backdrop-blur-sm border-none font-bold">INACTIVE</Badge>
                  )}
                </div>
                <h2 className="text-4xl font-extrabold text-white tracking-tight uppercase leading-tight drop-shadow-md">{selectedReward.name}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 text-white p-2 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/50 transition-all"
                onClick={() => setShowDetailsDialog(false)}
              >
                <Plus className="h-6 w-6 rotate-45" />
              </Button>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center bg-blue-50 p-4 rounded-2xl border border-blue-100/50 group transition-all hover:bg-blue-100 hover:scale-105 duration-300">
                  <CreditCard className="h-6 w-6 text-blue-600 mb-2 group-hover:animate-bounce" />
                  <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Coût Points</span>
                  <span className="text-3xl font-black text-blue-600 tracking-tighter">{selectedReward.pointsRequired}</span>
                </div>
                <div className="flex flex-col items-center bg-orange-50 p-4 rounded-2xl border border-orange-100/50 group transition-all hover:bg-orange-100 hover:scale-105 duration-300">
                  <Layers className="h-6 w-6 text-orange-600 mb-2 group-hover:animate-bounce" />
                  <span className="text-[10px] text-orange-400 font-black uppercase tracking-widest">Stock Restant</span>
                  <span className="text-3xl font-black text-orange-600 tracking-tighter">{selectedReward.quantity}</span>
                </div>
                <div className="flex flex-col items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 group transition-all hover:bg-gray-100 hover:scale-105 duration-300">
                  <Clock className="h-6 w-6 text-gray-600 mb-2 group-hover:animate-bounce" />
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Validité</span>
                  <span className="text-3xl font-black text-gray-600 tracking-tighter">{selectedReward.validityPeriod || 30}j</span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                    <History className="h-4 w-4" /> Description de l'offre
                  </h4>
                  <p className="text-gray-600 text-lg leading-relaxed font-medium bg-gray-50/50 p-4 rounded-xl border border-dashed hover:border-blue-200 transition-colors">
                    {selectedReward.description || 'Pas de description.'}
                  </p>
                </div>

                {selectedReward.terms && (
                  <div>
                    <h4 className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                      <ShieldCheck className="h-4 w-4" /> Conditions de réclamation
                    </h4>
                    <p className="text-gray-500 text-sm leading-relaxed whitespace-pre-line border-l-4 border-l-blue-100 pl-4 py-1">
                      {selectedReward.terms}
                    </p>
                  </div>
                )}

                {(selectedReward.metadata?.isSponsored || selectedReward.partnerId) && (
                  <div className="mt-8 pt-8 border-t border-dashed">
                    <div className="flex items-center gap-6 p-6 bg-amber-50 rounded-2xl border-2 border-amber-200 relative overflow-hidden group">
                      <ShieldCheck className="absolute -right-4 -bottom-4 h-24 w-24 text-amber-200 opacity-50 group-hover:rotate-12 transition-transform duration-500" />
                      
                      {(selectedReward.partnerLogo || selectedReward.metadata?.sponsorLogo) && (
                        <div className="relative z-10 w-24 h-24 bg-white rounded-xl shadow-md overflow-hidden flex-shrink-0 border-2 border-amber-100">
                           <img 
                             src={getImageUrl(selectedReward.partnerLogo || selectedReward.metadata?.sponsorLogo)} 
                             alt="Sponsor Logo" 
                             className="w-full h-full object-cover"
                             onError={(e) => {
                               e.target.style.display = 'none';
                               e.target.parentNode.style.display = 'none';
                             }}
                           />
                        </div>
                      )}

                      <div className="relative z-10 flex-1">
                        <h4 className="text-amber-800 font-black uppercase tracking-tighter line-clamp-1 text-2xl mb-1">
                          {selectedReward.partnerName || (typeof selectedReward.partnerId === 'object' ? selectedReward.partnerId?.name : null) || selectedReward.metadata?.sponsorName || "Sponsorisé"}
                        </h4>
                        <p className="text-amber-700/70 text-sm font-bold uppercase tracking-tight">Récompense Partenaire Officielle</p>
                        {selectedReward.metadata?.sponsorNotes && (
                          <p className="mt-4 text-amber-600/80 italic text-sm font-medium border-l-2 border-amber-300 pl-3">
                            "{selectedReward.metadata.sponsorNotes}"
                          </p>
                        )}
                      </div>
                      <Badge className="bg-amber-500 text-white font-black px-4 py-2 rounded-full absolute top-6 right-6 shadow-lg shadow-amber-200 transform scale-110">
                        OFFICIEL
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  className="flex-1 h-16 text-xl font-black bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-xl shadow-blue-200"
                  onClick={() => { setShowDetailsDialog(false); handleEdit(selectedReward); }}
                >
                  <Edit className="mr-3 h-6 w-6" /> CONFIGURER
                </Button>
                <Button
                  variant="outline"
                  className="h-16 w-16 p-0 rounded-2xl border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => { setShowDetailsDialog(false); handleDeleteClick(selectedReward.id); }}
                >
                  <Trash2 className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div >
  );
}
