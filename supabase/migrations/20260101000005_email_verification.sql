-- ============================================================================
-- CertiPass — e-mail verification support
--
-- Problem: signing up creates the profile immediately (with the register number), but the account stays
-- unverified until the e-mail link is clicked. If the student mistyped their address, the verification mail
-- never arrives AND the register number is now "taken" by an account nobody can ever sign in to, so they could
-- not simply register again with the right address.
--
-- Fix: an *unconfirmed* sign-up never holds a register number. A new sign-up with the same register number
-- replaces it, and the availability check treats it as free. A confirmed account is never touched.
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
  v_register  text;
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

    -- Release the register number from an earlier sign-up that never verified its e-mail address.
    v_register := nullif(trim(v_meta ->> 'register_number'), '');
    if v_register is not null then
      delete from auth.users u
       using public.profiles p
       where p.id = u.id
         and u.id <> new.id
         and u.email_confirmed_at is null
         and upper(p.register_number) = upper(v_register);
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
    case when v_role = 'student' then v_register end,
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

-- "Is this register number free?" — only a *confirmed* account counts as holding it.
create or replace function public.register_number_available(p_register_number text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where upper(p.register_number) = upper(trim(p_register_number))
      and u.email_confirmed_at is not null
  )
$$;

grant execute on function public.register_number_available(text) to anon, authenticated;
