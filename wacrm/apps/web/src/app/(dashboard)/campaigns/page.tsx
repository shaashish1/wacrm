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
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Send,
  Plus,
  Play,
  Pause
} from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';

export default function CampaignsPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (data.data) {
        setCampaigns(data.data);
      }
    } catch (err) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  function openAddForm() {
    setEditCampaign(null);
    setName('');
    setChannel('email');
    setFormOpen(true);
  }

  function openEditForm(campaign: any) {
    setEditCampaign(campaign);
    setName(campaign.name || '');
    setChannel(campaign.channel || 'email');
    setFormOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Name is required');

    setSaving(true);
    try {
      const url = editCampaign ? `/api/campaigns/${editCampaign.id}` : '/api/campaigns';
      const method = editCampaign ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channel })
      });

      if (!res.ok) throw new Error('Failed to save');
      
      toast.success(editCampaign ? 'Campaign updated' : 'Campaign created');
      setFormOpen(false);
      fetchCampaigns();
    } catch (e) {
      toast.error('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch (e) {
      toast.error('Failed to delete campaign');
    }
  }

  async function handleStart(id: string) {
    if (!confirm('Are you sure you want to start this campaign? Contacts in the target group will be enrolled.')) return;
    try {
      const res = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      toast.success(`Campaign started. Enrolled ${data.enrolled} contacts.`);
      fetchCampaigns();
    } catch (e: any) {
      toast.error(e.message || 'Failed to start campaign');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drip Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate multi-step email and WhatsApp sequences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canEdit}
            gateReason="create campaigns"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-2" />
            Create Campaign
          </GatedButton>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Channel</TableHead>
              <TableHead className="text-muted-foreground">Enrollments</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading campaigns...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Send className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No campaigns found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => {/* Navigate to campaign details */}}>
                  <TableCell className="text-foreground font-medium">
                    {campaign.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      campaign.status === 'active' ? 'bg-green-500/10 text-green-500' :
                      campaign.status === 'draft' ? 'bg-slate-500/10 text-slate-500' :
                      'bg-orange-500/10 text-orange-500'
                    }`}>
                      {campaign.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {campaign.channel}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {campaign.enrollments_count || 0}
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
                        {campaign.status === 'draft' && (
                           <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStart(campaign.id); }}>
                             <Play className="size-4 mr-2" /> Start Campaign
                           </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditForm(campaign); }}>
                          <Pencil className="size-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(campaign.id); }}
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
            <DialogTitle>{editCampaign ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Sequence"
              />
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <select 
                className="w-full p-2 rounded-md border bg-background"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="multi">Multi-channel</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              Save Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
