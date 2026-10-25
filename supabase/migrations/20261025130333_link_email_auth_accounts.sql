alter table public.teachers
  drop constraint teachers_id_fkey;

alter table public.teachers
  alter column id set default gen_random_uuid();

alter table public.teachers
  add column auth_user_id uuid references auth.users (id) on delete set null;

alter table public.teachers
  add constraint teachers_auth_user_id_unique unique (auth_user_id);

-- Preserve already-permanent accounts if the project contains any. Legacy
-- anonymous teacher IDs remain stable domain IDs but are intentionally not
-- authorized after the email/password transition.
update public.teachers t
set auth_user_id = t.id
from auth.users u
where u.id = t.id
  and not u.is_anonymous
  and u.email is not null;

create or replace function private.ensure_teacher_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = new.auth_user_id
      and not u.is_anonymous
      and u.email is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Teacher must be linked to a permanent email Auth user';
  end if;

  if exists (
    select 1
    from public.students s
    where s.auth_user_id = new.auth_user_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Auth user is already linked to a student';
  end if;

  return new;
end;
$$;

create or replace function private.ensure_student_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = new.auth_user_id
      and not u.is_anonymous
      and u.email is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Student must be linked to a permanent email Auth user';
  end if;

  if exists (
    select 1
    from public.teachers t
    where t.auth_user_id = new.auth_user_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Auth user is already linked to a teacher';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_teacher_auth_link() from public, anon, authenticated;
revoke all on function private.ensure_student_auth_link() from public, anon, authenticated;

create trigger teachers_validate_auth_link
before insert or update of auth_user_id on public.teachers
for each row execute function private.ensure_teacher_auth_link();

create trigger students_validate_auth_link
before insert or update of auth_user_id on public.students
for each row execute function private.ensure_student_auth_link();

create or replace function private.is_teacher_for(candidate_teacher_id uuid)
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
      from public.teachers t
      where t.id = candidate_teacher_id
        and t.auth_user_id = (select auth.uid())
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
      and teacher.auth_user_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
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
        exists (
          select 1
          from public.teachers teacher
          where teacher.id = t.teacher_id
            and teacher.auth_user_id = (select auth.uid())
        )
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
  select exists (
    select 1
    from public.teachers t
    where t.id::text = candidate_teacher_id
      and t.auth_user_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
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
      and teacher.auth_user_id = (select auth.uid())
      and (select private.is_permanent_authenticated_user())
  );
$$;

comment on column public.teachers.id is
  '학생·활동·기록이 참조하는 안정적인 교사 domain ID. Auth UID와 분리한다.';
comment on column public.teachers.auth_user_id is
  '관리자가 연결하는 이메일/비밀번호 Supabase Auth UID. 한 Auth 사용자와 한 교사를 1:1로 연결한다.';
