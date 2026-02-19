import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import {
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  Eye,
  Zap,
  BarChart3,
  Filter,
  Download,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  getPowerUps,
  createPowerUp,
  updatePowerUp,
  deletePowerUp,
  getPowerUpAnalytics,
} from '../services/powerUps';
import { toast } from 'sonner';

const PowerUpManagement = () => {
  // State
  const [powerUps, setPowerUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPowerUp, setSelectedPowerUp] = useState(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEnabled] = useState(null); // null = show all, true = enabled only, false = disabled only
  const [allAnalytics, setAllAnalytics] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingDeleteName, setPendingDeleteName] = useState('');

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['powerup_created', 'powerup_update', 'powerup_used'],
    onMessage: () => {
      fetchPowerUps();
    }
  });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'radar_boost',
    icon: '⚡',
    rarity: 'common',
    durationMs: 30000,
    dropRate: 10,
    maxPerSession: 3,
    maxInInventory: 10,
    effects: {
      radarBoost: { radiusMultiplier: 2 }
    },
    notes: '',
  });

  // Power-up types and their descriptions
  const powerUpTypes = {
    radar_boost: {
      label: 'Radar Boost',
      icon: '🎯',
      description: 'Expands prize detection radius',
      effectsRequired: ['radiusMultiplier'],
    },
    double_points: {
      label: 'Double Points',
      icon: '💰',
      description: 'Doubles earned points temporarily',
      effectsRequired: ['pointsMultiplier'],
    },
    speed_boost: {
      label: 'Speed Boost',
      icon: '⚡',
      description: 'Increases movement speed',
      effectsRequired: ['speedMultiplier'],
    },
    shield: {
      label: 'Shield',
      icon: '🛡️',
      description: 'Protects against damage',
      effectsRequired: ['damageMitigation'],
    },
    time_extension: {
      label: 'Time Extension',
      icon: '⏱️',
      description: 'Extends gameplay time',
      effectsRequired: ['additionalTimeMs'],
    },
  };

  const rarities = [
    { value: 'common', label: 'Common', color: 'bg-gray-400' },
    { value: 'rare', label: 'Rare', color: 'bg-blue-400' },
    { value: 'epic', label: 'Epic', color: 'bg-purple-400' },
    { value: 'legendary', label: 'Legendary', color: 'bg-yellow-400' },
  ];

  // Fetch power-ups
  const fetchPowerUps = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterEnabled !== null) params.enabled = filterEnabled;
      if (filterType) params.type = filterType;
      if (filterRarity) params.rarity = filterRarity;

      console.log('Fetching power-ups with params:', params);
      const response = await getPowerUps(params);
      console.log('Power-ups response:', response);
      
      const items = response.items || response.data || [];
      console.log('Setting powerUps to:', items.length, 'items');
      setPowerUps(items);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching power-ups:', err);
      toast.error('Erreur lors du chargement des power-ups');
    } finally {
      setLoading(false);
    }
  }, [filterEnabled, filterType, filterRarity]);

  // Fetch all analytics
  const fetchAllAnalytics = async () => {
    try {
      const data = await getPowerUpAnalytics();
      setAllAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  // Fetch analytics for specific power-up
  const fetchPowerUpAnalytics = async (powerUpId) => {
    try {
      const data = await getPowerUpAnalytics(powerUpId);
      setAnalytics(data);
      setShowAnalyticsModal(true);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message);
    }
  };

  // Create power-up
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const created = await createPowerUp(formData);
      console.log('Power-up created:', created);
      
      setShowCreateModal(false);
      resetForm();
      toast.success(`Power-up "${formData.name}" créé avec succès!`);
      
      // Refresh the list after a short delay to allow cache invalidation
      setTimeout(() => {
        fetchPowerUps();
        fetchAllAnalytics();
      }, 500);
    } catch (err) {
      console.error('Create power-up error:', err);
      toast.error(err.message || 'Erreur lors de la création');
      setError(err.message);
    }
  };

  // Update power-up
  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await updatePowerUp(selectedPowerUp._id, formData);
      
      setShowEditModal(false);
      resetForm();
      toast.success(`Power-up "${formData.name}" mis à jour`);
      fetchPowerUps();
      fetchAllAnalytics();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la mise à jour');
      setError(err.message);
    }
  };

  // Delete power-up
  const handleDeleteClick = (powerUpId, powerUpName) => {
    setPendingDeleteId(powerUpId);
    setPendingDeleteName(powerUpName);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;

    try {
      await deletePowerUp(pendingDeleteId);
      
      toast.success(`Power-up "${pendingDeleteName}" supprimé`);
      fetchPowerUps();
      fetchAllAnalytics();
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la suppression');
      setError(err.message);
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
      setPendingDeleteName('');
    }
  };

  // Update drop rate
  const handleUpdateDropRate = async (powerUpId, newRate, powerUpName) => {
    try {
      await updatePowerUp(powerUpId, { dropRate: newRate });
      setSuccess(`📊 Drop rate for "${powerUpName}" updated to ${newRate}%`);
      setTimeout(() => setSuccess(null), 3000);
      fetchPowerUps();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'radar_boost',
      icon: '⚡',
      rarity: 'common',
      durationMs: 30000,
      dropRate: 10,
      maxPerSession: 3,
      maxInInventory: 10,
      effects: {
        radarBoost: { radiusMultiplier: 2 }
      },
      notes: '',
    });
    setSelectedPowerUp(null);
  };

  const openEditModal = (powerUp) => {
    setSelectedPowerUp(powerUp);
    setFormData({
      name: powerUp.name,
      description: powerUp.description,
      type: powerUp.type,
      icon: powerUp.icon,
      rarity: powerUp.rarity,
      durationMs: powerUp.durationMs,
      dropRate: powerUp.dropRate,
      maxPerSession: powerUp.maxPerSession,
      maxInInventory: powerUp.maxInInventory,
      effects: powerUp.effects || {},
      notes: powerUp.notes || '',
    });
    setShowEditModal(true);
  };

  // Filter power-ups with useMemo
  const filteredPowerUps = useMemo(() => powerUps.filter((pu) => {
    const matchSearch =
      pu.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pu.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  }), [powerUps, searchTerm]);

  // Initialize
  useEffect(() => {
    fetchPowerUps();
    fetchAllAnalytics();
  }, [filterEnabled, filterType, filterRarity]);

  // Update effects based on type - using functional update to avoid stale closure
  useEffect(() => {
    setFormData(prev => {
      const currentType = prev.type;
      const newEffects = { ...prev.effects };

      // Ensure required effect fields exist for each type
      if (currentType === 'radar_boost' && !newEffects.radarBoost?.radiusMultiplier) {
        newEffects.radarBoost = { radiusMultiplier: 2 };
      } else if (currentType === 'double_points' && !newEffects.doublePoints?.pointsMultiplier) {
        newEffects.doublePoints = { pointsMultiplier: 2 };
      } else if (currentType === 'speed_boost' && !newEffects.speedBoost?.speedMultiplier) {
        newEffects.speedBoost = { speedMultiplier: 1.5 };
      } else if (currentType === 'shield' && !newEffects.shield?.damageMitigation) {
        newEffects.shield = { damageMitigation: 0.5 };
      } else if (currentType === 'time_extension' && !newEffects.timeExtension?.additionalTimeMs) {
        newEffects.timeExtension = { additionalTimeMs: 60000 };
      }

      return { ...prev, effects: newEffects };
    });
  }, [formData.type]);

  return (
    <div className="p-6 space-y-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer le Power-Up"
        description={`Êtes-vous sûr de vouloir supprimer "${pendingDeleteName}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">⚡ Power-Up Management</h1>
            <p className="text-gray-500 mt-1">Create and manage in-game power-ups for players</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-sm"
          >
            <Plus size={20} />
            Create Power-Up
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 items-start mb-4 animate-pulse">
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-green-800 font-medium">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-green-600 hover:text-green-800"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 items-start mb-4">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-red-800 font-medium">Something went wrong</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {allAnalytics?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-gray-600 text-sm font-medium">Total Power-Ups</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {allAnalytics.summary.totalPowerUps || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-gray-600 text-sm font-medium">Total Created</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {allAnalytics.summary.totalCreated.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-gray-600 text-sm font-medium">Total Claimed</div>
            <div className="text-3xl font-bold text-purple-600 mt-2">
              {allAnalytics.summary.totalClaimed.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-gray-600 text-sm font-medium">Active Instances</div>
            <div className="text-3xl font-bold text-yellow-600 mt-2">
              {allAnalytics.summary.totalActiveInstances.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-gray-600 text-sm font-medium">Avg Adoption</div>
            <div className="text-3xl font-bold text-orange-600 mt-2">
              {(allAnalytics.summary?.averageAdoptionRate ?? 0).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search power-ups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="radar_boost">Radar Boost</option>
            <option value="double_points">Double Points</option>
            <option value="speed_boost">Speed Boost</option>
            <option value="shield">Shield</option>
            <option value="time_extension">Time Extension</option>
          </select>

          <select
            value={filterRarity}
            onChange={(e) => setFilterRarity(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Rarities</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>

          <button
            onClick={fetchPowerUps}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition flex items-center gap-2"
          >
            <Filter size={18} />
            Refresh
          </button>
        </div>
      </div>

      {/* Power-Ups Grid */}
      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 bg-white rounded-lg border border-gray-200">
          <div className="animate-spin mb-4">
            <Zap className="text-blue-600" size={40} />
          </div>
          <p className="text-gray-500 font-medium">Loading power-ups...</p>
          <p className="text-gray-400 text-sm">Please wait</p>
        </div>
      ) : filteredPowerUps.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
          <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="text-blue-500" size={40} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No Power-Ups Yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Power-ups enhance gameplay by giving players special abilities. Create your first power-up to get started!
          </p>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition mx-auto"
          >
            <Plus size={20} />
            Create Your First Power-Up
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPowerUps.map((powerUp) => (
            <div
              key={powerUp._id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition"
            >
              {/* Card Header */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{powerUp.name}</h3>
                    <p className="text-sm text-gray-600">{powerUp.description}</p>
                  </div>
                  <span className="text-3xl">{powerUp.icon}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3">
                {/* Type & Rarity */}
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {powerUpTypes[powerUp.type]?.label}
                  </span>
                  <span
                    className={`px-3 py-1 text-white rounded-full text-xs font-medium ${
                      rarities.find((r) => r.value === powerUp.rarity)?.color
                    }`}
                  >
                    {powerUp.rarity}
                  </span>
                  {!powerUp.enabled && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                      Disabled
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-600 text-xs">Duration</div>
                    <div className="font-bold text-gray-900">
                      {(powerUp.durationMs / 1000).toFixed(0)}s
                    </div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-600 text-xs">Drop Rate</div>
                    <div className="font-bold text-gray-900">{powerUp.dropRate}%</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-600 text-xs">Per Session</div>
                    <div className="font-bold text-gray-900">Max {powerUp.maxPerSession}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-600 text-xs">Inventory</div>
                    <div className="font-bold text-gray-900">Max {powerUp.maxInInventory}</div>
                  </div>
                </div>

                {/* Drop Rate Slider */}
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">
                    Adjust Drop Rate: {powerUp.dropRate}%
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={powerUp.dropRate}
                    onChange={(e) =>
                      handleUpdateDropRate(powerUp._id, parseInt(e.target.value))
                    }
                    className="w-full"
                  />
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-2">
                <button
                  onClick={() => fetchPowerUpAnalytics(powerUp._id)}
                  className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition flex items-center justify-center gap-2 text-sm font-medium"
                  title="View analytics for this power-up"
                >
                  <BarChart3 size={16} />
                  Analytics
                </button>
                <button
                  onClick={() => openEditModal(powerUp)}
                  className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition flex items-center justify-center gap-2 text-sm font-medium"
                  title="Edit power-up settings"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteClick(powerUp._id, powerUp.name)}
                  className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition flex items-center justify-center gap-2 text-sm font-medium"
                  title="Permanently delete this power-up"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE/EDIT MODAL */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {showEditModal ? `✏️ Edit Power-Up` : `✨ Create New Power-Up`}
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  {showEditModal 
                    ? `Modify settings for "${selectedPowerUp?.name}"`
                    : 'Configure a new power-up for your game'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={showEditModal ? handleUpdate : handleCreate}
              className="p-6 space-y-5"
            >
              {/* Basic Info Section */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Info size={14} /> Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Power-Up Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., Super Radar"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type *</label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(powerUpTypes).map(([key, val]) => (
                        <option key={key} value={key}>
                          {val.icon} {val.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Description *</label>
                <textarea
                  placeholder="Describe what this power-up does for the player..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
              </div>

              {/* Appearance Section */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Sparkles size={14} /> Appearance & Rarity
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Icon (emoji)</label>
                    <input
                      type="text"
                      placeholder="⚡"
                      maxLength={2}
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData({ ...formData, icon: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Rarity</label>
                    <select
                      value={formData.rarity}
                      onChange={(e) =>
                        setFormData({ ...formData, rarity: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {rarities.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Duration (seconds)</label>
                    <input
                      type="number"
                      placeholder="30"
                      value={Math.round(formData.durationMs / 1000)}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          durationMs: parseInt(e.target.value) * 1000,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="3600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Drop Rate (%)</label>
                    <input
                      type="number"
                      placeholder="10"
                      value={formData.dropRate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          dropRate: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              {/* Limits Section */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Filter size={14} /> Limits & Restrictions
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Per Game Session</label>
                    <input
                      type="number"
                      placeholder="3"
                      value={formData.maxPerSession}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxPerSession: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max In Inventory</label>
                    <input
                      type="number"
                      placeholder="10"
                      value={formData.maxInInventory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxInInventory: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>
                </div>
              </div>

              {/* Effects Configuration */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                  <Zap size={16} className="text-blue-600" /> Effects Configuration
                </h3>
                <p className="text-xs text-gray-500 mb-3">Configure how this power-up affects gameplay</p>
                {formData.type === 'radar_boost' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      📍 Radar Radius Multiplier (1x - 5x)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={formData.effects.radarBoost?.radiusMultiplier || 2}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          effects: {
                            ...formData.effects,
                            radarBoost: {
                              radiusMultiplier: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {formData.type === 'double_points' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      💰 Points Multiplier (1.5x - 10x)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.5"
                      max="10"
                      value={formData.effects.doublePoints?.pointsMultiplier || 2}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          effects: {
                            ...formData.effects,
                            doublePoints: {
                              pointsMultiplier: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">All points earned are multiplied by this value</p>
                  </div>
                )}
                {formData.type === 'speed_boost' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      ⚡ Speed Multiplier (1.1x - 3x)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.1"
                      max="3"
                      value={formData.effects.speedBoost?.speedMultiplier || 1.5}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          effects: {
                            ...formData.effects,
                            speedBoost: {
                              speedMultiplier: parseFloat(e.target.value),
                            },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Player movement speed multiplier</p>
                  </div>
                )}
                {formData.type === 'shield' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      🛡️ Damage Reduction (0% - 100%)
                    </label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      max="100"
                      value={Math.round((formData.effects.shield?.damageMitigation || 0.5) * 100)}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          effects: {
                            ...formData.effects,
                            shield: {
                              damageMitigation: parseFloat(e.target.value) / 100,
                            },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Percentage of damage blocked</p>
                  </div>
                )}
                {formData.type === 'time_extension' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      ⏱️ Additional Time (seconds)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={Math.round((formData.effects.timeExtension?.additionalTimeMs || 60000) / 1000)}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          effects: {
                            ...formData.effects,
                            timeExtension: {
                              additionalTimeMs: parseInt(e.target.value) * 1000,
                            },
                          },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">How many extra seconds players get</p>
                  </div>
                )}
              </div>

              {/* Notes Section */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Admin Notes (optional)</label>
                <textarea
                  placeholder="Internal notes about this power-up..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                >
                  {showEditModal ? (
                    <>
                      <CheckCircle size={18} />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Create Power-Up
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ANALYTICS MODAL */}
      {showAnalyticsModal && analytics && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-2xl font-bold">
                {analytics.name} - Analytics
              </h2>
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Metrics */}
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-4">Key Metrics</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-blue-600 text-sm font-medium">Claim Rate</div>
                    <div className="text-3xl font-bold text-blue-900 mt-2">
                      {analytics.metrics.claimRate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="text-purple-600 text-sm font-medium">Adoption Rate</div>
                    <div className="text-3xl font-bold text-purple-900 mt-2">
                      {analytics.metrics.adoptionRate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-green-600 text-sm font-medium">Avg Usage/Session</div>
                    <div className="text-3xl font-bold text-green-900 mt-2">
                      {analytics.metrics.averageUsagePerSession.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-4">Inventory Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Total Created</span>
                    <span className="font-bold text-gray-900">
                      {analytics.stats.totalCreated.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Total Claimed</span>
                    <span className="font-bold text-gray-900">
                      {analytics.stats.totalClaimed.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Active Instances</span>
                    <span className="font-bold text-gray-900">
                      {analytics.stats.activeInstances.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Usage Count</span>
                    <span className="font-bold text-gray-900">
                      {analytics.stats.usageCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-4">Configuration</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Status</span>
                    <span className="font-bold text-gray-900">
                      {analytics.configuration.enabled ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Drop Rate</span>
                    <span className="font-bold text-gray-900">
                      {analytics.configuration.dropRate}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Duration</span>
                    <span className="font-bold text-gray-900">
                      {(analytics.configuration.durationMs / 1000).toFixed(0)}s
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Max Per Session</span>
                    <span className="font-bold text-gray-900">
                      {analytics.configuration.maxPerSession}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-700">Max in Inventory</span>
                    <span className="font-bold text-gray-900">
                      {analytics.configuration.maxInInventory}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PowerUpManagement;
