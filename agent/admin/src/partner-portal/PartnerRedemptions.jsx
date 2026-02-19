import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { ScanLine, RefreshCw, CheckCircle, XCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { getPendingRedemptions, scanRedemption } from '../services/redemptions-partner';
import { formatDate } from '../utils/dates';
import QRScanner from '../components/QRScanner';
import { usePartnerUpdates } from '../hooks/useRealtimeUpdates';
import { useAuth } from '../contexts/AuthContext';

const statusVariant = {
  PENDING: 'outline',
  FULFILLED: 'default',
  CANCELLED: 'destructive',
};

export default function PartnerRedemptions() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanDialog, setScanDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { success: boolean, message: string, data?: any }

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

  const { user } = useAuth();

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  usePartnerUpdates(user?.partnerId, {
    onRedemptionCreated: () => loadPending(),
    onRedemptionFulfilled: () => loadPending(),
  });

  // Handle successful QR scan from the scanner
  const handleScanSuccess = async (code) => {
    if (processing) return;

    setProcessing(true);
    setLastResult(null);

    try {
      // Send to backend for validation
      const result = await scanRedemption(code);

      setLastResult({
        success: true,
        message: 'Redemption validée avec succès!',
        data: result
      });

      toast.success('Redemption validée', {
        description: result?.redemption?.id
          ? `ID: ${result.redemption.id}`
          : 'Le QR code a été accepté',
      });

      // Refresh the pending list
      loadPending();

      // Auto-close after showing success
      setTimeout(() => {
        setScanDialog(false);
        setLastResult(null);
      }, 2000);

    } catch (error) {
      const errorMessage = error?.message || 'QR invalide ou déjà traité';

      setLastResult({
        success: false,
        message: errorMessage
      });

      toast.error('Validation impossible', {
        description: errorMessage,
      });
    } finally {
      setProcessing(false);
    }
  };

  // Handle scan error from the scanner
  const handleScanError = (errorMessage) => {
    toast.error('Code invalide', {
      description: errorMessage || 'Le code scanné n\'est pas valide',
    });
  };

  // Close dialog and reset state
  const handleCloseDialog = () => {
    setScanDialog(false);
    setLastResult(null);
    setProcessing(false);
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
      <TableRow key={item.id || item._id}>
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
          <Badge variant={statusVariant[String(item.status || 'PENDING').toUpperCase()] || 'secondary'}>
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
            Scanner QR
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

      {/* Scan Dialog with QR Scanner */}
      <Dialog open={scanDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scanner un QR Code</DialogTitle>
            <DialogDescription>
              Scannez le QR code du client pour valider sa redemption.
            </DialogDescription>
          </DialogHeader>

          {/* Close button */}
          <button
            onClick={handleCloseDialog}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            disabled={processing}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fermer</span>
          </button>

          {/* Show result feedback or scanner */}
          {lastResult ? (
            <div className={`p-6 rounded-lg text-center ${lastResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
              {lastResult.success ? (
                <>
                  <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-3" />
                  <h3 className="text-lg font-semibold text-green-800">Succès!</h3>
                  <p className="text-green-600 mt-1">{lastResult.message}</p>
                  {lastResult.data?.redemption?.reward?.name && (
                    <p className="text-sm text-green-700 mt-2">
                      Récompense: {lastResult.data.redemption.reward.name}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <XCircle className="h-16 w-16 mx-auto text-red-500 mb-3" />
                  <h3 className="text-lg font-semibold text-red-800">Erreur</h3>
                  <p className="text-red-600 mt-1">{lastResult.message}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setLastResult(null)}
                  >
                    Réessayer
                  </Button>
                </>
              )}
            </div>
          ) : (
            <QRScanner
              onScan={handleScanSuccess}
              onError={handleScanError}
              autoValidate={true}
              showManualInput={true}
              soundEnabled={true}
            />
          )}

          {/* Processing indicator */}
          {processing && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-20">
              <div className="text-center">
                <RefreshCw className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-2" />
                <p className="text-gray-600">Validation en cours...</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
