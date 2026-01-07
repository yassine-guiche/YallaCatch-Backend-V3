import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Ticket, Calendar, Users, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getCodes, generateCodes } from '../services/promoCodes';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

export default function PromoCodesManagement() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // Form matches backend /admin/codes/generate API: { count, prefix, pointsValue, expiresAt }
  const [newCode, setNewCode] = useState({
    count: 1,
    prefix: 'YALLA',
    pointsValue: 100,
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

  useEffect(() => {
    loadCodes();
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['promo_code_created', 'promo_code_redeemed'],
    onMessage: (event, data) => {
      loadCodes();
    }
  });

  const handleCreate = async () => {
    try {
      await generateCodes({
        count: newCode.count || 1,
        prefix: newCode.prefix || 'YALLA',
        pointsValue: newCode.pointsValue || 100,
        expiresAt: newCode.expiresAt || undefined
      });

      setError(null);
      toast.success(`${newCode.count} code(s) généré(s) avec succès`);

      setCreateDialogOpen(false);
      setNewCode({
        count: 1,
        prefix: 'YALLA',
        pointsValue: 100,
        expiresAt: ''
      });
      loadCodes();
    } catch (error) {
      setError(error.message);
      toast.error('Erreur lors de la génération des codes');
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Codes Promo</h1>
          <p className="text-muted-foreground">Gérer les codes promotionnels</p>
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
                  <TableHead>Points</TableHead>
                  <TableHead>Utilisé</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>Statut</TableHead>
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
                      <Badge variant="outline">{code.pointsValue || 0} pts</Badge>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Générer des codes promo</DialogTitle>
            <DialogDescription>
              Générez des codes promotionnels en lot (format: PREFIX-XXXXXXXX)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
    </div>
  );
}
