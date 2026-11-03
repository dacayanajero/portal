-- Optional prerequisite if the main Supabase v2 schema was installed
-- without the college column used by the registration form.
-- Execute manually in Supabase SQL Editor; this PR cannot change your database.
alter table public.profiles add column if not exists college text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles
    (id, account_number, full_name, contact_email, phone_number,
     college, program, year_level, semester)
  values (
    new.id,
    coalesce(nullif(btrim(m ->> 'account_number'), ''), split_part(new.email, '@', 1)),
    coalesce(nullif(btrim(m ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(m ->> 'contact_email'), ''),
    nullif(btrim(m ->> 'phone_number'), ''),
    nullif(btrim(m ->> 'college'), ''),
    nullif(btrim(m ->> 'program'), ''),
    nullif(btrim(m ->> 'year_level'), ''),
    nullif(btrim(m ->> 'semester'), ''));
  return new;
end $$;
