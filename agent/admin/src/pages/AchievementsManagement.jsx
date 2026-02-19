import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Trophy, Star, Users, Target, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import achievementsService from '../services/achievements';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

const AchievementsManagement = () => {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingDeleteName, setPendingDeleteName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🏆',
    category: 'explorer',
    trigger: 'PRIZE_CLAIMED',
    condition: {
      type: 'TOTAL_CLAIMS',
      target: 10,
    },
    rewards: [
      {
        type: 'POINTS',
        value: 100,
        description: '100 points bonus',
      },
    ],
    isActive: true,
    isHidden: false,
    order: 0,
  });

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['achievement_unlocked', 'achievement_update'],
    onMessage: () => {
      fetchAchievements();
    }
  });

  const fetchAchievements = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await achievementsService.getAllAchievements({ page, limit });
      const list = resp?.achievements || resp?.data || resp || [];
      setAchievements(list || []);
      setTotal(resp?.total || list.length || 0);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      toast.error('Erreur lors du chargement des achievements');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  const handleCreate = async () => {
    try {
      await achievementsService.createAchievement(formData);
      toast.success('Achievement créé avec succès');
      setIsCreateDialogOpen(false);
      resetForm();
      fetchAchievements();
    } catch (error) {
      console.error('Error creating achievement:', error);
      toast.error('Erreur lors de la création de l\'achievement');
    }
  };

  const handleUpdate = async () => {
    try {
      await achievementsService.updateAchievement(selectedAchievement._id, formData);
      toast.success('Achievement mis à jour avec succès');
      setIsEditDialogOpen(false);
      setSelectedAchievement(null);
      resetForm();
      fetchAchievements();
    } catch (error) {
      console.error('Error updating achievement:', error);
      toast.error('Erreur lors de la mise à jour de l\'achievement');
    }
  };

  const handleDeleteClick = (achievementId, achievementName) => {
    setPendingDeleteId(achievementId);
    setPendingDeleteName(achievementName || 'cet achievement');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    try {
      await achievementsService.deleteAchievement(pendingDeleteId);
      toast.success('Achievement supprimé avec succès');
      fetchAchievements();
    } catch (error) {
      console.error('Error deleting achievement:', error);
      toast.error('Erreur lors de la suppression de l\'achievement');
    }
    setPendingDeleteId(null);
    setPendingDeleteName('');
  };

  const openEditDialog = (achievement) => {
    setSelectedAchievement(achievement);
    setFormData({
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      category: achievement.category,
      trigger: achievement.trigger,
      condition: achievement.condition,
      rewards: achievement.rewards,
      isActive: achievement.isActive,
      isHidden: achievement.isHidden,
      order: achievement.order,
    });
    setIsEditDialogOpen(true);
  };

  const handleView = async (achievementId) => {
    try {
      const data = await achievementsService.getAchievementById(achievementId);
      setViewData(data);
      setIsViewDialogOpen(true);
    } catch (error) {
      console.error('Error fetching achievement details:', error);
      toast.error("Impossible de charger l'achievement");
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: '🏆',
      category: 'explorer',
      trigger: 'PRIZE_CLAIMED',
      condition: {
        type: 'TOTAL_CLAIMS',
        target: 10,
      },
      rewards: [
        {
          type: 'POINTS',
          value: 100,
          description: '100 points bonus',
        },
      ],
      isActive: true,
      isHidden: false,
      order: 0,
    });
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'explorer': return <Target className="h-4 w-4" />;
      case 'collector': return <Trophy className="h-4 w-4" />;
      case 'social': return <Users className="h-4 w-4" />;
      case 'master': return <Star className="h-4 w-4" />;
      default: return <Trophy className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'explorer': return 'bg-blue-100 text-blue-800';
      case 'collector': return 'bg-green-100 text-green-800';
      case 'social': return 'bg-purple-100 text-purple-800';
      case 'master': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer l'achievement"
        description={`Êtes-vous sûr de vouloir supprimer "${pendingDeleteName}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Achievements</h1>
          <p className="text-gray-500 mt-1">Créez et gérez les achievements du jeu</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Créer Achievement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Créer un Achievement</DialogTitle>
              <DialogDescription>
                Définissez les paramètres du nouvel achievement
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nom</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Premier Pas"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Capturer votre premier prize"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="icon">Icône (emoji)</Label>
                  <Input
                    id="icon"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="🏆"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Catégorie</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="explorer">Explorer</SelectItem>
                      <SelectItem value="collector">Collector</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                      <SelectItem value="special">Special</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="trigger">Déclencheur</Label>
                  <Select
                    value={formData.trigger}
                    onValueChange={(value) => setFormData({ ...formData, trigger: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRIZE_CLAIMED">Prize Claimed</SelectItem>
                      <SelectItem value="LEVEL_UP">Level Up</SelectItem>
                      <SelectItem value="REWARD_REDEEMED">Reward Redeemed</SelectItem>
                      <SelectItem value="FRIEND_ADDED">Friend Added</SelectItem>
                      <SelectItem value="STREAK_MILESTONE">Streak Milestone</SelectItem>
                      <SelectItem value="DISTANCE_MILESTONE">Distance Milestone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="conditionType">Type de Condition</Label>
                  <Select
                    value={formData.condition.type}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      condition: { ...formData.condition, type: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TOTAL_CLAIMS">Total Claims</SelectItem>
                      <SelectItem value="TOTAL_POINTS">Total Points</SelectItem>
                      <SelectItem value="LEVEL_REACHED">Level Reached</SelectItem>
                      <SelectItem value="STREAK_DAYS">Streak Days</SelectItem>
                      <SelectItem value="FRIENDS_COUNT">Friends Count</SelectItem>
                      <SelectItem value="REWARDS_REDEEMED">Rewards Redeemed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="target">Objectif</Label>
                <Input
                  id="target"
                  type="number"
                  value={formData.condition.target}
                  onChange={(e) => setFormData({
                    ...formData,
                    condition: { ...formData.condition, target: parseInt(e.target.value) }
                  })}
                  placeholder="10"
                />
              </div>
              <div>
                <Label htmlFor="rewardValue">Récompense (Points)</Label>
                <Input
                  id="rewardValue"
                  type="number"
                  value={formData.rewards[0]?.value || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rewards: [{
                      type: 'POINTS',
                      value: parseInt(e.target.value),
                      description: `${e.target.value} points bonus`
                    }]
                  })}
                  placeholder="100"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate}>
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des Achievements</CardTitle>
          <CardDescription>
            {total} achievement(s) au total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icône</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Récompense</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {achievements.map((achievement) => (
                  <TableRow key={achievement._id}>
                    <TableCell className="text-2xl">{achievement.icon}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{achievement.name}</div>
                        <div className="text-sm text-gray-500">{achievement.description}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(achievement.category)}>
                        <span className="mr-1">{getCategoryIcon(achievement.category)}</span>
                        {achievement.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{achievement.condition?.type || 'N/A'}</div>
                        <div className="text-gray-500">Target: {achievement.condition?.target || 'N/A'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {achievement.rewards.map((reward, idx) => (
                        <Badge key={idx} variant="outline">
                          {reward.value} {reward.type}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={achievement.isActive ? 'success' : 'secondary'}>
                        {achievement.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(achievement._id)}
                          aria-label="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(achievement)}
                          aria-label="Modifier"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(achievement._id, achievement.name)}
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <div>
              Page {page} — {(achievements || []).length} / {total}
            </div>
            <div className="flex items-center gap-2">
              <label>Par page:</label>
              <select
                value={limit}
                onChange={(e) => { setPage(1); setLimit(parseInt(e.target.value) || 20); }}
                className="border rounded px-2 py-1"
              >
                {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  Précédent
                </Button>
                <Button variant="outline" size="sm" disabled={(page * limit) >= total} onClick={() => setPage(p => p + 1)}>
                  Suivant
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog (similar to Create Dialog) */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier l'Achievement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Same form fields as Create Dialog */}
            <div>
              <Label htmlFor="edit-name">Nom</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            {/* Add other fields as needed */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate}>
              Mettre à jour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Détails de l'Achievement</DialogTitle>
          </DialogHeader>
          {viewData ? (
            <div className="space-y-3 text-sm">
              <div><span className="font-medium">Nom:</span> {viewData.name}</div>
              <div><span className="font-medium">Description:</span> {viewData.description}</div>
              <div><span className="font-medium">Icône:</span> <span className="text-xl">{viewData.icon}</span></div>
              <div><span className="font-medium">Catégorie:</span> {viewData.category}</div>
              <div><span className="font-medium">Déclencheur:</span> {viewData.trigger}</div>
              <div>
                <span className="font-medium">Condition:</span>{' '}
                {viewData.condition?.type} → {viewData.condition?.target}
              </div>
              <div>
                <span className="font-medium">Récompenses:</span>{' '}
                {Array.isArray(viewData.rewards) && viewData.rewards.map((r, i) => (
                  <Badge key={i} variant="outline" className="mr-1">{r.value} {r.type}</Badge>
                ))}
              </div>
              <div>
                <span className="font-medium">Statut:</span>{' '}
                <Badge variant={viewData.isActive ? 'success' : 'secondary'}>
                  {viewData.isActive ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            </div>
          ) : (
            <div>Chargement...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AchievementsManagement;
