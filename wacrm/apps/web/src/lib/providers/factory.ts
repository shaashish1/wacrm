import { IMessagingProvider, ProviderType } from '@wacrm/shared';
import { CloudAPIProvider } from './cloud-api-provider';
import { WWebJSWebProvider } from './wwebjs-web-provider';
import { supabaseAdmin } from '../flows/admin-client';

export async function providerFactory(accountId: string): Promise<IMessagingProvider> {
  const { data, error } = await supabaseAdmin()
    .from('accounts') // Or whichever table stores provider_type
    .select('provider_type')
    .eq('id', accountId)
    .single();

  const providerType: ProviderType = data?.provider_type || 'cloud_api';

  if (providerType === 'cloud_api') {
    return new CloudAPIProvider();
  } else if (providerType === 'wwebjs') {
    return new WWebJSWebProvider();
  }

  throw new Error(`Unsupported provider type: ${providerType}`);
}
