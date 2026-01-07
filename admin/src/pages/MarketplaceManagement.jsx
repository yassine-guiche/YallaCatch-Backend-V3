import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useRewardsUpdates } from '../hooks/useRealtimeUpdates';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  ShoppingBag,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  Package,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import marketplaceService from '../services/marketplace';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { getPartners } from '../services/partners';

export default function MarketplaceManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPartner, setFilterPartner] = useState('all');
  const [partners, setPartners] = useState([]);
  const [categories, setCategories] = useState([
    { value: 'voucher', label: "Bon d'Achat" },
    { value: 'gift_card', label: 'Carte Cadeau' },
    { value: 'physical', label: 'Produit Physique' },
    { value: 'digital', label: 'Produit Numérique' },
    { value: 'experience', label: 'Expérience' },
  ]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'physical',
    pointsCost: 0,
    stockQuantity: 0,
    stockAvailable: 0,
    imageUrl: '',
    isActive: true,
    isPopular: false,
    isSponsored: false,
    partnerId: '',
    sponsorName: '',
    sponsorLogo: '',
    sponsorNotes: '',
  });

  useEffect(() => {
    loadItems();
    loadCategories();
    loadPartnersList();
  }, [filterCategory, filterPartner]);

  useRewardsUpdates({
    onRewardUpdate: () => loadItems(),
    onRedemptionCreated: () => {
      toast.info('Nouvelle rédemption marketplace');
      loadItems();
    },
    onMarketplaceUpdate: () => loadItems(),
  });

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await marketplaceService.getMarketplaceItems({
        page: 1,
        limit: 100,
        category: filterCategory !== 'all' ? filterCategory : undefined,
        search: searchTerm || undefined,
        partnerId: filterPartner !== 'all' ? filterPartner : undefined,
      });
      setItems(response.items || []);
    } catch (error) {
      toast.error('Erreur lors du chargement des items');
      console.error('Load items error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await marketplaceService.getMarketplaceCategories();
      if (Array.isArray(cats) && cats.length > 0) {
        const normalized = cats.map((c) =>
          typeof c === 'string'
            ? { value: c, label: c }
            : { value: c.value || c.label || c, label: c.label || c.value || c }
        );
        setCategories(normalized);
      }
    } catch (error) {
      console.warn('Fallback to default categories', error);
    }
  };

  const loadPartnersList = async () => {
    try {
      const res = await getPartners({ page: 1, limit: 100, status: 'active' });
      setPartners(res.items || res.partners || []);
    } catch (error) {
      console.warn('Erreur chargement partenaires', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const partner = formData.isSponsored
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
          commissionRate: partner?.commissionRate,
        },
        partnerId: formData.isSponsored ? formData.partnerId : undefined,
      };
      if (editingItem) {
        await marketplaceService.updateMarketplaceItem(editingItem._id, payload);
        toast.success('Item mis à jour avec succès');
      } else {
        await marketplaceService.createMarketplaceItem(payload);
        toast.success('Item créé avec succès');
      }
      setShowAddDialog(false);
      setEditingItem(null);
      resetForm();
      loadItems();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
      console.error('Save item error:', error);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'physical',
      pointsCost: Number.isFinite(item.pointsCost) ? item.pointsCost : 0,
      stockQuantity: Number.isFinite(item.stockQuantity) ? item.stockQuantity : 0,
      stockAvailable: Number.isFinite(item.stockAvailable) ? item.stockAvailable : (Number.isFinite(item.stockQuantity) ? item.stockQuantity : 0),
      imageUrl: item.imageUrl || '',
      isActive: item.isActive ?? true,
      isPopular: item.isPopular ?? false,
      isSponsored: item.metadata?.isSponsored || !!item.partnerId,
      partnerId: item.partnerId || item.metadata?.partnerId || '',
      sponsorName: item.metadata?.sponsorName || '',
      sponsorLogo: item.metadata?.sponsorLogo || '',
      sponsorNotes: item.metadata?.sponsorNotes || '',
    });
    setShowAddDialog(true);
  };

  const handleDeleteClick = (itemId) => {
    setPendingDeleteId(itemId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await marketplaceService.deleteMarketplaceItem(pendingDeleteId);
      toast.success('Item supprimé avec succès');
      loadItems();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
      console.error('Delete item error:', error);
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleStockUpdate = async (itemId, quantity) => {
    try {
      await marketplaceService.updateMarketplaceItem(itemId, {
        stockQuantity: quantity,
        stockAvailable: quantity,
      });
      toast.success('Stock mis à jour');
      loadItems();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du stock');
      console.error('Update stock error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'physical',
      pointsCost: 0,
      stockQuantity: 0,
      stockAvailable: 0,
      imageUrl: '',
      isActive: true,
      isPopular: false,
      isSponsored: false,
      partnerId: '',
      sponsorName: '',
      sponsorLogo: '',
      sponsorNotes: '',
    });
  };

  const safeItems = Array.isArray(items) ? items : [];

  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      const matchesSearch =
        (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      const matchesPartner = filterPartner === 'all' || item.partnerId === filterPartner;
      return matchesSearch && matchesCategory && matchesPartner;
    });
  }, [items, searchTerm, filterCategory, filterPartner]);

  const stats = {
    totalItems: safeItems.length,
    activeItems: safeItems.filter((i) => i.isActive).length,
    totalStock: safeItems.reduce((sum, i) => sum + (i.stockAvailable || 0), 0),
    totalPurchases: safeItems.reduce((sum, i) => sum + (i.purchases || 0), 0),
  };

  const partnerName = (item) =>
    partners.find((p) => (p._id || p.id) === item.partnerId)?.name ||
    item.metadata?.sponsorName ||
    null;

  return (
    <div className="p-6 space-y-6">
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer l'item"
        description="Êtes-vous sûr de vouloir supprimer cet item du marketplace ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-gray-500 mt-1">Gérer les items du marketplace</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel Item
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Actifs</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStock}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Achats</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPurchases}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Rechercher un item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" onClick={loadItems}>
            <Search className="h-4 w-4 mr-2" />
            Rechercher
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Partenaire" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous partenaires</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p._id || p.id} value={p._id || p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={loadItems}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Liste des items du marketplace</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Partenaire</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item._id || item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {categories.find((c) => c.value === item.category)?.label || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.pointsCost}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{item.stockAvailable}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newStock = prompt('Nouveau stock disponible', item.stockAvailable);
                          if (newStock !== null) {
                            handleStockUpdate(item._id || item.id, Number(newStock));
                          }
                        }}
                      >
                        Mettre à jour
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                      {item.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {partnerName(item) ? (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {partnerName(item)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-500">YallaCatch</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(item._id || item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredItems.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Aucun item trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Modifier l'item" : 'Nouvel item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Mettre à jour les informations de l'item." : 'Créer un nouvel item pour le marketplace.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Nom</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Catégorie</label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Coût (points)</label>
                <Input
                  type="number"
                  value={formData.pointsCost}
                  onChange={(e) => setFormData({ ...formData, pointsCost: Number(e.target.value) })}
                  min={0}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Stock total</label>
                <Input
                  type="number"
                  value={formData.stockQuantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      stockQuantity: Number(e.target.value),
                      stockAvailable: Number(e.target.value),
                    })
                  }
                  min={0}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Image URL</label>
                <Input
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2 flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Actif</label>
                <Input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label className="text-sm font-medium text-gray-700">Populaire</label>
                <Input
                  type="checkbox"
                  checked={formData.isPopular}
                  onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isSponsored}
                  onChange={(e) => setFormData({ ...formData, isSponsored: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm font-medium">Item sponsorisé (lié à un partenaire)</span>
              </label>
              {formData.isSponsored && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Partenaire</label>
                    <select
                      value={formData.partnerId}
                      onChange={(e) => setFormData({ ...formData, partnerId: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                      required
                    >
                      <option value="">Sélectionner un partenaire</option>
                      {partners.map((p) => (
                        <option key={p._id || p.id} value={p._id || p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Nom sponsor</label>
                    <Input
                      value={formData.sponsorName}
                      onChange={(e) => setFormData({ ...formData, sponsorName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Logo sponsor (URL)</label>
                    <Input
                      value={formData.sponsorLogo}
                      onChange={(e) => setFormData({ ...formData, sponsorLogo: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Notes sponsor</label>
                    <textarea
                      className="w-full px-3 py-2 border rounded-md"
                      rows={2}
                      value={formData.sponsorNotes}
                      onChange={(e) => setFormData({ ...formData, sponsorNotes: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => { setShowAddDialog(false); resetForm(); }}>
                Annuler
              </Button>
              <Button type="submit">
                {editingItem ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
