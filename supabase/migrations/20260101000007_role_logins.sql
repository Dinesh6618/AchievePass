-- ============================================================================
-- CertiPass — username sign-in for ALL three roles (student, faculty, admin)
--
-- Migration 6 gave students a username. This extends the same model to faculty and admins so every role signs in
-- with Username + Password and there is no e-mail anywhere in the sign-in flow:
--   * every profile has a username (required, unique, immutable);
--   * every NEW account's login identity is <username>@certipass.invalid (an "@" in the username is written "+");
--   * a public sign-up can only ever create a student — faculty come from an administrator (edge function) and the
--     first administrator from `npm run create-admin`; the role is read only from app_metadata (service role).
--
-- Safe to run on a project that already has migrations 1–6, and safe to run again.
-- ============================================================================

-- ---------- 1. give every existing faculty / admin a username -----------------------------------------------------------
-- (their *login* is converted separately by `npm run convert-staff`; nothing here touches auth.users)
do $$
declare
  r         record;
  base      text;
  candidate text;
  n         integer;
begin
  for r in
    select id, role, email, faculty_id from public.profiles
    where username is null
    order by created_at
  loop
    base := lower(regexp_replace(
      coalesce(nullif(split_part(coalesce(r.email, ''), '@', 1), ''), r.faculty_id, r.role::text),
      '[^a-zA-Z0-9]+', '.', 'g'));
    base := trim(both '.' from base);
    if length(base) < 3 then
      base := r.role::text || substr(replace(r.id::text, '-', ''), 1, 6);
    end if;
    base := substr(base, 1, 26);
    base := trim(both '.' from base);
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

-- ---------- 2. a username is now required for every role ----------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_student_has_username;
alter table public.profiles drop constraint if exists profiles_has_username;
alter table public.profiles
  add constraint profiles_has_username
  check (username is not null);

-- ---------- 3. sign-up trigger: one rule for every role ------------------------------------------------------------------
-- The role still comes only from app_metadata (service role), never from what the browser sends. Whatever the role:
--   * a valid username is required, and the login address must be exactly <username>@certipass.invalid, so nobody
--     can register a real e-mail address;
--   * the profile never stores that internal address.
-- Public sign-ups are always students and are subject to the "registration closed" switch.
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

  v_username := lower(trim(coalesce(v_meta ->> 'username', '')));
  if v_username !~ '^(?=.{3,100}$)(?!.*\.\.)[a-z0-9]([a-z0-9._-]*[a-z0-9])?(@[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$' then
    raise exception 'Choose a username of 3 to 100 characters: letters, numbers, dots, dashes, underscores and at most one @.';
  end if;
  -- the "@" of an e-mail-style username is written "+" in the login address (usernames can't contain "+")
  if lower(coalesce(new.email, '')) <> replace(v_username, '@', '+') || '@' || v_internal_domain then
    raise exception 'Invalid sign-up request.';
  end if;

  if v_role = 'student' then
    if not v_by_admin then
      select coalesce((value #>> '{}')::boolean, true) into v_open
        from public.app_settings where key = 'allow_student_registration';
      if v_open is false then
        raise exception 'Student registration is currently closed.';
      end if;
    end if;
  end if;

  -- official-looking names are for the first administrator only (created by `npm run create-admin`)
  if v_role <> 'admin' and public.is_reserved_username(v_username) then
    raise exception 'That username is reserved. Please choose another.';
  end if;

  insert into public.profiles (
    id, role, username, full_name, email, register_number, faculty_id, department_id,
    year, section, designation, phone
  )
  values (
    new.id,
    v_role,
    v_username,
    coalesce(nullif(trim(v_meta ->> 'full_name'), ''), v_username),
    null, -- the internal login address is never stored
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
