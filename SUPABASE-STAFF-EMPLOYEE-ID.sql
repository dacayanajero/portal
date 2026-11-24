-- Separate employee identifiers from legacy account numbers used by authentication.
-- Existing profile UUIDs, account numbers, login email, and all foreign keys stay unchanged.
begin;
alter table public.profiles add column if not exists employee_number text;
create sequence if not exists public.portal_employee_number_seq;
revoke all on sequence public.portal_employee_number_seq from public, anon, authenticated;
create unique index if not exists profiles_employee_number_unique on public.profiles(employee_number) where employee_number is not null;

create or replace function public.portal_assign_employee_number()
returns trigger language plpgsql security definer set search_path='' as $$
declare serial_text text;
begin
  if new.role in ('staff','admin') then
    if tg_op='UPDATE' and old.role in ('staff','admin') and old.employee_number is not null then
      new.employee_number:=old.employee_number;
    else
      serial_text:=nextval('public.portal_employee_number_seq'::regclass)::text;
      new.employee_number:='ST-'||lpad(serial_text,greatest(6,length(serial_text)),'0');
    end if;
  else
    new.employee_number:=null;
  end if;
  return new;
end $$;
revoke all on function public.portal_assign_employee_number() from public, anon, authenticated;
drop trigger if exists z_portal_assign_employee_number on public.profiles;
create trigger z_portal_assign_employee_number before insert or update on public.profiles for each row execute function public.portal_assign_employee_number();
-- Existing staff are allocated IDs; student IDs remain untouched.
update public.profiles set employee_number=null where role in ('staff','admin') and employee_number is null;
alter table public.profiles drop constraint if exists profiles_employee_number_role_check;
alter table public.profiles add constraint profiles_employee_number_role_check check (
  (role in ('staff','admin') and employee_number is not null and employee_number ~ '^ST-[0-9]{6,}$')
  or (role='student' and employee_number is null)
);
commit;
