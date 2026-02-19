import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { 
  RefreshCw, 
  Activity, 
  User, 
  Gift, 
  Settings, 
  Shield,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Monitor,
  MapPin,
  Hash,
  FileText,
  Calendar,
  XCircle,
  Eye,
  Trash2,
  Edit,
  UserPlus,
  UserMinus,
  Send,
  Package,
  Award
} from 'lucide-react';
import { getActivityLogs } from '../services/activity';
import { formatDate, formatRelativeDate } from '../utils/dates';
import { toast } from 'sonner';

// Action type icons and colors - expanded list
const ACTION_CONFIG = {
  // Auth actions
  LOGIN: { icon: User, color: 'bg-green-100 text-green-700 border-green-200', label: 'Connexion', severity: 'low' },
  ADMIN_LOGIN: { icon: Shield, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Connexion Admin', severity: 'medium' },
  LOGOUT: { icon: User, color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Déconnexion', severity: 'low' },
  
  // Prize actions
  CREATE_PRIZE: { icon: Gift, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Création prix', severity: 'medium' },
  UPDATE_PRIZE: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modification prix', severity: 'medium' },
  DELETE_PRIZE: { icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200', label: 'Suppression prix', severity: 'high' },
  BATCH_CREATE_PRIZES: { icon: Package, color: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Création lot', severity: 'medium' },
  
  // Reward actions
  CREATE_REWARD: { icon: Award, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Création récompense', severity: 'medium' },
  UPDATE_REWARD: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modification récompense', severity: 'medium' },
  DELETE_REWARD: { icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200', label: 'Suppression récompense', severity: 'high' },
  
  // User actions
  USER_BANNED: { icon: UserMinus, color: 'bg-red-100 text-red-700 border-red-200', label: 'Bannissement', severity: 'high' },
  USER_UNBANNED: { icon: UserPlus, color: 'bg-green-100 text-green-700 border-green-200', label: 'Débannissement', severity: 'medium' },
  BAN_USER: { icon: UserMinus, color: 'bg-red-100 text-red-700 border-red-200', label: 'Bannissement', severity: 'high' },
  UNBAN_USER: { icon: UserPlus, color: 'bg-green-100 text-green-700 border-green-200', label: 'Débannissement', severity: 'medium' },
  UPDATE_USER: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modification user', severity: 'medium' },
  UPDATE_USER_PROFILE: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modification profil', severity: 'medium' },
  DELETE_USER: { icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200', label: 'Suppression user', severity: 'critical' },
  POINTS_ADDED: { icon: TrendingUp, color: 'bg-green-100 text-green-700 border-green-200', label: 'Ajout points', severity: 'medium' },
  POINTS_DEDUCTED: { icon: TrendingUp, color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Retrait points', severity: 'medium' },
  POINTS_ADJUSTED: { icon: TrendingUp, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Ajustement points', severity: 'medium' },
  
  // Notification actions
  SEND_NOTIFICATION: { icon: Send, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Notification', severity: 'low' },
  BROADCAST_NOTIFICATION: { icon: Bell, color: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Broadcast', severity: 'medium' },
  
  // Partner actions
  CREATE_PARTNER: { icon: UserPlus, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Nouveau partenaire', severity: 'medium' },
  PARTNER_CREATED: { icon: UserPlus, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Nouveau partenaire', severity: 'medium' },
  UPDATE_PARTNER: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modif. partenaire', severity: 'medium' },
  PARTNER_UPDATED: { icon: Edit, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Modif. partenaire', severity: 'medium' },
  DELETE_PARTNER: { icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200', label: 'Suppr. partenaire', severity: 'high' },
  PARTNER_DELETED: { icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200', label: 'Suppr. partenaire', severity: 'high' },
  
  // Settings actions
  UPDATE_SETTINGS: { icon: Settings, color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Paramètres', severity: 'medium' },
  SETTINGS_UPDATED: { icon: Settings, color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Paramètres', severity: 'medium' },
  
  // System actions
  CLEAR_CACHE: { icon: Trash2, color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Vidage cache', severity: 'medium' },
  SYSTEM_BACKUP: { icon: Package, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Sauvegarde', severity: 'medium' },
  
  // Redemption actions
  VALIDATE_REDEMPTION: { icon: CheckCircle, color: 'bg-green-100 text-green-700 border-green-200', label: 'Validation', severity: 'medium' },
  REJECT_REDEMPTION: { icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200', label: 'Rejet', severity: 'medium' },
  QR_SCAN_REDEMPTION: { icon: Eye, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Scan QR', severity: 'low' },
  
  // Default
  DEFAULT: { icon: Activity, color: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Action', severity: 'low' },
};

const SEVERITY_COLORS = {
  low: 'border-l-green-400',
  medium: 'border-l-amber-400',
  high: 'border-l-orange-500',
  critical: 'border-l-red-500',
};

const getActionConfig = (action) => {
  const normalizedAction = action?.toUpperCase()?.replace(/-/g, '_');
  return ACTION_CONFIG[normalizedAction] || ACTION_CONFIG.DEFAULT;
};

// Helper to format action for display
const formatAction = (action) => {
  if (!action) return 'Unknown';
  return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

// Log detail dialog component
function LogDetailDialog({ log, open, onClose }) {
  if (!log) return null;

  const config = getActionConfig(log.action);
  const IconComponent = config.icon;
  const metadata = log.metadata || log.details || {};
  const actor = log.actor || null;

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié!`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg">{config.label}</span>
              <Badge variant="outline" className="ml-2 text-xs">
                {log.resource}
              </Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            Détails complets de l'action effectuée
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Actor Section */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Acteur (Admin)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500">Nom</span>
                <p className="font-medium text-gray-900">
                  {actor?.displayName || log.userEmail || 'Système'}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Email</span>
                <p className="font-medium text-gray-900 flex items-center gap-1">
                  {actor?.email || log.userEmail || 'N/A'}
                  {(actor?.email || log.userEmail) && (
                    <button 
                      onClick={() => copyToClipboard(actor?.email || log.userEmail, 'Email')}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Rôle</span>
                <p className="font-medium text-gray-900">
                  <Badge variant="outline" className="capitalize">
                    {actor?.role || log.userRole || 'admin'}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">ID Admin</span>
                <p className="font-mono text-xs text-gray-700 flex items-center gap-1">
                  {actor?.id || log.userId || 'N/A'}
                  {(actor?.id || log.userId) && (
                    <button 
                      onClick={() => copyToClipboard(actor?.id || log.userId, 'ID')}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Action Details */}
          <div className="bg-gray-50 rounded-lg p-4 border">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Détails de l'Action
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500">Action</span>
                <p className="font-medium text-gray-900">{formatAction(log.action)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Ressource</span>
                <p className="font-medium text-gray-900 capitalize">{log.resource || 'N/A'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">ID Ressource</span>
                <p className="font-mono text-xs text-gray-700 flex items-center gap-1">
                  {log.resourceId || 'N/A'}
                  {log.resourceId && (
                    <button 
                      onClick={() => copyToClipboard(log.resourceId, 'ID Ressource')}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Catégorie</span>
                <p className="font-medium text-gray-900 capitalize">{log.category || 'admin'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Sévérité</span>
                <Badge 
                  variant="outline" 
                  className={`capitalize ${
                    log.severity === 'critical' ? 'border-red-500 text-red-700' :
                    log.severity === 'high' ? 'border-orange-500 text-orange-700' :
                    log.severity === 'medium' ? 'border-amber-500 text-amber-700' :
                    'border-green-500 text-green-700'
                  }`}
                >
                  {log.severity || 'low'}
                </Badge>
              </div>
              <div>
                <span className="text-xs text-gray-500">Succès</span>
                <p className="font-medium">
                  {log.success !== false ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> Oui
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="h-4 w-4" /> Non
                    </span>
                  )}
                </p>
              </div>
            </div>
            {log.description && (
              <div className="mt-3 pt-3 border-t">
                <span className="text-xs text-gray-500">Description</span>
                <p className="text-gray-700">{log.description}</p>
              </div>
            )}
          </div>

          {/* Metadata Section */}
          {Object.keys(metadata).length > 0 && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Métadonnées
              </h3>
              <div className="space-y-2">
                {Object.entries(metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start py-1 border-b border-amber-100 last:border-0">
                    <span className="text-xs text-amber-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-sm font-medium text-gray-800 text-right max-w-[60%] break-all">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context Section */}
          <div className="bg-slate-50 rounded-lg p-4 border">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Contexte Technique
            </h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              {log.ipAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">IP:</span>
                  <span className="font-mono text-gray-700">{log.ipAddress}</span>
                </div>
              )}
              {log.userAgent && (
                <div className="flex items-start gap-2">
                  <Monitor className="h-4 w-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-500">Agent:</span>
                  <span className="text-gray-700 text-xs break-all">{log.userAgent}</span>
                </div>
              )}
              {log.endpoint && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Endpoint:</span>
                  <span className="font-mono text-xs text-gray-700">{log.method} {log.endpoint}</span>
                </div>
              )}
              {log.requestId && (
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Request ID:</span>
                  <span className="font-mono text-xs text-gray-700">{log.requestId}</span>
                </div>
              )}
              {log.responseTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Temps réponse:</span>
                  <span className="text-gray-700">{log.responseTime}ms</span>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="bg-white rounded-lg p-4 border">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Horodatage
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500">Date/Heure</span>
                <p className="font-medium text-gray-900">
                  {formatDate(log.timestamp || log.createdAt)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Relatif</span>
                <p className="text-gray-600">
                  {formatRelativeDate(log.timestamp || log.createdAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Raw Log ID */}
          <div className="text-center pt-2 border-t">
            <span className="text-xs text-gray-400">Log ID: </span>
            <span className="font-mono text-xs text-gray-500">{log._id || log.id}</span>
            <button 
              onClick={() => copyToClipboard(log._id || log.id, 'Log ID')}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              <Copy className="h-3 w-3 inline" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await getActivityLogs({
        limit,
        page,
        action: actionFilter || undefined,
      });
      const list = resp?.logs || resp || [];
      setLogs(list || []);
      setTotal(resp?.total || list.length || 0);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des logs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // WebSocket real-time updates for activity log
  useRealtimeUpdates({
    events: ['*'], // Listen to all events for comprehensive activity log
    onMessage: () => {
      // Reload logs when any significant event occurs
      loadLogs();
    }
  });

  // Filter logs by search term locally
  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const actor = log.actor || {};
    return (
      log.action?.toLowerCase().includes(term) ||
      log.resource?.toLowerCase().includes(term) ||
      actor.displayName?.toLowerCase().includes(term) ||
      actor.email?.toLowerCase().includes(term) ||
      log.userEmail?.toLowerCase().includes(term) ||
      log.description?.toLowerCase().includes(term) ||
      log.resourceId?.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(total / limit);

  const openLogDetail = (log) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="h-7 w-7 text-blue-600" />
            </div>
            Journal d'Activité
          </h1>
          <p className="text-muted-foreground mt-1 ml-12">
            Historique complet de toutes les actions administratives
          </p>
        </div>
        <Button onClick={loadLogs} disabled={loading} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-2">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[250px]">
              <label className="text-sm font-medium mb-1 block">Rechercher</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher par action, admin, ressource..."
                  className="pl-10"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Type d'action</label>
              <select
                value={actionFilter}
                onChange={(e) => { setPage(1); setActionFilter(e.target.value); }}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="">Toutes les actions</option>
                <optgroup label="Authentification">
                  <option value="ADMIN_LOGIN">Connexion admin</option>
                  <option value="LOGIN">Connexion</option>
                  <option value="LOGOUT">Déconnexion</option>
                </optgroup>
                <optgroup label="Prix">
                  <option value="CREATE_PRIZE">Création prix</option>
                  <option value="UPDATE_PRIZE">Modification prix</option>
                  <option value="DELETE_PRIZE">Suppression prix</option>
                </optgroup>
                <optgroup label="Récompenses">
                  <option value="CREATE_REWARD">Création récompense</option>
                  <option value="UPDATE_REWARD">Modification récompense</option>
                  <option value="DELETE_REWARD">Suppression récompense</option>
                </optgroup>
                <optgroup label="Utilisateurs">
                  <option value="USER_BANNED">Bannissement</option>
                  <option value="USER_UNBANNED">Débannissement</option>
                  <option value="POINTS_ADJUSTED">Ajustement points</option>
                  <option value="DELETE_USER">Suppression user</option>
                </optgroup>
                <optgroup label="Partenaires">
                  <option value="PARTNER_CREATED">Création partenaire</option>
                  <option value="PARTNER_UPDATED">Modification partenaire</option>
                  <option value="PARTNER_DELETED">Suppression partenaire</option>
                </optgroup>
                <optgroup label="Notifications">
                  <option value="SEND_NOTIFICATION">Notification envoyée</option>
                  <option value="BROADCAST_NOTIFICATION">Broadcast</option>
                </optgroup>
                <optgroup label="Système">
                  <option value="UPDATE_SETTINGS">Paramètres</option>
                  <option value="CLEAR_CACHE">Vidage cache</option>
                </optgroup>
              </select>
            </div>
            <div className="min-w-[100px]">
              <label className="text-sm font-medium mb-1 block">Par page</label>
              <select
                value={limit}
                onChange={(e) => { setPage(1); setLimit(parseInt(e.target.value) || 50); }}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                {[20, 50, 100, 200].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-4">
            <div className="text-sm text-blue-600 font-medium">Total Logs</div>
            <div className="text-3xl font-bold text-blue-800">{total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="pt-4">
            <div className="text-sm text-purple-600 font-medium">Page</div>
            <div className="text-3xl font-bold text-purple-800">{page} <span className="text-lg font-normal">/ {totalPages || 1}</span></div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-4">
            <div className="text-sm text-emerald-600 font-medium">Affichés</div>
            <div className="text-3xl font-bold text-emerald-800">{filteredLogs.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="pt-4">
            <div className="text-sm text-amber-600 font-medium">Filtre actif</div>
            <div className="text-lg font-bold text-amber-800 truncate">{actionFilter || 'Aucun'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Logs List */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Activités Récentes
          </CardTitle>
          <CardDescription>
            Cliquez sur une entrée pour voir tous les détails
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Activity className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Aucune activité trouvée</p>
              <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log, i) => {
                const config = getActionConfig(log.action);
                const IconComponent = config.icon;
                const actor = log.actor || {};
                const metadata = log.metadata || log.details || {};
                const severity = log.severity || config.severity;
                
                return (
                  <div 
                    key={log._id || log.id || i} 
                    onClick={() => openLogDetail(log)}
                    className={`flex items-center gap-4 p-4 border-2 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all cursor-pointer group border-l-4 ${SEVERITY_COLORS[severity] || SEVERITY_COLORS.low}`}
                  >
                    {/* Icon */}
                    <div className={`p-3 rounded-xl ${config.color} border`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Top row: Action + Resource */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={`${config.color} font-semibold`}>
                          {config.label}
                        </Badge>
                        <span className="text-sm font-semibold text-gray-800">
                          {log.displayAction || formatAction(log.action)}
                        </span>
                        {log.resource && (
                          <Badge variant="secondary" className="text-xs">
                            {log.displayResource || log.resource}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Description or metadata preview */}
                      {(log.description || Object.keys(metadata).length > 0) && (
                        <p className="text-sm text-gray-600 truncate">
                          {log.description || 
                            Object.entries(metadata).slice(0, 3).map(([k, v]) => 
                              `${k}: ${typeof v === 'object' ? '...' : v}`
                            ).join(' • ')
                          }
                        </p>
                      )}
                      
                      {/* Bottom row: Actor + Time + ID */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5 font-medium">
                          <User className="h-3.5 w-3.5" />
                          <span className="text-gray-700">
                            {actor.displayName || actor.email || log.userEmail || 'Système'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatRelativeDate(log.createdAt || log.timestamp)}
                        </span>
                        {log.resourceId && (
                          <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                            ID: {log.resourceId?.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Page <span className="font-bold">{page}</span> sur <span className="font-bold">{totalPages}</span> ({total.toLocaleString()} logs)
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1} 
                  onClick={() => setPage(1)}
                >
                  Début
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1} 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page >= totalPages} 
                  onClick={() => setPage(p => p + 1)}
                >
                  Suivant
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page >= totalPages} 
                  onClick={() => setPage(totalPages)}
                >
                  Fin
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <LogDetailDialog 
        log={selectedLog} 
        open={detailOpen} 
        onClose={() => setDetailOpen(false)} 
      />
    </div>
  );
}
