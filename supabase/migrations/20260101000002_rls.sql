-- ============================================================================
-- CertiPass — Row Level Security
--   student  → only their own records
--   faculty  → submitted records of students in their own department (read-only;
--              decisions go through the SECURITY DEFINER RPCs in the next migration)
--   admin    → everything
-- ============================================================================

alter table public.departments          enable row level security;
alter table public.event_categories     enable row level security;
alter table public.profiles             enable row level security;
alter table public.app_settings         enable row level security;
alter table public.achievements         enable row level security;
alter table public.certificates         enable row level security;
alter table public.od_requests          enable row level security;
alter table public.verification_records enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;

-- Defence in depth: anonymous visitors get nothing except what is granted below.
revoke all on all tables in schema public from anon;
grant select on public.departments to anon;

-- ---------- departments ------------------------------------------------------
create policy departments_read on public.departments
  for select to anon, authenticated
  using (is_active or public.is_admin());

create policy departments_admin_write on public.departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- event categories -------------------------------------------------
create policy categories_read on public.event_categories
  for select to authenticated
  using (is_active or public.is_admin());

create policy categories_admin_write on public.event_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- profiles ---------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      role = 'student'
      and public.auth_role() = 'faculty'
      and department_id is not distinct from public.auth_department()
    )
  );

-- Sensitive columns are additionally locked by the profiles_protect trigger.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Rows are created by the signup trigger; accounts are deactivated (is_active), not deleted.

-- ---------- app settings -----------------------------------------------------
create policy settings_admin_read on public.app_settings
  for select to authenticated
  using (public.is_admin());

create policy settings_admin_write on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- achievements -----------------------------------------------------
create policy achievements_select on public.achievements
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or (status <> 'draft' and public.is_faculty_of_student(student_id))
  );

create policy achievements_student_insert on public.achievements
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.auth_role() = 'student'
    and status = 'draft'
  );

-- Pending items are locked while faculty review them; verified items are immutable.
create policy achievements_student_update on public.achievements
  for update to authenticated
  using (
    student_id = auth.uid()
    and public.auth_role() = 'student'
    and status in ('draft', 'changes_requested', 'rejected')
  )
  with check (
    student_id = auth.uid()
    -- never 'verified': only the review RPCs can certify a record
    and status in ('draft', 'pending', 'changes_requested', 'rejected')
  );

create policy achievements_student_delete on public.achievements
  for delete to authenticated
  using (
    student_id = auth.uid()
    and status in ('draft', 'changes_requested', 'rejected')
  );

create policy achievements_admin_delete on public.achievements
  for delete to authenticated
  using (public.is_admin());

-- ---------- certificates -----------------------------------------------------
create or replace function public.achievement_is_editable(p_achievement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.achievements a
    where a.id = p_achievement
      and a.student_id = auth.uid()
      and a.status in ('draft', 'changes_requested', 'rejected')
  )
$$;

create policy certificates_select on public.certificates
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or (
      public.is_faculty_of_student(student_id)
      and exists (
        select 1 from public.achievements a
        where a.id = achievement_id and a.status <> 'draft'
      )
    )
  );

create policy certificates_student_insert on public.certificates
  for insert to authenticated
  with check (student_id = auth.uid() and public.achievement_is_editable(achievement_id));

create policy certificates_student_update on public.certificates
  for update to authenticated
  using (student_id = auth.uid() and public.achievement_is_editable(achievement_id))
  with check (student_id = auth.uid() and public.achievement_is_editable(achievement_id));

create policy certificates_student_delete on public.certificates
  for delete to authenticated
  using (student_id = auth.uid() and public.achievement_is_editable(achievement_id));

-- ---------- OD requests ------------------------------------------------------
create policy od_select on public.od_requests
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.is_faculty_of_student(student_id)
  );

create policy od_student_insert on public.od_requests
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.auth_role() = 'student'
    and status = 'pending'
  );

-- Students can only edit a request after faculty asked for more information.
create policy od_student_update on public.od_requests
  for update to authenticated
  using (student_id = auth.uid() and status = 'more_info')
  with check (student_id = auth.uid() and status in ('more_info', 'pending'));

