"use client";

import { useMemo, useState } from "react";

import { ACTIVITIES } from "../../lib/activities";
import {
  mockActivities,
  mockActivityRecords,
  mockStudentReports,
  mockStudents,
  mockTeachers,
} from "../../mocks";
import type {
  Activity,
  ActivityCategory,
  AiApiErrorResponse,
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  GenerateActivityRecordRequest,
  GenerateActivityRecordResponse,
  ReportAnalysis,
  Student,
} from "../../types";

type FlowStep = "home" | "students" | "activities" | "workspace";
type AsyncStatus = "idle" | "loading" | "success" | "error";
type ClassFilter = "all" | "2-1" | "2-2";

function requireMockItem<T>(item: T | undefined, label: string): T {
  if (!item) throw new Error(`교사 흐름에 필요한 ${label} mock 데이터가 없습니다.`);
  return item;
}

const teacher = requireMockItem(mockTeachers[0], "교사");
const initialStudent = requireMockItem(mockStudents[0], "학생");
const initialActivity = requireMockItem(mockActivities[0], "활동");

async function postJson<TRequest, TResponse extends object>(url: string, body: TRequest): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TResponse | AiApiErrorResponse;
  if (!response.ok) {
    const message = "error" in payload ? payload.error.message : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return payload as TResponse;
}

function categoryLabel(category: ActivityCategory) {
  return category === "AUTONOMOUS" ? "자율활동" : "진로활동";
}

function studentDetail(student: Student) {
  return `${student.grade}학년 ${student.classNo}반 ${student.studentNo}번`;
}

