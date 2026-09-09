'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { PageIntro } from '@/components/layout/page-intro';
import { CAMPAIGNS_NAV, SectionNav } from '@/components/layout/section-nav';
import { ConsentGateLegend } from '@/components/product/consent-gate-legend';
import Link from 'next/link';

export default function CampaignsPage() {
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
    setChannel('whatsapp');
    setSteps([{ delay_hours: 0, channel: 'whatsapp', body_text: '' }]);
    setFormOpen(true);
  }

  async function openEditForm(campaign: any) {
    setEditCampaign(campaign);
    setName(campaign.name || '');
    setChannel(campaign.channel || 'whatsapp');
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
      <SectionNav items={CAMPAIGNS_NAV} label="Campaigns" />
      <PageIntro
        description="Consented audience only. Compliance can refuse. Extract is not a send list. Schedule stays off when the send set is empty."
        actions={
          <GatedButton
            canAct={canEdit}
            gateReason="create campaigns"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-2" />
            New campaign
          </GatedButton>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <Send className="mx-auto size-8 text-muted-foreground" />
          <h2 className="font-heading mt-4 text-base font-semibold text-foreground">
            No campaigns
          </h2>
          <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-muted-foreground">
            AudienceGate will not send to a book that never said yes.
            Capture consent on a landing first. This is not a blast tool.
          </p>
          <GatedButton
            canAct={canEdit}
            gateReason="create campaigns"
            onClick={openAddForm}
            className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4 mr-2" />
            New campaign
          </GatedButton>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="hidden text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                  Channel
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {campaign.name}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {campaign.status || "draft"}
                  </TableCell>
                  <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">
                    {campaign.channel || "whatsapp"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {campaign.status === "draft" && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStart(campaign.id);
                            }}
                          >
                            <Play className="size-4 mr-2" /> Start
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(campaign);
                          }}
                        >
                          <Pencil className="size-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(campaign.id);
                          }}
                        >
                          <Trash2 className="size-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConsentGateLegend />

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Broadcasts
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          One-time send to a consented audience. Same gate.
        </p>
        <Link
          href="/broadcasts"
          className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Open Broadcasts
        </Link>
      </section>

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
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
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
