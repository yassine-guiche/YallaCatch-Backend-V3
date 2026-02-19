import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Plus,
  Play,
  Pause,
  StopCircle,
  BarChart3,
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  TrendingUp,
  Users,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  FlaskConical,
  Beaker,
} from 'lucide-react';
import abTestingService, {
  AB_TEST_TYPES,
  AB_TEST_STATUSES,
} from '../services/abTesting';
import { formatRelativeDate } from '../utils/dates';
import { toast } from 'sonner';

export default function ABTestingManagement() {
  // State
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [results, setResults] = useState(null);

  // Confirm dialog states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingEndId, setPendingEndId] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'feature',
    variants: [
      { name: 'Control', trafficAllocation: 50, config: {} },
      { name: 'Variant A', trafficAllocation: 50, config: {} },
    ],
    startDate: '',
    sampleSize: 1000,
    confidenceLevel: 95,
  });

  const showToast = (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  };

  // Fetch tests
  const fetchTests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterType !== 'all') params.type = filterType;

      const response = await abTestingService.getTests(params);
      setTests(response.items || []);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching A/B tests:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['abtest_update', 'abtest_started', 'abtest_stopped'],
    onMessage: () => {
      fetchTests();
    }
  });

  // CRUD Operations
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await abTestingService.createTest(formData);
      showToast('success', 'Test A/B créé avec succès');
      setShowCreateModal(false);
      resetForm();
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await abTestingService.updateTest(selectedTest._id, formData);
      showToast('success', 'Test A/B mis à jour');
      setShowEditModal(false);
      resetForm();
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDeleteClick = (testId) => {
    setPendingDeleteId(testId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await abTestingService.deleteTest(pendingDeleteId);
      showToast('success', 'Test supprimé');
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Test Actions
  const handleStartTest = async (testId) => {
    try {
      await abTestingService.startTest(testId);
      showToast('success', 'Test démarré');
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handlePauseTest = async (testId) => {
    try {
      await abTestingService.pauseTest(testId);
      showToast('success', 'Test mis en pause');
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleEndTestClick = (testId) => {
    setPendingEndId(testId);
    setEndConfirmOpen(true);
  };

  const handleEndTestConfirm = async () => {
    if (!pendingEndId) return;
    try {
      await abTestingService.endTest(pendingEndId);
      showToast('success', 'Test terminé');
      fetchTests();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setEndConfirmOpen(false);
      setPendingEndId(null);
    }
  };

  // View Metrics & Results
  const handleViewMetrics = async (test) => {
    try {
      setSelectedTest(test);
      const data = await abTestingService.getTestMetrics(test._id);
      setMetrics(data);
      setShowMetricsModal(true);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleViewResults = async (test) => {
    try {
      setSelectedTest(test);
      const data = await abTestingService.getTestResults(test._id);
      setResults(data);
      setShowResultsModal(true);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  // Form helpers
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'feature',
      variants: [
        { name: 'Control', trafficAllocation: 50, config: {} },
        { name: 'Variant A', trafficAllocation: 50, config: {} },
      ],
      startDate: '',
      sampleSize: 1000,
      confidenceLevel: 95,
    });
    setSelectedTest(null);
  };

  const openEditModal = (test) => {
    setSelectedTest(test);
    setFormData({
      name: test.name,
      description: test.description || '',
      type: test.type,
      variants: test.variants || [],
      startDate: test.startDate?.split('T')[0] || '',
      sampleSize: test.sampleSize || 1000,
      confidenceLevel: test.confidenceLevel || 95,
    });
    setShowEditModal(true);
  };

  const addVariant = () => {
    const newVariants = [...formData.variants];
    const totalAllocation = newVariants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    const remaining = Math.max(0, 100 - totalAllocation);
    newVariants.push({
      name: `Variant ${String.fromCharCode(65 + newVariants.length - 1)}`,
      trafficAllocation: remaining,
      config: {},
    });
    setFormData({ ...formData, variants: newVariants });
  };

  const removeVariant = (index) => {
    if (formData.variants.length <= 2) return;
    const newVariants = formData.variants.filter((_, i) => i !== index);
    setFormData({ ...formData, variants: newVariants });
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData({ ...formData, variants: newVariants });
  };

  // Filtering
  const filteredTests = tests.filter((test) => {
    const matchSearch =
      test.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  // Status helpers
  const getStatusBadge = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      ended: 'bg-blue-100 text-blue-700',
    };
    const labels = {
      draft: 'Brouillon',
      active: 'En cours',
      paused: 'En pause',
      ended: 'Terminé',
    };
    return (
      <Badge className={colors[status] || 'bg-gray-100'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getTypeBadge = (type) => {
    const labels = {
      feature: 'Fonctionnalité',
      ui: 'Interface',
      mechanics: 'Mécanique',
      rewards: 'Récompenses',
      pricing: 'Prix',
    };
    const icons = {
      feature: <FlaskConical className="h-3 w-3 mr-1" />,
      ui: <Target className="h-3 w-3 mr-1" />,
      mechanics: <Beaker className="h-3 w-3 mr-1" />,
      rewards: <TrendingUp className="h-3 w-3 mr-1" />,
      pricing: <BarChart3 className="h-3 w-3 mr-1" />,
    };
    return (
      <Badge variant="outline" className="flex items-center">
        {icons[type]}
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer le test"
        description="Êtes-vous sûr de vouloir supprimer ce test A/B ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />
      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="Terminer le test"
        description="Êtes-vous sûr de vouloir terminer ce test ? Les résultats seront figés."
        confirmLabel="Terminer"
        variant="warning"
        onConfirm={handleEndTestConfirm}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical className="h-7 w-7 text-purple-600" />
            Tests A/B
          </h1>
          <p className="text-gray-500 mt-1">
            Gérer les expérimentations et optimisations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTests} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Test
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tests Actifs</p>
                <p className="text-2xl font-bold text-green-600">
                  {tests.filter((t) => t.status === 'active').length}
                </p>
              </div>
              <Play className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">En Pause</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {tests.filter((t) => t.status === 'paused').length}
                </p>
              </div>
              <Pause className="h-8 w-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Terminés</p>
                <p className="text-2xl font-bold text-blue-600">
                  {tests.filter((t) => t.status === 'ended').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Tests</p>
                <p className="text-2xl font-bold text-gray-900">{tests.length}</p>
              </div>
              <FlaskConical className="h-8 w-8 text-gray-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Rechercher un test..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="active">En cours</option>
              <option value="paused">En pause</option>
              <option value="ended">Terminé</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">Tous les types</option>
              <option value="feature">Fonctionnalité</option>
              <option value="ui">Interface</option>
              <option value="mechanics">Mécanique</option>
              <option value="rewards">Récompenses</option>
              <option value="pricing">Prix</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Tests</CardTitle>
          <CardDescription>
            {filteredTests.length} test(s) trouvé(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-gray-500">Chargement...</p>
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="text-center py-8">
              <FlaskConical className="h-12 w-12 mx-auto text-gray-300" />
              <p className="mt-2 text-gray-500">Aucun test trouvé</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                Créer un test
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTests.map((test) => (
                  <TableRow key={test._id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{test.name}</p>
                        {test.description && (
                          <p className="text-sm text-gray-500 truncate max-w-xs">
                            {test.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(test.type)}</TableCell>
                    <TableCell>{getStatusBadge(test.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {test.variants?.map((v, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {v.name}: {v.trafficAllocation}%
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-gray-400" />
                        {test.participantCount || 0}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {test.createdAt ? formatRelativeDate(test.createdAt) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {test.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartTest(test._id)}
                            title="Démarrer"
                          >
                            <Play className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {test.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePauseTest(test._id)}
                            title="Pause"
                          >
                            <Pause className="h-4 w-4 text-yellow-600" />
                          </Button>
                        )}
                        {test.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartTest(test._id)}
                            title="Reprendre"
                          >
                            <Play className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {['active', 'paused'].includes(test.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEndTestClick(test._id)}
                            title="Terminer"
                          >
                            <StopCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewMetrics(test)}
                          title="Métriques"
                        >
                          <BarChart3 className="h-4 w-4 text-blue-600" />
                        </Button>
                        {test.status === 'ended' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewResults(test)}
                            title="Résultats"
                          >
                            <Eye className="h-4 w-4 text-purple-600" />
                          </Button>
                        )}
                        {test.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(test)}
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4 text-gray-600" />
                          </Button>
                        )}
                        {test.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(test._id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">
                {showCreateModal ? 'Nouveau Test A/B' : 'Modifier le Test'}
              </h2>
            </div>
            <form onSubmit={showCreateModal ? handleCreate : handleUpdate}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom du test *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type *</label>
                    <select
                      className="w-full px-3 py-2 border rounded-lg"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="feature">Fonctionnalité</option>
                      <option value="ui">Interface</option>
                      <option value="mechanics">Mécanique de jeu</option>
                      <option value="rewards">Récompenses</option>
                      <option value="pricing">Tarification</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Date de début</label>
                    <Input
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Taille échantillon</label>
                    <Input
                      type="number"
                      value={formData.sampleSize}
                      onChange={(e) => setFormData({ ...formData, sampleSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Niveau de confiance (%)</label>
                    <Input
                      type="number"
                      min="80"
                      max="99"
                      value={formData.confidenceLevel}
                      onChange={(e) => setFormData({ ...formData, confidenceLevel: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Variants */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium">Variants</label>
                    <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.variants.map((variant, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                        <Input
                          value={variant.name}
                          onChange={(e) => updateVariant(index, 'name', e.target.value)}
                          placeholder="Nom du variant"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={variant.trafficAllocation}
                          onChange={(e) => updateVariant(index, 'trafficAllocation', Number(e.target.value))}
                          className="w-20"
                        />
                        <span className="text-sm text-gray-500">%</span>
                        {formData.variants.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVariant(index)}
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Total: {formData.variants.reduce((sum, v) => sum + v.trafficAllocation, 0)}% (doit être 100%)
                  </p>
                </div>
              </div>
              <div className="p-6 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit">
                  {showCreateModal ? 'Créer' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Metrics Modal */}
      {showMetricsModal && selectedTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Métriques: {selectedTest.name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowMetricsModal(false)}>
                <XCircle className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-6">
              {metrics ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Participants</p>
                      <p className="text-2xl font-bold">{metrics.totalParticipants || 0}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Conversions</p>
                      <p className="text-2xl font-bold">{metrics.totalConversions || 0}</p>
                    </div>
                  </div>
                  {metrics.variants?.map((v, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{v.name}</span>
                        <Badge>{v.conversionRate?.toFixed(2)}%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${v.conversionRate || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500">Chargement des métriques...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && selectedTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Résultats: {selectedTest.name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowResultsModal(false)}>
                <XCircle className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-6">
              {results ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700">Variant Gagnant</p>
                    <p className="text-xl font-bold text-green-800">
                      {results.winner?.name || 'Non déterminé'}
                    </p>
                    {results.winner?.improvement && (
                      <p className="text-sm text-green-600">
                        +{results.winner.improvement.toFixed(2)}% d'amélioration
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Significativité statistique</p>
                    <p className="text-lg font-bold">
                      {results.statisticalSignificance?.toFixed(2)}%
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Recommandation</p>
                    <p className="text-sm">{results.recommendation || 'Aucune recommandation'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-500">Chargement des résultats...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
