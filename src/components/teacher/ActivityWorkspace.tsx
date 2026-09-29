"use client";

import { useEffect, useState } from "react";
import { CAREER_DNA_QUESTIONS } from "../../lib/career-dna-form";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
  type Activity,
  type AnalyzeCareerDnaResponse,
  type GenerateActivityRecordResponse,
  type GenerateIcanWecanRecordResponse,
  type ActivityCode,
  type ReportAnalysis,
  type Student,
  type TeacherWorkspaceSnapshot,
} from "../../types";
import type { GenerateOneTopicRecordResponse as OneTopicResponse } from "../../types/one-topic";
import type { GenerateCurriculumCreativeRecordResponse as CurriculumResponse } from "../../types/curriculum-creative";
import { ReportInputForm, emptyActivityInputs, type ActivityInputs } from "./ReportInputForm";

type BusyStatus = "idle" | "analyzing" | "generating" | "saving";

interface WorkspaceSession {
  inputs: ActivityInputs;
  analysis: AnalyzeCareerDnaResponse | null;
  draft: GenerateActivityRecordResponse | null;
  editedText: string;
  finalText: string | null;
  maxLength: number;
  reportText: string;
  analysisForSave: ReportAnalysis | null;
  stored: boolean;
}

const sessions = new Map<string, WorkspaceSession>();

function emptySession(): WorkspaceSession {
  return {
    inputs: emptyActivityInputs(), analysis: null, draft: null,
    editedText: "", finalText: null, maxLength: DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
    reportText: "", analysisForSave: null, stored: false,
  };
}

function serializeInputs(activityCode: ActivityCode, inputs: ActivityInputs, sourceText: string): string {
  return JSON.stringify({
    version: 1, activityCode,
    dnaAnswers: inputs.dnaAnswers,
    icanReflection: inputs.icanReflection,
    oneTopicReport: inputs.oneTopicReport,
    curriculumText: inputs.curriculumText,
    sourceText,
  });
}

function restoreInputs(reportText: string | undefined): ActivityInputs {
  const inputs = emptyActivityInputs();
  if (!reportText) return inputs;
  try {
    const value: unknown = JSON.parse(reportText);
    if (!value || typeof value !== "object" || Array.isArray(value)) return inputs;
    const saved = value as Record<string, unknown>;
    if (saved.version !== 1) return inputs;
    if (saved.dnaAnswers && typeof saved.dnaAnswers === "object" && !Array.isArray(saved.dnaAnswers)) {
      inputs.dnaAnswers = Object.fromEntries(Object.entries(saved.dnaAnswers)
        .filter(([, answer]) => typeof answer === "string"));
    }
    if (typeof saved.icanReflection === "string") inputs.icanReflection = saved.icanReflection;
    if (typeof saved.curriculumText === "string") inputs.curriculumText = saved.curriculumText;
    if (saved.oneTopicReport && typeof saved.oneTopicReport === "object" && !Array.isArray(saved.oneTopicReport)) {
      const report = saved.oneTopicReport as Record<string, unknown>;
      for (const key of Object.keys(inputs.oneTopicReport) as Array<keyof ActivityInputs["oneTopicReport"]>) {
        if (typeof report[key] === "string") inputs.oneTopicReport[key] = report[key];
      }
    }
  } catch { /* Older plain-text reports remain available in the DB. */ }
  return inputs;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error(`서버가 JSON이 아닌 응답을 반환했습니다. (${response.status})`);
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    if (data && typeof data === "object" && "error" in data) {
      const error = (data as { error?: { message?: unknown } }).error;
      if (typeof error?.message === "string") throw new Error(error.message);
    }
    throw new Error(`요청을 처리하지 못했습니다. (${response.status})`);
  }
  return data as T;
}

function hasRequiredInputs(activity: Activity, inputs: ActivityInputs): boolean {
  switch (activity.code) {
    case "CAREER_DNA":
      return CAREER_DNA_QUESTIONS.every((question) => inputs.dnaAnswers[question.session]?.trim()) &&
        !!inputs.readingPresentation && !!inputs.researchPresentation;
    case "AUTONOMOUS_ICAN_WECAN":
      return !!inputs.icanReport && !!inputs.icanReflection.trim();
    case "AUTONOMOUS_ONE_TOPIC":
      return !!inputs.oneTopicReport.topic.trim() && !!inputs.oneTopicReport.content.trim();
    case "CAREER_CURRICULUM_CREATIVE":
      return inputs.curriculumText.trim().length >= 20;
  }
}

