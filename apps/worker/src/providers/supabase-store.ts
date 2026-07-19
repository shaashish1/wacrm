import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export class SupabaseAuthStore {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }

  async sessionExists(options: { session: string }): Promise<boolean> {
    const { data } = await this.supabase
      .from('sessions')
      .select('id')
      .eq('account_id', options.session)
      .not('session_data', 'is', null)
      .maybeSingle();

    return !!data;
  }

  async save(options: { session: string }): Promise<void> {
    const zipPath = `${options.session}.zip`;
    if (!fs.existsSync(zipPath)) {
        return;
    }
    
    const zipData = fs.readFileSync(zipPath).toString('base64');
    await this.supabase
      .from('sessions')
      .update({ session_data: zipData })
      .eq('account_id', options.session);
      
    // Clean up local zip
    try {
        fs.unlinkSync(zipPath);
    } catch (err) {
        console.error('Failed to unlink zip', err);
    }
  }

  async extract(options: { session: string; path: string }): Promise<void> {
    const { data } = await this.supabase
      .from('sessions')
      .select('session_data')
      .eq('account_id', options.session)
      .maybeSingle();

    if (data && data.session_data) {
      const buffer = Buffer.from(data.session_data, 'base64');
      fs.writeFileSync(options.path, buffer);
    }
  }

  async delete(options: { session: string }): Promise<void> {
    await this.supabase
      .from('sessions')
      .update({ session_data: null })
      .eq('account_id', options.session);
  }
}
