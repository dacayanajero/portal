-- RTU Portal phase 3: run manually in Supabase SQL Editor.
-- Requires the original v2 schema. Does not delete or overwrite tables.
-- The GitHub frontend cannot run this migration for you.

create or replace function public.create_document_request_and_appointment(
  p_document_type text,
  p_purpose text,
  p_details jsonb,
  p_appt_date date,
  p_start_time time,
  p_end_time time
)
returns table (request_id uuid, request_reference_no text, appointment_id uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_request_id uuid;
  v_reference_no text;
  v_appointment_id uuid;
begin
  if public.auth_role() is distinct from 'student'::public.portal_role then
    raise exception 'Sign in as an active student before submitting a request';
  end if;
  if nullif(btrim(p_purpose), '') is null then
    raise exception 'Purpose is required';
  end if;
  if p_document_type is null or not exists (
    select 1 from public.document_types
    where name = p_document_type and is_active
  ) then
    raise exception 'Document type is not available';
  end if;
  if p_details is not null and jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details must be a JSON object';
  end if;
  if p_appt_date is null or p_start_time is null or p_end_time is null then
    raise exception 'Appointment date and time are required';
  end if;
  if p_end_time - p_start_time <> interval '60 minutes' then
    raise exception 'Appointment duration must be 60 minutes';
  end if;

  insert into public.requests (document_type, purpose, details)
  values (p_document_type, btrim(p_purpose), coalesce(p_details, '{}'::jsonb))
  returning id, reference_no into v_request_id, v_reference_no;

  insert into public.appointments (request_id, appt_date, start_time, end_time)
  values (v_request_id, p_appt_date, p_start_time, p_end_time)
  returning id into v_appointment_id;

  return query select v_request_id, v_reference_no, v_appointment_id;
end;
$$;

revoke all on function public.create_document_request_and_appointment(text,text,jsonb,date,time,time)
  from public, anon;
grant execute on function public.create_document_request_and_appointment(text,text,jsonb,date,time,time)
  to authenticated;

-- Cancels the request and any still-cancellable linked appointment together.
-- No partial cancellation if an appointment is already checked in.
create or replace function public.cancel_document_request_and_appointment(
  p_request_id uuid,
  p_reason text
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_request public.requests;
  v_appointment public.appointments;
begin
  if public.auth_role() is distinct from 'student'::public.portal_role then
    raise exception 'Only a signed-in student can cancel their request';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Enter a cancellation reason';
  end if;
  select * into v_request from public.requests
    where id = p_request_id and student_id = auth.uid() for update;
  if v_request.id is null then raise exception 'Request not found'; end if;
  if v_request.status not in ('Pending Review', 'Needs Correction') then
    raise exception 'This request can no longer be cancelled';
  end if;
  select * into v_appointment from public.appointments
    where request_id = p_request_id for update;
  if v_appointment.id is not null and v_appointment.status = 'Checked In' then
    raise exception 'This appointment is already checked in and cannot be cancelled';
  end if;
  update public.requests set status = 'Cancelled', cancel_reason = btrim(p_reason)
    where id = p_request_id;
  if v_appointment.id is not null
     and v_appointment.status in ('Pending Confirmation', 'Scheduled') then
    update public.appointments set status = 'Cancelled', reason = btrim(p_reason)
      where id = v_appointment.id;
  end if;
end;
$$;

revoke all on function public.cancel_document_request_and_appointment(uuid,text) from public, anon;
grant execute on function public.cancel_document_request_and_appointment(uuid,text) to authenticated;

-- Use database-wide booking checks (not the currently visible student's
-- bookings), with a per-day transaction lock to prevent concurrent overlap.
create or replace function public.check_slot(d date, s time, e time, self_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  op_start time := (public.setting('operating_start') #>> '{}')::time;
  op_end time := (public.setting('operating_end') #>> '{}')::time;
  latest time := (public.setting('latest_start') #>> '{}')::time;
  slot_duration int := (public.setting('slot_minutes') #>> '{}')::int;
  cap int := (public.setting('appointment_capacity') #>> '{}')::int;
  taken int;
begin
  if d is null or s is null or e is null then
    raise exception 'Select an appointment date and time';
  end if;
  if cap is null or cap < 1 or slot_duration is null or slot_duration < 1 then
    raise exception 'Appointment settings are invalid';
  end if;
  if not (public.setting('operating_days') @> to_jsonb(extract(isodow from d)::int)) then
    raise exception 'Appointments are not available on that day';
  end if;
  if exists (select 1 from public.closed_dates where closed_date = d) then
    raise exception 'The office is closed on that date';
  end if;
  if s < op_start or s > latest or e > op_end or e <= s then
    raise exception 'Choose a time within office hours';
  end if;
  if e - s <> make_interval(mins => slot_duration) then
    raise exception 'Appointment duration must be % minutes', slot_duration;
  end if;
  if (d + s) <= timezone('Asia/Manila', now()) then
    raise exception 'Choose a future appointment time';
  end if;
  perform pg_advisory_xact_lock(hashtext('rtu-appt-day:' || d::text));
  select count(*) into taken from public.appointments
   where appt_date = d
     and start_time < e and s < end_time
     and status in ('Pending Confirmation', 'Scheduled', 'Checked In')
     and (self_id is null or id <> self_id);
  if taken >= cap then raise exception 'That appointment time slot is full'; end if;
end;
$$;

revoke execute on function public.check_slot(date,time,time,uuid) from public, anon, authenticated;
