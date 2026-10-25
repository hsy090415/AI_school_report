-- Preserve the existing activity/report model and add a dedicated ICWC flow.
-- Existing rows are never rewritten or deleted by this migration.

alter table public.students
  add column auth_user_id uuid references auth.users (id) on delete set null;

alter table public.students
  add constraint students_auth_user_id_unique unique (auth_user_id);

comment on column public.students.auth_user_id is
  '관리자가 연결하는 학생용 Supabase Auth UID. 한 Auth 사용자와 한 학생 명단 행을 1:1로 연결한다.';

create table public.icwc_teams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  activity_id uuid not null,
  team_name text not null
    constraint icwc_teams_name_not_blank
    check (char_length(btrim(team_name)) between 1 and 100),
  report_text text not null default '',
  report_file_path text,
  report_file_name text,
  report_file_mime_type text,
  report_file_size_bytes bigint,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icwc_teams_activity_teacher_fkey
    foreign key (activity_id, teacher_id)
    references public.activities (id, teacher_id)
    on delete cascade,
  constraint icwc_teams_id_teacher_activity_unique
    unique (id, teacher_id, activity_id),
  constraint icwc_teams_teacher_activity_name_unique
    unique (teacher_id, activity_id, team_name),
  constraint icwc_teams_submission_content_present check (
    submitted_at is null
    or char_length(btrim(report_text)) > 0
    or report_file_path is not null
  ),
  constraint icwc_teams_file_metadata_complete check (
    (
      report_file_path is null
      and report_file_name is null
      and report_file_mime_type is null
      and report_file_size_bytes is null
    )
    or (
      report_file_path is not null
      and char_length(btrim(report_file_path)) > 0
      and report_file_name is not null
      and char_length(btrim(report_file_name)) > 0
      and report_file_mime_type is not null
      and report_file_mime_type in (
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/haansofthwp',
        'application/x-hwp',
        'application/vnd.hancom.hwp',
        'application/vnd.hancom.hwpx'
      )
      and report_file_size_bytes is not null
      and report_file_size_bytes > 0
      and split_part(report_file_path, '/', 1) = 'icwc'
      and split_part(report_file_path, '/', 2) = id::text
    )
  )
);

create unique index icwc_teams_report_file_path_unique_idx
  on public.icwc_teams (report_file_path)
  where report_file_path is not null;

create index icwc_teams_teacher_activity_idx
  on public.icwc_teams (teacher_id, activity_id);

create table public.icwc_team_members (
  team_id uuid not null,
  teacher_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, student_id),
  constraint icwc_team_members_team_fkey
    foreign key (team_id, teacher_id, activity_id)
    references public.icwc_teams (id, teacher_id, activity_id)
    on delete cascade,
  constraint icwc_team_members_student_teacher_fkey
    foreign key (student_id, teacher_id)
    references public.students (id, teacher_id)
    on delete cascade,
  constraint icwc_team_members_student_activity_unique
    unique (student_id, activity_id),
  constraint icwc_team_members_identity_unique
    unique (team_id, student_id, teacher_id, activity_id)
);

create index icwc_team_members_teacher_id_idx
  on public.icwc_team_members (teacher_id);

create index icwc_team_members_activity_id_idx
  on public.icwc_team_members (activity_id);

create index icwc_team_members_student_id_idx
  on public.icwc_team_members (student_id);

create table public.icwc_student_submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  teacher_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  reflection_text text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icwc_student_submissions_member_fkey
    foreign key (team_id, student_id, teacher_id, activity_id)
    references public.icwc_team_members (team_id, student_id, teacher_id, activity_id)
    on delete cascade,
  constraint icwc_student_submissions_student_activity_unique
    unique (student_id, activity_id),
  constraint icwc_student_submissions_identity_unique
    unique (id, teacher_id, student_id, team_id, activity_id),
  constraint icwc_student_submissions_submitted_content check (
    submitted_at is null or char_length(btrim(reflection_text)) > 0
  )
);

create index icwc_student_submissions_team_id_idx
  on public.icwc_student_submissions (team_id);

create index icwc_student_submissions_teacher_id_idx
  on public.icwc_student_submissions (teacher_id);

