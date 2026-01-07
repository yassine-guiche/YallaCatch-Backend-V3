import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Bell, Send, RefreshCw, Users, User, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { getNotifications, sendNotification, getNotificationStats, getNotificationTemplates, createNotificationTemplate, updateNotificationTemplate, deleteNotificationTemplate, scheduleNotification } from '../services/notifications';
import { formatDate } from '../utils/dates';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

export default function NotificationsManagement() {
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [templates, setTemplates] = useState({ push: [], email: [], sms: [], in_app: [] });
  const [selectedTemplate, setSelectedTemplate] = useState({ channel: 'push', id: '' });
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info', // severity
    channel: 'push', // push | email | sms | in_app
    target: 'all', // all | specific
    targetIds: [],
    scheduledFor: ''
  });

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getNotifications({ page: 1, limit: 50 });
      setNotifications(result.items || []);
      
      const statsData = await getNotificationStats();
      setStats(statsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    (async () => {
      const tpls = await getNotificationTemplates();
      setTemplates(tpls);
    })();
  }, []);

  // WebSocket real-time updates
  useRealtimeUpdates({
    events: ['notification_sent', 'stats_update'],
    onMessage: (event, data) => {
      if (event === 'notification_sent') {
        loadNotifications();
        toast.info('Notification envoyée');
      } else if (event === 'stats_update' && data.stats) {
        setStats(prev => ({ ...prev, ...data.stats }));
      }
    }
  });

