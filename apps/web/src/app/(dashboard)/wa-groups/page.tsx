'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  Search,
  Users,
  UserPlus,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Globe,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WaGroup {
  id: string;
  jid: string;
  subject: string | null;
  description: string | null;
  size: number;
  is_community: boolean;
  synced_at: string;
}

interface WaParticipant {
  id: string;
  jid: string;
  phone: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
}

export default function WaGroupsPage() {
  const t = useTranslations('WaGroups');
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  // Participant drill-down
  const [selectedGroup, setSelectedGroup] = useState<WaGroup | null>(null);
  const [participants, setParticipants] = useState<WaParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');

  // Import selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/groups');
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      toast.error(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGroups();
  }, [fetchGroups]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/groups', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      toast.success(t('syncQueued'));
      setTimeout(() => fetchGroups(), 5000);
    } catch {
      toast.error(t('syncError'));
    } finally {
      setSyncing(false);
    }
  }

  async function openGroup(group: WaGroup) {
    setSelectedGroup(group);
    setParticipants([]);
    setSelected(new Set());
    setParticipantSearch('');
    setParticipantsLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/groups/${group.id}/participants`,
      );
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setParticipants(data.participants ?? []);
    } catch {
      toast.error(t('fetchParticipantsError'));
    } finally {
      setParticipantsLoading(false);
    }
  }

  function goBack() {
    setSelectedGroup(null);
    setParticipants([]);
    setSelected(new Set());
  }

  const importableParticipants = participants.filter((p) => p.phone);
  const filteredParticipants = participants.filter((p) => {
    if (!participantSearch.trim()) return true;
    const q = participantSearch.toLowerCase();
    return (
      p.display_name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.jid.includes(q)
    );
  });

  const allImportableSelected =
    importableParticipants.length > 0 &&
    importableParticipants.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allImportableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importableParticipants.map((p) => p.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch('/api/whatsapp/groups/import-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: [...selected] }),
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(
        t('importSuccess', {
          imported: data.imported,
          skipped: data.skipped,
        }),
      );
      setSelected(new Set());
    } catch {
      toast.error(t('importError'));
    } finally {
      setImporting(false);
      setImportConfirmOpen(false);
    }
  }

  const filteredGroups = groups.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.subject?.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q)
    );
  });

  // ── Participant view ──────────────────────────────────
  if (selectedGroup) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={goBack}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {selectedGroup.subject || selectedGroup.jid}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('participantCount', {
                  count: participants.length,
                })}
              </p>
            </div>
          </div>
          {selected.size > 0 && (
            <Button
              onClick={() => setImportConfirmOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="size-4" />
              {t('importSelected', { count: selected.size })}
            </Button>
          )}
        </div>

        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={participantSearch}
            onChange={(e) => setParticipantSearch(e.target.value)}
            placeholder={t('searchParticipants')}
            className="border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allImportableSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={importableParticipants.length === 0}
                    aria-label={t('selectAll')}
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t('colName')}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t('colPhone')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">
                  {t('colRole')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participantsLoading ? (
                <TableRow className="border-border">
                  <TableCell colSpan={4} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="size-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {t('loading')}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredParticipants.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={4} className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t('noParticipants')}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredParticipants.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-border hover:bg-muted/50"
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleSelect(p.id)}
                        disabled={!p.phone}
                        aria-label={`Select ${p.display_name || p.jid}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {p.display_name || (
                        <span className="italic text-muted-foreground">
                          {t('unknown')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.phone || '-'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {p.is_super_admin
                        ? t('superAdmin')
                        : p.is_admin
                          ? t('admin')
                          : t('member')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
          <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {t('importTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('importDesc', { count: selected.size })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-border bg-popover">
              <Button
                variant="outline"
                onClick={() => setImportConfirmOpen(false)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                {t('importBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Groups list view ──────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t('syncBtn')}
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchGroups')}
          className="border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">
                {t('colGroupName')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('colMembers')}
              </TableHead>
              <TableHead className="hidden text-muted-foreground sm:table-cell">
                {t('colType')}
              </TableHead>
              <TableHead className="hidden text-muted-foreground md:table-cell">
                {t('colSyncedAt')}
              </TableHead>
              <TableHead className="w-10 text-muted-foreground" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {t('loading')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredGroups.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {groups.length === 0
                        ? t('noGroups')
                        : t('noGroupsMatch')}
                    </p>
                    {groups.length === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncing}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <RefreshCw className="size-3.5" />
                        {t('syncBtn')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredGroups.map((group) => (
                <TableRow
                  key={group.id}
                  className="cursor-pointer border-border hover:bg-muted/50"
                  onClick={() => openGroup(group)}
                >
                  <TableCell className="font-medium text-foreground">
                    {group.subject || (
                      <span className="italic text-muted-foreground">
                        {t('unnamed')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.size}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {group.is_community ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="size-3" />
                        {t('community')}
                      </span>
                    ) : (
                      t('group')
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {group.synced_at
                      ? new Date(group.synced_at).toLocaleDateString(
                          'en-US',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