export function TeacherFlow() {
  const [step, setStep] = useState<FlowStep>("home");
  const [selectedStudent, setSelectedStudent] = useState<Student>(initialStudent);
  const [selectedActivity, setSelectedActivity] = useState<Activity>(initialActivity);
  const [classFilter, setClassFilter] = useState<ClassFilter>("2-1");
  const [searchQuery, setSearchQuery] = useState("");
  const [reportText, setReportText] = useState("");
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null);
  const [aiDraft, setAiDraft] = useState("");
  const [editorText, setEditorText] = useState("");
  const [finalText, setFinalText] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AsyncStatus>("idle");
  const [draftStatus, setDraftStatus] = useState<AsyncStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<AsyncStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showOriginalDraft, setShowOriginalDraft] = useState(false);

  const filteredStudents = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return mockStudents.filter((student) => {
      const matchesClass =
        classFilter === "all" || `${student.grade}-${student.classNo}` === classFilter;
      const matchesSearch =
        !normalized ||
        student.name.toLowerCase().includes(normalized) ||
        String(student.studentNo).includes(normalized);
      return matchesClass && matchesSearch;
    });
  }, [classFilter, searchQuery]);

  const groupedActivities = useMemo(
    () => ({
      AUTONOMOUS: mockActivities.filter((activity) => activity.category === "AUTONOMOUS"),
      CAREER: mockActivities.filter((activity) => activity.category === "CAREER"),
    }),
    [],
  );

  function openWorkspace(activity = selectedActivity, student = selectedStudent) {
    const report = mockStudentReports.find(
      (item) => item.studentId === student.id && item.activityId === activity.id,
    );
    const record = mockActivityRecords.find(
      (item) => item.studentId === student.id && item.activityId === activity.id,
    );

    setReportText(report?.reportText ?? "");
    setAnalysis(record?.analysis ?? null);
    setAiDraft(record?.aiDraft ?? "");
    setFinalText(record?.finalText ?? null);
    setEditorText(record?.finalText ?? record?.aiDraft ?? "");
    setAnalysisStatus(record ? "success" : "idle");
    setDraftStatus(record ? "success" : "idle");
    setSaveStatus(record?.finalText ? "success" : "idle");
    setErrorMessage("");
    setShowOriginalDraft(false);
    setStep("workspace");
  }

  async function analyzeCurrentReport() {
    if (!reportText.trim()) return;
    setAnalysisStatus("loading");
    setDraftStatus("idle");
    setSaveStatus("idle");
    setAnalysis(null);
    setAiDraft("");
    setEditorText("");
    setFinalText(null);
    setErrorMessage("");

    const request: AnalyzeReportRequest = {
      studentId: selectedStudent.id,
      activityId: selectedActivity.id,
      activityCode: selectedActivity.code,
      activityTitle: selectedActivity.title,
      reportText,
    };

    try {
      const result = await postJson<AnalyzeReportRequest, AnalyzeReportResponse>(
        "/api/analyze-report",
        request,
      );
      setAnalysis(result);
      setAnalysisStatus("success");
    } catch (error) {
      setAnalysisStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "AI 분석에 실패했습니다.");
    }
  }

  async function generateDraft() {
    if (!analysis) return;
    setDraftStatus("loading");
    setSaveStatus("idle");
    setErrorMessage("");

    const request: GenerateActivityRecordRequest = {
      studentId: selectedStudent.id,
      activityId: selectedActivity.id,
      activityCode: selectedActivity.code,
      analysis,
    };

    try {
      const result = await postJson<
        GenerateActivityRecordRequest,
        GenerateActivityRecordResponse
      >("/api/generate-activity-record", request);
      setAiDraft(result.draft);
      setEditorText(result.draft);
      setFinalText(null);
      setDraftStatus("success");
    } catch (error) {
      setDraftStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "초안 생성에 실패했습니다.");
    }
  }

  function saveFinalText() {
    if (!editorText.trim()) return;
    setSaveStatus("loading");
    window.setTimeout(() => {
      setFinalText(editorText);
      setSaveStatus("success");
    }, 450);
  }

  function updateEditor(value: string) {
    setEditorText(value);
    setSaveStatus(finalText === value ? "success" : "idle");
  }

  const editorLabel =
    finalText !== null && finalText === editorText
      ? "저장 완료"
      : editorText && editorText !== aiDraft
        ? "교사 수정 중"
        : "AI 생성 초안";

  return (
    <div className="app-shell">
      <Header
        active={step === "home" ? "dashboard" : "write"}
        onDashboard={() => setStep("home")}
        onWrite={() => setStep("students")}
      />
      {step === "home" && (
        <HomeScreen
          onStart={() => setStep("students")}
          onContinue={() => openWorkspace(initialActivity, initialStudent)}
        />
      )}
      {step === "students" && (
        <StudentSelection
          classFilter={classFilter}
          filteredStudents={filteredStudents}
          searchQuery={searchQuery}
          selectedStudent={selectedStudent}
          onClassFilter={setClassFilter}
          onSearch={setSearchQuery}
          onSelect={setSelectedStudent}
          onNext={() => setStep("activities")}
        />
      )}
      {step === "activities" && (
        <ActivitySelection
          groupedActivities={groupedActivities}
          selectedActivity={selectedActivity}
          selectedStudent={selectedStudent}
          onBack={() => setStep("students")}
          onChangeStudent={() => setStep("students")}
          onSelect={setSelectedActivity}
          onNext={() => openWorkspace()}
        />
      )}
      {step === "workspace" && (
        <Workspace
          activity={selectedActivity}
          student={selectedStudent}
          reportText={reportText}
          analysis={analysis}
          aiDraft={aiDraft}
          editorText={editorText}
          finalText={finalText}
          editorLabel={editorLabel}
          analysisStatus={analysisStatus}
          draftStatus={draftStatus}
          saveStatus={saveStatus}
          errorMessage={errorMessage}
          showOriginalDraft={showOriginalDraft}
          onBack={() => setStep("activities")}
          onReportChange={(value) => {
            setReportText(value);
            setAnalysis(null);
            setAiDraft("");
            setEditorText("");
            setFinalText(null);
            setAnalysisStatus("idle");
            setDraftStatus("idle");
            setSaveStatus("idle");
            setErrorMessage("");
          }}
          onAnalyze={analyzeCurrentReport}
          onGenerate={generateDraft}
          onEditorChange={updateEditor}
          onSave={saveFinalText}
          onToggleOriginal={() => setShowOriginalDraft((value) => !value)}
        />
      )}
    </div>
  );
}

function Header({
  active,
  onDashboard,
  onWrite,
}: {
  active: "dashboard" | "write";
  onDashboard: () => void;
  onWrite: () => void;
}) {
  return (
    <header className="system-header">
      <button className="brand" type="button" onClick={onDashboard}>
        <span className="brand-icon" aria-hidden="true">▤</span>
        <span>학생부 기록 도우미</span>
      </button>
      <nav className="main-nav" aria-label="주요 메뉴">
        <button className={active === "dashboard" ? "active" : ""} onClick={onDashboard}>대시보드</button>
        <button className={active === "write" ? "active" : ""} onClick={onWrite}>학생부 작성</button>
        <button type="button">기록 현황 조회</button>
      </nav>
      <div className="teacher-profile">
        <span>{teacher.name}님 (2학년 1반 담임)</span>
        <span className="badge teacher">교사</span>
      </div>
    </header>
  );
}