create table public.icwc_student_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  team_id uuid not null,
  teacher_id uuid not null,
  activity_id uuid not null,
  student_id uuid not null,
  teacher_comment text not null default '',
  draft_focus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icwc_student_reviews_submission_unique unique (submission_id),
  constraint icwc_student_reviews_submission_fkey
    foreign key (submission_id, teacher_id, student_id, team_id, activity_id)
    references public.icwc_student_submissions (id, teacher_id, student_id, team_id, activity_id)
    on delete cascade,
  constraint icwc_student_reviews_focus_valid check (
    draft_focus is null
    or draft_focus in ('탐구내용 중심', '공동체역량 중심')
  ),
  constraint icwc_student_reviews_id_teacher_unique
    unique (id, teacher_id),
  constraint icwc_student_reviews_final_identity_unique
    unique (id, teacher_id, student_id, activity_id)
);

create index icwc_student_reviews_team_id_idx
  on public.icwc_student_reviews (team_id);

create index icwc_student_reviews_teacher_id_idx
  on public.icwc_student_reviews (teacher_id);

create index icwc_student_reviews_student_id_idx
  on public.icwc_student_reviews (student_id);

create table public.icwc_draft_history (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  teacher_id uuid not null,
  generation_direction text not null
    constraint icwc_draft_history_direction_valid
    check (generation_direction in ('탐구내용 중심', '공동체역량 중심')),
  draft_text text not null
    constraint icwc_draft_history_text_not_blank
    check (char_length(btrim(draft_text)) > 0),
  created_at timestamptz not null default now(),
  constraint icwc_draft_history_review_teacher_fkey
    foreign key (review_id, teacher_id)
    references public.icwc_student_reviews (id, teacher_id)
    on delete cascade
);

create index icwc_draft_history_review_created_idx
  on public.icwc_draft_history (review_id, created_at desc);

create index icwc_draft_history_teacher_id_idx
  on public.icwc_draft_history (teacher_id);

create table public.icwc_final_records (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  teacher_id uuid not null,
  student_id uuid not null,
  activity_id uuid not null,
  final_text text not null
    constraint icwc_final_records_text_not_blank
    check (char_length(btrim(final_text)) > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icwc_final_records_review_unique unique (review_id),
  constraint icwc_final_records_review_fkey
    foreign key (review_id, teacher_id, student_id, activity_id)
    references public.icwc_student_reviews (id, teacher_id, student_id, activity_id)
    on delete cascade
);

create index icwc_final_records_teacher_id_idx
  on public.icwc_final_records (teacher_id);

create index icwc_final_records_student_published_idx
  on public.icwc_final_records (student_id, published_at)
  where published_at is not null;

create or replace function private.ensure_icwc_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.activities a
    where a.id = new.activity_id
      and a.teacher_id = new.teacher_id
      and a.code = 'AUTONOMOUS_ICAN_WECAN'
      and a.category = 'AUTONOMOUS'
  ) then
    raise exception using
      errcode = '23514',
      message = 'ICWC team must reference the AUTONOMOUS_ICAN_WECAN activity owned by the teacher';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_icwc_activity() from public, anon, authenticated;

create trigger icwc_teams_validate_activity
before insert or update of teacher_id, activity_id on public.icwc_teams
for each row execute function private.ensure_icwc_activity();

create trigger icwc_teams_set_updated_at
before update on public.icwc_teams
for each row execute function private.set_updated_at();

create trigger icwc_student_submissions_set_updated_at
before update on public.icwc_student_submissions
for each row execute function private.set_updated_at();

create trigger icwc_student_reviews_set_updated_at
before update on public.icwc_student_reviews
for each row execute function private.set_updated_at();

create trigger icwc_final_records_set_updated_at
before update on public.icwc_final_records
for each row execute function private.set_updated_at();

create or replace function private.is_permanent_authenticated_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false;
$$;

create or replace function private.is_teacher_for(candidate_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_permanent_authenticated_user())
    and candidate_teacher_id = (select auth.uid())
    and exists (
      select 1
      from public.teachers t
      where t.id = (select auth.uid())
    );
$$;

create or replace function private.is_student_for(candidate_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_permanent_authenticated_user())
    and exists (
      select 1
      from public.students s
      where s.id = candidate_student_id
        and s.auth_user_id = (select auth.uid())
    );
$$;

