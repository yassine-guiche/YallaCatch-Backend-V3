import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { getActivityLogs } from '../services/activity';
import { formatDate } from '../utils/dates';

export default function ActivityLogDialog({ open, onOpenChange }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchAction, setSearchAction] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = async (reset = false) => {
    try {
      setLoading(true);
      const data = await getActivityLogs({
        limit: 50,
        page: reset ? 1 : page,
        action: searchAction || undefined,
        actorEmail: actorEmail || undefined,
      });
      if (reset) {
        setLogs(data || []);
        setPage(1);
      } else {
        setLogs(data || []);
      }
      setHasMore((data || []).length === 50);
    } catch (e) {
      console.error('load activity logs error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Journal d'Activité (Admin)</DialogTitle>
          <DialogDescription>Historique des actions effectuées sur la plateforme</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Filtrer par action (ex: ban_user)" value={searchAction} onChange={e => setSearchAction(e.target.value)} />
            <Input placeholder="Filtrer par email acteur" value={actorEmail} onChange={e => setActorEmail(e.target.value)} />
            <Button onClick={() => load(true)} disabled={loading}>Rechercher</Button>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y">
            {loading ? (
              <div className="p-4 text-center">Chargement...</div>
            ) : logs.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Aucune activité</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="p-3 text-sm">
                  <div className="flex justify-between">
                    <div className="font-medium">{log.action} <span className="text-gray-500">/ {log.resource}</span></div>
                    <div className="text-gray-500">{formatDate(log.timestamp || log.createdAt)}</div>
                  </div>
                  <div className="text-gray-600">{log.message || log.description}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {log.userEmail || 'Système'} • IP {log.ipAddress || 'N/A'} • {log.userAgent?.slice(0, 50) || ''}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { if (page > 1) { setPage(page - 1); load(); } }} disabled={loading || page === 1}>Précédent</Button>
            <div className="text-sm text-gray-500">Page {page}</div>
            <Button variant="outline" onClick={() => { if (hasMore) { setPage(page + 1); load(); } }} disabled={loading || !hasMore}>Suivant</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

