import nodemailer from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  supabase: SupabaseClient,
  accountId: string,
  payload: EmailPayload,
) {
  const { data: config, error } = await supabase
    .from('email_configs')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error || !config) {
    throw new Error('Email configuration not found or inactive');
  }

  if (!config.is_active) {
    throw new Error('Email configuration is inactive');
  }

  let host = config.smtp_host;
  let port = config.smtp_port;
  let user = config.smtp_user;
  
  const pass = config.smtp_pass_encrypted ? decrypt(config.smtp_pass_encrypted) : null;
  const apiKey = config.api_key_encrypted ? decrypt(config.api_key_encrypted) : null;
  let authPass = pass;

  if (config.provider === 'resend') {
    host = 'smtp.resend.com';
    port = 465;
    user = 'resend';
    authPass = apiKey || pass;
  } else if (config.provider === 'sendgrid') {
    host = 'smtp.sendgrid.net';
    port = 587;
    user = 'apikey';
    authPass = apiKey || pass;
  }

  if (!host || !user || !authPass) {
    throw new Error(`Incomplete SMTP credentials for provider ${config.provider}`);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: authPass,
    },
  });

  const from = config.from_name 
    ? `"${config.from_name}" <${config.from_email}>`
    : config.from_email;

  const info = await transporter.sendMail({
    from,
    to: payload.to,
    replyTo: config.reply_to || undefined,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  return info;
}
