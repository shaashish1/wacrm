'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Plus,
} from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useRouter } from 'next/navigation';

export default function ContactGroupsPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const router = useRouter();

  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isSmart, setIsSmart] = useState(false);
  const [smartFilter, setSmartFilter] = useState('');

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contact-groups');
      const data = await res.json();
      if (data.data) {
        setGroups(data.data);
      }
    } catch (err) {
      toast.error('Failed to load contact groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  function openAddForm() {
    setEditGroup(null);
    setName('');
    setDescription('');
    setColor('#6366f1');
    setIsSmart(false);
    setSmartFilter('');
    setFormOpen(true);
  }

  function openEditForm(group: any) {
    setEditGroup(group);
    setName(group.name || '');
    setDescription(group.description || '');
    setColor(group.color || '#6366f1');
    setIsSmart(group.is_smart || false);
    setSmartFilter(group.smart_filter ? JSON.stringify(group.smart_filter) : '');
    setFormOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Name is required');
    
    let parsedFilter = null;
    if (isSmart && smartFilter) {
      try {
        parsedFilter = JSON.parse(smartFilter);
      } catch (e) {
        return toast.error('Smart filter must be valid JSON');
      }
    }

    setSaving(true);
    try {
      const url = editGroup ? `/api/contact-groups/${editGroup.id}` : '/api/contact-groups';
      const method = editGroup ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          color,
          is_smart: isSmart,
          smart_filter: parsedFilter
        })
      });

      if (!res.ok) throw new Error('Failed to save group');
      
      toast.success(editGroup ? 'Group updated' : 'Group created');
      setFormOpen(false);
      fetchGroups();
    } catch (e) {
      toast.error('Failed to save group');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      const res = await fetch(`/api/contact-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Group deleted');
      fetchGroups();
    } catch (e) {
      toast.error('Failed to delete group');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contact Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize your contacts into static lists or smart segments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canEdit}
            gateReason="create groups"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-2" />
            Add Group
          </GatedButton>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Members</TableHead>
              <TableHead className="text-muted-foreground">Description</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading groups...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No groups yet.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <TableRow key={group.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => {/* Navigate to group details */}}>
                  <TableCell className="text-foreground font-medium flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: group.color || '#6366f1' }}
                    />
                    {group.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {group.is_smart ? (
                      <span className="inline-flex rounded-full bg-blue-500/10 text-blue-500 px-2 py-0.5 text-xs font-semibold">Smart</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-500/10 text-slate-500 px-2 py-0.5 text-xs font-semibold">Static</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.is_smart ? 'Auto' : group.member_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {group.description || '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditForm(group); }}>
                          <Pencil className="size-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }}
                        >
                          <Trash2 className="size-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., VIP Customers"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label>Color Code</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-16 p-1 h-10 cursor-pointer"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#6366f1"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Smart Segment</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically add members based on criteria.
                </p>
              </div>
              <Switch
                checked={isSmart}
                onCheckedChange={setIsSmart}
              />
            </div>
            
            {isSmart && (
              <div className="space-y-2">
                <Label>Smart Filter (JSON)</Label>
                <Input
                  value={smartFilter}
                  onChange={(e) => setSmartFilter(e.target.value)}
                  placeholder='{"tags": ["VIP"]}'
                />
                <p className="text-xs text-muted-foreground">
                  Experimental: Provide raw JSON filter for segmentation. Leave empty to match all.
                </p>
              </div>
            )}

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
