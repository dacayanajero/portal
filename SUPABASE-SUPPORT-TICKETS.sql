-- Apply in Supabase SQL Editor before deploying the frontend branch.
-- Review staff capability grants separately. No data is deleted.
begin;
-- Status remarks are part of the existing status update and audit transaction.
alter table public.support_tickets add column if not exists status_remarks text not null default '';
alter table public.support_tickets drop constraint if exists support_status_remarks_length;
alter table public.support_tickets add constraint support_status_remarks_length check (length(status_remarks)<=2000);

-- Queue access requires a support capability, not merely any staff role.
drop policy if exists ticket_read on public.support_tickets;
create policy ticket_read on public.support_tickets for select to authenticated using (
  (student_id=auth.uid() and public.auth_role()='student') or
  (public.is_staff() and (public.has_capability('viewAll') or
   (public.has_capability('viewAssigned') and (assigned_staff_id=auth.uid() or assigned_staff_id is null))))
);
drop policy if exists ticket_update on public.support_tickets;
create policy ticket_update on public.support_tickets for update to authenticated using (
  (student_id=auth.uid() and public.auth_role()='student') or
  (public.is_staff() and (public.has_capability('viewAll') or
   (public.has_capability('viewAssigned') and (assigned_staff_id=auth.uid() or assigned_staff_id is null))))
) with check ((student_id=auth.uid() and public.auth_role()='student') or public.is_staff());
drop policy if exists msg_read on public.support_messages;
create policy msg_read on public.support_messages for select to authenticated using (
  exists(select 1 from public.support_tickets t where t.id=ticket_id)
  and (not is_internal or (public.is_staff() and public.has_capability('note')))
);

-- Enforce assignee eligibility and preserve remark text only on a real status change.
create or replace function public.portal_support_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then new.status_remarks:=''; return new; end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id and new.assigned_staff_id is not null and not exists (
    select 1 from public.profiles p where p.id=new.assigned_staff_id and p.role='staff' and p.is_active
    and exists(select 1 from public.staff_capabilities c where c.user_id=p.id and c.capability='reply')
    and exists(select 1 from public.staff_capabilities c where c.user_id=p.id and c.capability in ('viewAll','viewAssigned'))
  ) then raise exception 'Choose an eligible active support staff member'; end if;
  if new.status is not distinct from old.status then new.status_remarks:=old.status_remarks; end if;
  return new;
end $$;
revoke all on function public.portal_support_guard() from public, anon, authenticated;
drop trigger if exists z_portal_support_guard on public.support_tickets;
create trigger z_portal_support_guard before insert or update on public.support_tickets for each row execute function public.portal_support_guard();

-- Store the submitted description and ticket atomically. The UUID is the retry token.
create or replace function public.portal_create_support_ticket(p_id uuid,p_subject text,p_category text,p_description text,p_request uuid,p_appointment uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  if public.auth_role() is distinct from 'student' or auth.uid() is null then raise exception 'Student login required'; end if;
  if p_id is null or length(btrim(coalesce(p_subject,''))) not between 1 and 160 or length(btrim(coalesce(p_description,''))) not between 1 and 5000 then raise exception 'Subject and description are required'; end if;
  insert into public.support_tickets(id,student_id,subject,category,request_id,appointment_id)
  values(p_id,auth.uid(),btrim(p_subject),p_category,p_request,p_appointment) on conflict(id) do nothing;
  if not exists(select 1 from public.support_tickets where id=p_id and student_id=auth.uid()) then raise exception 'Ticket unavailable'; end if;
  if not exists(select 1 from public.support_messages where id=p_id and ticket_id=p_id and sender_id=auth.uid()) then
    insert into public.support_messages(id,ticket_id,body) values(p_id,p_id,btrim(p_description)) on conflict(id) do nothing;
  end if;
  if not exists(select 1 from public.support_messages where id=p_id and ticket_id=p_id and sender_id=auth.uid()) then raise exception 'Message unavailable'; end if;
  return p_id;
end $$;
revoke all on function public.portal_create_support_ticket(uuid,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.portal_create_support_ticket(uuid,text,text,text,uuid,uuid) to authenticated;

create or replace function public.portal_reply_support_ticket(p_ticket uuid,p_message uuid,p_revision integer,p_body text,p_internal boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.support_tickets;
begin
  if auth.uid() is null or p_message is null then raise exception 'Login required'; end if;
  select * into t from public.support_tickets where id=p_ticket for update;
  if not found then raise exception 'Ticket unavailable'; end if;
  if exists(select 1 from public.support_messages where id=p_message and ticket_id=p_ticket and sender_id=auth.uid()) then return p_message; end if;
  if t.revision<>p_revision then raise exception 'Ticket changed; refresh and retry'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and (case when p_internal then 2000 else 5000 end) then raise exception 'Invalid message length'; end if;
  insert into public.support_messages(id,ticket_id,body,is_internal) values(p_message,p_ticket,btrim(p_body),p_internal);
  return p_message;
end $$;
revoke all on function public.portal_reply_support_ticket(uuid,uuid,integer,text,boolean) from public, anon;
grant execute on function public.portal_reply_support_ticket(uuid,uuid,integer,text,boolean) to authenticated;

create or replace function public.portal_transition_support_ticket(p_ticket uuid,p_revision integer,p_status public.ticket_status,p_remarks text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  update public.support_tickets set status=p_status,status_remarks=coalesce(btrim(p_remarks),'')
  where id=p_ticket and revision=p_revision and status<>p_status returning id into result;
  if result is null then raise exception 'Ticket changed or unavailable; refresh and retry'; end if;
  return result;
end $$;
revoke all on function public.portal_transition_support_ticket(uuid,integer,public.ticket_status,text) from public, anon;
grant execute on function public.portal_transition_support_ticket(uuid,integer,public.ticket_status,text) to authenticated;

-- Existing audit trigger logs status; enrich that entry rather than duplicating it.
create or replace function public.portal_support_audit_remarks() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status_remarks<>'' and coalesce(current_setting('portal.system_update',true),'')<>'on' then
    update public.audit_log set remarks=new.status_remarks where id=(
      select id from public.audit_log where entity='ticket' and entity_id=new.id and action='Status Updated'
      and actor_id=auth.uid() and new_status=new.status::text order by created_at desc,id desc limit 1
    );
  end if;
  return null;
end $$;
revoke all on function public.portal_support_audit_remarks() from public, anon, authenticated;
drop trigger if exists z_portal_support_audit_remarks on public.support_tickets;
create trigger z_portal_support_audit_remarks after update on public.support_tickets for each row execute function public.portal_support_audit_remarks();

-- Realtime sends only invalidations; the frontend re-queries under RLS.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets') then alter publication supabase_realtime add table public.support_tickets; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then alter publication supabase_realtime add table public.support_messages; end if;
end $$;
commit;
