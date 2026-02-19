import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { CheckCircle, XCircle, Eye, RefreshCw, Search, Filter, AlertTriangle, Map, List } from 'lucide-react';
import { toast } from 'sonner';
import { getCaptures, validateCapture, rejectCapture, getCaptureStats } from '../services/claims';
import { formatDate, formatRelativeDate } from '../utils/dates';
import MapComponent from '../components/MapComponent';
import { usePrizesUpdates } from '../hooks/useRealtimeUpdates';

export default function PrizeClaimsManagement() {
  const [captures, setCaptures] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCapture, setSelectedCapture] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [viewMode, setViewMode] = useState('list'); // 'list' ou 'map'
  const capturesPerPage = 20;
  const [validateConfirmOpen, setValidateConfirmOpen] = useState(false);
  const [pendingValidateId, setPendingValidateId] = useState(null);

  const loadCaptures = useCallback(async () => {
    try {
      setLoading(true);
      
      const filters = {
        page: currentPage,
        limit: capturesPerPage
      };
      
      if (searchTerm) filters.search = searchTerm;
      if (filterStatus !== 'all') filters.status = filterStatus;
      
      const result = await getCaptures(filters);
      setCaptures(result.items || []);
      setTotalCaptures(result.total || 0);
      setTotalPages(Math.ceil((result.total || 0) / capturesPerPage));
      
      // Charger les stats
      const statsData = await getCaptureStats('7d');
      setStats(statsData);
      
    } catch (err) {
      console.error('Erreur chargement captures:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, filterStatus, searchTerm]);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadCaptures();
      } else {
        setCurrentPage(1);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [searchTerm, loadCaptures]);

  // WebSocket real-time updates
  usePrizesUpdates({
    onCaptureCreated: () => {
      loadCaptures();
      toast.info('Nouvelle capture détectée');
    },
    onCaptureUpdate: () => {
      loadCaptures();
    },
    onStatsUpdate: (data) => {
      if (data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
    }
  });

  const handleValidateClick = (captureId) => {
    setPendingValidateId(captureId);
    setValidateConfirmOpen(true);
  };

  const handleValidateConfirm = async () => {
    if (!pendingValidateId) return;
    
    try {
      await validateCapture(pendingValidateId, 'Validé par admin');
      toast.success('Capture validée');
      await loadCaptures();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setValidateConfirmOpen(false);
      setPendingValidateId(null);
    }
  };

  const handleReject = async (captureId) => {
    const reason = prompt('Raison du rejet:');
    if (!reason) return;
    
    try {
      await rejectCapture(captureId, reason);
      toast.success('Capture rejetée');
      await loadCaptures();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  };

  const handleViewDetails = (capture) => {
    setSelectedCapture(capture);
    setShowDetailDialog(true);
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-800' },
      validated: { label: 'Validée', className: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejetée', className: 'bg-red-100 text-red-800' }
    };
    
    const variant = variants[status] || variants.pending;
    
    return (
      <Badge className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  const getConfidenceColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Préparer les données pour MapComponent
  const capturesForMap = captures.map(capture => ({
    id: capture.id,
    name: capture.prizeName || 'Capture',
    type: 'capture',
    status: capture.status,
    location: capture.location,
    confidenceScore: capture.confidenceScore,
    userId: capture.userId,
    createdAt: capture.createdAt
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={validateConfirmOpen}
        onOpenChange={setValidateConfirmOpen}
        title="Valider la capture"
        description="Êtes-vous sûr de vouloir valider cette capture ? Les points seront crédités à l'utilisateur."
        confirmLabel="Valider"
        variant="success"
        onConfirm={handleValidateConfirm}
      />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Validation des Captures</h1>
          <p className="text-gray-500 mt-1">
            {totalCaptures} captures au total
          </p>
        </div>
        <Button variant="outline" onClick={loadCaptures} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">En attente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Validées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.validated || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Rejetées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.rejected || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Taux de validation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.validationRate ? `${stats.validationRate.toFixed(1)}%` : '0%'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters et Vue Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Rechercher par utilisateur ou prix..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="validated">Validées</option>
              <option value="rejected">Rejetées</option>
            </select>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4 mr-2" />
                Liste
              </Button>
              <Button
                variant={viewMode === 'map' ? 'default' : 'outline'}
                onClick={() => setViewMode('map')}
              >
                <Map className="h-4 w-4 mr-2" />
                Carte
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vue Liste */}
      {viewMode === 'list' && (
        <>
          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Confiance</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {captures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                        Aucune capture trouvée
                      </TableCell>
                    </TableRow>
                  ) : (
                    captures.map((capture) => (
                      <TableRow key={capture.id}>
                        <TableCell className="font-medium">
                          {capture.userName || capture.userId}
                        </TableCell>
                        <TableCell>{capture.prizeName || 'Prix inconnu'}</TableCell>
                        <TableCell>{getStatusBadge(capture.status)}</TableCell>
                        <TableCell>
                          <span className={`font-semibold ${getConfidenceColor(capture.confidenceScore)}`}>
                            {capture.confidenceScore}%
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {formatRelativeDate(capture.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(capture)}
                              aria-label="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {capture.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => handleValidateClick(capture.id)}
                                  aria-label="Valider"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleReject(capture.id)}
                                  aria-label="Rejeter"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Page {currentPage} sur {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || loading}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Vue Carte */}
      {viewMode === 'map' && (
        <Card>
          <CardHeader>
            <CardTitle>Carte des Captures</CardTitle>
            <CardDescription>
              Visualisation géographique des captures avec code couleur par statut
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Légende */}
            <div className="flex gap-6 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                <span className="text-sm">Validées</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                <span className="text-sm">En attente</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-purple-500"></div>
                <span className="text-sm">Rejetées</span>
              </div>
            </div>
            
            <MapComponent
              prizes={capturesForMap}
              height="600px"
              center={[36.8065, 10.1815]}
              zoom={7}
              showPrizes={true}
              interactive={false}
              mode="single"
            />
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de la Capture</DialogTitle>
            <DialogDescription>
              Informations complètes et validation
            </DialogDescription>
          </DialogHeader>
          {selectedCapture && (
            <div className="space-y-6">
              {/* Informations principales */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Utilisateur</label>
                  <p className="text-base font-medium">{selectedCapture.userName || selectedCapture.userId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Prix</label>
                  <p className="text-base font-medium">{selectedCapture.prizeName || 'Prix inconnu'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Statut</label>
                  <div className="mt-1">{getStatusBadge(selectedCapture.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Score de confiance</label>
                  <p className={`text-base font-bold ${getConfidenceColor(selectedCapture.confidenceScore)}`}>
                    {selectedCapture.confidenceScore}%
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Date de capture</label>
                  <p className="text-base">{formatDate(selectedCapture.createdAt)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Localisation</label>
                  <p className="text-base">
                    {selectedCapture.location?.coordinates 
                      ? `${selectedCapture.location.coordinates[1].toFixed(4)}, ${selectedCapture.location.coordinates[0].toFixed(4)}`
                      : 'Non disponible'}
                  </p>
                </div>
              </div>

              {/* Photo de capture */}
              {selectedCapture.photo && (
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">Photo de capture</label>
                  <img 
                    src={selectedCapture.photo} 
                    alt="Capture" 
                    className="w-full rounded-lg border"
                  />
                </div>
              )}

              {/* Mini Carte */}
              {selectedCapture.location?.coordinates && (
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">Position exacte</label>
                  <MapComponent
                    prizes={[{
                      id: selectedCapture.id,
                      name: selectedCapture.prizeName || 'Capture',
                      type: 'capture',
                      status: selectedCapture.status,
                      location: selectedCapture.location
                    }]}
                    height="300px"
                    center={[
                      selectedCapture.location.coordinates[1],
                      selectedCapture.location.coordinates[0]
                    ]}
                    zoom={14}
                    showPrizes={true}
                    interactive={false}
                    mode="single"
                  />
                </div>
              )}

              {/* Raison de rejet si applicable */}
              {selectedCapture.status === 'rejected' && selectedCapture.rejectionReason && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <label className="text-sm font-medium text-red-800 block mb-1">Raison du rejet</label>
                  <p className="text-sm text-red-700">{selectedCapture.rejectionReason}</p>
                </div>
              )}

              {/* Actions */}
              {selectedCapture.status === 'pending' && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      handleValidateClick(selectedCapture.id);
                      setShowDetailDialog(false);
                    }}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Valider
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() => {
                      handleReject(selectedCapture.id);
                      setShowDetailDialog(false);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                </div>
              )}

              {selectedCapture.status !== 'pending' && (
                <div className="flex justify-end pt-4 border-t">
                  <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                    Fermer
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
