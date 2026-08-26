import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';
import { wwebjsMessageQueue } from '@/lib/queue/bullmq';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  // Validate cron secret if configured
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // 1. Fetch due enrollments
    const { data: enrollments, error: enrollErr } = await supabase
      .from('campaign_enrollments')
      .select('*, campaigns(*), contacts(*)')
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())
      .limit(100);

    if (enrollErr) throw enrollErr;
    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processedCount = 0;

    // Process each enrollment
    for (const enrollment of enrollments) {
      const campaign = enrollment.campaigns;
      const contact = enrollment.contacts;

      // 2. Fetch steps for this campaign
      const { data: steps, error: stepsErr } = await supabase
        .from('campaign_steps')
        .select('*, email_templates(*)')
        .eq('campaign_id', campaign.id)
        .order('position', { ascending: true });

      if (stepsErr || !steps) continue;

      // Find the current step to execute
      const currentStepObj = steps.find((s: any) => s.position === enrollment.current_step);

      if (!currentStepObj) {
        // No more steps, mark completed
        await supabase
          .from('campaign_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // 3. Execute step
      try {
        if (currentStepObj.channel === 'email') {
          const template = currentStepObj.email_templates;
          if (template && contact.email) {
            // Very simple variable replacement: replace {{name}} with contact.name
            const html = template.body_html.replace(/\{\{name\}\}/g, contact.name || '');
            
            await sendEmail(supabase, campaign.account_id, {
              to: contact.email,
              subject: template.subject,
              html: html
            });
          }
        } else if (currentStepObj.channel === 'whatsapp') {
          if (contact.phone) {
             // Add to whatsapp queue
             await wwebjsMessageQueue.add('send-campaign-msg', {
               accountId: campaign.account_id,
               action: 'sendText',
               payload: {
                 to: contact.phone,
                 body: currentStepObj.whatsapp_template_name || 'Hello from campaign'
               }
             });
          }
        }

        // Record event
        await supabase.from('campaign_events').insert({
          enrollment_id: enrollment.id,
          step_id: currentStepObj.id,
          event_type: 'sent'
        });

        // 4. Update enrollment for next step
        const nextStepPosition = currentStepObj.position + 1;
        const nextDate = new Date();
        nextDate.setHours(nextDate.getHours() + (currentStepObj.delay_hours || 24));

        await supabase
          .from('campaign_enrollments')
          .update({
            current_step: nextStepPosition,
            next_send_at: nextDate.toISOString()
          })
          .eq('id', enrollment.id);
          
        processedCount++;

      } catch (stepErr) {
        console.error(`Failed to execute step ${currentStepObj.id} for enrollment ${enrollment.id}`, stepErr);
        // Log failure event
        await supabase.from('campaign_events').insert({
          enrollment_id: enrollment.id,
          step_id: currentStepObj.id,
          event_type: 'failed',
          metadata: { error: stepErr instanceof Error ? stepErr.message : 'Unknown error' }
        });
      }
    }

    return NextResponse.json({ processed: processedCount });
  } catch (err) {
    console.error('Campaign cron error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
