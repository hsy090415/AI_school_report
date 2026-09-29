# AI·DB·교사 화면 연동 계약

현재 `feat/ai` 작업 트리는 DB 팀의 `feat/database` 구현을 가져오고, 익명 Supabase 세션을 내부에서 자동 생성해 교사 화면과 DB를 연결한다. DB 스키마 자체는 변경하지 않았다. 발표자료 파일 원본은 저장하지 않는다.

## 현재 연결된 API

- `POST /api/teacher/bootstrap`: 익명 Supabase 사용자로 교사 프로필, 기본 활동 4개와 첫 접속 시 체험 학생 5명을 준비하고 교사·학생·활동·기록 상태 반환
- `GET /api/teacher/bootstrap`: 현재 교사·학생·활동 목록 조회
- `GET /api/teacher/students`: 학생 목록 조회
- `POST /api/teacher/students`: 학생 등록 (`name`, `grade`, `classNo`, `studentNo`)
- `GET /api/teacher/workspace?studentId=...&activityId=...`: 활동별 보고서·기록 조회
- `POST /api/teacher/workspace`: `{ studentId, activityId, activityCode, reportText, analysis, aiDraft }` 저장. AI 원본 기록이 이미 있으면 409를 반환한다. 보고서만 저장된 경우에는 내용이 정확히 같을 때 초안 저장을 재시도한다.
- `PATCH /api/teacher/workspace`: `{ studentId, activityId, finalText }`로 교사 수정 문구 저장. `aiDraft`는 변경하지 않음

모든 DB API는 서버에서 Supabase Auth 사용자를 검증한다. `service_role` 키는 사용하지 않는다. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 설정이 필요하다. Supabase 프로젝트의 **Allow anonymous sign-ins**도 활성화해야 한다.

DNA 분석 응답에는 `analysis`와 `extractedText`가 있고, DNA 초안 응답에는 `draft`가 있다. I CAN WE CAN·1인 1주제·교과창체 초안 응답에는 저장에 바로 쓸 수 있는 `analysis`와 `reportText`를 추가했다.

## 교사 화면 연결

`TeacherFlow`가 브라우저의 익명 세션을 자동 생성하고 bootstrap 응답을 사용한다. `ActivityWorkspace`는 기존 기록을 조회하며, 초안 생성 직후 분석·원문 텍스트·AI 원본을 저장한다. 교사 수정 버튼은 `finalText`를 DB에 저장한다. 활동별 원문 답변은 텍스트 JSON으로 보관하며 업로드한 PDF/PPTX/XLSX/DOCX/HWP 파일 자체는 보관하지 않는다.

## DB 담당 변경이 필요한 사항

- `activity_records.ai_draft`가 수정 불가이고 학생·활동당 1개만 허용된다. 재생성 이력 보존, 기존 원본 교체, 재생성 금지 중 정책을 정해야 한다. 현재 통합 API는 기존 기록을 덮어쓰지 않고 409를 반환한다.

2026-09-30 확인 시 Supabase 프로젝트의 **Allow anonymous sign-ins**를 활성화했다. 브라우저에서 첫 접속 후 Auth 사용자 1명, 체험 교사 1명, 학생 5명, 활동 4명이 생성된 것을 확인했다. 공개 연결 설정은 로컬 `.env.local`에만 추가했다. 보고서와 활동 기록 저장은 아직 실제 데이터로 검증하지 않았다.
