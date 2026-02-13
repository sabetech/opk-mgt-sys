-- FINAL DIAGNOSTIC AND FIX FOR "Profile not found"

-- 1. Check if the user exists in auth.users and get their ID
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'adminopk@mail.com';

-- 2. Check if the 'admin' role is currently in your enum
-- (This is just for your info, you don't need to change anything here)
SELECT enum_range(NULL::user_role);

-- 3. FORCE INSERT the profile (using the exact email to find the ID)
INSERT INTO public.profiles (id, full_name, role)
SELECT id, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'adminopk@mail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin User';

-- 4. FINAL VERIFICATION: Both tables should have a matching record
SELECT u.id, u.email, p.role as profile_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'adminopk@mail.com';
