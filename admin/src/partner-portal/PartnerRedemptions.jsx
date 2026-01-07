import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { ScanLine, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getPendingRedemptions, scanRedemption } from '../services/redemptions-partner';
import { formatDate } from '../utils/dates';

const statusVariant = {
  PENDING: 'outline',
  FULFILLED: 'default',
  CANCELLED: 'destructive',
};

export default function PartnerRedemptions() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanDialog, setScanDialog] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [scanning, setScanning] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      setLoading(true);
      const items = await getPendingRedemptions({ limit: 100 });
      setPending(items);
    } catch (error) {
      const message = error?.message || 'Impossible de récupérer les redemptions en attente';
      toast.error('Chargement impossible', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, []);

  const handleScan = async () => {
    if (!qrInput.trim()) {
      toast.error('QR/code manquant', { description: 'Collez le code ou le payload base64 du QR.' });
      return;
    }

    try {
      setScanning(true);
      const result = await scanRedemption(qrInput.trim());
      toast.success('Redemption validée', {
        description: result?.redemption?.id ? `ID ${result.redemption.id}` : 'QR accepté',
      });
      setScanDialog(false);
      setQrInput('');
      loadPending();
    } catch (error) {
      toast.error('Validation impossible', {
        description: error?.message || 'QR invalide ou déjà traité',
      });
    } finally {
      setScanning(false);
    }
  };

  const renderRows = () => {
    if (!pending || pending.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center text-gray-500 py-6">
            {loading ? 'Chargement...' : 'Aucune redemption en attente'}
          </TableCell>
        </TableRow>
      );
    }

    return pending.map((item) => (
      <TableRow key={item.id}>
        <TableCell>
          <div className="font-medium">{item.user?.displayName || 'Joueur'}</div>
          <div className="text-xs text-gray-500">{item.user?.email}</div>
        </TableCell>
        <TableCell>
          <div className="font-medium">{item.reward?.name || 'Récompense'}</div>
          <div className="text-xs text-gray-500">{item.reward?.category || '—'}</div>
        </TableCell>
        <TableCell>
          <div className="text-sm">{item.reward?.partnerId?.name || 'Partenaire'}</div>
        </TableCell>
        <TableCell>
          <Badge variant={statusVariant[item.status] || 'secondary'}>
            {item.status || 'PENDING'}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-gray-600">
          {item.createdAt ? formatDate(item.createdAt) : '—'}
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validations partenaires</h1>
          <p className="text-gray-600">Suivi des redemptions à valider et scan des QR codes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPending} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={() => setScanDialog(true)}>
            <ScanLine className="h-4 w-4 mr-2" />
            Scanner / Valider
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Redemptions en attente</CardTitle>
          <CardDescription>
            Affichage limité aux récompenses liées à votre partenaire si vous êtes connecté en tant que partenaire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Récompense</TableHead>
                  <TableHead>Partenaire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créée le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderRows()}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={scanDialog} onOpenChange={setScanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scanner un QR / saisir un code</DialogTitle>
            <DialogDescription>
              Collez le contenu du QR (payload base64 ou code texte) pour valider la récompense.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Payload base64 du QR ou code alphanumérique"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Les partenaires ne peuvent valider que leurs propres récompenses. Un code déjà utilisé sera refusé.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialog(false)} disabled={scanning}>
              Annuler
            </Button>
            <Button onClick={handleScan} disabled={scanning}>
              {scanning ? 'Validation...' : 'Valider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
