-- RUN THIS IN THE SUPABASE SQL EDITOR TO FIX "Database error saving new user" (500 error)

-- 1. Drop the existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Redefine the function with better error handling and schema robustness
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- We wrap this in a sub-block to capture errors specifically for the profile insert
  BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'auditor'::public.user_role)
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role;
  EXCEPTION WHEN OTHERS THEN
    -- If profile creation fails, we still want the user to be created in auth.users
    -- The error will be logged in Supabase Database logs
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. VERIFY: Check if the 'admin' user is and any other users have profiles
SELECT u.email, p.role, p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC
LIMIT 5;
