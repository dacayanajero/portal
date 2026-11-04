-- RTU Portal phase 4: development-only preparation checklist, stored in Supabase.
-- Run in Supabase SQL Editor on the existing v2 schema, AFTER phase 3.
-- This is NOT an official RTU document-verification policy.
-- Does not delete data or grant public access to staff actions.

create or replace function public.save_request_preparation_check(
  p_request_id uuid,
  p_check_id text,
  p_checked boolean,
  p_policy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.requests%rowtype;
  v_staff public.profiles%rowtype;
  v_label text;
  v_processing jsonb;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'An active staff sign-in is required';
  end if;
  if p_request_id is null or p_check_id is null or p_checked is null then
    raise exception 'Missing preparation check input';
  end if;
  if p_policy_version is distinct from 'development-preparation-v1' then
    raise exception 'The preparation checklist policy version is no longer supported';
  end if;
  v_label := case p_check_id
    when 'student'  then 'Student information verified'
    when 'request'  then 'Request details reviewed'
    when 'academic' then 'Required academic information checked'
    when 'prepared' then 'Document prepared'
    when 'accuracy' then 'Document reviewed for accuracy'
    else null end;
  if v_label is null then
    raise exception 'Unknown preparation check';
  end if;
  select * into v_staff from public.profiles
    where id = auth.uid() and is_active and role in ('staff', 'admin');
  if v_staff.id is null then
    raise exception 'Staff profile is not active';
  end if;

  select * into v_row from public.requests
    where id = p_request_id for update;
  if v_row.id is null then raise exception 'Request not found'; end if;
  if v_row.status <> 'Processing' then
    raise exception 'Preparation checks can only change while the request is Processing';
  end if;
  if v_row.document_type not in (
    'Grade Slip', 'Registration Form', 'ID Printing',
    'Transcript of Records', 'Certificate of Enrollment'
  ) then
    raise exception 'The document has no configured preparation checklist';
  end if;

  v_processing := jsonb_set(
    coalesce(v_row.processing, '{"checks":{},"notes":[]}'::jsonb),
    array['checks', p_check_id],
    jsonb_build_object(
      'checked', p_checked, 'version', p_policy_version,
      'timestamp', now(), 'actor', v_staff.full_name,
      'staffId', v_staff.account_number
    ), true
  );
  update public.requests set processing = v_processing where id = p_request_id;

  perform public.write_audit(
    'request', p_request_id, 'Preparation Check Updated',
    v_row.status::text, v_row.status::text,
    v_label || ': ' || case when p_checked then 'complete' else 'incomplete' end,
    false
  );
end;
$$;

revoke all on function public.save_request_preparation_check(uuid,text,boolean,text) from public, anon;
grant execute on function public.save_request_preparation_check(uuid,text,boolean,text) to authenticated;

-- Database-side guard: even a direct status UPDATE must not skip the checklist.
create or replace function public.require_preparation_before_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_check text;
begin
  if new.status = 'Ready for Pickup' and old.status is distinct from new.status then
    if not public.is_staff() then
      raise exception 'Only active staff can mark a request ready';
    end if;
    if old.status <> 'Processing' then
      raise exception 'The request must be Processing before it can be Ready for Pickup';
    end if;
    if new.document_type not in (
      'Grade Slip', 'Registration Form', 'ID Printing',
      'Transcript of Records', 'Certificate of Enrollment'
    ) then raise exception 'No configured preparation workflow for this document'; end if;

    foreach v_check in array array['student','request','academic','prepared','accuracy'] loop
      if coalesce(new.processing->'checks'->v_check->>'checked', 'false') <> 'true'
         or coalesce(new.processing->'checks'->v_check->>'version','')
            <> 'development-preparation-v1'
      then
        raise exception 'All five preparation checks must be completed before marking ready';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_ready_guard on public.requests;
create trigger requests_ready_guard
before update of status on public.requests
for each row execute function public.require_preparation_before_ready();

revoke all on function public.require_preparation_before_ready() from public, anon, authenticated;

-- Atomic transition after all required checks; the normal request status
-- trigger updates ready_at, writes audit history, and notifies the student.
create or replace function public.mark_request_ready(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status public.request_status;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'An active staff sign-in is required';
  end if;
  select status into v_status from public.requests
    where id = p_request_id for update;
  if v_status is null then raise exception 'Request not found'; end if;
  if v_status <> 'Processing' then
    raise exception 'Only Processing requests can be marked Ready for Pickup';
  end if;
  update public.requests set status = 'Ready for Pickup'
    where id = p_request_id;
  -- The requests_ready_guard trigger validates all five checks.
end;
$$;

revoke all on function public.mark_request_ready(uuid) from public, anon;
grant execute on function public.mark_request_ready(uuid) to authenticated;
