-- ============================================================================
-- CertiPass — make the FIRST administrator (no secret keys, no terminal)
--
-- Nobody can sign up as an administrator, and the admin screens can't create one either — that is on purpose. The first
-- admin is set up once, by whoever owns the Supabase project, and this SQL Editor is the place only that person can reach.
--
--   1. Open your CertiPass site and register a normal account at /register with the username you want for the
--      administrator (for example  college.admin ).  Use a fresh account — not your own student account.
--   2. Put that exact username on the line marked  EDIT  below.
--   3. Paste this whole script into  Supabase dashboard → SQL Editor → New query  and click Run.
--   4. Sign in at /login/admin with that username and the password you registered with.
--
-- From then on the administrator adds faculty from  Admin → Faculty Management  — nobody needs the SQL Editor again.
-- It refuses to touch an account that already has achievements or OD requests (so a student's records are never
-- orphaned) and does nothing to an unknown username. Safe to run more than once.
-- ============================================================================

do $$
declare
  v_username constant text := 'college.admin';   -- <<< EDIT: the username you just registered
  v_id       uuid;
begin
  select id into v_id from public.profiles where username = lower(trim(v_username));

  if v_id is null then
    raise exception 'There is no account with the username "%". Register it first at /register, then run this again.', v_username;
  end if;

  if exists (select 1 from public.achievements where student_id = v_id)
     or exists (select 1 from public.od_requests where student_id = v_id) then
    raise exception 'The account "%" already has achievements or OD requests. Register a fresh account for the administrator instead.', v_username;
  end if;

  -- (this runs with the SQL Editor's own privileges; nobody signed in to the app can change a role)
  update public.profiles
     set role            = 'admin',
         register_number = null,
         year            = null,
         section         = null,
         department_id   = null,
         faculty_id      = null,
         designation     = null,
         is_active       = true
   where id = v_id;

  raise notice '"%" is now an administrator. Sign in at /login/admin.', v_username;
end
$$;
