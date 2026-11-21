-- Restore the student cancellation RPC from patch 3.
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


CREATE OR REPLACE FUNCTION public.check_slot(d date, s time without time zone, e time without time zone, self_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  op_start time := (public.setting('operating_start') #>> '{}')::time;
  op_end   time := (public.setting('operating_end')   #>> '{}')::time;
  latest   time := (public.setting('latest_start')    #>> '{}')::time;
  cap      int  := (public.setting('appointment_capacity') #>> '{}')::int;
  peak_existing int;
begin
  if d is null or s is null or e is null or e - s <> interval '1 hour' then
    raise exception 'Choose a one-hour appointment';
  end if;
  if cap is null or cap < 1 then
    raise exception 'Appointment booking is unavailable';
  end if;
  if not (public.setting('operating_days') @> to_jsonb(extract(isodow from d)::int)) then
    raise exception 'Appointments are not available on that day';
  end if;
  if exists (select 1 from public.closed_dates where closed_date = d) then
    raise exception 'The office is closed on that date';
  end if;
  if s < op_start or s > latest or e > op_end then
    raise exception 'Choose a time within office hours (% to %)', op_start, op_end;
  end if;
  if (d + s) <= timezone('Asia/Manila', now()) then
    raise exception 'Choose a future time';
  end if;
  -- All starts on the same Manila office date compete for the same capacity.
  perform pg_advisory_xact_lock(721046, d - date '2000-01-01');

  -- Occupancy rises only at a start. Equal end/start times are adjacent.
  with bookings as (
    select a.start_time, a.end_time
    from public.appointments a
    where a.appt_date = d
      and a.status in ('Pending Confirmation', 'Scheduled', 'Checked In')
      and a.id is distinct from self_id
      and a.start_time < e and a.end_time > s
  ), starts as (
    select s as at_time
    union
    select start_time from bookings where start_time > s
  )
  select max((select count(*) from bookings o
              where o.start_time <= starts.at_time and o.end_time > starts.at_time))
  into peak_existing from starts;

  if peak_existing >= cap then
    raise exception 'That time slot is already full';
  end if;
end
$function$;

revoke execute on function public.check_slot(date,time,time,uuid) from public, anon, authenticated;
