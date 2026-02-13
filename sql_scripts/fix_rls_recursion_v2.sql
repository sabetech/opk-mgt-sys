-- RUN THIS IN THE SUPABASE SQL EDITOR TO FIX "infinite recursion detected"

-- 1. Drop ALL existing policies on the profiles table to start fresh
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

-- 2. Create new, non-recursive policies
-- We use auth.jwt() to check roles from the user's metadata instead of querying the table itself.

-- 2.1 Allow users to view all profiles (needed for various lookups)
CREATE POLICY "Profiles are viewable by authenticated users" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- 2.2 Allow users to update their own profile
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- 2.3 Allow Admins to manage everything (Insert, Update, Delete)
-- This uses the user_metadata we set during account creation
CREATE POLICY "Admins can manage all profiles" 
ON public.profiles FOR ALL 
TO authenticated 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 3. FINAL REPAIR: Ensure the profile record actually exists for your admin user
INSERT INTO public.profiles (id, full_name, role)
SELECT id, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'adminopk@mail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin User';

-- 4. VERIFY: Should return 1 row with email and 'admin' role
SELECT u.email, p.role as profile_role
FROM auth.users u
JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'adminopk@mail.com';
