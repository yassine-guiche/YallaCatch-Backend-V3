import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Ticket, Calendar, RefreshCw, Trash2, Power, PowerOff, Gift, Coins, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getCodes, generateCodes, deactivateCode, activateCode, revokeCode } from '../services/promoCodes';
import { getRewards } from '../services/rewards';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

export default function PromoCodesManagement() {
  const [codes, setCodes] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState(null);

  // Form state - now with code type choice
  const [newCode, setNewCode] = useState({
    count: 1,
    prefix: 'YALLA',
    codeType: 'points', // 'points' or 'reward'
    pointsValue: 100,
    rewardId: '',
    expiresAt: ''
  });
  const [error, setError] = useState(null);

  const loadCodes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getCodes({ limit: 100 });
      setCodes(result.items || []);
    } catch (error) {
      setError(error.message);
      toast.error('Erreur de chargement des codes');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRewards = useCallback(async () => {
    try {
      const result = await getRewards({ limit: 100 });
      setRewards(result.items || result || []);
    } catch (error) {
      console.error('Failed to load rewards:', error);
    }
  }, []);

  useEffect(() => {
    loadCodes();
    loadRewards();
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['promo_code_created', 'promo_code_redeemed'],
    onMessage: () => {
      loadCodes();
    }
  });

  const handleCreate = async () => {
    try {
      const payload = {
        count: newCode.count || 1,
        prefix: newCode.prefix || 'YALLA',
        expiresAt: newCode.expiresAt || undefined
      };

      if (newCode.codeType === 'reward') {
        if (!newCode.rewardId) {
          toast.error('Veuillez sélectionner une récompense');
          return;
        }
        payload.rewardId = newCode.rewardId;
      } else {
        payload.pointsValue = newCode.pointsValue || 100;
      }

      await generateCodes(payload);

      setError(null);
      toast.success(`${newCode.count} code(s) généré(s) avec succès`);

      setCreateDialogOpen(false);
      setNewCode({
        count: 1,
        prefix: 'YALLA',
        codeType: 'points',
        pointsValue: 100,
        rewardId: '',
        expiresAt: ''
      });
      loadCodes();
    } catch (error) {
      setError(error.message);
      toast.error('Erreur lors de la génération des codes');
    }
  };

  const handleToggleActive = async (code) => {
    try {
      if (code.isActive) {
        await deactivateCode(code._id);
        toast.success('Code désactivé');
      } else {
        await activateCode(code._id);
        toast.success('Code activé');
      }
      loadCodes();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la modification');
    }
  };

  const handleDeleteClick = (code) => {
    if (code.isUsed) {
      toast.error('Impossible de supprimer un code utilisé');
      return;
    }
    setCodeToDelete(code);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!codeToDelete) return;
    try {
      await revokeCode(codeToDelete._id);
      toast.success('Code supprimé');
      setDeleteDialogOpen(false);
      setCodeToDelete(null);
      loadCodes();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const generateRandomPrefix = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let prefix = 'YALLA';
    for (let i = 0; i < 3; i++) {
      prefix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode({ ...newCode, prefix });
  };

  const getRewardName = (rewardId) => {
    const reward = rewards.find(r => r._id === rewardId || r.id === rewardId);
    return reward?.name || 'Récompense inconnue';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Codes Promo</h1>
          <p className="text-muted-foreground">Gérer les codes promotionnels (points ou récompenses)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCodes} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Code
          </Button>
        </div>
      </div>

      <Card className="flex flex-col min-h-0">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Liste des codes promo</CardTitle>
          <CardDescription>
            {codes.length} code(s) trouvé(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Chargement des codes...</p>
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Aucun code promo trouvé</p>
              <p className="text-sm mt-1">Cliquez sur "Nouveau Code" pour générer des codes</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Valeur</TableHead>
                  <TableHead>Utilisé</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => (
                  <TableRow key={code._id}>
                    <TableCell className="font-mono font-bold">
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        {code.code}
                      </div>
                    </TableCell>
                    <TableCell>
                      {code.rewardId ? (
                        <Badge variant="secondary" className="gap-1">
                          <Gift className="h-3 w-3" />
                          Récompense
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Coins className="h-3 w-3" />
                          Points
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.rewardId ? (
                        <span className="text-sm">{getRewardName(code.rewardId)}</span>
                      ) : (
                        <Badge variant="outline">{code.pointsValue || 0} pts</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={code.isUsed ? 'destructive' : 'success'}>
                        {code.isUsed ? 'Utilisé' : 'Disponible'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString('fr-FR') : 'Jamais'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={code.isActive ? 'success' : 'secondary'}>
                        {code.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleActive(code)}>
                            {code.isActive ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Désactiver
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activer
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(code)}
                            disabled={code.isUsed}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Générer des codes promo</DialogTitle>
            <DialogDescription>
              Créez des codes promotionnels pour vos utilisateurs (points ou récompenses directes)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Code Type Selection */}
            <div className="space-y-2">
              <Label>Type de code</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newCode.codeType === 'points' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setNewCode({ ...newCode, codeType: 'points', rewardId: '' })}
                >
                  <Coins className="h-4 w-4 mr-2" />
                  Points
                </Button>
                <Button
                  type="button"
                  variant={newCode.codeType === 'reward' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setNewCode({ ...newCode, codeType: 'reward', pointsValue: 0 })}
                >
                  <Gift className="h-4 w-4 mr-2" />
                  Récompense
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Nombre de codes à générer</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="100"
                value={newCode.count}
                onChange={(e) => setNewCode({ ...newCode, count: parseInt(e.target.value) || 1 })}
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Préfixe du code</Label>
              <div className="flex gap-2">
                <Input
                  id="prefix"
                  value={newCode.prefix}
                  onChange={(e) => setNewCode({ ...newCode, prefix: e.target.value.toUpperCase() })}
                  placeholder="YALLA"
                  className="font-mono"
                />
                <Button variant="outline" onClick={generateRandomPrefix}>
                  Générer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Exemple: {newCode.prefix}-A1B2C3D4
              </p>
            </div>

            {/* Conditional: Points Value or Reward Selection */}
            {newCode.codeType === 'points' ? (
              <div className="space-y-2">
                <Label htmlFor="pointsValue">Valeur en points</Label>
                <Input
                  id="pointsValue"
                  type="number"
                  min="1"
                  value={newCode.pointsValue}
                  onChange={(e) => setNewCode({ ...newCode, pointsValue: parseInt(e.target.value) || 100 })}
                  placeholder="100"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="rewardId">Récompense liée</Label>
                <Select
                  value={newCode.rewardId}
                  onValueChange={(value) => setNewCode({ ...newCode, rewardId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une récompense" />
                  </SelectTrigger>
                  <SelectContent>
                    {rewards.map((reward) => (
                      <SelectItem key={reward._id || reward.id} value={reward._id || reward.id}>
                        {reward.name} ({reward.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  L'utilisateur recevra un QR code pour cette récompense chez le partenaire
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="expiresAt">Date d'expiration (optionnel)</Label>
              <Input
                id="expiresAt"
                type="date"
                value={newCode.expiresAt}
                onChange={(e) => setNewCode({ ...newCode, expiresAt: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate}>
              Générer {newCode.count} code(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Supprimer le code promo"
        description={`Êtes-vous sûr de vouloir supprimer le code "${codeToDelete?.code}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        onConfirm={handleDeleteConfirm}
        variant="destructive"
      />
    </div>
  );
}
