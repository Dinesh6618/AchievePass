-- ============================================================================
-- CertiPass — username sign-in for students (no e-mail verification)
--
-- Students sign in with a USERNAME + password. Supabase Auth needs an e-mail-shaped identity, so each student's
-- login identity is derived from the username:  <username>@certipass.invalid
-- (a username may itself look like an e-mail address, e.g. dinesh.g.2024.aids@rajalakshmi.edu.in; its "@" is written
-- "+" in the login address so the result is always one valid address — usernames can never contain "+")
-- (".invalid" is a reserved TLD that can never resolve, so nothing is ever delivered and no real person's address
-- is involved). That address is internal: it is NOT stored in the profile and is never shown in the app.
-- Faculty and admins keep signing in with their real e-mail address.
--
-- Safe to run on a project that already has migrations 1–5 (existing rows are kept and backfilled).
-- ============================================================================

-- ---------- 1. profile columns -------------------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;
-- students no longer have a (real) e-mail on file; staff still do
alter table public.profiles alter column email drop not null;

-- ---------- 2. give every existing student a username ---------------------------------------------------------------
do $$
declare
  r         record;
  base      text;
  candidate text;
  n         integer;
begin
  for r in
    select id, register_number, email from public.profiles
    where role = 'student' and username is null
    order by created_at
  loop
    base := lower(regexp_replace(
      coalesce(r.register_number, nullif(split_part(coalesce(r.email, ''), '@', 1), ''), 'student'),
      '[^a-zA-Z0-9]+', '', 'g'));
    if length(base) < 3 then
      base := 'student' || substr(replace(r.id::text, '-', ''), 1, 6);
    end if;
    base := substr(base, 1, 26);
    candidate := base;
    n := 1;
    while exists (select 1 from public.profiles where username = candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;
    update public.profiles set username = candidate where id = r.id;
  end loop;
end
$$;

-- ---------- 3. username rules: format, required for students, unique ---------------------------------------------------
-- (drop-then-add, so running this file again — for example to pick up a changed username rule — is safe)
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$');

alter table public.profiles drop constraint if exists profiles_student_has_username;
alter table public.profiles
  add constraint profiles_student_has_username
  check (role <> 'student' or username is not null);

create unique index if not exists profiles_username_key on public.profiles (username) where username is not null;

create or replace function public.normalize_profile()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.username := nullif(lower(trim(new.username)), '');
  new.full_name := trim(new.full_name);
  new.register_number := nullif(upper(trim(new.register_number)), '');
  new.faculty_id := nullif(upper(trim(new.faculty_id)), '');
  return new;
end;
$$;

-- The username IS the login identity: the sign-in address is derived from it, so renaming a profile would silently
-- lock the student out. Nobody can change it through the API (not even admins); only the service role / SQL editor.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.username is distinct from old.username then
      raise exception 'A username can not be changed.' using errcode = '42501';
    end if;
    if not public.is_admin() and (
         new.role is distinct from old.role
         or new.email is distinct from old.email
         or new.is_active is distinct from old.is_active
         or new.register_number is distinct from old.register_number
         or new.faculty_id is distinct from old.faculty_id
         or new.department_id is distinct from old.department_id
       ) then
      raise exception 'You are not allowed to change role, email, department or identifiers.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Names that look official can't be claimed by a student. (Keep in sync with RESERVED_USERNAMES in src/lib/identity.ts.)
create or replace function public.is_reserved_username(p_username text)
returns boolean
language sql
immutable
as $$
  select lower(trim(p_username)) in (
    'admin', 'administrator', 'root', 'faculty', 'staff', 'support', 'certipass', 'system', 'moderator', 'help'
  )
$$;

-- ---------- 4. sign-up trigger ---------------------------------------------------------------------------------------
-- The role still comes only from app_metadata (service role), never from what the browser sends.
-- A student sign-up must carry a valid username AND its login address must be exactly <username>@certipass.invalid,
-- so a public sign-up can never register an arbitrary (e.g. someone else's real) e-mail address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      public.user_role := 'student';
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app       jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_open      boolean;
  v_by_admin  boolean := coalesce(v_app ->> 'provisioned', 'false') = 'true';
  v_username  text;
  -- must match INTERNAL_EMAIL_DOMAIN in src/lib/identity.ts and the admin-create-user function
  v_internal_domain constant text := 'certipass.invalid';
begin
  if (v_app ->> 'role') in ('faculty', 'admin') then
    v_role := (v_app ->> 'role')::public.user_role;
  end if;

  if v_role = 'student' then
    if not v_by_admin then
      select coalesce((value #>> '{}')::boolean, true) into v_open
        from public.app_settings where key = 'allow_student_registration';
      if v_open is false then
        raise exception 'Student registration is currently closed.';
      end if;
    end if;

    v_username := lower(trim(coalesce(v_meta ->> 'username', '')));
    if v_username !~ '^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$' then
      raise exception 'Choose a username of 3 to 100 characters: letters, numbers, dots, dashes, underscores and at most one @.';
    end if;
    if public.is_reserved_username(v_username) then
      raise exception 'That username is reserved. Please choose another.';
    end if;
    -- the "@" of an e-mail-style username is written "+" in the login address (usernames can't contain "+")
    if lower(coalesce(new.email, '')) <> replace(v_username, '@', '+') || '@' || v_internal_domain then
      raise exception 'Invalid sign-up request.';
    end if;
  end if;

  insert into public.profiles (
    id, role, username, full_name, email, register_number, faculty_id, department_id,
    year, section, designation, phone
  )
  values (
    new.id,
    v_role,
    case when v_role = 'student' then v_username end,
    coalesce(nullif(trim(v_meta ->> 'full_name'), ''), v_username, split_part(new.email, '@', 1)),
    case when v_role = 'student' then null else new.email end, -- the internal login address is never stored for students
    case when v_role = 'student' then nullif(trim(v_meta ->> 'register_number'), '') end,
    case when v_role <> 'student' then nullif(trim(v_meta ->> 'faculty_id'), '') end,
    case when v_role <> 'admin' then nullif(v_meta ->> 'department_id', '')::uuid end,
    case when v_role = 'student' then nullif(v_meta ->> 'year', '')::smallint end,
    case when v_role = 'student' then nullif(trim(v_meta ->> 'section'), '') end,
    case when v_role = 'faculty' then nullif(trim(v_meta ->> 'designation'), '') end,
    nullif(trim(v_meta ->> 'phone'), '')
  );

  return new;
end;
$$;

-- ---------- 5. availability checks (used by the registration form) -------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)))
$$;

-- back to the plain rule: every account is verified-by-construction, so any holder of the number counts
create or replace function public.register_number_available(p_register_number text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where upper(register_number) = upper(trim(p_register_number))
  )
$$;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.register_number_available(text) to anon, authenticated;

-- ---------- 6. settings: students no longer have a college e-mail to restrict -----------------------------------------
delete from public.app_settings where key = 'student_email_domain';

create or replace function public.public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.app_settings
  where key in ('institution_name', 'allow_student_registration')
$$;

grant execute on function public.public_settings() to anon, authenticated;

-- ---------- 7. staff directory view: username instead of e-mail ------------------------------------------------------
drop view if exists public.student_summaries;

create view public.student_summaries
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.username,
  p.register_number,
  p.year,
  p.section,
  p.phone,
  p.avatar_url,
  p.is_active,
  p.department_id,
  d.name as department_name,
  d.code as department_code,
  p.created_at,
  (select count(*) from public.achievements a where a.student_id = p.id and a.status <> 'draft') as total_achievements,
  (select count(*) from public.achievements a where a.student_id = p.id and a.status = 'verified') as verified_achievements,
  (select count(*) from public.achievements a where a.student_id = p.id and a.status = 'pending') as pending_achievements,
  (select count(*) from public.od_requests o where o.student_id = p.id) as total_ods,
  (select count(*) from public.od_requests o where o.student_id = p.id and o.status = 'approved') as approved_ods
from public.profiles p
left join public.departments d on d.id = p.department_id
where p.role = 'student';

revoke all on public.student_summaries from anon;
grant select on public.student_summaries to authenticated;
