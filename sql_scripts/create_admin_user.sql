-- 1. Enable pgcrypto (required for password hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Insert the admin user into auth.users
-- Email: adminopk@mail.com | Password: blender3D
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
)
SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'adminopk@mail.com',
    crypt('blender3D', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin User", "role":"admin"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'adminopk@mail.com'
);

-- 3. Ensure the profile exists in public.profiles
-- (The trigger in create_profiles_table.sql should handle this, but this is a safety net)
INSERT INTO public.profiles (id, full_name, role)
SELECT id, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'adminopk@mail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin User';
