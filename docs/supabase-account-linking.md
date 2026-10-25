# Supabase 이메일 계정 연결

아래 작업은 브라우저가 아니라 Supabase Dashboard의 Auth/SQL Editor 또는 동등한 관리자 절차에서만 수행한다. 이메일, 이름, `user_metadata`로 권한을 추론하지 않고 Auth UID를 DB 행에 직접 연결한다.

## 교사 계정

1. Supabase Dashboard의 **Authentication → Users**에서 이메일/비밀번호 사용자를 만든다.
2. 생성된 사용자의 **User UID**를 복사한다.
3. 연결할 기존 교사를 교사 domain ID와 학교 내부 정보로 확인한다. 현재 기존 교사는 예전 익명 Auth UID를 domain ID로 유지하므로, `teachers.id`를 새 UID로 바꾸지 않는다.
4. SQL Editor에서 관리자 권한으로 다음을 실행한다.

```sql
begin;

select id, email, is_anonymous
from auth.users
where id = '<AUTH_USER_UID>'::uuid;

select id, name, email, auth_user_id
from public.teachers
where id = '<TEACHER_DOMAIN_ID>'::uuid;

update public.teachers
set auth_user_id = '<AUTH_USER_UID>'::uuid
where id = '<TEACHER_DOMAIN_ID>'::uuid
  and auth_user_id is null;

-- 반드시 1행이며 두 UID가 의도한 값인지 확인한다.
select id, name, email, auth_user_id
from public.teachers
where id = '<TEACHER_DOMAIN_ID>'::uuid;

commit;
```

`teachers.auth_user_id`는 UNIQUE이며 영구 이메일 Auth 사용자만 허용한다. 일반 `authenticated` 사용자는 `teachers`를 INSERT하거나 `auth_user_id`를 변경할 권한이 없다. 신규 교사라면 관리자가 새 `teachers` 행을 만들고 `auth_user_id`를 지정한다.

## 학생 계정

1. Supabase Dashboard의 **Authentication → Users**에서 이메일/비밀번호 사용자를 만든다.
2. 기존 학생 명단에서 교사 domain ID, 학년, 반, 번호를 함께 사용해 대상 학생을 확인한다.
3. Auth의 **User UID**를 해당 학생 행의 `auth_user_id`에 관리자 권한으로 연결한다.

```sql
begin;

select id, email, is_anonymous
from auth.users
where id = '<AUTH_USER_UID>'::uuid;

select id, teacher_id, name, grade, class_no, student_no, auth_user_id
from public.students
where teacher_id = '<TEACHER_DOMAIN_ID>'::uuid
  and grade = 2
  and class_no = <CLASS_NO>
  and student_no = <STUDENT_NO>;

update public.students
set auth_user_id = '<AUTH_USER_UID>'::uuid
where id = '<STUDENT_ID>'::uuid
  and auth_user_id is null;

-- 반드시 1행인지 확인한다.
select id, teacher_id, name, grade, class_no, student_no, auth_user_id
from public.students
where id = '<STUDENT_ID>'::uuid;

commit;
```

`students.auth_user_id`는 UNIQUE이므로 같은 Auth UID를 여러 학생에게 연결할 수 없다. 교사와 학생 간 Auth UID 중복도 DB trigger가 차단한다. 학생 브라우저 세션에는 이 연결을 생성하거나 변경할 권한이 없다.

## 실제 이메일 세션 smoke test

위 절차로 연결한 계정의 자격 증명을 로컬 환경변수로만 설정한 뒤 `npm run test:supabase-access`를 실행한다. 스크립트는 데이터를 생성·수정·삭제하지 않고 교사/학생 연결, 학생의 교사 코멘트·AI 초안 차단, 공개된 자기 최종 문장만 조회, 비로그인 차단을 publishable key로 확인한다.

```text
SUPABASE_TEST_TEACHER_EMAIL
SUPABASE_TEST_TEACHER_PASSWORD
SUPABASE_TEST_STUDENT_EMAIL
SUPABASE_TEST_STUDENT_PASSWORD
```

이 값은 `.env` 예시, migration, seed 또는 Git에 커밋하지 않는다.

## SMTP

Supabase 기본 이메일 발송 서비스는 프로젝트 설정과 템플릿을 시험하기 위한 비운영용 서비스다. 현재 공식 문서 기준으로 팀에 사전 승인된 주소만 발송 가능하고 기본 제한은 시간당 2건이며 SLA가 없다. 실제 학생·교사의 이메일 인증이나 비밀번호 재설정 메일을 운영 환경에서 보내려면 Custom SMTP를 설정한다.

- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/passwords
