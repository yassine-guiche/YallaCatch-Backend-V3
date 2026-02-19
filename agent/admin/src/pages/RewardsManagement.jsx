import React, { useState, useEffect, useCallback } from 'react';
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
import { Plus, Edit, Trash2, RefreshCw, CreditCard, Star, History, FolderOpen, ShieldCheck } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('rewards');
  const [showDialog, setShowDialog] = useState(false);
  const [editingReward, setEditingReward] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
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
      loadStats();
      toast.info('Récompense mise à jour');
    },
    onRedemptionCreated: () => {
      loadExchangeHistory();
    },
    onMarketplaceUpdate: () => {
      loadRewards();
      loadStats();
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
      partnerId: reward.partnerId || reward.metadata?.partnerId || '',
      sponsorName: reward.metadata?.sponsorName || '',
      sponsorLogo: reward.metadata?.sponsorLogo || '',
      sponsorNotes: reward.metadata?.sponsorNotes || '',
    });
    setShowDialog(true);
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
      voucher: { color: 'bg-pink-100 text-pink-800', label: "Bon d'achat" },
      gift_card: { color: 'bg-purple-100 text-purple-800', label: 'Carte cadeau' },
      physical: { color: 'bg-blue-100 text-blue-800', label: 'Physique' },
      digital: { color: 'bg-green-100 text-green-800', label: 'Numérique' },
      experience: { color: 'bg-orange-100 text-orange-800', label: 'Expérience' }
    };
    const config = categoryConfig[category] || { color: 'bg-gray-100 text-gray-800', label: category };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const sponsoredBadge = (reward) => {
    if (!(reward.metadata?.isSponsored || reward.partnerId)) return null;
    return (
      <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" />
        Sponsorisé {reward.metadata?.sponsorName ? `- ${reward.metadata.sponsorName}` : ''}
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Récompenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || rewards.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Actives</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.active || rewards.filter(r => r.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Catégories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Echanges Totaux</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exchangeHistory.length}</div>
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

        <TabsContent value="rewards" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-4 py-2 border rounded-md"
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
                  className="px-4 py-2 border rounded-md"
                >
                  <option value="all">Tous statuts</option>
                  <option value="active">Actives</option>
                  <option value="inactive">Inactives</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="col-span-full text-center py-8">Chargement...</div>
            ) : rewards.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                Aucune récompense trouvée
              </div>
            ) : (
              rewards.map(reward => (
                <Card key={reward.id} className={!reward.isActive ? 'opacity-60' : ''}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{reward.name}</CardTitle>
                      <div className="flex gap-2">
                        {sponsoredBadge(reward)}
                        {reward.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reward.imageUrl && (
                        <img
                          src={reward.imageUrl}
                          alt={reward.name}
                          className="w-full h-32 object-cover rounded-md"
                        />
                      )}
                      <p className="text-sm text-gray-600 line-clamp-2">{reward.description}</p>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{reward.pointsRequired} points</span>
                      </div>
                      {getCategoryBadge(reward.category)}
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>Stock: {reward.quantity}</span>
                        <span>Validité: {reward.validityPeriod || 30}j</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(reward)}
                          className="flex-1"
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteClick(reward.id)}
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
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
                              src={reward.imageUrl}
                              alt={reward.name}
                              className="w-full h-32 object-cover rounded-md"
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
      </Tabs>

      {showDialog && (
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingReward ? 'Modifier la Récompense' : 'Nouvelle Récompense'}
              </DialogTitle>
              <DialogDescription>
                {editingReward ? 'Modifier les informations de la récompense' : 'Ajouter une nouvelle récompense au marketplace'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Nom</label>
                  <Input
                    placeholder="Nom de la récompense"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    placeholder="Description détaillée"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    rows={3}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Points requis</label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.pointsRequired}
                    onChange={e => setFormData({ ...formData, pointsRequired: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantité</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Catégorie</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="voucher">Bon d'achat</option>
                    <option value="gift_card">Carte cadeau</option>
                    <option value="physical">Produit physique</option>
                    <option value="digital">Produit numérique</option>
                    <option value="experience">Expérience</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={formData.isPopular || false}
                    onChange={e => setFormData({ ...formData, isPopular: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Mettre en vedette</span>
                </div>
                <div className="col-span-2">
                  <ImageUpload
                    label="Image de la récompense"
                    value={formData.imageUrl}
                    onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                    onUpload={uploadRewardImage}
                    placeholder="Cliquez ou déposez l'image"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Conditions d'utilisation</label>
                  <textarea
                    placeholder="Conditions et restrictions"
                    value={formData.terms}
                    onChange={e => setFormData({ ...formData, terms: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                    rows={2}
                  />
                </div>
                <div className="col-span-2 space-y-2 border-t pt-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isSponsored}
                      onChange={e => setFormData({ ...formData, isSponsored: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Récompense sponsorisée (requiert un partenaire)</span>
                  </label>
                  {formData.isSponsored && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Partenaire</label>
                        <select
                          value={formData.partnerId}
                          onChange={e => setFormData({ ...formData, partnerId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-md"
                          required
                        >
                          <option value="">Choisir un partenaire</option>
                          {partners.map(p => (
                            <option key={p._id || p.id} value={p._id || p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Nom sponsor</label>
                        <Input
                          value={formData.sponsorName}
                          onChange={e => setFormData({ ...formData, sponsorName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Logo sponsor (URL)</label>
                        <Input
                          value={formData.sponsorLogo}
                          onChange={e => setFormData({ ...formData, sponsorLogo: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">Notes sponsor</label>
                        <textarea
                          value={formData.sponsorNotes}
                          onChange={e => setFormData({ ...formData, sponsorNotes: e.target.value })}
                          className="w-full px-3 py-2 border rounded-md"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Récompense active</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  {editingReward ? 'Enregistrer' : 'Ajouter'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowDialog(false);
                    setEditingReward(null);
                    resetForm();
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
