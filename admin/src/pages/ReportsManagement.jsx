import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, XCircle, Eye, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getReports, handleReport } from '../services/reports';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

export default function ReportsManagement() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [error, setError] = useState(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const result = await getReports(params);
      setReports(result.items || []);
    } catch (error) {
      setError(error.message);
      toast.error('Erreur de chargement des signalements');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadReports();
  }, [filterStatus]);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['report_created', 'report_update'],
    onMessage: (event, data) => {
      loadReports();
      if (event === 'report_created') {
        toast.info('Nouveau signalement reçu');
      }
    }
  });

  const handleReview = async (reportId, action) => {
    try {
      await handleReport(reportId, action, reviewNotes);
      toast.success(`Signalement ${action === 'resolve' ? 'résolu' : 'rejeté'}`);
      setReviewDialogOpen(false);
      setReviewNotes('');
      loadReports();
    } catch (error) {
      toast.error('Erreur: ' + error.message);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: { variant: 'warning', icon: AlertCircle, label: 'En attente' },
      resolved: { variant: 'success', icon: CheckCircle, label: 'Résolu' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejeté' }
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Modération</h1>
          <p className="text-muted-foreground">Gérer les signalements et modérer le contenu</p>
        </div>
        <Button variant="outline" onClick={loadReports} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <div className="flex gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="resolved">Résolus</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des signalements</CardTitle>
          <CardDescription>
            {reports.length} signalement(s) trouvé(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Chargement des signalements...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Aucun signalement trouvé</p>
              <p className="text-sm mt-1">Les signalements des utilisateurs apparaîtront ici</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report._id}>
                    <TableCell className="font-mono text-xs">
                      {report._id.slice(-8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {report.reason}
                    </TableCell>
                    <TableCell>{report.reporter?.username || 'N/A'}</TableCell>
                    <TableCell>
                      {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedReport(report);
                            setReviewDialogOpen(true);
                          }}
                          disabled={report.status !== 'pending'}
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Traiter
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traiter le signalement</DialogTitle>
            <DialogDescription>
              Examinez le signalement et prenez une décision
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Type:</p>
                <p className="text-sm text-muted-foreground">{selectedReport.type}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Raison:</p>
                <p className="text-sm text-muted-foreground">{selectedReport.reason}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Description:</p>
                <p className="text-sm text-muted-foreground">
                  {selectedReport.description || 'Aucune description'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Notes de modération:</label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Ajoutez vos notes ici..."
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview(selectedReport._id, 'reject')}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Rejeter
            </Button>
            <Button
              onClick={() => handleReview(selectedReport._id, 'resolve')}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Résoudre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