create or replace function private.is_icwc_team_teacher(candidate_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.icwc_teams t
    join public.teachers teacher on teacher.id = t.teacher_id
    where t.id = candidate_team_id
      and t.teacher_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
$$;

create or replace function private.is_icwc_team_member(candidate_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.icwc_team_members m
    join public.students s on s.id = m.student_id
    where m.team_id = candidate_team_id
      and s.auth_user_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
$$;

create or replace function private.can_access_icwc_team(candidate_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_icwc_team_teacher(candidate_team_id))
    or (select private.is_icwc_team_member(candidate_team_id));
$$;

create or replace function private.can_access_icwc_activity(candidate_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.icwc_teams t
    where t.activity_id = candidate_activity_id
      and (
        t.teacher_id = (select auth.uid())
        or exists (
          select 1
          from public.icwc_team_members m
          join public.students s on s.id = m.student_id
          where m.team_id = t.id
            and s.auth_user_id = (select auth.uid())
        )
      )
      and (select private.is_permanent_authenticated_user())
  );
$$;

create or replace function private.is_teacher_storage_path(candidate_teacher_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate_teacher_id = (select auth.uid())::text
    and exists (
      select 1 from public.teachers t where t.id = (select auth.uid())
    )
    and (select private.is_permanent_authenticated_user());
$$;

create or replace function private.is_icwc_team_teacher_path(candidate_team_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.icwc_teams t
    join public.teachers teacher on teacher.id = t.teacher_id
    where t.id::text = candidate_team_id
      and t.teacher_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
$$;

create or replace function private.is_icwc_team_member_path(candidate_team_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.icwc_team_members m
    join public.students s on s.id = m.student_id
    where m.team_id::text = candidate_team_id
      and s.auth_user_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
$$;

revoke all on function private.is_permanent_authenticated_user() from public, anon, authenticated;
revoke all on function private.is_teacher_for(uuid) from public, anon, authenticated;
revoke all on function private.is_student_for(uuid) from public, anon, authenticated;
revoke all on function private.is_icwc_team_teacher(uuid) from public, anon, authenticated;
revoke all on function private.is_icwc_team_member(uuid) from public, anon, authenticated;
revoke all on function private.can_access_icwc_team(uuid) from public, anon, authenticated;
revoke all on function private.can_access_icwc_activity(uuid) from public, anon, authenticated;
revoke all on function private.is_teacher_storage_path(text) from public, anon, authenticated;
revoke all on function private.is_icwc_team_teacher_path(text) from public, anon, authenticated;
revoke all on function private.is_icwc_team_member_path(text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_permanent_authenticated_user() to authenticated;
grant execute on function private.is_teacher_for(uuid) to authenticated;
grant execute on function private.is_student_for(uuid) to authenticated;
grant execute on function private.is_icwc_team_teacher(uuid) to authenticated;
grant execute on function private.is_icwc_team_member(uuid) to authenticated;
grant execute on function private.can_access_icwc_team(uuid) to authenticated;
grant execute on function private.can_access_icwc_activity(uuid) to authenticated;
grant execute on function private.is_teacher_storage_path(text) to authenticated;
grant execute on function private.is_icwc_team_teacher_path(text) to authenticated;
grant execute on function private.is_icwc_team_member_path(text) to authenticated;

alter table public.icwc_teams enable row level security;
alter table public.icwc_team_members enable row level security;
alter table public.icwc_student_submissions enable row level security;
alter table public.icwc_student_reviews enable row level security;
alter table public.icwc_draft_history enable row level security;
alter table public.icwc_final_records enable row level security;

revoke all on table public.icwc_teams from anon, authenticated;
revoke all on table public.icwc_team_members from anon, authenticated;
revoke all on table public.icwc_student_submissions from anon, authenticated;
revoke all on table public.icwc_student_reviews from anon, authenticated;
revoke all on table public.icwc_draft_history from anon, authenticated;
revoke all on table public.icwc_final_records from anon, authenticated;

grant select, insert, delete on table public.icwc_teams to authenticated;
grant update (
  report_text,
  report_file_path,
  report_file_name,
  report_file_mime_type,
  report_file_size_bytes,
  submitted_at
) on table public.icwc_teams to authenticated;

grant select, insert, delete on table public.icwc_team_members to authenticated;

grant select on table public.icwc_student_submissions to authenticated;
grant insert (
  team_id,
  teacher_id,
  activity_id,
  student_id,
  reflection_text,
  submitted_at
) on table public.icwc_student_submissions to authenticated;
grant update (reflection_text, submitted_at)
  on table public.icwc_student_submissions to authenticated;

grant select, insert, delete on table public.icwc_student_reviews to authenticated;
grant update (teacher_comment, draft_focus)
  on table public.icwc_student_reviews to authenticated;

grant select, insert on table public.icwc_draft_history to authenticated;

grant select, insert, delete on table public.icwc_final_records to authenticated;
grant update (final_text, published_at)
  on table public.icwc_final_records to authenticated;

-- A signed-in user may no longer self-assign the teacher role.
drop policy if exists teachers_insert_own on public.teachers;
revoke insert on table public.teachers from authenticated;

drop policy if exists teachers_select_own on public.teachers;
drop policy if exists teachers_update_own on public.teachers;
drop policy if exists students_select_own on public.students;
drop policy if exists students_insert_own on public.students;
drop policy if exists students_update_own on public.students;
drop policy if exists students_delete_own on public.students;
drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_insert_own on public.activities;
drop policy if exists activities_update_own on public.activities;
drop policy if exists activities_delete_own on public.activities;
drop policy if exists student_reports_select_own on public.student_reports;
drop policy if exists student_reports_insert_own on public.student_reports;
drop policy if exists student_reports_update_own on public.student_reports;
drop policy if exists student_reports_delete_own on public.student_reports;
drop policy if exists activity_records_select_own on public.activity_records;
drop policy if exists activity_records_insert_own on public.activity_records;
drop policy if exists activity_records_update_own on public.activity_records;
drop policy if exists activity_records_delete_own on public.activity_records;

create policy teachers_select_approved_self
on public.teachers
for select
to authenticated
using ((select private.is_teacher_for(id)));

create policy teachers_update_approved_self
on public.teachers
for update
to authenticated
using ((select private.is_teacher_for(id)))
with check ((select private.is_teacher_for(id)) and role = 'TEACHER');

create policy students_select_teacher_or_linked_self
on public.students
for select
to authenticated
using (
  (select private.is_teacher_for(teacher_id))
  or (select private.is_student_for(id))
);

create policy students_insert_approved_teacher
on public.students
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy students_update_approved_teacher
on public.students
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy students_delete_approved_teacher
on public.students
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy activities_select_teacher_or_icwc_member
on public.activities
for select
to authenticated
using (
  (select private.is_teacher_for(teacher_id))
  or (
    code = 'AUTONOMOUS_ICAN_WECAN'
    and (select private.can_access_icwc_activity(id))
  )
);

create policy activities_insert_approved_teacher
on public.activities
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy activities_update_approved_teacher
on public.activities
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy activities_delete_approved_teacher
on public.activities
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy student_reports_select_approved_teacher
on public.student_reports
for select
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy student_reports_insert_approved_teacher
on public.student_reports
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy student_reports_update_approved_teacher
on public.student_reports
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy student_reports_delete_approved_teacher
on public.student_reports
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy activity_records_select_approved_teacher
on public.activity_records
for select
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy activity_records_insert_approved_teacher
on public.activity_records
for insert
to authenticated
with check (
  (select private.is_teacher_for(teacher_id))
  and final_text is null
);

create policy activity_records_update_approved_teacher
on public.activity_records
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy activity_records_delete_approved_teacher
on public.activity_records
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_teams_select_authorized
on public.icwc_teams
for select
to authenticated
using ((select private.can_access_icwc_team(id)));

create policy icwc_teams_insert_teacher
on public.icwc_teams
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_teams_update_authorized
on public.icwc_teams
for update
to authenticated
using ((select private.can_access_icwc_team(id)))
with check ((select private.can_access_icwc_team(id)));

create policy icwc_teams_delete_teacher
on public.icwc_teams
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_team_members_select_authorized
on public.icwc_team_members
for select
to authenticated
using ((select private.can_access_icwc_team(team_id)));

create policy icwc_team_members_insert_teacher
on public.icwc_team_members
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_team_members_delete_teacher
on public.icwc_team_members
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_student_submissions_select_teacher_or_self
on public.icwc_student_submissions
for select
to authenticated
using (
  (select private.is_teacher_for(teacher_id))
  or (select private.is_student_for(student_id))
);

create policy icwc_student_submissions_insert_self
on public.icwc_student_submissions
for insert
to authenticated
with check (
  (select private.is_student_for(student_id))
  and (select private.is_icwc_team_member(team_id))
);

create policy icwc_student_submissions_update_self
on public.icwc_student_submissions
for update
to authenticated
using ((select private.is_student_for(student_id)))
with check (
  (select private.is_student_for(student_id))
  and (select private.is_icwc_team_member(team_id))
);

create policy icwc_student_reviews_select_teacher
on public.icwc_student_reviews
for select
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_student_reviews_insert_teacher
on public.icwc_student_reviews
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_student_reviews_update_teacher
on public.icwc_student_reviews
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_student_reviews_delete_teacher
on public.icwc_student_reviews
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_draft_history_select_teacher
on public.icwc_draft_history
for select
to authenticated
using ((select private.is_teacher_for(teacher_id)));

create policy icwc_draft_history_insert_teacher
on public.icwc_draft_history
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_final_records_select_teacher_or_published_self
on public.icwc_final_records
for select
to authenticated
using (
  (select private.is_teacher_for(teacher_id))
  or (
    published_at is not null
    and (select private.is_student_for(student_id))
  )
);

create policy icwc_final_records_insert_teacher
on public.icwc_final_records
for insert
to authenticated
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_final_records_update_teacher
on public.icwc_final_records
for update
to authenticated
using ((select private.is_teacher_for(teacher_id)))
with check ((select private.is_teacher_for(teacher_id)));

create policy icwc_final_records_delete_teacher
on public.icwc_final_records
for delete
to authenticated
using ((select private.is_teacher_for(teacher_id)));

drop policy if exists student_reports_storage_select_own on storage.objects;
drop policy if exists student_reports_storage_insert_own on storage.objects;
drop policy if exists student_reports_storage_update_own on storage.objects;
drop policy if exists student_reports_storage_delete_own on storage.objects;

create policy student_reports_storage_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (
      owner_id = (select auth.uid())::text
      and (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    )
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
      )
    )
  )
);

create policy student_reports_storage_insert_authorized
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-reports'
  and (
    (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
      )
    )
  )
);

create policy student_reports_storage_update_authorized
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (
      owner_id = (select auth.uid())::text
      and (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    )
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
)
with check (
  bucket_id = 'student-reports'
  and (
    (
      owner_id = (select auth.uid())::text
      and (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    )
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
);

create policy student_reports_storage_delete_authorized
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-reports'
  and (
    (
      owner_id = (select auth.uid())::text
      and (select private.is_teacher_storage_path((storage.foldername(name))[1]))
    )
    or (
      (storage.foldername(name))[1] = 'icwc'
      and (
        (select private.is_icwc_team_teacher_path((storage.foldername(name))[2]))
        or (
          owner_id = (select auth.uid())::text
          and (select private.is_icwc_team_member_path((storage.foldername(name))[2]))
        )
      )
    )
  )
);

comment on table public.icwc_teams is
  'AUTONOMOUS_ICAN_WECAN 팀 공통 보고서와 비공개 원본 파일 metadata';
comment on table public.icwc_team_members is
  'ICWC 팀과 기존 학생 명단의 N:M 관계';
comment on table public.icwc_student_submissions is
  'ICWC 팀원별 개인 소감문 제출';
comment on table public.icwc_student_reviews is
  '담당 교사만 보는 학생별 코멘트와 현재 초안 생성 방향';
comment on table public.icwc_draft_history is
  '재생성 이력을 보존하는 변경 불가 AI 초안 기록';
comment on table public.icwc_final_records is
  '교사 검토 최종 문장과 학생 공개 시점을 분리한 학생 공개 가능 데이터';

comment on column public.icwc_student_reviews.teacher_comment is
  '학생에게 공개하지 않는 담당 교사 내부 코멘트';
comment on column public.icwc_student_reviews.draft_focus is
  '허용 값: 탐구내용 중심, 공동체역량 중심';
comment on column public.icwc_draft_history.draft_text is
  'AI 원본 초안. 최종 문장으로 덮어쓰지 않고 이력으로 보존한다.';
comment on column public.icwc_final_records.final_text is
  '교사가 저장한 최종 문장. published_at이 NULL이면 학생에게 보이지 않는다.';
comment on column public.icwc_final_records.published_at is
  'NULL은 저장만 된 비공개 상태, 값이 있으면 해당 학생에게 공개된 상태';
