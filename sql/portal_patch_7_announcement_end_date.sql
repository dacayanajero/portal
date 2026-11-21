-- Apply to RTU_Scheduling before deploying the announcement UI.
-- Only actively published notices may be read from student sessions.
-- An end date is mandatory for new/updated Published records and is exclusive
-- at midnight Asia/Manila on the calendar day AFTER the selected end date.
drop policy if exists ann_read on public.announcements;
create policy ann_read on public.announcements
for select to authenticated
using (
  ((select public.is_staff()) and (select public.has_capability('view')))
  or (
    status = 'Published'::public.announcement_status
    and published_at is not null
    and published_at <= now()
    and expires_at is not null
    and expires_at > now()
  )
);

-- New published rows must carry an expiry, preventing permanent student notices.
-- This is NOT applied to existing records until they are modified/published.
alter table public.announcements
  add constraint announcements_published_window_check
  check (
    status <> 'Published'::public.announcement_status
    or (
      published_at is not null
      and expires_at is not null
      and expires_at > published_at
    )
  ) not valid;

create index if not exists announcements_active_feed_idx
  on public.announcements (published_at desc, expires_at)
  where status = 'Published'::public.announcement_status;
