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
  const [steps, setSteps] = useState<
    { delay_hours: number; channel: string; body_text: string }[]
  >([]);

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
    setSteps([{ delay_hours: 0, channel: 'whatsapp', body_text: '' }]);
    setFormOpen(true);
  }

  async function openEditForm(campaign: any) {
    setEditCampaign(campaign);
    setName(campaign.name || '');
    setChannel(campaign.channel || 'email');
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`);
      const json = await res.json();
      const loaded = (json.data?.campaign_steps ?? []) as any[];
      setSteps(
        loaded.length > 0
          ? loaded.map((s) => ({
              delay_hours: s.delay_hours ?? 0,
              channel: s.channel || 'whatsapp',
              body_text: s.whatsapp_template_name || '',
            }))
          : [{ delay_hours: 0, channel: 'whatsapp', body_text: '' }],
      );
    } catch {
      setSteps([{ delay_hours: 0, channel: 'whatsapp', body_text: '' }]);
    }
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
        body: JSON.stringify({
          name,
          channel,
          steps: steps.map((s, i) => ({
            position: i + 1,
            channel: s.channel,
            delay_hours: s.delay_hours,
            whatsapp_template_name: s.body_text,
          })),
        })
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSteps((prev) => [
                      ...prev,
                      { delay_hours: 24, channel: 'whatsapp', body_text: '' },
                    ])
                  }
                >
                  Add step
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each step waits delay hours, then sends the WhatsApp text (or email template id). Recurring campaigns are not implemented.
              </p>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {steps.map((step, idx) => (
                  <div key={idx} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Step {idx + 1}</span>
                      {steps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Delay (hours)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={step.delay_hours}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, delay_hours: Number(e.target.value) || 0 } : s,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Channel</Label>
                        <select
                          className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                          value={step.channel}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, channel: e.target.value } : s,
                              ),
                            )
                          }
                        >
                          <option value="whatsapp">WhatsApp text</option>
                          <option value="email">Email</option>
                        </select>
                      </div>
                    </div>
                    {step.channel === 'whatsapp' && (
                      <div>
                        <Label className="text-xs">Message text</Label>
                        <Input
                          value={step.body_text}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, body_text: e.target.value } : s,
                              ),
                            )
                          }
                          placeholder="Hi {{name}}, …"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
