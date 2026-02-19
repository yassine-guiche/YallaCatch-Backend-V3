import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Users, UserPlus, UserMinus, RefreshCw, Search, Trash2, 
  Clock, CheckCircle, XCircle, AlertCircle, Heart
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { getFriendships, deleteFriendship } from '../services/friendships';
import { formatRelativeDate } from '../utils/dates';
import { toast } from 'sonner';

export default function FriendshipsManagement() {
  const [friendships, setFriendships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0
  });

  // Confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['friendship_created', 'friendship_update', 'stats_update'],
    onMessage: (event, data) => {
      if (event === 'friendship_created' || event === 'friendship_update') {
        loadFriendships();
      } else if (event === 'stats_update' && data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
    }
  });

  const loadFriendships = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: currentPage, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      
      const data = await getFriendships(params);
      setFriendships(data.friendships || []);
      setTotal(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / 20));
      
      // Calculate stats
      const pending = (data.friendships || []).filter(f => f.status === 'pending').length;
      const accepted = (data.friendships || []).filter(f => f.status === 'accepted').length;
      const rejected = (data.friendships || []).filter(f => f.status === 'rejected').length;
      setStats({
        total: data.total || 0,
        pending,
        accepted,
        rejected
      });
    } catch (err) {
      console.error('Error loading friendships:', err);
      toast.error('Erreur de chargement des amitiés');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    loadFriendships();
  }, [currentPage, statusFilter]);

  const handleDeleteClick = (friendshipId) => {
    setPendingDeleteId(friendshipId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    try {
      await deleteFriendship(pendingDeleteId);
      toast.success('Amitié supprimée');
      loadFriendships();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setPendingDeleteId(null);
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: { color: 'bg-yellow-500', icon: Clock, label: 'En attente' },
      accepted: { color: 'bg-green-500', icon: CheckCircle, label: 'Acceptée' },
      rejected: { color: 'bg-red-500', icon: XCircle, label: 'Rejetée' },
      blocked: { color: 'bg-gray-500', icon: AlertCircle, label: 'Bloquée' }
    };
    const config = variants[status] || { color: 'bg-gray-400', icon: AlertCircle, label: status };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getUserDisplay = (user) => {
    if (!user) return 'Utilisateur inconnu';
    return user.displayName || user.username || user.email || user._id || 'N/A';
  };

  const filteredFriendships = useMemo(() => friendships.filter(f => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const user1 = getUserDisplay(f.userId).toLowerCase();
    const user2 = getUserDisplay(f.friendId).toLowerCase();
    return user1.includes(search) || user2.includes(search);
  }), [friendships, searchTerm]);

  return (
    <div className="p-6 space-y-6">
      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer la relation d'amitié"
        description="Êtes-vous sûr de vouloir supprimer cette relation d'amitié ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="h-8 w-8 text-pink-500" />
            Gestion des Amitiés
          </h1>
          <p className="text-gray-500 mt-1">{total} relation{total > 1 ? 's' : ''} d'amitié</p>
        </div>
        <Button variant="outline" onClick={loadFriendships} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Amitiés</p>
                <p className="text-3xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Attente</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Acceptées</p>
                <p className="text-3xl font-bold text-green-600">{stats.accepted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejetées</p>
                <p className="text-3xl font-bold text-red-600">{stats.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Rechercher par utilisateur..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="pl-10" 
                />
              </div>
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="accepted">Acceptées</SelectItem>
                <SelectItem value="rejected">Rejetées</SelectItem>
                <SelectItem value="blocked">Bloquées</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Friendships Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Amitiés</CardTitle>
          <CardDescription>Page {currentPage} sur {totalPages || 1}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && friendships.length === 0 ? (
            <div className="space-y-4">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="h-16 bg-gray-200 animate-pulse rounded" />
              ))}
            </div>
          ) : filteredFriendships.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune relation d'amitié trouvée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur 1</TableHead>
                  <TableHead>Utilisateur 2</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de création</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFriendships.map((friendship, index) => (
                  <TableRow key={friendship._id || index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                          {getUserDisplay(friendship.userId)?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-medium">{getUserDisplay(friendship.userId)}</div>
                          <div className="text-xs text-gray-500">
                            {friendship.userId?.email || friendship.userId?._id?.slice(0, 8) || ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">
                          {getUserDisplay(friendship.friendId)?.[0]?.toUpperCase() || 'F'}
                        </div>
                        <div>
                          <div className="font-medium">{getUserDisplay(friendship.friendId)}</div>
                          <div className="text-xs text-gray-500">
                            {friendship.friendId?.email || friendship.friendId?._id?.slice(0, 8) || ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(friendship.status)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {friendship.createdAt ? formatRelativeDate(friendship.createdAt) : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteClick(friendship._id)}
                        aria-label="Supprimer l'amitié"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Précédent
              </Button>
              <span className="px-4 py-2 text-sm">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
