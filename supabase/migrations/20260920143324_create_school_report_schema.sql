create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null constraint teachers_name_not_blank check (char_length(btrim(name)) between 1 and 100),
  email text not null constraint teachers_email_not_blank check (char_length(btrim(email)) between 3 and 320),
  role text not null default 'TEACHER' constraint teachers_role_valid check (role = 'TEACHER'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teachers_email_unique_idx on public.teachers (lower(email));

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null constraint students_name_not_blank check (char_length(btrim(name)) between 1 and 100),
  grade smallint not null constraint students_grade_valid check (grade between 1 and 3),
  class_no smallint not null constraint students_class_no_valid check (class_no between 1 and 30),
  student_no smallint not null constraint students_student_no_valid check (student_no between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_teacher_roster_unique unique (teacher_id, grade, class_no, student_no),
  constraint students_id_teacher_unique unique (id, teacher_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  code text not null constraint activities_code_valid check (
    code in (
      'AUTONOMOUS_ONE_TOPIC',
      'AUTONOMOUS_ICAN_WECAN',
      'CAREER_DNA',
      'CAREER_CURRICULUM_CREATIVE'
    )
  ),
  category text not null constraint activities_category_valid check (category in ('AUTONOMOUS', 'CAREER')),
  title text not null constraint activities_title_not_blank check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_code_category_match check (
    (code like 'AUTONOMOUS_%' and category = 'AUTONOMOUS')
    or (code like 'CAREER_%' and category = 'CAREER')
  ),
  constraint activities_teacher_code_unique unique (teacher_id, code),
  constraint activities_id_teacher_unique unique (id, teacher_id)
);

create table public.student_reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null,
  activity_id uuid not null,
  report_text text not null default '',
  report_file_path text,
  report_file_name text,
  report_file_mime_type text,
  report_file_size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_reports_student_teacher_fkey
    foreign key (student_id, teacher_id)
    references public.students (id, teacher_id)
    on delete cascade,
  constraint student_reports_activity_teacher_fkey
    foreign key (activity_id, teacher_id)
    references public.activities (id, teacher_id)
    on delete cascade,
  constraint student_reports_student_activity_unique unique (student_id, activity_id),
  constraint student_reports_content_present check (
    char_length(btrim(report_text)) > 0 or report_file_path is not null
  ),
  constraint student_reports_file_metadata_complete check (
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
      and char_length(btrim(report_file_mime_type)) > 0
      and report_file_size_bytes is not null
      and report_file_size_bytes > 0
      and split_part(report_file_path, '/', 1) = teacher_id::text
    )
  )
);

create unique index student_reports_file_path_unique_idx
  on public.student_reports (report_file_path)
  where report_file_path is not null;

create table public.activity_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null,
  activity_id uuid not null,
  analysis_json jsonb not null,
  ai_draft text not null constraint activity_records_ai_draft_not_blank check (char_length(btrim(ai_draft)) > 0),
  final_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_records_student_teacher_fkey
    foreign key (student_id, teacher_id)
    references public.students (id, teacher_id)
    on delete cascade,
  constraint activity_records_activity_teacher_fkey
    foreign key (activity_id, teacher_id)
    references public.activities (id, teacher_id)
    on delete cascade,
  constraint activity_records_student_activity_unique unique (student_id, activity_id),
  constraint activity_records_analysis_shape_valid check (
    jsonb_typeof(analysis_json) = 'object'
    and jsonb_typeof(analysis_json -> 'topic') = 'string'
    and jsonb_typeof(analysis_json -> 'studentActions') = 'array'
    and jsonb_typeof(analysis_json -> 'knowledge') = 'array'
    and jsonb_typeof(analysis_json -> 'skills') = 'array'
    and jsonb_typeof(analysis_json -> 'notablePoints') = 'array'
  ),
  constraint activity_records_final_text_not_blank check (
    final_text is null or char_length(btrim(final_text)) > 0
  )
);

create index student_reports_activity_id_idx on public.student_reports (activity_id);
create index student_reports_teacher_updated_at_idx on public.student_reports (teacher_id, updated_at desc);
create index activity_records_activity_id_idx on public.activity_records (activity_id);
create index activity_records_teacher_updated_at_idx on public.activity_records (teacher_id, updated_at desc);

create trigger teachers_set_updated_at
before update on public.teachers
for each row execute function private.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function private.set_updated_at();

create trigger activities_set_updated_at
before update on public.activities
for each row execute function private.set_updated_at();