function requirementMessage(activity: Activity): string {
  switch (activity.code) {
    case "CAREER_DNA": return "20개 차시 답변과 발표자료 2개를 준비해 주세요.";
    case "AUTONOMOUS_ICAN_WECAN": return "XLSX 보고서와 느낀점을 입력해 주세요.";
    case "AUTONOMOUS_ONE_TOPIC": return "발표 주제와 발표 내용을 입력해 주세요.";
    case "CAREER_CURRICULUM_CREATIVE": return "활동 내용을 20자 이상 입력해 주세요. 발표자료는 함께 첨부할 수 있습니다.";
  }
}

export function ActivityWorkspace({ activity, student, onBack, onChangeStudent, onSaved }: {
  activity: Activity; student: Student; onBack: () => void; onChangeStudent: () => void; onSaved: () => void;
}) {
  const sessionKey = `${student.id}:${activity.id}`;
  const [session, setSession] = useState<WorkspaceSession>(() => sessions.get(sessionKey) ?? emptySession());
  const [busy, setBusy] = useState<BusyStatus>("idle");
  const [error, setError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ studentId: student.id, activityId: activity.id });
    void (async () => readJson<TeacherWorkspaceSnapshot>(await fetch(`/api/teacher/workspace?${params}`)))()
      .then((snapshot) => {
        if (!active) return;
        if (snapshot.record) {
          const record = snapshot.record;
          const next: WorkspaceSession = {
            ...emptySession(),
            inputs: restoreInputs(snapshot.report?.reportText),
            analysis: activity.code === "CAREER_DNA" ? {
              analysis: record.analysis, extractedText: "", answeredSessions: [], presentations: [], cacheHit: true,
            } : null,
            draft: {
              draft: record.aiDraft, usedEvidence: [],
              characterCount: Array.from(record.aiDraft).length,
              maxLength: DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
            },
            editedText: record.finalText ?? record.aiDraft,
            finalText: record.finalText,
            analysisForSave: record.analysis,
            reportText: snapshot.report?.reportText ?? "",
            stored: true,
          };
          sessions.set(sessionKey, next);
          setSession(next);
        } else if (snapshot.report) {
          updateSession({ inputs: restoreInputs(snapshot.report.reportText) });
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "저장된 기록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activity.code, activity.id, sessionKey, student.id]);
  const ready = hasRequiredInputs(activity, session.inputs);
  const validLength = Number.isInteger(session.maxLength) &&
    session.maxLength >= MIN_ACTIVITY_RECORD_MAX_LENGTH &&
    session.maxLength <= MAX_ACTIVITY_RECORD_MAX_LENGTH;

  function updateSession(change: Partial<WorkspaceSession>) {
    setSession((current) => {
      const next = { ...current, ...change };
      sessions.set(sessionKey, next);
      return next;
    });
  }

  function updateInputs(inputs: ActivityInputs) {
    updateSession({ inputs, analysis: null, draft: null, editedText: "", finalText: null,
      reportText: "", analysisForSave: null, stored: false });
    setError("");
  }

  async function analyzeDna() {
    if (activity.code !== "CAREER_DNA" || !ready || busy !== "idle") return;
    const { inputs } = session;
    if (!inputs.readingPresentation || !inputs.researchPresentation) return;
    const form = new FormData();
    form.append("studentId", student.id);
    form.append("answers", JSON.stringify(CAREER_DNA_QUESTIONS.map((question) => ({
      session: question.session, answer: inputs.dnaAnswers[question.session]?.trim() ?? "",
    }))));
    form.append("readingPresentation", inputs.readingPresentation);
    form.append("researchPresentation", inputs.researchPresentation);
    setBusy("analyzing");
    setError("");
    updateSession({ analysis: null, draft: null, editedText: "", finalText: null });
    try {
      const result = await readJson<AnalyzeCareerDnaResponse>(
        await fetch("/api/analyze-career-dna", { method: "POST", body: form }),
      );
      updateSession({ analysis: result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DNA 자료 분석에 실패했습니다.");
    } finally {
      setBusy("idle");
    }
  }

  async function generateDraft() {
    if (busy !== "idle" || !ready || !validLength || session.stored) return;
    setBusy("generating");
    setError("");
    updateSession({ draft: null, editedText: "", finalText: null });
    try {
      let result: GenerateActivityRecordResponse;
      let analysisForSave: ReportAnalysis;
      let sourceText: string;
      switch (activity.code) {
        case "CAREER_DNA": {
          if (!session.analysis) throw new Error("먼저 DNA 자료를 분석해 주세요.");
          result = await readJson<GenerateActivityRecordResponse>(await fetch("/api/generate-activity-record", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: student.id, activityId: activity.id,
              activityCode: activity.code, analysis: session.analysis.analysis,
              maxLength: session.maxLength,
            }),
          }));
          analysisForSave = session.analysis.analysis;
          sourceText = session.analysis.extractedText;
          break;
        }
        case "AUTONOMOUS_ICAN_WECAN": {
          if (!session.inputs.icanReport) throw new Error("엑셀 보고서를 선택해 주세요.");
          const form = new FormData();
          form.append("studentId", student.id);
          form.append("reportFile", session.inputs.icanReport);
          form.append("reflection", session.inputs.icanReflection.trim());
          form.append("maxLength", String(session.maxLength));
          const generated = await readJson<GenerateIcanWecanRecordResponse>(
            await fetch("/api/generate-ican-wecan-record", { method: "POST", body: form }),
          );
          result = generated;
          analysisForSave = generated.analysis;
          sourceText = generated.reportText;
          break;
        }
        case "AUTONOMOUS_ONE_TOPIC":
          const oneTopic = await readJson<OneTopicResponse>(await fetch("/api/generate-one-topic-record", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report: session.inputs.oneTopicReport, maxLength: session.maxLength }),
          }));
          result = oneTopic;
          analysisForSave = oneTopic.analysis;
          sourceText = oneTopic.reportText;
          break;
        case "CAREER_CURRICULUM_CREATIVE":
          const curriculum = await readJson<CurriculumResponse>(
            await fetch("/api/generate-curriculum-creative-record", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ freeText: session.inputs.curriculumText.trim(), maxLength: session.maxLength }),
            }),
          );
          result = curriculum;
          analysisForSave = curriculum.analysis;
          sourceText = curriculum.reportText;
          break;
      }
      const reportText = serializeInputs(activity.code, session.inputs, sourceText);
      updateSession({ draft: result, editedText: result.draft, analysisForSave, reportText, stored: false });
      try {
        await persistDraft(result, analysisForSave, reportText);
      } catch (cause) {
        setError(cause instanceof Error ? `초안은 생성됐지만 DB 저장에 실패했습니다: ${cause.message}` : "초안 저장에 실패했습니다.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "초안 생성에 실패했습니다.");
    } finally {
      setBusy("idle");
    }
  }

  async function persistDraft(draft: GenerateActivityRecordResponse, analysis: ReportAnalysis, reportText: string) {
    await readJson(await fetch("/api/teacher/workspace", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, activityId: activity.id,
        activityCode: activity.code, reportText, analysis, aiDraft: draft.draft }),
    }));
    updateSession({ stored: true });
    setError("");
    onSaved();
  }

  async function saveFinal() {
    if (!session.stored || !session.editedText.trim()) return;
    setBusy("saving");
    setError("");
    try {
      await readJson(await fetch("/api/teacher/workspace", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, activityId: activity.id, finalText: session.editedText.trim() }),
      }));
      updateSession({ finalText: session.editedText.trim() });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "교사 문구 저장에 실패했습니다.");
    } finally {
      setBusy("idle");
    }
  }

  const editedCount = Array.from(session.editedText).length;
  return <main className="page-container workspace-page">
    <section className="student-ribbon">
      <span className="avatar" aria-hidden="true">♙</span>
      <div><strong>{student.name} 학생의 활동 기록 작성</strong>
        <span>{student.grade}학년 {student.classNo}반 {student.studentNo}번</span></div>
      <button className="button secondary" type="button" onClick={onChangeStudent}>학생 변경</button>
    </section>
    <div className="workspace-heading"><div>
      <span className={`badge ${activity.category.toLowerCase()}`}>{activity.category === "AUTONOMOUS" ? "자율활동" : "진로활동"}</span>
      <h1>{activity.title}</h1></div>
      <button className="text-button" type="button" onClick={onBack}>활동 다시 선택</button>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {loading && <div className="loading-state"><i className="spinner" />저장된 활동 기록을 확인하고 있습니다.</div>}
    <div className="workspace-grid">
      <div className="workspace-column">
        <section className="panel input-panel">
          <div className="panel-title"><div><span className="step-number">1</span><h2>보고서와 활동 내용</h2></div>
            <span className="subtle-label">{activity.title} 입력</span></div>
          <ReportInputForm key={activity.code} activityCode={activity.code} value={session.inputs}
            onChange={updateInputs} disabled={loading || busy !== "idle" || session.stored} />
          {session.stored && <p className="report-field-help">저장된 AI 원본과 보고서입니다. 발표자료 원본은 보관하지 않습니다.</p>}
          <div className="length-control">
            <label className="field-label" htmlFor="draft-max-length">초안 목표 글자 수 (공백 포함)</label>
            <input id="draft-max-length" type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH}
              max={MAX_ACTIVITY_RECORD_MAX_LENGTH} value={session.maxLength} disabled={loading || busy !== "idle" || session.stored}
              onChange={(event) => updateSession({ maxLength: Number(event.target.value) })} />
            <span>{MIN_ACTIVITY_RECORD_MAX_LENGTH}~{MAX_ACTIVITY_RECORD_MAX_LENGTH}자</span>
          </div>
          {activity.code === "CAREER_DNA" ? <button className="button primary full" type="button"
            disabled={loading || session.stored || !ready || busy !== "idle"} onClick={() => void analyzeDna()}>
            {busy === "analyzing" ? "DNA 자료 분석 중…" : "✦ DNA 자료 분석"}</button>
          : <button className="button primary full" type="button"
            disabled={loading || session.stored || !ready || !validLength || busy !== "idle"} onClick={() => void generateDraft()}>
            {busy === "generating" ? "초안 생성 중…" : "✦ 활동 기록 초안 생성"}</button>}
          {!ready && !session.stored && <p className="helper-text">{requirementMessage(activity)}</p>}
          {!validLength && <p className="report-file-error" role="alert">글자 수는 {MIN_ACTIVITY_RECORD_MAX_LENGTH}~{MAX_ACTIVITY_RECORD_MAX_LENGTH}자로 설정해 주세요.</p>}
        </section>
        {activity.code === "CAREER_DNA" && <section className="panel analysis-panel">
          <div className="panel-title"><div><span className="step-number">2</span><h2>DNA 분석 결과</h2></div>
            {session.analysis && <span className="badge warning">교사 검토 필요</span>}</div>
          {busy === "analyzing" ? <div className="loading-state"><i className="spinner" />발표자료와 답변을 분석하고 있습니다.</div>
            : session.analysis ? <div className="analysis-content">
              <div className="analysis-item"><h3>핵심 주제</h3><div>{session.analysis.analysis.topic}</div></div>
              <div className="analysis-item"><h3>학생 행동과 근거</h3><ul>
                {session.analysis.analysis.studentActions.map((item, index) =>
                  <li key={index}><strong>{item.action}</strong><span>근거: {item.evidence}</span></li>)}
              </ul></div>
              <div className="analysis-item"><h3>역량 근거</h3><ul>
                {session.analysis.analysis.skills.map((item, index) =>
                  <li key={index}><strong>{item.name}</strong><span>{item.evidence}</span></li>)}
              </ul></div>
              <button className="button primary full" type="button" disabled={session.stored || busy !== "idle" || !validLength}
                onClick={() => void generateDraft()}>{busy === "generating" ? "초안 생성 중…" : "✦ 분석 결과로 초안 생성"}</button>
            </div> : <div className="empty-state compact">자료를 분석하면 학생 행동과 근거가 여기에 표시됩니다.</div>}
        </section>}
      </div>
      <div className="workspace-column">
        <section className="panel editor-panel">
          <div className="panel-title"><div><span className="step-number">{activity.code === "CAREER_DNA" ? 3 : 2}</span><h2>초안 검토와 수정</h2></div>
            {session.draft && <span className="editor-status">{session.finalText === session.editedText ? "DB 저장됨" : "교사 수정 중"}</span>}</div>
          <div className="ai-banner"><span>✦</span><div><strong>교사 검토용 AI 초안</strong>
            <small>학생 입력 자료를 확인한 뒤 교사가 직접 수정하세요.</small></div></div>
          {busy === "generating" ? <div className="loading-state"><i className="spinner" />초안을 생성하고 있습니다.</div>
            : session.draft ? <>
              <textarea className="editor-textarea" aria-label="교사 수정 초안" value={session.editedText}
                onChange={(event) => updateSession({ editedText: event.target.value, finalText: null })} />
              <div className="editor-meta"><span>공백 포함 {editedCount}자</span>
                <span className={editedCount > session.maxLength ? "over-limit" : ""}>목표 {session.maxLength}자</span></div>
              <button className="button primary full save-button" type="button"
                disabled={!session.stored || !session.editedText.trim() || busy !== "idle"} onClick={() => void saveFinal()}>
                {busy === "saving" ? "DB에 저장 중…" : "교사 수정 문구 DB 저장"}</button>
              {!session.stored && session.analysisForSave && <button className="button secondary full" type="button"
                onClick={() => void persistDraft(session.draft!, session.analysisForSave!, session.reportText).catch((cause: unknown) =>
                  setError(cause instanceof Error ? cause.message : "초안 저장에 실패했습니다."))}>
                생성된 초안 DB 저장 다시 시도</button>}
              <button className="original-toggle" type="button" onClick={() => setShowOriginal((current) => !current)}>
                AI 원본 초안 {showOriginal ? "접기" : "보기"}</button>
              {showOriginal && <div className="original-draft">{session.draft.draft}</div>}
            </> : <div className="editor-empty"><span>✦</span><p>활동 자료를 입력하고 초안을 생성하면 이곳에서 문장을 수정할 수 있습니다.</p></div>}
        </section>
      </div>
    </div>
  </main>;
}
