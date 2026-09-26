# AI_school_report

고등학교 활동 기록 작성 보조 서비스의 공통 기반과 mock AI API입니다. Supabase 스키마, RLS, 비공개 Storage, 생성 DB 타입과 공통 데이터 서비스가 연결되어 있으며 실제 외부 LLM은 아직 연결하지 않았습니다.

## 공통 모델

- `src/types/domain.ts`: `Teacher`, `Student`, `Activity`, `StudentReport`, `ReportAnalysis`, `ActivityRecord`, `ActivityCategory`, `ActivityCode`
- `src/types/api.ts`: 두 POST API의 요청·응답 타입과 `AiApiContract`
- `src/lib/activities.ts`: 네 활동의 코드, 분류, 표시 이름, 설명 및 `getActivityDefinition`
- `src/mocks/data.ts`: 교사 1명, 학생 5명, 활동 4개, 보고서 3개, 분석·기록·API 요청·응답 샘플

공통 타입은 `src/types`에서 가져옵니다. 활동은 `ACTIVITIES`와 `getActivityDefinition`을 사용하고, 화면 시연이나 API 구현 중에는 `src/mocks`의 샘플을 사용할 수 있습니다. `ActivityRecord.analysis`는 분석 결과, `aiDraft`는 AI가 만든 원본 초안, `finalText`는 교사가 저장한 문장입니다. 저장 전 `finalText`는 `null`이며, 교사가 수정해 저장할 때 `aiDraft`는 유지해야 합니다.

## API 계약

| 경로 | 요청 타입 | 응답 타입 |
| --- | --- | --- |
| `POST /api/analyze-report` | `AnalyzeReportRequest` | `AnalyzeReportResponse` (`ReportAnalysis`) |
| `POST /api/generate-activity-record` | `GenerateActivityRecordRequest` | `GenerateActivityRecordResponse` |

두 경로는 `src/app/api`의 Next.js Route Handler로 실행됩니다. 성공 응답은 위 타입의 JSON 본문 그대로이며, 오류 응답은 `{ "error": { "code": "...", "message": "..." } }` 형식입니다. 잘못된 JSON·요청은 400, 초안에 쓸 행동 근거가 없으면 422, provider 응답 형식이 잘못되면 502를 반환합니다.

`src/services/ai`는 분석과 초안 작성 서비스를 분리합니다. `src/lib/ai/provider.ts`의 `AIProvider` 인터페이스에 현재 `MockAIProvider`를 연결했습니다. 활동별 지침과 동작 단서는 `src/lib/ai/context.ts`에 모아 두었고, 두 서비스는 공통 흐름을 사용합니다. mock 분석은 보고서 문장에서 행동 단서를 찾고 해당 원문을 `evidence`로 반환합니다. 근거 없이 지식·역량·특기사항을 만들지 않으며, mock 초안은 확인된 근거 문장을 이어 붙입니다. 이 결과는 교사가 수정할 출발점이며 실제 AI 분석 품질을 뜻하지 않습니다.

요청 JSON의 필수 필드와 분석 결과 구조, provider 응답 구조를 런타임에 검증합니다. 현재 AI Route Handler는 mock provider만 사용하며 DB 저장 서비스와 직접 연결되어 있지 않으므로 학생 실데이터 대신 시연 데이터로 사용하세요.

## Supabase / Database

- `supabase/migrations/`: 교사, 학생, 활동, 학생 보고서, 활동 기록 스키마와 RLS 정책
- `src/types/database.ts`: 연결된 원격 스키마에서 CLI로 자동 생성한 Supabase DB 타입
- `src/lib/supabase/client.ts`: Client Component용 브라우저 클라이언트
- `src/lib/supabase/server.ts`: Server Component, Server Action, Route Handler용 쿠키 기반 서버 클라이언트
- `src/services/database/`: 공통 CRUD, 활동 초기화, 비공개 보고서 업로드 및 signed URL 함수

보고서 파일은 public URL 대신 비공개 `student-reports` 버킷의 storage path를 DB에 저장합니다. 객체 경로의 첫 폴더는 로그인한 교사 ID여야 하며, RLS가 다른 교사의 데이터와 파일 접근을 차단합니다.

`ActivityRecord.analysis`, `aiDraft`, `finalText`는 DB의 `analysis_json`, `ai_draft`, `final_text`에 각각 저장됩니다. 인증 사용자에게는 `final_text` 열만 UPDATE 권한이 있으므로 AI 원본 분석과 초안을 교사 수정으로 덮어쓸 수 없습니다.

로컬 환경변수는 `.env.example`을 복사해 설정합니다. publishable key만 브라우저에서 사용하며 service role 또는 secret key는 클라이언트에 두지 않습니다.

## 확인

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

`npm run dev`로 로컬 API를 실행합니다. `npm run build`는 Next.js 빌드이고, 공통 타입 모듈만 컴파일하려면 `npm run build:types`를 사용합니다.
