-- ============================================================================
-- CertiPass — core schema
-- Tables, constraints, indexes and integrity triggers. Row Level Security is
-- defined in 20260101000002_rls.sql, RPCs in 20260101000003_functions.sql.
-- ============================================================================

-- ---------- enums ------------------------------------------------------------
create type public.user_role as enum ('student', 'faculty', 'admin');

create type public.achievement_status as enum (
  'draft',              -- saved by the student, not yet submitted
  'pending',            -- "Pending Verification"
  'verified',
  'rejected',
  'changes_requested'   -- faculty asked the student for corrections
);

create type public.od_status as enum ('pending', 'approved', 'rejected', 'more_info');

-- ---------- shared helpers ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- departments ------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (char_length(trim(code)) between 1 and 12),
  name       text not null unique check (char_length(trim(name)) between 2 and 120),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- event categories -------------------------------------------------
create table public.event_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null unique check (char_length(trim(name)) between 2 and 60),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- profiles (one row per auth user) ---------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.user_role not null default 'student',
  full_name       text not null check (char_length(trim(full_name)) between 2 and 120),
  email           text not null,
  register_number text,
  faculty_id      text,
  department_id   uuid references public.departments (id) on delete restrict,
  year            smallint check (year between 1 and 6),
  section         text check (section is null or char_length(section) <= 10),
  designation     text,
  phone           text check (phone is null or phone ~ '^[0-9+()\- ]{7,20}$'),
  avatar_url      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_student_has_register_number
    check (role <> 'student' or register_number is not null)
);

create unique index profiles_register_number_key on public.profiles (upper(register_number))
  where register_number is not null;
create unique index profiles_faculty_id_key on public.profiles (upper(faculty_id))
  where faculty_id is not null;
create index profiles_role_department_idx on public.profiles (role, department_id);
create index profiles_full_name_idx on public.profiles (lower(full_name));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Normalise identifiers so lookups and uniqueness are case-insensitive.
create or replace function public.normalize_profile()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.full_name := trim(new.full_name);
  new.register_number := nullif(upper(trim(new.register_number)), '');
  new.faculty_id := nullif(upper(trim(new.faculty_id)), '');
  return new;
end;
$$;

create trigger profiles_normalize
  before insert or update on public.profiles
  for each row execute function public.normalize_profile();

-- ---------- app settings -----------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------- achievements -----------------------------------------------------
create table public.achievements (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  category_id    uuid not null references public.event_categories (id) on delete restrict,
  event_name     text not null check (char_length(trim(event_name)) between 2 and 200),
  organization   text check (organization is null or char_length(organization) <= 200),
  start_date     date not null,
  end_date       date,
  result         text check (result is null or char_length(result) <= 200),
  description    text check (description is null or char_length(description) <= 2000),
  status         public.achievement_status not null default 'draft',
  submitted_at   timestamptz,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  review_comment text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint achievements_dates_ordered check (end_date is null or end_date >= start_date),
  -- Lets child tables prove they belong to the same student as the achievement.
  constraint achievements_id_student_key unique (id, student_id)
);

create index achievements_student_idx on public.achievements (student_id, start_date desc);
create index achievements_status_idx on public.achievements (status, submitted_at);
create index achievements_category_idx on public.achievements (category_id);
create index achievements_start_date_idx on public.achievements (start_date);

create trigger achievements_set_updated_at
  before update on public.achievements
  for each row execute function public.set_updated_at();

-- ---------- certificates -----------------------------------------------------
create table public.certificates (
  id             uuid primary key default gen_random_uuid(),
  achievement_id uuid not null,
  student_id     uuid not null,
  storage_path   text not null unique,
  file_name      text not null check (char_length(file_name) <= 255),
  mime_type      text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  file_hash      text,
  ocr_data       jsonb,
  created_at     timestamptz not null default now(),
  -- exactly one certificate per achievement; owner must match the achievement's owner
  constraint certificates_one_per_achievement unique (achievement_id),
  constraint certificates_achievement_fkey foreign key (achievement_id, student_id)
    references public.achievements (id, student_id) on delete cascade
);

create index certificates_student_hash_idx on public.certificates (student_id, file_hash);

