-- Migration 050: Seed Admin User for wacrm Application
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_account_id UUID;
BEGIN
  -- Insert into auth.users if admin user doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@wacrm.itgyani.com') THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@wacrm.itgyani.com',
      crypt('18a5f3deb2198d569bd7d125b553c52b', gen_salt('bf')),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Admin User"}',
      'authenticated',
      'authenticated',
      NOW(),
      NOW()
    );

    -- Ensure profile exists
    INSERT INTO public.profiles (user_id, full_name, email, role)
    VALUES (v_user_id, 'Admin User', 'admin@wacrm.itgyani.com', 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- Create default account for admin user if not existing
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE owner_user_id = v_user_id) THEN
      v_account_id := uuid_generate_v4();
      INSERT INTO public.accounts (id, name, owner_user_id)
      VALUES (v_account_id, 'Admin Workspace', v_user_id);

      INSERT INTO public.account_members (account_id, user_id, role)
      VALUES (v_account_id, v_user_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
