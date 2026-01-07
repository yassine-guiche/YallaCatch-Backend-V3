import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Search,
  Ban,
  CheckCircle,
  Eye,
  Trophy,
  Coins,
  RefreshCw,
  Download,
  Info,
  X,
  ShieldAlert,
  Users,
  UserCheck,
  UserX,
  MapPin,
  Smartphone,
  Clock,
  Edit,
  Trash2,
  Globe,
  Wifi,
  Monitor,
  Navigation,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { getUsers, getUserById, banUser, unbanUser, addUserPoints, updateUser, deleteUser } from '../services/users';
import { formatRelativeDate } from '../utils/dates';
import { toast } from 'sonner';
import { useUsersUpdates } from '../hooks/useRealtimeUpdates';

export default function UsersManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 20;

  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pointsModal, setPointsModal] = useState({ open: false, user: null, mode: 'add', amount: '', reason: '', error: null });
  const [banModal, setBanModal] = useState({ open: false, user: null, reason: '', duration: '', notify: true, error: null });
  const [editModal, setEditModal] = useState({ open: false, user: null, displayName: '', level: '', error: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });
  const [detailOpen, setDetailOpen] = useState(false);

  // Stats summary
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0 });

  const showToast = (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filters = { page: currentPage, limit: usersPerPage };
      if (searchTerm) filters.search = searchTerm;
      if (filterStatus !== 'all') filters.status = filterStatus;
      const result = await getUsers(filters);
      const usersList = result.items || [];
      setUsers(usersList);
      setTotalUsers(result.total || 0);
      setTotalPages(Math.ceil((result.total || 0) / usersPerPage));
      
      // Calculate stats from current page (backend should ideally return these)
      const activeCount = usersList.filter(u => u.status === 'active').length;
      const bannedCount = usersList.filter(u => u.status === 'banned' || u.isBanned).length;
      setStats({
        total: result.total || 0,
        active: activeCount,
        banned: bannedCount,
      });
    } catch (err) {
      console.error('Erreur chargement utilisateurs:', err);
      setError(err.message || 'Erreur de chargement');
      showToast('error', 'Erreur de chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterStatus]);

  // WebSocket real-time updates
  useUsersUpdates({
    onUserUpdate: (data) => {
      console.log('User update received:', data);
      loadUsers(); // Refresh user list
      toast.info('Utilisateur mis à jour');
    },
    onStatsUpdate: (data) => {
      if (data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
    },
  });

  // Load users when page, search or filter changes
  useEffect(() => { 
    loadUsers(); 
  }, [loadUsers]);
  
  // Reset to page 1 when search term changes (with debounce)
  useEffect(() => {
    if (!searchTerm) return; // Don't reset on empty search
    const timer = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]); // Only depend on searchTerm, not currentPage

  // Reset to page 1 when filter changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [filterStatus]);

  const handleBanUser = async (userId) => {
    const user = users.find((u) => u.id === userId);
    setBanModal({ open: true, user, reason: '', duration: '', notify: true, error: null });
  };

  const handleUnbanUser = async (userId) => {
    try {
      await unbanUser(userId);
      await loadUsers();
      if (selectedUser?.id === userId) {
        const detail = await getUserById(userId);
        setSelectedUser((prev) => ({ ...prev, ...detail }));
      }
      showToast('success', 'Utilisateur débanni');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleAddPoints = (userId) => {
    const user = users.find((u) => u.id === userId);
    setPointsModal({ open: true, user, mode: 'add', amount: '', reason: '', error: null });
  };

  const handleDeductPoints = (userId) => {
    const user = users.find((u) => u.id === userId);
    setPointsModal({ open: true, user, mode: 'deduct', amount: '', reason: '', error: null });
  };

  const handleShowDetails = async (user) => {
    if (!user) return;
    // Seed with row data for instant display while fetching full profile
    setSelectedUser(user);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await getUserById(user.id);
      setSelectedUser({ ...user, ...detail });
    } catch (err) {
      console.error('Impossible de charger le profil:', err);
      showToast('error', err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = () => {
    if (!users.length) return;
    const headers = ['ID', 'Nom', 'Email', 'Niveau', 'Points', 'Statut', 'Créé le'];
    const rows = users.map((u) => [u.id, u.name || '', u.email || '', u.level || 1, u.points || 0, u.status || '', u.createdAt || '']);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'users-export.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const statusBadge = (status) => {
    const variants = { active: 'default', banned: 'destructive', suspended: 'secondary' };
    const labels = { active: 'Actif', banned: 'Banni', suspended: 'Suspendu' };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  const renderRecent = (list) => {
    if (!list?.length) return <div className="text-sm text-gray-500 col-span-full">Dernières activités: Aucune</div>;
    return list.slice(0, 3).map((a) => (
      <div key={a.id || a.prizeName || a.claimedAt} className="col-span-full text-sm text-gray-600">
        • {a.prizeName || 'Activité'} — {a.pointsAwarded ?? 0} pts — {a.claimedAt ? formatRelativeDate(a.claimedAt) : ''}
      </div>
    ));
  };

  const submitPoints = async () => {
    const { user, mode, amount, reason } = pointsModal;
    if (!user) return;
    const num = Math.abs(Number(amount));
    if (Number.isNaN(num) || num <= 0) {
      setPointsModal((m) => ({ ...m, error: 'Montant invalide (doit être positif)' }));
      return;
    }
    if (!reason.trim()) {
      setPointsModal((m) => ({ ...m, error: 'Une raison est requise' }));
      return;
    }
    // Apply sign based on mode
    const finalAmount = mode === 'deduct' ? -num : num;
    try {
      await addUserPoints(user.id, finalAmount, reason.trim());
      setPointsModal({ open: false, user: null, mode: 'add', amount: '', reason: '', error: null });
      await loadUsers();
      if (selectedUser?.id === user.id) {
        const detail = await getUserById(user.id);
        setSelectedUser((prev) => ({ ...prev, ...detail }));
      }
      showToast('success', mode === 'deduct' ? 'Points retirés avec succès' : 'Points ajoutés avec succès');
    } catch (err) {
      const errorMsg = err.message?.includes('INSUFFICIENT') ? 'Points insuffisants' : err.message;
      setPointsModal((m) => ({ ...m, error: errorMsg }));
      showToast('error', errorMsg);
    }
  };

  const submitBan = async () => {
    const { user, reason, duration } = banModal;
    if (!user) return;
    if (!reason.trim()) {
      setBanModal((m) => ({ ...m, error: 'Une raison est requise' }));
      return;
    }
    const hours = duration === '' ? undefined : Number(duration);
    if (hours !== undefined && Number.isNaN(hours)) {
      setBanModal((m) => ({ ...m, error: 'Durée invalide' }));
      return;
    }
    try {
      await banUser(user.id, reason.trim(), hours);
      setBanModal({ open: false, user: null, reason: '', duration: '', error: null });
      await loadUsers();
      if (selectedUser?.id === user.id) {
        const detail = await getUserById(user.id);
        setSelectedUser((prev) => ({ ...prev, ...detail }));
      }
      showToast('success', 'Utilisateur banni');
    } catch (err) {
      setBanModal((m) => ({ ...m, error: err.message }));
      showToast('error', err.message);
    }
  };

  const submitEdit = async () => {
    const { user, displayName, level } = editModal;
    if (!user) return;
    if (!displayName.trim()) {
      setEditModal((m) => ({ ...m, error: 'Le nom est requis' }));
      return;
    }
    try {
      const updates = { displayName: displayName.trim() };
      if (level && level !== user.levelName) {
        updates.level = level;
      }
      await updateUser(user.id, updates);
      setEditModal({ open: false, user: null, displayName: '', level: '', error: null });
      await loadUsers();
      if (selectedUser?.id === user.id) {
        const detail = await getUserById(user.id);
        setSelectedUser((prev) => ({ ...prev, ...detail }));
      }
      showToast('success', 'Utilisateur mis à jour');
    } catch (err) {
      setEditModal((m) => ({ ...m, error: err.message }));
      showToast('error', err.message);
    }
  };

  const submitDelete = async () => {
    const { user } = deleteModal;
    if (!user) return;
    try {
      await deleteUser(user.id);
      setDeleteModal({ open: false, user: null });
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
        setDetailOpen(false);
      }
      await loadUsers();
      showToast('success', 'Utilisateur supprimé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const filteredInfo = useMemo(() => ({ total: totalUsers, page: currentPage, pages: totalPages }), [totalUsers, currentPage, totalPages]);

  if (loading && users.length === 0) {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestion des Utilisateurs</h1>
        </div>
        <Card><CardContent className="p-6">
          <div className="space-y-4">{[1,2,3,4,5].map((i) => (<div key={i} className="h-16 bg-gray-200 animate-pulse rounded" />))}</div>
        </CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Erreur</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadUsers}><RefreshCw className="mr-2 h-4 w-4" /> Réessayer</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Utilisateurs</h1>
          <p className="text-gray-500 mt-1">{filteredInfo.total} utilisateur{filteredInfo.total > 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={!users.length}>
            <Download className="mr-2 h-4 w-4" /> Exporter
          </Button>
        </div>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Rechercher par nom ou email" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="banned">Bannis</SelectItem>
              <SelectItem value="suspended">Suspendus</SelectItem>
              <SelectItem value="inactive">Inactifs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Utilisateurs</p>
                <p className="text-3xl font-bold">{filteredInfo.total}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Actifs</p>
                <p className="text-3xl font-bold text-green-600">{stats.active}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bannis</p>
                <p className="text-3xl font-bold text-red-600">{stats.banned}</p>
              </div>
              <UserX className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Page</p>
                <p className="text-3xl font-bold">{filteredInfo.page}/{filteredInfo.pages}</p>
              </div>
              <Info className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Liste des Utilisateurs</CardTitle><CardDescription>Page {currentPage} sur {totalPages}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Utilisateur</TableHead><TableHead>Email</TableHead><TableHead>Niveau</TableHead><TableHead>Points</TableHead><TableHead>Statut</TableHead><TableHead>Inscription</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">Aucun utilisateur trouvé</TableCell></TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                          {user.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-medium">{user.name || 'Sans nom'}</div>
                          <div className="text-sm text-gray-500">ID: {user.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell><Badge variant="outline">Niveau {user.level || 1}</Badge></TableCell>
                    <TableCell><div className="flex items-center gap-1"><Coins className="h-4 w-4 text-yellow-500" /><span className="font-medium">{user.points || 0}</span></div></TableCell>
                    <TableCell>{statusBadge(user.status)}</TableCell>
                    <TableCell><div className="text-sm">{user.createdAt ? formatRelativeDate(user.createdAt) : '-'}</div></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => handleShowDetails(user)} title="Voir détails" aria-label="Voir les détails">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditModal({ open: true, user, displayName: user.name || '', level: user.levelName || 'bronze', error: null })} title="Modifier" aria-label="Modifier">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {user.status === 'banned' || user.isBanned ? (
                          <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => handleUnbanUser(user.id)} title="Débannir" aria-label="Débannir">
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-orange-600 hover:text-orange-700" onClick={() => handleBanUser(user.id)} title="Bannir" aria-label="Bannir">
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => handleAddPoints(user.id)} title="Ajouter points" aria-label="Ajouter des points">
                          <Trophy className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-orange-500 hover:text-orange-600" onClick={() => handleDeductPoints(user.id)} title="Retirer points" aria-label="Retirer des points">
                          <Coins className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteModal({ open: true, user })} title="Supprimer" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Affichage de {(currentPage - 1) * usersPerPage + 1} à {Math.min(currentPage * usersPerPage, totalUsers)} sur {totalUsers}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || loading}>Précédent</Button>
                <Button variant="outline" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || loading}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side drawer for user detail */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl border-l z-40 transform transition-transform ${detailOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
          <div>
            <div className="text-sm text-gray-500">Profil utilisateur</div>
            <div className="font-semibold flex items-center gap-2">
              {selectedUser?.name || selectedUser?.email || 'Aucun utilisateur'}
              {selectedUser?.lastActive && new Date(selectedUser.lastActive) > new Date(Date.now() - 5 * 60 * 1000) && (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  <Activity className="h-3 w-3" /> En ligne
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setDetailOpen(false); setSelectedUser(null); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-64px)]">
          {detailLoading && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 bg-gray-200 rounded" />)}
            </div>
          )}

          {!detailLoading && selectedUser && (
            <>
              {/* Basic Info */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Info className="h-4 w-4" /> Informations générales
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">ID</div>
                  <div className="font-mono text-xs flex items-center gap-1">
                    {selectedUser.id?.slice(0, 12)}...
                    <button className="text-blue-500 hover:underline" onClick={() => { navigator.clipboard.writeText(selectedUser.id); toast.success('ID copié'); }}>📋</button>
                  </div>
                  <div className="text-gray-500">Email</div>
                  <div>{selectedUser.email || '-'}</div>
                  <div className="text-gray-500">Rôle</div>
                  <div><Badge variant={selectedUser.role === 'admin' ? 'destructive' : 'outline'}>{selectedUser.role || 'player'}</Badge></div>
                  <div className="text-gray-500">Statut</div>
                  <div>{statusBadge(selectedUser.status)}</div>
                  <div className="text-gray-500">Niveau</div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{selectedUser.levelName || 'bronze'}</span>
                    <span className="text-xs text-gray-400">(Niv. {selectedUser.level || 1})</span>
                  </div>
                  <div className="text-gray-500">Inscrit</div>
                  <div>{selectedUser.createdAt ? formatRelativeDate(selectedUser.createdAt) : '-'}</div>
                  <div className="text-gray-500">Dernière activité</div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    {selectedUser.lastActive ? formatRelativeDate(selectedUser.lastActive) : '-'}
                  </div>
                </div>
              </div>

              {/* Points */}
              <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-yellow-700 flex items-center gap-2">
                  <Coins className="h-4 w-4" /> Points & Progression
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded p-2">
                    <div className="text-lg font-bold text-green-600">{selectedUser.points ?? 0}</div>
                    <div className="text-xs text-gray-500">Disponibles</div>
                  </div>
                  <div className="bg-white rounded p-2">
                    <div className="text-lg font-bold text-blue-600">{selectedUser.pointsTotal ?? selectedUser.points ?? 0}</div>
                    <div className="text-xs text-gray-500">Total gagné</div>
                  </div>
                  <div className="bg-white rounded p-2">
                    <div className="text-lg font-bold text-orange-600">{selectedUser.pointsSpent ?? 0}</div>
                    <div className="text-xs text-gray-500">Dépensés</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <div className="flex justify-between"><span>Captures:</span> <span className="font-medium">{selectedUser.stats?.totalClaims ?? selectedUser.totalClaims ?? 0}</span></div>
                  <div className="flex justify-between"><span>Streak actuel:</span> <span className="font-medium">{selectedUser.stats?.currentStreak ?? 0} jours</span></div>
                  <div className="flex justify-between"><span>Meilleur streak:</span> <span className="font-medium">{selectedUser.stats?.longestStreak ?? 0} jours</span></div>
                </div>
              </div>

              {/* Location */}
              <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-blue-700 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Localisation
                </div>
                {selectedUser.location ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Ville:</span>
                      <span className="font-medium">{selectedUser.location.city || 'Inconnue'}</span>
                    </div>
                    {(selectedUser.location.lat || selectedUser.location.coordinates) && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Coordonnées:</span>
                          <span className="font-mono text-xs">
                            {selectedUser.location.lat?.toFixed(6) || selectedUser.location.coordinates?.[1]?.toFixed(6)}, 
                            {selectedUser.location.lng?.toFixed(6) || selectedUser.location.coordinates?.[0]?.toFixed(6)}
                          </span>
                        </div>
                        <a 
                          href={`https://www.google.com/maps?q=${selectedUser.location.lat || selectedUser.location.coordinates?.[1]},${selectedUser.location.lng || selectedUser.location.coordinates?.[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                        >
                          <ExternalLink className="h-3 w-3" /> Voir sur Google Maps
                        </a>
                      </>
                    )}
                    {selectedUser.location.lastUpdated && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Mis à jour: {formatRelativeDate(selectedUser.location.lastUpdated)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">Aucune localisation enregistrée</div>
                )}
              </div>

              {/* Network & IP */}
              <div className="bg-purple-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-purple-700 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Réseau & Connexion
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 flex items-center gap-1"><Wifi className="h-3 w-3" /> Dernière IP:</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded text-xs">{selectedUser.lastIp || 'N/A'}</span>
                  </div>
                  {selectedUser.lastIp && (
                    <a 
                      href={`https://ipinfo.io/${selectedUser.lastIp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-purple-600 hover:underline text-xs"
                    >
                      <ExternalLink className="h-3 w-3" /> Infos IP (géolocalisation, ISP...)
                    </a>
                  )}
                  {selectedUser.lastUserAgent && (
                    <div className="text-xs text-gray-500 break-all">
                      <span className="font-medium">User-Agent:</span> {selectedUser.lastUserAgent}
                    </div>
                  )}
                </div>
              </div>

              {/* Devices */}
              <div className="bg-green-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-green-700 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Appareils ({selectedUser.devices?.length || 0})
                </div>
                {selectedUser.devices?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedUser.devices.map((device, idx) => (
                      <div key={idx} className="bg-white rounded p-2 text-sm border border-green-100">
                        <div className="flex items-center justify-between">
                          <span className="font-medium flex items-center gap-1">
                            <Monitor className="h-3 w-3" /> {device.model || device.deviceId?.slice(0, 8) || 'Appareil inconnu'}
                          </span>
                          <Badge variant={device.isActive ? 'default' : 'secondary'} className="text-xs">
                            {device.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-gray-600">
                          <div>Plateforme: <span className="font-medium">{device.platform || '-'}</span></div>
                          <div>OS: <span className="font-medium">{device.osVersion || '-'}</span></div>
                          <div>App: <span className="font-medium">v{device.appVersion || '-'}</span></div>
                          <div>Vu: <span className="font-medium">{device.lastUsed ? formatRelativeDate(device.lastUsed) : '-'}</span></div>
                        </div>
                        {device.deviceId && (
                          <div className="text-xs text-gray-400 mt-1 font-mono truncate">ID: {device.deviceId}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">Aucun appareil enregistré</div>
                )}
              </div>

              {/* Ban Info */}
              {selectedUser.isBanned && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <div className="font-semibold text-sm text-red-700 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" /> Utilisateur banni
                  </div>
                  <div className="text-sm text-red-600">
                    <div><span className="font-medium">Raison:</span> {selectedUser.banInfo?.reason || 'Non spécifiée'}</div>
                    <div><span className="font-medium">Expiration:</span> {selectedUser.banInfo?.expiresAt ? formatRelativeDate(selectedUser.banInfo.expiresAt) : 'Permanent'}</div>
                    {selectedUser.banInfo?.bannedAt && (
                      <div><span className="font-medium">Banni le:</span> {formatRelativeDate(selectedUser.banInfo.bannedAt)}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Activité récente
                </div>
                {selectedUser.recentActivity?.length > 0 ? (
                  <div className="space-y-1">
                    {selectedUser.recentActivity.slice(0, 5).map((activity, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded">
                        <span>{activity.prizeName || 'Activité'}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">+{activity.pointsAwarded ?? 0} pts</Badge>
                          <span className="text-xs text-gray-400">{activity.claimedAt ? formatRelativeDate(activity.claimedAt) : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">Aucune activité récente</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => window.open(`/activity-log?actorEmail=${encodeURIComponent(selectedUser.email)}`, '_blank')}
                >
                  Voir l'audit complet
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => { setEditModal({ open: true, user: selectedUser, displayName: selectedUser.name || '', level: selectedUser.levelName || 'bronze', error: null }); }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {detailLoading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Chargement du profil...
        </div>
      )}

      {/* Points modal */}
      {pointsModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className={`text-lg font-semibold flex items-center gap-2 ${pointsModal.mode === 'deduct' ? 'text-orange-600' : 'text-green-600'}`}>
                {pointsModal.mode === 'deduct' ? (
                  <><Coins className="h-5 w-5" /> Retirer des points</>
                ) : (
                  <><Trophy className="h-5 w-5" /> Ajouter des points</>
                )}
              </h3>
              <button onClick={() => setPointsModal({ open: false, user: null, mode: 'add', amount: '', reason: '', error: null })}><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600">{pointsModal.user?.name || pointsModal.user?.email}</div>
              <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                <Coins className="h-4 w-4 text-yellow-500" />
                {pointsModal.user?.points || 0} pts
                <span className="text-sm font-normal text-gray-500 ml-1">disponibles</span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Montant à {pointsModal.mode === 'deduct' ? 'retirer' : 'ajouter'}</label>
                <Input 
                  type="number" 
                  min="1"
                  value={pointsModal.amount} 
                  onChange={(e) => setPointsModal((m) => ({ ...m, amount: e.target.value, error: null }))} 
                  placeholder="Ex: 100"
                  className="mt-1 text-lg"
                />
                {pointsModal.mode === 'deduct' && pointsModal.amount && Number(pointsModal.amount) > (pointsModal.user?.points || 0) && (
                  <p className="text-xs text-red-500 mt-1">⚠️ Le montant dépasse le solde disponible</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Raison</label>
                <Input 
                  value={pointsModal.reason} 
                  onChange={(e) => setPointsModal((m) => ({ ...m, reason: e.target.value, error: null }))} 
                  placeholder={pointsModal.mode === 'deduct' ? 'Ex: Correction, Pénalité...' : 'Ex: Bonus, Récompense...'}
                  className="mt-1"
                />
              </div>
            </div>
            {pointsModal.error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{pointsModal.error}</div>}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setPointsModal({ open: false, user: null, mode: 'add', amount: '', reason: '', error: null })}>Annuler</Button>
              <Button 
                onClick={submitPoints}
                variant={pointsModal.mode === 'deduct' ? 'destructive' : 'default'}
                className={pointsModal.mode === 'add' ? 'bg-green-600 hover:bg-green-700' : ''}
                disabled={!pointsModal.amount || Number(pointsModal.amount) <= 0}
              >
                {pointsModal.mode === 'deduct' ? (
                  <><Coins className="h-4 w-4 mr-2" /> Retirer {Math.abs(Number(pointsModal.amount) || 0)} pts</>
                ) : (
                  <><Trophy className="h-4 w-4 mr-2" /> Ajouter {Number(pointsModal.amount) || 0} pts</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ban modal */}
      {banModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Bannir l'utilisateur</h3>
              <button onClick={() => setBanModal({ open: false, user: null, reason: '', duration: '', error: null })}><X className="h-4 w-4" /></button>
            </div>
            <div className="text-sm text-gray-600">{banModal.user?.email}</div>
            <div className="space-y-2">
              <label className="text-sm">Raison</label>
              <Input value={banModal.reason} onChange={(e) => setBanModal((m) => ({ ...m, reason: e.target.value, error: null }))} />
              <label className="text-sm">Durée (heures, laisser vide pour permanent)</label>
              <Input type="number" value={banModal.duration} onChange={(e) => setBanModal((m) => ({ ...m, duration: e.target.value, error: null }))} />
            </div>
            {banModal.error && <div className="text-sm text-red-600">{banModal.error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBanModal({ open: false, user: null, reason: '', duration: '', notify: true, error: null })}>Annuler</Button>
              <Button variant="destructive" onClick={submitBan}><Ban className="h-4 w-4 mr-2" /> Bannir</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Modifier l'utilisateur</h3>
              <button onClick={() => setEditModal({ open: false, user: null, displayName: '', level: '', error: null })}><X className="h-4 w-4" /></button>
            </div>
            <div className="text-sm text-gray-600">{editModal.user?.email}</div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom d'affichage</label>
                <Input value={editModal.displayName} onChange={(e) => setEditModal((m) => ({ ...m, displayName: e.target.value, error: null }))} placeholder="Nom d'affichage" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Niveau</label>
                <Select value={editModal.level} onValueChange={(value) => setEditModal((m) => ({ ...m, level: value, error: null }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bronze">Bronze</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="diamond">Diamond</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editModal.error && <div className="text-sm text-red-600">{editModal.error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditModal({ open: false, user: null, displayName: '', level: '', error: null })}>Annuler</Button>
              <Button onClick={submitEdit}><Edit className="h-4 w-4 mr-2" /> Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-red-600">Supprimer l'utilisateur</h3>
              <button onClick={() => setDeleteModal({ open: false, user: null })}><X className="h-4 w-4" /></button>
            </div>
            <div className="text-sm text-gray-600">
              Êtes-vous sûr de vouloir supprimer <strong>{deleteModal.user?.name || deleteModal.user?.email}</strong> ?
            </div>
            <p className="text-sm text-red-500">Cette action est irréversible. Toutes les données de l'utilisateur seront supprimées.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteModal({ open: false, user: null })}>Annuler</Button>
              <Button variant="destructive" onClick={submitDelete}><Trash2 className="h-4 w-4 mr-2" /> Supprimer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