// Confirm dialog states
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [deleteTemplateConfirmOpen, setDeleteTemplateConfirmOpen] = useState(false);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState(null);
  const [pendingFormEvent, setPendingFormEvent] = useState(null);

  const handleSendClick = (e) => {
    e.preventDefault();
    setPendingFormEvent(e);
    setSendConfirmOpen(true);
  };

  const handleSendConfirm = async () => {
    setSendConfirmOpen(false);
    try {
      if (formData.scheduledFor) {
        const isoDate = new Date(formData.scheduledFor).toISOString();
        await scheduleNotification({ ...formData, scheduledFor: isoDate });
      } else if (formData.target === 'specific' && Array.isArray(formData.targetIds) && formData.targetIds.length > 0) {
        for (const uid of formData.targetIds) {
          await sendNotification({ ...formData, userId: uid });
        }
      } else {
        await sendNotification(formData);
      }
      setShowSendDialog(false);
      setFormData({
        title: '',
        message: '',
        type: 'info',
        channel: 'push',
        target: 'all',
        targetIds: [],
        scheduledFor: ''
      });
      await loadNotifications();
      toast.success('Notification envoyée avec succès !');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  };

  const getTypeBadge = (type) => {
    const variants = {
      info: 'default',
      success: 'default',
      warning: 'secondary',
      error: 'destructive'
    };
    
    return <Badge variant={variants[type] || 'outline'}>{type}</Badge>;
  };

  const handleDeleteTemplateConfirm = async () => {
    setDeleteTemplateConfirmOpen(false);
    try {
      await deleteNotificationTemplate(pendingDeleteTemplateId, formData.channel);
      const tpls = await getNotificationTemplates();
      setTemplates(tpls);
      setSelectedTemplate({ channel: formData.channel, id: '' });
      toast.success('Modèle supprimé');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setPendingDeleteTemplateId(null);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Send Confirm Dialog */}
      <ConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title="Envoyer la notification"
        description={`Êtes-vous sûr de vouloir envoyer cette notification à ${formData.target === 'all' ? 'tous les utilisateurs' : 'les utilisateurs sélectionnés'} ?`}
        confirmLabel="Envoyer"
        variant="warning"
        onConfirm={handleSendConfirm}
      />

      {/* Delete Template Confirm Dialog */}
      <ConfirmDialog
        open={deleteTemplateConfirmOpen}
        onOpenChange={setDeleteTemplateConfirmOpen}
        title="Supprimer le modèle"
        description="Êtes-vous sûr de vouloir supprimer ce modèle de notification ?"
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDeleteTemplateConfirm}
      />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Notifications</h1>
          <p className="text-gray-500 mt-1">Envoyer des notifications push aux utilisateurs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadNotifications} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button onClick={() => setShowSendDialog(true)}>
            <Send className="mr-2 h-4 w-4" />
            Envoyer une Notification
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Envoyées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSent || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Taux d'Ouverture</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openRate || 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Aujourd'hui</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sentToday || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cette Semaine</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sentThisWeek || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des Notifications</CardTitle>
          <CardDescription>Dernières notifications envoyées</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-200 animate-pulse rounded"></div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucune notification envoyée
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notif) => (
                <div key={notif.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{notif.title}</h3>
                      <p className="text-gray-600 mt-1">{notif.message}</p>
                    </div>
                    {getTypeBadge((notif.metadata && notif.metadata.severity) || 'info')}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
                    <div className="flex items-center gap-1">
                      {notif.targetType === 'all' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                      <span>{notif.targetType === 'all' ? 'Tous les utilisateurs' : 'Utilisateurs spécifiques'}</span>
                    </div>
                    <div>
                      Envoyée {formatDate(notif.sentAt || notif.createdAt)}
                    </div>
                    {notif.openRate !== undefined && (
                      <div>
                        Taux d'ouverture: {notif.openRate}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Envoyer une Notification</DialogTitle>
            <DialogDescription>
              Renseignez le contenu, la cible et le canal. Utilisez la planification pour envoyer plus tard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendClick} className="space-y-4">
            {/* Template Picker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Canal</label>
                <select
                  value={formData.channel}
                  onChange={(e) => {
                    const channel = e.target.value;
                    setFormData({ ...formData, channel });
                    setSelectedTemplate({ channel, id: '' });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="push">Push</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="in_app">In‑App</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Modèle (optionnel)</label>
                <select
                  value={selectedTemplate.id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTemplate({ channel: formData.channel, id });
                    const tpl = (templates[formData.channel] || []).find(t => t.id === id);
                    if (tpl) {
                      const content = tpl.content || {};
                      const tplTitle = tpl.title || tpl.name || content.title || '';
                      const tplMessage = tpl.body || tpl.message || content.body || content.message || '';
                      setFormData({
                        ...formData,
                        title: tplTitle,
                        message: tplMessage,
                        type: 'info',
                      });
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">— Aucun —</option>
                  {(templates[formData.channel] || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const name = prompt('Nom du modèle');
                    if (!name) return;
                    const entry = await createNotificationTemplate({
                      name,
                      channel: formData.channel,
                      content: {
                        title: formData.title,
                        message: formData.message,
                        body: formData.message,
                      },
                    });
                    const tpls = await getNotificationTemplates();
                    setTemplates(tpls);
                    setSelectedTemplate({ channel: formData.channel, id: entry.id });
                  }}
                >Enregistrer en modèle</Button>
                {selectedTemplate.id && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await updateNotificationTemplate(selectedTemplate.id, {
                          channel: formData.channel,
                          content: {
                            title: formData.title,
                            message: formData.message,
                            body: formData.message,
                          },
                        });
                        const tpls = await getNotificationTemplates();
                        setTemplates(tpls);
                      }}
                    >Mettre à jour</Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setPendingDeleteTemplateId(selectedTemplate.id);
                        setDeleteTemplateConfirmOpen(true);
                      }}
                    >Supprimer</Button>
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Titre de la notification"
                required
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Contenu de la notification"
                required
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(formData.message || '').length}/500 caractères
              </p>
            </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="info">Information</option>
                    <option value="success">Succès</option>
                    <option value="warning">Avertissement</option>
                    <option value="error">Erreur</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cible</label>
                  <select
                    value={formData.target}
                    onChange={(e) => setFormData({...formData, target: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="all">Tous les utilisateurs</option>
                    <option value="specific">Utilisateurs spécifiques</option>
                  </select>
                </div>
              </div>
            <div>
              <label className="block text-sm font-medium mb-1">Planifier (optionnel)</label>
              <Input
                type="datetime-local"
                value={formData.scheduledFor}
                onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Laisser vide pour envoyer immédiatement</p>
            </div>
            {formData.target === 'specific' && (
              <div>
                <label className="block text-sm font-medium mb-1">IDs des Utilisateurs</label>
                <Input
                  placeholder="ID1, ID2, ID3..."
                  value={Array.isArray(formData.targetIds) ? formData.targetIds.join(', ') : ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    targetIds: e.target.value.split(',').map(id => id.trim()).filter(Boolean)
                  })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Séparez les IDs par des virgules
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowSendDialog(false)}>
                Annuler
              </Button>
              <Button type="submit">
                <Send className="mr-2 h-4 w-4" />
                Envoyer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