-- ---------- OD requests ------------------------------------------------------
create table public.od_requests (
  id                       uuid primary key default gen_random_uuid(),
  student_id               uuid not null,
  achievement_id           uuid not null,
  category_id              uuid not null references public.event_categories (id) on delete restrict,
  event_name               text not null check (char_length(trim(event_name)) between 2 and 200),
  organization             text check (organization is null or char_length(organization) <= 200),
  event_date               date not null,
  event_end_date           date,
  start_time               time,
  end_time                 time,
  venue                    text not null check (char_length(trim(venue)) between 2 and 200),
  reason                   text not null check (char_length(trim(reason)) between 10 and 1500),
  additional_document_path text,
  additional_document_name text,
  status                   public.od_status not null default 'pending',
  reviewed_by              uuid references public.profiles (id) on delete set null,
  reviewed_at              timestamptz,
  review_comment           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint od_requests_one_per_achievement unique (achievement_id),
  constraint od_requests_dates_ordered check (event_end_date is null or event_end_date >= event_date),
  constraint od_requests_times_ordered check (
    start_time is null or end_time is null or end_time > start_time
  ),
  constraint od_requests_achievement_fkey foreign key (achievement_id, student_id)
    references public.achievements (id, student_id) on delete restrict
);

create index od_requests_student_idx on public.od_requests (student_id, event_date desc);
create index od_requests_status_idx on public.od_requests (status, created_at);

create trigger od_requests_set_updated_at
  before update on public.od_requests
  for each row execute function public.set_updated_at();

-- ---------- verification records --------------------------------------------
create table public.verification_records (
  id                uuid primary key default gen_random_uuid(),
  achievement_id    uuid not null unique references public.achievements (id) on delete cascade,
  verification_code text not null unique,
  verified_by       uuid references public.profiles (id) on delete set null,
  verified_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ---------- notifications ----------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------- audit logs -------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ============================================================================
-- Role helpers (SECURITY DEFINER so RLS policies can use them without
-- recursing into the profiles policies).
-- ============================================================================
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.auth_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

-- True when the caller is an active faculty member in the same department as the student.
create or replace function public.is_faculty_of_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles s on s.department_id = me.department_id
    where me.id = auth.uid()
      and me.role = 'faculty'
      and me.is_active
      and s.id = p_student
      and s.role = 'student'
  )
$$;

