-- ============================================================================
-- CertiPass — RPC functions
-- Faculty decisions are made exclusively through these functions so every
-- transition is validated (department scope, current state, required reason)
-- and atomic. Triggers in the schema migration create notifications + audit rows.
-- ============================================================================

-- ---------- public (anon-safe) -----------------------------------------------

-- Whitelisted settings the login / registration / verification pages need.
create or replace function public.public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.app_settings
  where key in ('institution_name', 'student_email_domain', 'allow_student_registration')
$$;

-- Lets the registration form tell the student early that a register number is taken.
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

-- Public QR landing page. Returns ONLY fields that are appropriate to share:
-- no email, phone, internal ids or reviewer identity.
create or replace function public.get_public_verification(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'verification_code', v.verification_code,
    'verified_at', v.verified_at,
    'student_name', s.full_name,
    'department', d.name,
    'event_name', a.event_name,
    'category', c.name,
    'organization', a.organization,
    'result', a.result,
    'start_date', a.start_date,
    'end_date', a.end_date,
    'institution', (select value #>> '{}' from public.app_settings where key = 'institution_name')
  )
  from public.verification_records v
  join public.achievements a on a.id = v.achievement_id and a.status = 'verified'
  join public.profiles s on s.id = a.student_id
  join public.event_categories c on c.id = a.category_id
  left join public.departments d on d.id = s.department_id
  where v.verification_code = upper(trim(p_code))
$$;

grant execute on function public.public_settings() to anon, authenticated;
grant execute on function public.register_number_available(text) to anon, authenticated;
grant execute on function public.get_public_verification(text) to anon, authenticated;

-- ---------- verification code ------------------------------------------------
create or replace function public.generate_verification_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- no I, O, 0, 1 — easy to read aloud and to type from a printout
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_prefix   text;
  v_bytes    bytea;
  v_code     text;
  i          int;
begin
  select coalesce(nullif(trim(value #>> '{}'), ''), 'CP') into v_prefix
    from public.app_settings where key = 'verification_prefix';
  v_prefix := coalesce(v_prefix, 'CP');

  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..4 loop
      -- 256 is a multiple of 32, so the modulo introduces no bias
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    v_code := upper(v_prefix) || '-' || to_char(now(), 'YYYY') || '-' || v_code;
    exit when not exists (select 1 from public.verification_records where verification_code = v_code);
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_verification_code() from public, anon, authenticated;

-- ---------- faculty decisions ------------------------------------------------
create or replace function public.verify_achievement(p_achievement_id uuid, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a      public.achievements;
  v_code text;
begin
  select * into a from public.achievements where id = p_achievement_id for update;
  if not found then
    raise exception 'Achievement not found.' using errcode = 'P0002';
  end if;
  if not public.is_faculty_of_student(a.student_id) then
    raise exception 'You can only review students in your department.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Only submissions that are pending verification can be verified.' using errcode = 'P0001';
  end if;

  v_code := public.generate_verification_code();

  update public.achievements
     set status = 'verified',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_comment = nullif(trim(p_comment), '')
   where id = a.id;

  insert into public.verification_records (achievement_id, verification_code, verified_by)
  values (a.id, v_code, auth.uid());

  return v_code;
end;
$$;

create or replace function public.reject_achievement(p_achievement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.achievements;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please give the student a reason for the rejection.' using errcode = 'P0001';
  end if;

  select * into a from public.achievements where id = p_achievement_id for update;
  if not found then
    raise exception 'Achievement not found.' using errcode = 'P0002';
  end if;
  if not public.is_faculty_of_student(a.student_id) then
    raise exception 'You can only review students in your department.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Only submissions that are pending verification can be rejected.' using errcode = 'P0001';
  end if;

  update public.achievements
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_comment = trim(p_reason)
   where id = a.id;
end;
$$;

create or replace function public.request_achievement_changes(p_achievement_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.achievements;
begin
  if char_length(trim(coalesce(p_message, ''))) < 5 then
    raise exception 'Please tell the student what needs to change.' using errcode = 'P0001';
  end if;

  select * into a from public.achievements where id = p_achievement_id for update;
  if not found then
    raise exception 'Achievement not found.' using errcode = 'P0002';
  end if;
  if not public.is_faculty_of_student(a.student_id) then
    raise exception 'You can only review students in your department.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Only submissions that are pending verification can be sent back.' using errcode = 'P0001';
  end if;

  update public.achievements
     set status = 'changes_requested', reviewed_by = auth.uid(), reviewed_at = now(),
         review_comment = trim(p_message)
   where id = a.id;
end;
$$;

create or replace function public.review_od_request(
  p_od_id uuid, p_decision public.od_status, p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.od_requests;
begin
  if p_decision not in ('approved', 'rejected', 'more_info') then
    raise exception 'Invalid decision.' using errcode = 'P0001';
  end if;
  if p_decision in ('rejected', 'more_info') and char_length(trim(coalesce(p_comment, ''))) < 5 then
    raise exception 'Please add a comment so the student knows what to do next.' using errcode = 'P0001';
  end if;

  select * into o from public.od_requests where id = p_od_id for update;
  if not found then
    raise exception 'OD request not found.' using errcode = 'P0002';
  end if;
  if not public.is_faculty_of_student(o.student_id) then
    raise exception 'You can only review students in your department.' using errcode = '42501';
  end if;
  if o.status <> 'pending' then
    raise exception 'This OD request has already been reviewed.' using errcode = 'P0001';
  end if;

  update public.od_requests
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_comment = nullif(trim(p_comment), '')
   where id = o.id;
end;
$$;

revoke all on function public.verify_achievement(uuid, text) from public, anon;
revoke all on function public.reject_achievement(uuid, text) from public, anon;
revoke all on function public.request_achievement_changes(uuid, text) from public, anon;
revoke all on function public.review_od_request(uuid, public.od_status, text) from public, anon;
grant execute on function public.verify_achievement(uuid, text) to authenticated;
grant execute on function public.reject_achievement(uuid, text) to authenticated;
grant execute on function public.request_achievement_changes(uuid, text) to authenticated;
grant execute on function public.review_od_request(uuid, public.od_status, text) to authenticated;

-- ---------- dashboards -------------------------------------------------------
-- SECURITY INVOKER (default): counts are scoped by the caller's RLS, so the same
-- function serves a faculty member (their department) and an admin (everything).
create or replace function public.review_stats(p_since timestamptz default date_trunc('day', now()))
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'pending_certificates', (select count(*) from public.achievements where status = 'pending'),
    'pending_ods',          (select count(*) from public.od_requests where status = 'pending'),
    'verified_today',       (select count(*) from public.achievements
                              where status = 'verified' and reviewed_at >= p_since),
    'verified_total',       (select count(*) from public.achievements where status = 'verified'),
    'rejected',             (select count(*) from public.achievements where status = 'rejected'),
    'total_students',       (select count(*) from public.profiles where role = 'student'),
    'total_faculty',        (select count(*) from public.profiles where role = 'faculty'),
    'total_achievements',   (select count(*) from public.achievements where status <> 'draft'),
    'total_ods',            (select count(*) from public.od_requests),
    'approved_ods',         (select count(*) from public.od_requests where status = 'approved'),
    'rejected_ods',         (select count(*) from public.od_requests where status = 'rejected')
  )
$$;

grant execute on function public.review_stats(timestamptz) to authenticated;
