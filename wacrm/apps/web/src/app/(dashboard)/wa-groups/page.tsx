'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  RefreshCw,
  Search,
  Users,
  UserPlus,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Globe,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Filter,
  CheckCircle2,
  XCircle,
  Shield,
  ShieldCheck,
  Lock,
  MessageSquareOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface WaGroup {
  id: string;
  jid: string;
  subject: string | null;
  description: string | null;
  size: number;
  is_community: boolean;
  creation_ts: number | null;
  synced_at: string;
  restrict: boolean;
  announce: boolean;
  member_add_mode: boolean;
  join_approval_mode: boolean;
  is_community_announce: boolean;
  linked_parent: string | null;
  ephemeral_duration: number;
  participants_with_phone: number;
}

interface WaParticipant {
  id: string;
  jid: string;
  phone: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  in_crm: boolean;
}

type SortDir = 'asc' | 'desc' | null;
type GroupSortKey =
  | 'subject'
  | 'size'
  | 'creation_ts'
  | 'synced_at'
  | 'participants_with_phone';
type ParticipantSortKey =
  | 'display_name'
  | 'phone'
  | 'role'
  | 'in_crm';

const GROUP_COLS = [
  'subject',
  'groupId',
  'size',
  'phonesResolved',
  'type',
  'created',
  'description',
  'announce',
  'restrict',
  'syncedAt',
] as const;
type GroupCol = (typeof GROUP_COLS)[number];

const PARTICIPANT_COLS = [
  'name',
  'phone',
  'role',
  'inCrm',
  'jid',
] as const;
type ParticipantCol = (typeof PARTICIPANT_COLS)[number];

const GROUP_COL_DEFAULTS: Set<GroupCol> = new Set([
  'subject',
  'groupId',
  'size',
  'phonesResolved',
  'type',
  'created',
  'syncedAt',
]);

const PARTICIPANT_COL_DEFAULTS: Set<ParticipantCol> = new Set([
  'name',
  'phone',
  'role',
  'inCrm',
]);

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active || !dir)
    return <ArrowUpDown className="ml-1 inline size-3 opacity-40" />;
  return dir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3" />
  ) : (
    <ArrowDown className="ml-1 inline size-3" />
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  currentKey: string | null;
  currentDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <SortIcon
          active={currentKey === sortKey}
          dir={currentKey === sortKey ? currentDir : null}
        />
      </button>
    </TableHead>
  );
}

