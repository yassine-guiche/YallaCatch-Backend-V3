import { useEffect, useMemo, useState } from 'react';
import { getImageUrl } from '../utils/images';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ImageUpload } from '../components/ui/ImageUpload';
import { uploadMarketplaceImage } from '../services/upload';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Edit, Trash2, RefreshCw, Package, CheckCircle, ShoppingBag, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { getMyItems, createMyItem, updateMyItem, deleteMyItem, getMyAnalytics } from '../services/partnerMarketplace';
import { usePartnerUpdates } from '../hooks/useRealtimeUpdates';
import { useAuth } from '../contexts/AuthContext';

export default function PartnerMarketplace() {
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
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
  });

  const { user } = useAuth();

  useEffect(() => {
    loadAll();
  }, []);

  usePartnerUpdates(user?.partnerId, {
    onMarketplaceUpdate: () => loadAll(),
    onRedemptionCreated: () => loadAll(),
    onRedemptionFulfilled: () => loadAll(),
  });

  const loadAll = async () => {
    try {
      setLoading(true);
      const [itemsRes, analyticsRes] = await Promise.all([getMyItems(), getMyAnalytics()]);
      setItems(itemsRes || []);
      setAnalytics(analyticsRes?.data || analyticsRes || {});
    } catch (err) {
      toast.error('Erreur de chargement du marketplace partenaire');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateMyItem(editingItem._id || editingItem.id, formData);
        toast.success('Item mis à jour');
      } else {
        await createMyItem(formData);
        toast.success('Item créé');
      }
      setShowDialog(false);
      setEditingItem(null);
      resetForm();
      loadAll();
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'physical',
      pointsCost: item.pointsCost || 0,
      stockQuantity: item.stockQuantity || 0,
      stockAvailable: item.stockAvailable || item.stockQuantity || 0,
      imageUrl: item.imageUrl || '',
      isActive: item.isActive ?? true,
      isPopular: item.isPopular ?? false,
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    try {
      await deleteMyItem(id);
      toast.success('Item supprimé');
      loadAll();
    } catch (err) {
      toast.error('Suppression impossible');
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
    });
  };

  const stats = useMemo(() => ({
    items: items.length,
    active: items.filter((i) => i.isActive).length,
    redemptions: analytics?.totalRedemptions || 0,
    commission: analytics?.commission || 0,
  }), [items, analytics]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Mes items marketplace</h1>
          <p className="text-gray-500">Créer et suivre vos articles sponsorisés</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll}>
            <RefreshCw className="h-4 w-4 mr-2" /> Actualiser
          </Button>
          <Button onClick={() => { resetForm(); setEditingItem(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nouvel item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Items</CardTitle>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <Package className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.items}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Actifs</CardTitle>
            <div className="p-2 rounded-lg bg-green-50 text-green-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Rédemptions</CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.redemptions}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Commission (pts)</CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.commission}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Vos articles sponsorisés</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Image</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Approbation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id || item.id}>
                  <TableCell>
                    <div className="w-10 h-10 rounded border border-gray-100 overflow-hidden bg-gray-50 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={getImageUrl(item.imageUrl)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/placeholder-reward.png';
                            e.target.className = 'w-5 h-5 opacity-20';
                          }}
                        />
                      ) : (
                        <ShoppingBag className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                  <TableCell>{item.pointsCost}</TableCell>
                  <TableCell>{item.stockAvailable}</TableCell>
                  <TableCell>
                    {item.approvalStatus === 'pending' ? (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">En attente</Badge>
                    ) : item.approvalStatus === 'rejected' ? (
                      <Badge variant="destructive">Rejeté</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600">Approuvé</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                      {item.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id || item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Aucun item pour le moment
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Modifier l'item" : 'Nouvel item'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Modifiez les informations de l'item."
                : "Les items créés doivent être approuvés par un administrateur avant d'apparaître dans la marketplace du jeu."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom</label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Catégorie</label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Physique</SelectItem>
                    <SelectItem value="digital">Digital</SelectItem>
                    <SelectItem value="discount">Réduction</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="food">Alimentation</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Points</label>
                <Input type="number" value={formData.pointsCost} onChange={(e) => setFormData({ ...formData, pointsCost: Number(e.target.value) })} min={0} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Stock</label>
                <Input type="number" value={formData.stockQuantity} onChange={(e) => setFormData({ ...formData, stockQuantity: Number(e.target.value), stockAvailable: Number(e.target.value) })} min={0} required />
              </div>
              <div className="space-y-2">
                <ImageUpload
                  label="Image de l'article"
                  value={formData.imageUrl}
                  onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                  onUpload={uploadMarketplaceImage}
                  placeholder="Cliquez ou déposez l'image"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
              <span className="text-sm">Actif</span>
              <input type="checkbox" checked={formData.isPopular} onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })} className="ml-4" />
              <span className="text-sm">Mettre en avant</span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setShowDialog(false); resetForm(); }}>Annuler</Button>
              <Button type="submit">{editingItem ? 'Mettre à jour' : 'Créer'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