create policy od_student_delete on public.od_requests
  for delete to authenticated
  using (student_id = auth.uid() and status in ('pending', 'more_info'));

create policy od_admin_delete on public.od_requests
  for delete to authenticated
  using (public.is_admin());

-- ---------- verification records ---------------------------------------------
-- Visibility follows the achievement (the sub-select is itself filtered by RLS).
create policy verification_select on public.verification_records
  for select to authenticated
  using (exists (select 1 from public.achievements a where a.id = achievement_id));

-- ---------- notifications ----------------------------------------------------
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Users may only flip the read flag; everything else is written by triggers.
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ---------- audit logs -------------------------------------------------------
create policy audit_admin_read on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- ============================================================================
-- Reporting views — security_invoker means the caller's RLS applies, so
-- faculty only ever see their department.
-- ============================================================================
create or replace view public.achievement_details
with (security_invoker = true) as
select
  a.id,
  a.student_id,
  a.category_id,
  a.event_name,
  a.organization,
  a.start_date,
  a.end_date,
  a.result,
  a.description,
  a.status,
  a.submitted_at,
  a.reviewed_at,
  a.review_comment,
  a.created_at,
  s.full_name       as student_name,
  s.register_number as register_number,
  s.year            as student_year,
  s.section         as student_section,
  s.department_id   as department_id,
  d.name            as department_name,
  d.code            as department_code,
  c.name            as category_name,
  c.slug            as category_slug,
  v.verification_code,
  v.verified_at,
  (select od.status from public.od_requests od where od.achievement_id = a.id) as od_status
from public.achievements a
join public.profiles s on s.id = a.student_id
left join public.departments d on d.id = s.department_id
join public.event_categories c on c.id = a.category_id
left join public.verification_records v on v.achievement_id = a.id;

create or replace view public.od_details
with (security_invoker = true) as
select
  o.id,
  o.student_id,
  o.achievement_id,
  o.category_id,
  o.event_name,
  o.organization,
  o.event_date,
  o.event_end_date,
  o.start_time,
  o.end_time,
  o.venue,
  o.reason,
  o.additional_document_path,
  o.additional_document_name,
  o.status,
  o.reviewed_at,
  o.review_comment,
  o.created_at,
  o.updated_at,
  s.full_name       as student_name,
  s.register_number as register_number,
  s.year            as student_year,
  s.department_id   as department_id,
  d.name            as department_name,
  c.name            as category_name,
  a.status          as achievement_status
from public.od_requests o
join public.profiles s on s.id = o.student_id
left join public.departments d on d.id = s.department_id
join public.event_categories c on c.id = o.category_id
join public.achievements a on a.id = o.achievement_id;

-- One row per student with participation counts, for the faculty / admin directories.
create or replace view public.student_summaries
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.email,
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

grant select on public.achievement_details, public.od_details, public.student_summaries to authenticated;

-- ============================================================================
-- Storage
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('certificates', 'certificates', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- A stored file is "locked" while it backs a submitted record, so students
-- can not delete or swap evidence that faculty are reviewing or have verified.
create or replace function public.storage_object_locked(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.certificates c
    join public.achievements a on a.id = c.achievement_id
    where c.storage_path = p_path and a.status in ('pending', 'verified')
  ) or exists (
    select 1 from public.od_requests o
    where o.additional_document_path = p_path and o.status in ('pending', 'approved')
  )
$$;

-- Faculty may read files that belong to a submitted (non-draft) record of a student in their department.
create or replace function public.faculty_can_read_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.certificates c
    join public.achievements a on a.id = c.achievement_id
    where c.storage_path = p_path
      and a.status <> 'draft'
      and public.is_faculty_of_student(c.student_id)
  ) or exists (
    select 1 from public.od_requests o
    where o.additional_document_path = p_path
      and public.is_faculty_of_student(o.student_id)
  )
$$;

create policy certificates_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.auth_role() = 'student'
  );

create policy certificates_files_student_read on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy certificates_files_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificates'
    and (public.is_admin() or public.faculty_can_read_object(name))
  );

create policy certificates_files_student_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.storage_object_locked(name)
  );

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Realtime: live notification badge
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