export default function WaGroupsPage() {
  const t = useTranslations('WaGroups');
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedGroup, setSelectedGroup] = useState<WaGroup | null>(
    null,
  );
  const [participants, setParticipants] = useState<WaParticipant[]>(
    [],
  );
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);

  const [importingGroupId, setImportingGroupId] = useState<
    string | null
  >(null);
  const [importingAll, setImportingAll] = useState(false);
  const [importAllConfirmOpen, setImportAllConfirmOpen] =
    useState(false);

  // Sorting
  const [groupSortKey, setGroupSortKey] =
    useState<GroupSortKey | null>('subject');
  const [groupSortDir, setGroupSortDir] = useState<SortDir>('asc');
  const [partSortKey, setPartSortKey] =
    useState<ParticipantSortKey | null>('display_name');
  const [partSortDir, setPartSortDir] = useState<SortDir>('asc');

  // Column visibility
  const [groupCols, setGroupCols] = useState<Set<GroupCol>>(
    new Set(GROUP_COL_DEFAULTS),
  );
  const [partCols, setPartCols] = useState<Set<ParticipantCol>>(
    new Set(PARTICIPANT_COL_DEFAULTS),
  );

  // Filters
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'group' | 'community'
  >('all');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'admin' | 'member'
  >('all');
  const [phoneFilter, setPhoneFilter] = useState<
    'all' | 'withPhone' | 'noPhone'
  >('all');
  const [crmFilter, setCrmFilter] = useState<
    'all' | 'inCrm' | 'notInCrm'
  >('all');

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

  async function handleSyncContacts() {
    setSyncingContacts(true);
    try {
      const res = await fetch('/api/whatsapp/contacts/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      toast.success(t('syncContactsQueued'));
    } catch {
      toast.error(t('syncContactsError'));
    } finally {
      setSyncingContacts(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Sync failed');
      toast.success(t('syncQueued'));
      setTimeout(() => fetchGroups(), 8000);
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
    setRoleFilter('all');
    setPhoneFilter('all');
    setCrmFilter('all');
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

  async function handleImportGroup(
    groupId: string,
    e?: React.MouseEvent,
  ) {
    e?.stopPropagation();
    setImportingGroupId(groupId);
    try {
      const res = await fetch(
        `/api/whatsapp/groups/${groupId}/import`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(
        t('importSuccess', {
          imported: data.imported,
          skipped: data.skipped,
        }),
      );
      if (selectedGroup) openGroup(selectedGroup);
    } catch {
      toast.error(t('importError'));
    } finally {
      setImportingGroupId(null);
    }
  }

  async function handleImportAll() {
    setImportingAll(true);
    try {
      const res = await fetch('/api/whatsapp/groups/import-all', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(
        t('importSuccess', {
          imported: data.imported,
          skipped: data.skipped,
        }),
      );
    } catch {
      toast.error(t('importError'));
    } finally {
      setImportingAll(false);
      setImportAllConfirmOpen(false);
    }
  }

  async function handleImportSelected() {
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
      if (selectedGroup) openGroup(selectedGroup);
    } catch {
      toast.error(t('importError'));
    } finally {
      setImporting(false);
      setImportConfirmOpen(false);
    }
  }

  function toggleGroupSort(key: string) {
    const k = key as GroupSortKey;
    if (groupSortKey === k) {
      if (groupSortDir === 'asc') setGroupSortDir('desc');
      else if (groupSortDir === 'desc') {
        setGroupSortKey(null);
        setGroupSortDir(null);
      }
    } else {
      setGroupSortKey(k);
      setGroupSortDir('asc');
    }
  }

  function togglePartSort(key: string) {
    const k = key as ParticipantSortKey;
    if (partSortKey === k) {
      if (partSortDir === 'asc') setPartSortDir('desc');
      else if (partSortDir === 'desc') {
        setPartSortKey(null);
        setPartSortDir(null);
      }
    } else {
      setPartSortKey(k);
      setPartSortDir('asc');
    }
  }

  function toggleGroupCol(col: GroupCol) {
    setGroupCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  function togglePartCol(col: ParticipantCol) {
    setPartCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  // ── Sorted & filtered groups ────────────────────────────
  const filteredGroups = useMemo(() => {
    let result = groups.filter((g) => {
      if (typeFilter === 'group' && g.is_community) return false;
      if (typeFilter === 'community' && !g.is_community) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !g.subject?.toLowerCase().includes(q) &&
          !g.jid.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    if (groupSortKey && groupSortDir) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (groupSortKey) {
          case 'subject':
            cmp = (a.subject || '').localeCompare(
              b.subject || '',
            );
            break;
          case 'size':
            cmp = a.size - b.size;
            break;
          case 'creation_ts':
            cmp = (a.creation_ts || 0) - (b.creation_ts || 0);
            break;
          case 'synced_at':
            cmp =
              new Date(a.synced_at).getTime() -
              new Date(b.synced_at).getTime();
            break;
          case 'participants_with_phone':
            cmp =
              a.participants_with_phone -
              b.participants_with_phone;
            break;
        }
        return groupSortDir === 'desc' ? -cmp : cmp;
      });
    }
    return result;
  }, [groups, search, typeFilter, groupSortKey, groupSortDir]);

  // ── Sorted & filtered participants ──────────────────────
  const importableParticipants = participants.filter(
    (p) => p.phone && !p.in_crm,
  );

  const filteredParticipants = useMemo(() => {
    let result = participants.filter((p) => {
      if (roleFilter === 'admin' && !p.is_admin) return false;
      if (roleFilter === 'member' && p.is_admin) return false;
      if (phoneFilter === 'withPhone' && !p.phone) return false;
      if (phoneFilter === 'noPhone' && p.phone) return false;
      if (crmFilter === 'inCrm' && !p.in_crm) return false;
      if (crmFilter === 'notInCrm' && p.in_crm) return false;
      if (participantSearch.trim()) {
        const q = participantSearch.toLowerCase();
        if (
          !p.display_name?.toLowerCase().includes(q) &&
          !p.phone?.includes(q) &&
          !p.jid.includes(q)
        )
          return false;
      }
      return true;
    });

    if (partSortKey && partSortDir) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (partSortKey) {
          case 'display_name':
            cmp = (a.display_name || '￿').localeCompare(
              b.display_name || '￿',
            );
            break;
          case 'phone':
            cmp = (a.phone || '￿').localeCompare(
              b.phone || '￿',
            );
            break;
          case 'role':
            cmp =
              (a.is_super_admin ? 2 : a.is_admin ? 1 : 0) -
              (b.is_super_admin ? 2 : b.is_admin ? 1 : 0);
            break;
          case 'in_crm':
            cmp =
              (a.in_crm ? 1 : 0) - (b.in_crm ? 1 : 0);
            break;
        }
        return partSortDir === 'desc' ? -cmp : cmp;
      });
    }
    return result;
  }, [
    participants,
    participantSearch,
    roleFilter,
    phoneFilter,
    crmFilter,
    partSortKey,
    partSortDir,
  ]);

  const filteredImportable = filteredParticipants.filter(
    (p) => p.phone && !p.in_crm,
  );
  const allImportableSelected =
    filteredImportable.length > 0 &&
    filteredImportable.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allImportableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredImportable.map((p) => p.id)));
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

  const groupColLabels: Record<GroupCol, string> = {
    subject: t('colGroupName'),
    groupId: t('colGroupId'),
    size: t('colMembers'),
    phonesResolved: t('colPhonesResolved'),
    type: t('colType'),
    created: t('colCreated'),
    description: t('colDescription'),
    announce: t('colAdminOnly'),
    restrict: t('colRestricted'),
    syncedAt: t('colSyncedAt'),
  };

  const partColLabels: Record<ParticipantCol, string> = {
    name: t('colName'),
    phone: t('colPhone'),
    role: t('colRole'),
    inCrm: t('colInCrm'),
    jid: t('colJid'),
  };

  // ── Participant view ──────────────────────────────────
  if (selectedGroup) {
    const statsWithPhone = participants.filter((p) => p.phone).length;
    const statsInCrm = participants.filter((p) => p.in_crm).length;

    return (
      <div className="space-y-4">
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
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {t('colGroupId')}: {selectedGroup.id}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {participants.length} {t('participantsLabel')}
                </span>
                <span>·</span>
                <span className="text-emerald-500">
                  {statsWithPhone} {t('withPhone')}
                </span>
                <span>·</span>
                <span className="text-blue-500">
                  {statsInCrm} {t('inCrmLabel')}
                </span>
                <span>·</span>
                <span>{t('emailHint')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                handleImportGroup(selectedGroup.id)
              }
              disabled={
                importingGroupId === selectedGroup.id ||
                importableParticipants.length === 0
              }
              variant="outline"
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {importingGroupId === selectedGroup.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('importAllFromGroup')} (
              {importableParticipants.length})
            </Button>
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
        </div>

        {/* Toolbar: search + filters + column visibility */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={participantSearch}
              onChange={(e) => setParticipantSearch(e.target.value)}
              placeholder={t('searchParticipants')}
              className="border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
                <Filter className="size-3.5" />
                {t('filters')}
                {(roleFilter !== 'all' ||
                  phoneFilter !== 'all' ||
                  crmFilter !== 'all') && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 rounded-full px-1.5 text-[10px]"
                  >
                    {[roleFilter, phoneFilter, crmFilter].filter(
                      (f) => f !== 'all',
                    ).length}
                  </Badge>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-48"
            >
              <DropdownMenuLabel>
                {t('colRole')}
              </DropdownMenuLabel>
              {(['all', 'admin', 'member'] as const).map(
                (v) => (
                  <DropdownMenuCheckboxItem
                    key={v}
                    checked={roleFilter === v}
                    onCheckedChange={() => setRoleFilter(v)}
                  >
                    {v === 'all'
                      ? t('filterAll')
                      : v === 'admin'
                        ? t('admin')
                        : t('member')}
                  </DropdownMenuCheckboxItem>
                ),
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t('colPhone')}
              </DropdownMenuLabel>
              {(['all', 'withPhone', 'noPhone'] as const).map(
                (v) => (
                  <DropdownMenuCheckboxItem
                    key={v}
                    checked={phoneFilter === v}
                    onCheckedChange={() => setPhoneFilter(v)}
                  >
                    {v === 'all'
                      ? t('filterAll')
                      : v === 'withPhone'
                        ? t('filterWithPhone')
                        : t('filterNoPhone')}
                  </DropdownMenuCheckboxItem>
                ),
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t('colInCrm')}
              </DropdownMenuLabel>
              {(['all', 'inCrm', 'notInCrm'] as const).map(
                (v) => (
                  <DropdownMenuCheckboxItem
                    key={v}
                    checked={crmFilter === v}
                    onCheckedChange={() => setCrmFilter(v)}
                  >
                    {v === 'all'
                      ? t('filterAll')
                      : v === 'inCrm'
                        ? t('filterInCrm')
                        : t('filterNotInCrm')}
                  </DropdownMenuCheckboxItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
                <SlidersHorizontal className="size-3.5" />
                {t('columns')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PARTICIPANT_COLS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={partCols.has(col)}
                  onCheckedChange={() => togglePartCol(col)}
                >
                  {partColLabels[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allImportableSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={filteredImportable.length === 0}
                    aria-label={t('selectAll')}
                  />
                </TableHead>
                {partCols.has('name') && (
                  <SortableHeader
                    label={t('colName')}
                    sortKey="display_name"
                    currentKey={partSortKey}
                    currentDir={partSortDir}
                    onSort={togglePartSort}
                    className="text-muted-foreground"
                  />
                )}
                {partCols.has('phone') && (
                  <SortableHeader
                    label={t('colPhone')}
                    sortKey="phone"
                    currentKey={partSortKey}
                    currentDir={partSortDir}
                    onSort={togglePartSort}
                    className="text-muted-foreground"
                  />
                )}
                {partCols.has('role') && (
                  <SortableHeader
                    label={t('colRole')}
                    sortKey="role"
                    currentKey={partSortKey}
                    currentDir={partSortDir}
                    onSort={togglePartSort}
                    className="hidden text-muted-foreground sm:table-cell"
                  />
                )}
                {partCols.has('inCrm') && (
                  <SortableHeader
                    label={t('colInCrm')}
                    sortKey="in_crm"
                    currentKey={partSortKey}
                    currentDir={partSortDir}
                    onSort={togglePartSort}
                    className="text-muted-foreground"
                  />
                )}
                {partCols.has('jid') && (
                  <TableHead className="text-muted-foreground">
                    {t('colJid')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {participantsLoading ? (
                <TableRow className="border-border">
                  <TableCell
                    colSpan={1 + partCols.size}
                    className="py-12 text-center"
                  >
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
                  <TableCell
                    colSpan={1 + partCols.size}
                    className="py-12 text-center"
                  >
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
                        onCheckedChange={() =>
                          toggleSelect(p.id)
                        }
                        disabled={!p.phone || p.in_crm}
                        aria-label={`Select ${p.display_name || p.jid}`}
                      />
                    </TableCell>
                    {partCols.has('name') && (
                      <TableCell className="font-medium text-foreground">
                        {p.display_name || (
                          <span className="italic text-muted-foreground">
                            {t('unknown')}
                          </span>
                        )}
                      </TableCell>
                    )}
                    {partCols.has('phone') && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.phone || (
                          <span className="text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </TableCell>
                    )}
                    {partCols.has('role') && (
                      <TableCell className="hidden sm:table-cell">
                        {p.is_super_admin ? (
                          <Badge
                            variant="default"
                            className="gap-1 text-[10px]"
                          >
                            <ShieldCheck className="size-3" />
                            {t('superAdmin')}
                          </Badge>
                        ) : p.is_admin ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px]"
                          >
                            <Shield className="size-3" />
                            {t('admin')}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('member')}
                          </span>
                        )}
                      </TableCell>
                    )}
                    {partCols.has('inCrm') && (
                      <TableCell>
                        {p.in_crm ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600"
                          >
                            <CheckCircle2 className="size-3" />
                            {t('inCrmYes')}
                          </Badge>
                        ) : p.phone ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-orange-500/30 bg-orange-500/10 text-[10px] text-orange-600"
                          >
                            <XCircle className="size-3" />
                            {t('inCrmNo')}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </TableCell>
                    )}
                    {partCols.has('jid') && (
                      <TableCell className="max-w-[200px] truncate font-mono text-[10px] text-muted-foreground/60">
                        {p.jid}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog
          open={importConfirmOpen}
          onOpenChange={setImportConfirmOpen}
        >
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
                onClick={handleImportSelected}
                disabled={importing}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {importing && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t('importBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Groups list view ──────────────────────────────────
  const totalPhones = groups.reduce(
    (sum, g) => sum + (g.participants_with_phone || 0),
    0,
  );
  const totalMembers = groups.reduce(
    (sum, g) => sum + g.size,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length > 0
              ? `${groups.length} ${t('groupsLabel')} · ${totalMembers.toLocaleString()} ${t('participantsLabel')} · ${totalPhones.toLocaleString()} ${t('withPhone')}`
              : t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <Button
              onClick={() => setImportAllConfirmOpen(true)}
              disabled={importingAll}
              variant="outline"
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {importingAll ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('importAllBtn')}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleSyncContacts}
            disabled={syncingContacts}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {syncingContacts ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {t('syncContactsBtn')}
          </Button>
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
      </div>

      {/* Toolbar: search + type filter + column visibility */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchGroups')}
            className="border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Type filter */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
              <Filter className="size-3.5" />
              {t('colType')}
              {typeFilter !== 'all' && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 rounded-full px-1.5 text-[10px]"
                >
                  1
                </Badge>
              )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(['all', 'group', 'community'] as const).map(
              (v) => (
                <DropdownMenuCheckboxItem
                  key={v}
                  checked={typeFilter === v}
                  onCheckedChange={() => setTypeFilter(v)}
                >
                  {v === 'all'
                    ? t('filterAll')
                    : v === 'group'
                      ? t('group')
                      : t('community')}
                </DropdownMenuCheckboxItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
              <SlidersHorizontal className="size-3.5" />
              {t('columns')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {GROUP_COLS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col}
                checked={groupCols.has(col)}
                onCheckedChange={() => toggleGroupCol(col)}
              >
                {groupColLabels[col]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {groupCols.has('subject') && (
                <SortableHeader
                  label={t('colGroupName')}
                  sortKey="subject"
                  currentKey={groupSortKey}
                  currentDir={groupSortDir}
                  onSort={toggleGroupSort}
                  className="text-muted-foreground"
                />
              )}
              {groupCols.has('groupId') && (
                <TableHead className="hidden font-mono text-muted-foreground lg:table-cell">
                  {t('colGroupId')}
                </TableHead>
              )}
              {groupCols.has('size') && (
                <SortableHeader
                  label={t('colMembers')}
                  sortKey="size"
                  currentKey={groupSortKey}
                  currentDir={groupSortDir}
                  onSort={toggleGroupSort}
                  className="text-muted-foreground"
                />
              )}
              {groupCols.has('phonesResolved') && (
                <SortableHeader
                  label={t('colPhonesResolved')}
                  sortKey="participants_with_phone"
                  currentKey={groupSortKey}
                  currentDir={groupSortDir}
                  onSort={toggleGroupSort}
                  className="text-muted-foreground"
                />
              )}
              {groupCols.has('type') && (
                <TableHead className="hidden text-muted-foreground sm:table-cell">
                  {t('colType')}
                </TableHead>
              )}
              {groupCols.has('created') && (
                <SortableHeader
                  label={t('colCreated')}
                  sortKey="creation_ts"
                  currentKey={groupSortKey}
                  currentDir={groupSortDir}
                  onSort={toggleGroupSort}
                  className="hidden text-muted-foreground md:table-cell"
                />
              )}
              {groupCols.has('description') && (
                <TableHead className="hidden text-muted-foreground lg:table-cell">
                  {t('colDescription')}
                </TableHead>
              )}
              {groupCols.has('announce') && (
                <TableHead className="hidden text-muted-foreground md:table-cell">
                  {t('colAdminOnly')}
                </TableHead>
              )}
              {groupCols.has('restrict') && (
                <TableHead className="hidden text-muted-foreground md:table-cell">
                  {t('colRestricted')}
                </TableHead>
              )}
              {groupCols.has('syncedAt') && (
                <SortableHeader
                  label={t('colSyncedAt')}
                  sortKey="synced_at"
                  currentKey={groupSortKey}
                  currentDir={groupSortDir}
                  onSort={toggleGroupSort}
                  className="hidden text-muted-foreground md:table-cell"
                />
              )}
              <TableHead className="w-28 text-muted-foreground" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell
                  colSpan={groupCols.size + 1}
                  className="py-12 text-center"
                >
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
                <TableCell
                  colSpan={groupCols.size + 1}
                  className="py-12 text-center"
                >
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
                  {groupCols.has('subject') && (
                    <TableCell className="font-medium text-foreground">
                      {group.subject || (
                        <span className="italic text-muted-foreground">
                          {t('unnamed')}
                        </span>
                      )}
                    </TableCell>
                  )}
                  {groupCols.has('groupId') && (
                    <TableCell className="hidden max-w-[140px] truncate font-mono text-xs text-muted-foreground lg:table-cell">
                      {group.id}
                    </TableCell>
                  )}
                  {groupCols.has('size') && (
                    <TableCell className="text-muted-foreground">
                      {group.size.toLocaleString()}
                    </TableCell>
                  )}
                  {groupCols.has('phonesResolved') && (
                    <TableCell className="text-muted-foreground">
                      <span
                        className={
                          group.participants_with_phone > 0
                            ? 'text-emerald-500'
                            : ''
                        }
                      >
                        {(
                          group.participants_with_phone || 0
                        ).toLocaleString()}
                      </span>
                    </TableCell>
                  )}
                  {groupCols.has('type') && (
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
                  )}
                  {groupCols.has('created') && (
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {group.creation_ts
                        ? new Date(
                            group.creation_ts * 1000,
                          ).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                  )}
                  {groupCols.has('description') && (
                    <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground lg:table-cell">
                      {group.description || '—'}
                    </TableCell>
                  )}
                  {groupCols.has('announce') && (
                    <TableCell className="hidden md:table-cell">
                      {group.announce && (
                        <MessageSquareOff className="size-3.5 text-amber-500" />
                      )}
                    </TableCell>
                  )}
                  {groupCols.has('restrict') && (
                    <TableCell className="hidden md:table-cell">
                      {group.restrict && (
                        <Lock className="size-3.5 text-amber-500" />
                      )}
                    </TableCell>
                  )}
                  {groupCols.has('syncedAt') && (
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {group.synced_at
                        ? new Date(
                            group.synced_at,
                          ).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) =>
                          handleImportGroup(group.id, e)
                        }
                        disabled={
                          importingGroupId === group.id
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {importingGroupId === group.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="size-3.5" />
                        )}
                        {t('importBtn')}
                      </Button>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Import All Confirmation */}
      <Dialog
        open={importAllConfirmOpen}
        onOpenChange={setImportAllConfirmOpen}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('importAllTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('importAllDesc', { count: groups.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-border bg-popover">
            <Button
              variant="outline"
              onClick={() => setImportAllConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleImportAll}
              disabled={importingAll}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importingAll && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t('importAllBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