function HomeScreen({ onStart, onContinue }: { onStart: () => void; onContinue: () => void }) {
  return (
    <main className="page-container">
      <section className="welcome-row">
        <div>
          <h1>{teacher.name}님, 안녕하세요</h1>
          <p>오늘도 성실하고 차분한 학교생활기록부 작성을 응원합니다.</p>
        </div>
        <button className="button primary" onClick={onStart}>학생 기록 작성하기</button>
      </section>

      <section className="section-block">
        <h2>담당 활동 요약</h2>
        <div className="activity-summary-grid">
          {ACTIVITIES.map((activity) => (
            <article className={`summary-card ${activity.category.toLowerCase()}`} key={activity.code}>
              <div className="card-row">
                <span className={`badge ${activity.category.toLowerCase()}`}>{categoryLabel(activity.category)}</span>
                <span className="muted">대상 28명</span>
              </div>
              <div>
                <h3>{activity.title}</h3>
                <p>{activity.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="record-columns">
        <div className="section-block">
          <h2>작성 중인 기록</h2>
          <article className="record-card">
            <div className="card-row"><strong>김하늘 (2학년 1반 3번)</strong><span className="badge autonomous">1인 1주제 융합활동</span></div>
            <p>교내 일회용품 사용 사례를 살피고 재사용 가능한 대안을 비교하여 발표한 활동 기록...</p>
            <div className="card-row"><span className="muted">최종 수정: 20분 전</span><button className="text-button" onClick={onContinue}>이어 쓰기</button></div>
          </article>
        </div>
        <div className="section-block">
          <h2>최근 작성 완료된 기록</h2>
          <article className="record-card completed">
            <div className="card-row"><strong>박지민 (2학년 1반 12번)</strong><span className="badge career">DNA</span></div>
            <p>기온과 강수량 자료를 월별 그래프로 나타내고 두 자료가 함께 변하는 시기를 탐구함...</p>
            <div className="card-row"><span className="muted">작성 완료: 어제 18:30</span><button className="text-button">조회 및 수정</button></div>
          </article>
        </div>
      </section>
    </main>
  );
}

function StudentSelection({
  classFilter,
  filteredStudents,
  searchQuery,
  selectedStudent,
  onClassFilter,
  onSearch,
  onSelect,
  onNext,
}: {
  classFilter: ClassFilter;
  filteredStudents: Student[];
  searchQuery: string;
  selectedStudent: Student;
  onClassFilter: (filter: ClassFilter) => void;
  onSearch: (query: string) => void;
  onSelect: (student: Student) => void;
  onNext: () => void;
}) {
  return (
    <main className="page-container student-page">
      <div className="page-title">
        <h1>활동 기록 학생 선택</h1>
        <p>나이스 생활기록부 활동을 작성할 학생을 목록에서 선택하십시오.</p>
      </div>
      <section className="filter-card">
        <div className="chip-group">
          {(["all", "2-1", "2-2"] as const).map((filter) => (
            <button className={`chip ${classFilter === filter ? "selected" : ""}`} key={filter} onClick={() => onClassFilter(filter)}>
              {filter === "all" ? "전체" : `${filter.replace("-", "학년 ")}반`}
            </button>
          ))}
        </div>
        <span className="vertical-divider" />
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="학생 이름 또는 학번을 검색하세요..." />
        </label>
      </section>
      <section className="student-table" aria-label="학생 목록">
        <div className="student-row table-head"><span>이름</span><span>학적 정보</span><span>작성 완료 상태 (자율/진로)</span><span>선택</span></div>
        {filteredStudents.length === 0 ? (
          <div className="empty-state">검색 조건에 맞는 학생이 없습니다.</div>
        ) : filteredStudents.map((student) => {
          const selected = student.id === selectedStudent.id;
          return (
            <button className={`student-row ${selected ? "selected" : ""}`} key={student.id} onClick={() => onSelect(student)}>
              <span className="student-name">{selected && <i className="active-dot" />}{student.name}</span>
              <span>{studentDetail(student)}</span>
              <span className="status-cell"><span><i className="status-dot blue" />자율활동 (2/2개 작성 완료)</span><span><i className="status-dot green" />진로활동 (1/2개 작성중)</span></span>
              <span className={`select-label ${selected ? "selected" : ""}`}>{selected ? "선택됨" : "선택하기"}</span>
            </button>
          );
        })}
      </section>
      <footer className="footer-actions">
        <p>현재 선택된 학생: <strong>{selectedStudent.name}</strong> 학생</p>
        <button className="button primary" onClick={onNext}>다음 단계: 활동 선택하기</button>
      </footer>
    </main>
  );
}

function ActivitySelection({
  groupedActivities,
  selectedActivity,
  selectedStudent,
  onBack,
  onChangeStudent,
  onSelect,
  onNext,
}: {
  groupedActivities: Record<ActivityCategory, Activity[]>;
  selectedActivity: Activity;
  selectedStudent: Student;
  onBack: () => void;
  onChangeStudent: () => void;
  onSelect: (activity: Activity) => void;
  onNext: () => void;
}) {
  return (
    <main className="page-container">
      <StudentRibbon student={selectedStudent} onChangeStudent={onChangeStudent} />
      <section className="activity-groups">
        {(["AUTONOMOUS", "CAREER"] as const).map((category) => (
          <div className="activity-group" key={category}>
            <div className="group-heading"><span className={`badge ${category.toLowerCase()}`}>{categoryLabel(category)}</span><h2>{categoryLabel(category)} 그룹</h2></div>
            {groupedActivities[category].map((activity) => {
              const selected = activity.id === selectedActivity.id;
              return (
                <button className={`activity-card ${category.toLowerCase()} ${selected ? "selected" : ""}`} key={activity.id} onClick={() => onSelect(activity)}>
                  <div className="card-row"><span className={`badge ${category.toLowerCase()}`}>{categoryLabel(category)}</span>{selected && <span className="selected-check">✓ 선택됨</span>}</div>
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                </button>
              );
            })}
          </div>
        ))}
      </section>
      <footer className="footer-actions">
        <button className="button secondary" onClick={onBack}>이전 단계로</button>
        <button className="button primary" onClick={onNext}>기록 작성 및 편집실로 이동</button>
      </footer>
    </main>
  );
}

function StudentRibbon({ student, onChangeStudent }: { student: Student; onChangeStudent: () => void }) {
  return (
    <section className="student-ribbon">
      <span className="avatar" aria-hidden="true">♙</span>
      <div><strong>{student.name} 학생의 활동 기록 작성</strong><span>학년·학적: {studentDetail(student)}</span></div>
      <button className="button secondary" onClick={onChangeStudent}>학생 변경</button>
    </section>
  );
}

function Workspace({
  activity,
  student,
  reportText,
  analysis,
  aiDraft,
  editorText,
  finalText,
  editorLabel,
  analysisStatus,
  draftStatus,
  saveStatus,
  errorMessage,
  showOriginalDraft,
  onBack,
  onReportChange,
  onAnalyze,
  onGenerate,
  onEditorChange,
  onSave,
  onToggleOriginal,
}: {
  activity: Activity;
  student: Student;
  reportText: string;
  analysis: ReportAnalysis | null;
  aiDraft: string;
  editorText: string;
  finalText: string | null;
  editorLabel: string;
  analysisStatus: AsyncStatus;
  draftStatus: AsyncStatus;
  saveStatus: AsyncStatus;
  errorMessage: string;
  showOriginalDraft: boolean;
  onBack: () => void;
  onReportChange: (value: string) => void;
  onAnalyze: () => void;
  onGenerate: () => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onToggleOriginal: () => void;
}) {
  const busy = analysisStatus === "loading" || draftStatus === "loading";
  return (
    <main className="page-container workspace-page">
      <StudentRibbon student={student} onChangeStudent={onBack} />
      <div className="workspace-heading">
        <div><span className={`badge ${activity.category.toLowerCase()}`}>{categoryLabel(activity.category)}</span><h1>{activity.title}</h1></div>
        <button className="text-button" onClick={onBack}>활동 다시 선택</button>
      </div>
      {errorMessage && <div className="alert error" role="alert">{errorMessage}</div>}
      <div className="workspace-grid">
        <div className="workspace-column">
          <section className="panel input-panel">
            <div className="panel-title"><div><span className="step-number">1</span><h2>학생 보고서 확인</h2></div><span className="subtle-label">직접 입력 또는 업로드</span></div>
            <label className="field-label" htmlFor="report-text">보고서 내용</label>
            <textarea id="report-text" className="report-textarea" value={reportText} onChange={(event) => onReportChange(event.target.value)} placeholder="학생이 작성한 보고서 내용을 입력하세요." />
            <button className="drop-zone" type="button"><span>↑</span><strong>보고서 파일을 이곳에 끌어다 놓으세요</strong><small>PDF, DOCX, HWP · 프로토타입에서는 텍스트 입력을 사용합니다.</small></button>
            <button className="button primary full" disabled={!reportText.trim() || busy} onClick={onAnalyze}>
              {analysisStatus === "loading" ? "AI가 보고서를 분석하는 중..." : "✦ AI 분석 시작하기"}
            </button>
            {!reportText.trim() && <p className="helper-text">보고서 내용이 있어야 AI 분석을 시작할 수 있습니다.</p>}
          </section>

          <section className="panel analysis-panel">
            <div className="panel-title"><div><span className="step-number">2</span><h2>AI 분석 결과</h2></div>{analysis && <span className="badge warning">검토 필요</span>}</div>
            {analysisStatus === "loading" ? <LoadingState label="근거를 구조화하고 있습니다." /> : analysis ? (
              <div className="analysis-content">
                <AnalysisItem label="핵심 주제"><strong>{analysis.topic}</strong></AnalysisItem>
                <AnalysisItem label="학생이 실제로 수행한 활동">
                  <ul>{analysis.studentActions.map((item) => <li key={`${item.action}-${item.evidence}`}><strong>{item.action}</strong><span>근거: “{item.evidence}”</span></li>)}</ul>
                </AnalysisItem>
                <AnalysisItem label="다룬 개념"><div className="tag-list">{analysis.knowledge.map((item) => <span key={item}>{item}</span>)}</div></AnalysisItem>
                <AnalysisItem label="주요 근거"><ul>{analysis.skills.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.evidence}</span></li>)}{analysis.notablePoints.map((item) => <li key={item}>{item}</li>)}</ul></AnalysisItem>
                <div className="alert notice">AI 분석은 교사의 최종 판단이 아닙니다. 학생 보고서 원문과 대조해 주세요.</div>
                <button className="button primary full" disabled={draftStatus === "loading"} onClick={onGenerate}>{draftStatus === "loading" ? "초안을 생성하는 중..." : "✦ 활동 기록 초안 생성"}</button>
              </div>
            ) : <div className="empty-state compact">보고서를 분석하면 핵심 주제와 활동 근거가 구조화되어 표시됩니다.</div>}
          </section>
        </div>

        <div className="workspace-column">
          <section className="panel editor-panel">
            <div className="panel-title"><div><span className="step-number">3</span><h2>최종 문구 편집</h2></div><span className={`editor-status ${editorLabel === "저장 완료" ? "saved" : ""}`}>{editorLabel}</span></div>
            <div className="ai-banner"><span>✦</span><div><strong>AI 생성 초안</strong><small>교사 확인 및 미세 조정 단계입니다.</small></div></div>
            {draftStatus === "loading" ? <LoadingState label="분석 근거로 초안을 작성하고 있습니다." /> : aiDraft ? (
              <>
                <label className="field-label" htmlFor="final-text">교사 최종 편집 문구</label>
                <textarea id="final-text" className="editor-textarea" value={editorText} onChange={(event) => onEditorChange(event.target.value)} />
                <div className="editor-meta"><span>{editorText.length}자</span><span>{editorText === aiDraft ? "AI 원본과 동일" : "교사가 수정한 내용이 있습니다"}</span></div>
                <div className="quick-actions"><span>빠른 편집</span><button onClick={() => onEditorChange(`${editorText} 학생의 구체적인 관찰과 실천 과정이 돋보임.`)}>관찰 내용 강조</button><button onClick={() => onEditorChange(editorText.replaceAll("했다", "함"))}>문체 다듬기</button></div>
                <button className="button primary full save-button" disabled={!editorText.trim() || saveStatus === "loading"} onClick={onSave}>{saveStatus === "loading" ? "저장 중..." : finalText === editorText ? "✓ 저장 완료" : "최종 문구 저장"}</button>
                {saveStatus === "success" && finalText === editorText && <p className="save-message" role="status">최종 문구가 mock 상태에 저장되었습니다.</p>}
                <button className="original-toggle" onClick={onToggleOriginal}><span>AI 원본 초안 보기</span><span>{showOriginalDraft ? "⌃" : "⌄"}</span></button>
                {showOriginalDraft && <div className="original-draft">{aiDraft}</div>}
              </>
            ) : <div className="empty-state editor-empty"><span>✦</span><strong>아직 생성된 초안이 없습니다.</strong><p>왼쪽에서 보고서를 분석한 뒤 활동 기록 초안을 생성해 주세요.</p></div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function AnalysisItem({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="analysis-item"><h3>{label}</h3><div>{children}</div></div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label}</div>;
}