create trigger student_reports_set_updated_at
before update on public.student_reports
for each row execute function private.set_updated_at();

create trigger activity_records_set_updated_at
before update on public.activity_records
for each row execute function private.set_updated_at();

alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.activities enable row level security;
alter table public.student_reports enable row level security;
alter table public.activity_records enable row level security;

revoke all on table public.teachers from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.activities from anon, authenticated;
revoke all on table public.student_reports from anon, authenticated;
revoke all on table public.activity_records from anon, authenticated;

grant usage on schema public to authenticated;

grant select, insert on table public.teachers to authenticated;
grant update (name, email) on table public.teachers to authenticated;

grant select, insert, delete on table public.students to authenticated;
grant update (name, grade, class_no, student_no) on table public.students to authenticated;

grant select, insert, delete on table public.activities to authenticated;
grant update (title, description) on table public.activities to authenticated;

grant select, insert, delete on table public.student_reports to authenticated;
grant update (
  report_text,
  report_file_path,
  report_file_name,
  report_file_mime_type,
  report_file_size_bytes
) on table public.student_reports to authenticated;

grant select, insert, delete on table public.activity_records to authenticated;
grant update (final_text) on table public.activity_records to authenticated;

create policy teachers_select_own
on public.teachers
for select
to authenticated
using ((select auth.uid()) = id);

create policy teachers_insert_own
on public.teachers
for insert
to authenticated
with check ((select auth.uid()) = id and role = 'TEACHER');

create policy teachers_update_own
on public.teachers
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = 'TEACHER');

create policy students_select_own
on public.students
for select
to authenticated
using ((select auth.uid()) = teacher_id);

create policy students_insert_own
on public.students
for insert
to authenticated
with check ((select auth.uid()) = teacher_id);

create policy students_update_own
on public.students
for update
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy students_delete_own
on public.students
for delete
to authenticated
using ((select auth.uid()) = teacher_id);

create policy activities_select_own
on public.activities
for select
to authenticated
using ((select auth.uid()) = teacher_id);

create policy activities_insert_own
on public.activities
for insert
to authenticated
with check ((select auth.uid()) = teacher_id);

create policy activities_update_own
on public.activities
for update
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy activities_delete_own
on public.activities
for delete
to authenticated
using ((select auth.uid()) = teacher_id);

create policy student_reports_select_own
on public.student_reports
for select
to authenticated
using ((select auth.uid()) = teacher_id);

create policy student_reports_insert_own
on public.student_reports
for insert
to authenticated
with check ((select auth.uid()) = teacher_id);

create policy student_reports_update_own
on public.student_reports
for update
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy student_reports_delete_own
on public.student_reports
for delete
to authenticated
using ((select auth.uid()) = teacher_id);

create policy activity_records_select_own
on public.activity_records
for select
to authenticated
using ((select auth.uid()) = teacher_id);

create policy activity_records_insert_own
on public.activity_records
for insert
to authenticated
with check (
  (select auth.uid()) = teacher_id
  and final_text is null
);

create policy activity_records_update_own
on public.activity_records
for update
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy activity_records_delete_own
on public.activity_records
for delete
to authenticated
using ((select auth.uid()) = teacher_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'student-reports',
  'student-reports',
  false,
  10485760,
  array[
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/haansofthwp',
    'application/x-hwp',
    'application/vnd.hancom.hwp',
    'application/vnd.hancom.hwpx'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy student_reports_storage_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-reports'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy student_reports_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-reports'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy student_reports_storage_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-reports'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'student-reports'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy student_reports_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-reports'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

comment on table public.teachers is 'Supabase Auth 사용자와 1:1로 연결되는 교사 프로필';
comment on table public.students is '담당 교사가 관리하는 학생 명단';
comment on table public.activities is '담당 교사별 학교생활기록부 활동';
comment on table public.student_reports is '학생이 활동별로 제출한 보고서와 비공개 Storage 경로';
comment on table public.activity_records is 'AI 분석, 원본 초안, 교사 확정 문구를 분리한 활동 기록';

comment on column public.activity_records.analysis_json is 'ReportAnalysis 구조의 JSON 원본';
comment on column public.activity_records.ai_draft is 'AI가 최초 생성한 원본 초안이며 일반 사용자에게 UPDATE 권한이 없음';
comment on column public.activity_records.final_text is '담당 교사가 검토·수정해 저장한 최종 문구. 저장 전에는 NULL';
