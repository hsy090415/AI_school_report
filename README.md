# AI_school_report

고등학교 활동 기록 작성 보조 서비스의 공통 기반입니다. 현재는 타입, 활동 정의, mock 데이터만 있으며 실제 Supabase, LLM, Next.js API route는 연결하지 않았습니다.

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

API route를 구현할 때 위 타입을 그대로 사용합니다. 타입은 컴파일 시점 계약이며, 외부 입력과 AI 응답의 런타임 검증은 실제 API 구현 단계에서 추가해야 합니다.

## 확인

```bash
npm ci
npm run typecheck
npm run build
```

현재 빌드는 공통 TypeScript 모듈을 `dist/`에 컴파일합니다. Next.js 앱이 추가되면 앱 빌드 명령을 별도로 연결해야 합니다.