-- ============================================================================
-- Signup: create the profile row. The role is NEVER read from
-- raw_user_meta_data (which the client controls); only raw_app_meta_data,
-- which can be set only with the service role (admin-create-user function).
-- ============================================================================
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
  v_domain    text;
  v_open      boolean;
  v_by_admin  boolean := coalesce(v_app ->> 'provisioned', 'false') = 'true';
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

    select nullif(trim(value #>> '{}'), '') into v_domain
      from public.app_settings where key = 'student_email_domain';
    if v_domain is not null and lower(new.email) not like '%@' || lower(v_domain) then
      raise exception 'Please register with your college email address (@%).', v_domain;
    end if;
  end if;

  insert into public.profiles (
    id, role, full_name, email, register_number, faculty_id, department_id,
    year, section, designation, phone
  )
  values (
    new.id,
    v_role,
    coalesce(nullif(trim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Integrity triggers
-- ============================================================================

-- Users may only edit the "soft" parts of their own profile. Identity,
-- role and department are managed by admins. (auth.uid() is null for the
-- service role / SQL editor, which stays unrestricted.)
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.is_active is distinct from old.is_active
       or new.register_number is distinct from old.register_number
       or new.faculty_id is distinct from old.faculty_id
       or new.department_id is distinct from old.department_id then
      raise exception 'You are not allowed to change role, email, department or identifiers.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Achievements: students can not forge review data, and a submission needs a certificate.
create or replace function public.guard_achievement_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.auth_role() = 'student' then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
  end if;

  if new.status = 'pending' and old.status is distinct from 'pending' then
    if not exists (select 1 from public.certificates c where c.achievement_id = new.id) then
      raise exception 'Upload a certificate before submitting this achievement.'
        using errcode = 'P0001';
    end if;
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

create trigger achievements_guard_update
  before update on public.achievements
  for each row execute function public.guard_achievement_update();

-- OD requests: students can not forge review data; OD needs a submitted achievement.
create or replace function public.guard_od_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.achievement_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.achievements where id = new.achievement_id;
    if v_status is null or v_status not in ('pending', 'verified') then
      raise exception 'Submit the achievement for verification before creating an OD request.'
        using errcode = 'P0001';
    end if;
  elsif auth.uid() is not null and public.auth_role() = 'student' then
    new.student_id := old.student_id;
    new.achievement_id := old.achievement_id;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
  end if;
  return new;
end;
$$;

create trigger od_requests_guard
  before insert or update on public.od_requests
  for each row execute function public.guard_od_request();

-- ============================================================================
-- Notifications (written by triggers so every code path produces them)
-- ============================================================================
create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_message text, p_link text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, link)
  values (p_user, p_type, p_title, p_message, p_link)
$$;

revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_department_faculty(
  p_student uuid, p_type text, p_title text, p_message text, p_link text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, link)
  select f.id, p_type, p_title, p_message, p_link
  from public.profiles s
  join public.profiles f on f.department_id = s.department_id
  where s.id = p_student and f.role = 'faculty' and f.is_active
$$;

revoke all on function public.notify_department_faculty(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.on_achievement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select full_name into v_student from public.profiles where id = new.student_id;

  if new.status = 'pending' then
    perform public.notify(new.student_id, 'achievement_submitted', 'Achievement submitted',
      new.event_name || ' is now pending verification.', '/student/achievements/' || new.id);
    perform public.notify_department_faculty(new.student_id, 'review_requested',
      'New certificate to verify',
      v_student || ' submitted "' || new.event_name || '".', '/faculty/review/' || new.id);
  elsif new.status = 'verified' then
    perform public.notify(new.student_id, 'achievement_verified', 'Certificate verified',
      new.event_name || ' has been verified. Your QR record is ready.',
      '/student/achievements/' || new.id);
  elsif new.status = 'rejected' then
    perform public.notify(new.student_id, 'achievement_rejected', 'Certificate rejected',
      coalesce(new.review_comment, 'Your submission for ' || new.event_name || ' was rejected.'),
      '/student/achievements/' || new.id);
  elsif new.status = 'changes_requested' then
    perform public.notify(new.student_id, 'achievement_changes_requested', 'Changes requested',
      coalesce(new.review_comment, 'Faculty asked for more information on ' || new.event_name || '.'),
      '/student/achievements/' || new.id);
  end if;

  return new;
end;
$$;

create trigger achievements_notify
  after update on public.achievements
  for each row execute function public.on_achievement_status_change();

create or replace function public.on_od_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
begin
  select full_name into v_student from public.profiles where id = new.student_id;

  if tg_op = 'INSERT' then
    perform public.notify(new.student_id, 'od_submitted', 'OD request submitted',
      'Your OD request for ' || new.event_name || ' was submitted for approval.',
      '/student/od/' || new.id);
    perform public.notify_department_faculty(new.student_id, 'review_requested',
      'New OD request', v_student || ' requested OD for "' || new.event_name || '".',
      '/faculty/od/' || new.id);
  elsif new.status is distinct from old.status then
    if new.status = 'pending' then
      perform public.notify_department_faculty(new.student_id, 'review_requested',
        'OD request updated', v_student || ' updated the OD request for "' || new.event_name || '".',
        '/faculty/od/' || new.id);
    elsif new.status = 'approved' then
      perform public.notify(new.student_id, 'od_approved', 'OD approved',
        'Your OD request for ' || new.event_name || ' was approved.', '/student/od/' || new.id);
    elsif new.status = 'rejected' then
      perform public.notify(new.student_id, 'od_rejected', 'OD rejected',
        coalesce(new.review_comment, 'Your OD request for ' || new.event_name || ' was rejected.'),
        '/student/od/' || new.id);
    elsif new.status = 'more_info' then
      perform public.notify(new.student_id, 'od_more_info', 'More information required',
        coalesce(new.review_comment, 'Faculty needs more information about your OD request.'),
        '/student/od/' || new.id);
    end if;
  end if;

  return new;
end;
$$;

create trigger od_requests_notify
  after insert or update on public.od_requests
  for each row execute function public.on_od_change();

-- ============================================================================
-- Audit log (status transitions for workflow tables, every change for admin data)
-- ============================================================================
create or replace function public.audit_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (v_new ->> 'status') = (v_old ->> 'status') then
    return null;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id')::uuid,
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_old ->> 'status',
      'to', v_new ->> 'status',
      'event', coalesce(v_new, v_old) ->> 'event_name',
      'comment', v_new ->> 'review_comment'
    ))
  );
  return null;
end;
$$;

create trigger achievements_audit
  after insert or update or delete on public.achievements
  for each row execute function public.audit_workflow_change();

create trigger od_requests_audit
  after insert or update or delete on public.od_requests
  for each row execute function public.audit_workflow_change();

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  -- Profile edits by the user themselves are noise; only log changes made by someone else.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' and auth.uid() = (v_row ->> 'id')::uuid then
    return null;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    jsonb_strip_nulls(jsonb_build_object(
      'name', coalesce(v_row ->> 'name', v_row ->> 'full_name', v_row ->> 'key'),
      'role', v_row ->> 'role'
    ))
  );
  return null;
end;
$$;

create trigger departments_audit
  after insert or update or delete on public.departments
  for each row execute function public.audit_admin_change();

create trigger event_categories_audit
  after insert or update or delete on public.event_categories
  for each row execute function public.audit_admin_change();

create trigger app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_admin_change();

create trigger profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_admin_change();
