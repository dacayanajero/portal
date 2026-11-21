-- The existing request triggers authorize the transition, stamp the releasing
-- staff account and time, and publish the audit entry and student notice.
create or replace function public.record_staff_document_release()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  staff_name text;
begin
  if old.status = 'Ready for Pickup' and new.status = 'Released' then
    select full_name into staff_name from public.profiles
      where id = auth.uid() and is_active and role in ('staff','admin');
    if not found then raise exception 'Active staff sign-in required to release a document'; end if;
    new.release := jsonb_build_object(
      'reference', 'REL-' || old.reference_no, 'requestId', old.reference_no,
      'documentType', old.document_type, 'copies', old.details->'copies',
      'actor', staff_name, 'timestamp', new.released_at
    );
  end if;
  return new;
end;
$$;
revoke all on function public.record_staff_document_release() from public, anon, authenticated;
create trigger requests_record_release before update of status on public.requests
for each row when (old.status is distinct from new.status and new.status = 'Released')
execute function public.record_staff_document_release();
