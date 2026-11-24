-- Support ticket completion; apply after SUPABASE-SUPPORT-TICKETS.sql.
-- Existing ticket data and RLS policies are preserved.
begin;
CREATE OR REPLACE FUNCTION public.ticket_transition_ok(from_s ticket_status, to_s ticket_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case from_s
    when 'Open'               then to_s in ('In Progress', 'Resolved')
    when 'In Progress'        then to_s in ('Waiting for Student', 'Resolved')
    when 'Waiting for Student' then to_s in ('In Progress', 'Resolved')
    when 'Resolved'           then to_s in ('Closed', 'Open')
    when 'Closed'             then to_s = 'Open'
    else false end
$function$;
CREATE OR REPLACE FUNCTION public.tickets_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.portal_role := public.auth_role(); need text;
begin
  if current_setting('portal.system_update', true) = 'on' or auth.uid() is null then
    new.updated_at := now(); return new;
  end if;

  new.id := old.id; new.reference_no := old.reference_no; new.student_id := old.student_id;
  new.student_number := old.student_number; new.student_name := old.student_name;
  new.email := old.email; new.created_at := old.created_at; new.subject := old.subject;
  new.category := old.category; new.request_id := old.request_id; new.appointment_id := old.appointment_id;

  new.resolved_at := old.resolved_at; new.closed_at := old.closed_at;
  if r in ('staff', 'admin') then
    if new.status is distinct from old.status then
      if not public.ticket_transition_ok(old.status, new.status) then
        raise exception 'A "%" ticket cannot move to "%"', old.status, new.status;
      end if;
      need := case when new.status = 'Resolved' then 'resolve'
                   when new.status = 'Closed'   then 'close'
                   when new.status = 'Open'     then 'reopen'
                   else 'manage' end;
      if not public.has_capability(need) then
        raise exception 'Your account does not have support % permission', need;
      end if;
      if new.status = 'Resolved' then new.resolved_at := now();
      elsif new.status = 'Closed' then new.closed_at := now();
      elsif new.status = 'Open' then new.resolved_at := null; new.closed_at := null;
      end if;
    end if;
    if new.assigned_staff_id is distinct from old.assigned_staff_id and not public.has_capability('assign') then
      raise exception 'Your account does not have support assign permission';
    end if;
    if new.priority is distinct from old.priority and not public.has_capability('manage') then
      raise exception 'Your account does not have support manage permission';
    end if;
  elsif r = 'student' and old.student_id = auth.uid() then
    new.priority := old.priority; new.assigned_staff_id := old.assigned_staff_id;
    new.assigned_staff_name := old.assigned_staff_name;
    new.resolved_at := old.resolved_at; new.closed_at := old.closed_at;
    if new.status is distinct from old.status then
      if old.status <> 'Resolved' or new.status not in ('Open', 'Closed') then
        raise exception 'You can only confirm or reopen your own resolved ticket';
      end if;
      if new.status = 'Closed' then
        new.closed_at := now();
      else
        new.resolved_at := null; new.closed_at := null;
      end if;
    end if;
  else
    raise exception 'You are not allowed to update this ticket';
  end if;

  if new.assigned_staff_id is not null then
    select full_name into new.assigned_staff_name from public.profiles where id = new.assigned_staff_id;
  else
    new.assigned_staff_name := null;
  end if;
  new.revision := old.revision + 1;   -- lets the app detect edit conflicts: .eq('revision', n)
  new.updated_at := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.tickets_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('ticket', new.id, 'Ticket Submitted', null, new.status::text);
    perform public.notify_staff('support', 'New support ticket', new.reference_no || ': ' || new.subject,
      'support_tickets', new.id);
  else
    if new.status is distinct from old.status
       and coalesce(current_setting('portal.system_update', true), '') <> 'on' then
      perform public.write_audit('ticket', new.id, 'Status Updated', old.status::text, new.status::text);
      if new.student_id is distinct from auth.uid() then
        perform public.notify_user(new.student_id, 'support',
          case when new.status='Resolved' then 'Solution ready for your confirmation'
               when new.status='Closed' then 'Support ticket closed' else 'Ticket update' end,
          new.reference_no || ': ' || new.status::text, 'support_tickets', new.id);
      elsif old.status='Resolved' and new.status in ('Closed','Open') then
        insert into public.notifications(user_id,kind,title,body,ref_table,ref_id)
        select p.id,'support',case when new.status='Closed' then 'Student confirmed issue fixed' else 'Student reopened support ticket' end,
          new.reference_no || ': ' || new.status::text,'support_tickets',new.id
        from public.profiles p
        where p.is_active and (p.role='admin' or (p.role='staff' and
          (exists(select 1 from public.staff_capabilities c where c.user_id=p.id and c.capability='viewAll')
           or ((new.assigned_staff_id is null or new.assigned_staff_id=p.id) and exists(select 1 from public.staff_capabilities c where c.user_id=p.id and c.capability='viewAssigned')))));
      end if;
    end if;
    if new.assigned_staff_id is distinct from old.assigned_staff_id then
      perform public.write_audit('ticket', new.id, 'Staff Assignment Updated', old.status::text, new.status::text,
        new.assigned_staff_name);
      perform public.notify_user(new.assigned_staff_id, 'support', 'Ticket assigned to you',
        new.reference_no || ': ' || new.subject, 'support_tickets', new.id);
    end if;
    if new.priority is distinct from old.priority then
      perform public.write_audit('ticket', new.id, 'Priority Updated', old.status::text, new.status::text,
        new.priority::text);
    end if;
  end if;
  return null;
end $function$;
-- Only active staff already authorized to manage and reply to support tickets receive finish permissions.
insert into public.staff_capabilities(user_id,capability)
select p.id,c.capability from public.profiles p
cross join (values ('resolve'),('close')) as c(capability)
where p.role='staff' and p.is_active
and exists(select 1 from public.staff_capabilities x where x.user_id=p.id and x.capability='manage')
and exists(select 1 from public.staff_capabilities x where x.user_id=p.id and x.capability='reply')
and exists(select 1 from public.staff_capabilities x where x.user_id=p.id and x.capability in ('viewAssigned','viewAll'))
on conflict do nothing;
commit;
