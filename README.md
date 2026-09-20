# AI_school_report

고등학교 활동 기록 작성 보조 서비스의 공통 기반과 mock AI API입니다. 실제 Supabase와 외부 LLM은 연결하지 않았습니다.

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

요청 JSON의 필수 필드와 분석 결과 구조, provider 응답 구조를 런타임에 검증합니다. 현재 인증이나 DB 저장은 없으므로 학생 실데이터 대신 시연 데이터로 사용하세요.

## 확인

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

`npm run dev`로 로컬 API를 실행합니다. `npm run build`는 Next.js 빌드이고, 공통 타입 모듈만 컴파일하려면 `npm run build:types`를 사용합니다.
