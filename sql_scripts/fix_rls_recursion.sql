-- RUN THIS IN THE SUPABASE SQL EDITOR TO FIX "infinite recursion detected"

-- 1. Remove the problematic recursive policy
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- 2. Create healthy, non-recursive policies
-- We split 'FOR ALL' into specific actions. 
-- For SELECT, we rely on the existing "Public profiles are viewable by everyone" policy.

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
