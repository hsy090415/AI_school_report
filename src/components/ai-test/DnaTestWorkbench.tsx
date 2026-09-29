"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITY_RECORD_REQUEST_OFFSET,
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
  type ActivityRecordDraftProgress,
  type AnalyzeCareerDnaResponse,
  type GenerateActivityRecordResponse,
  type GenerateActivityRecordStreamEvent,
} from "../../types";
import {
  CAREER_DNA_QUESTIONS,
  CAREER_DNA_STAGE_LABELS,
  type CareerDnaStage,
} from "../../lib/career-dna-form";
import styles from "./dna-test.module.css";
import { ActivityTestNav } from "./ActivityTestNav";
import { getDnaWorkbenchSession, saveDnaWorkbenchSession } from "./workbench-session";

const STAGES: CareerDnaStage[] = ["DIRECTION", "READING", "RESEARCH", "REFLECTION"];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const TOTAL_QUESTIONS = CAREER_DNA_QUESTIONS.length;

type Answers = Record<number, string>;
type RequestStatus = "idle" | "analyzing" | "generating";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiErrorMessage(value: unknown, fallback: string): string {
  if (isObject(value) && isObject(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return fallback;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DnaTestWorkbench() {
  const savedSession = useRef(getDnaWorkbenchSession()).current;
  const readingInputRef = useRef<HTMLInputElement>(null);
  const researchInputRef = useRef<HTMLInputElement>(null);
  const analysisRequestInFlightRef = useRef(false);
  const [stage, setStage] = useState<CareerDnaStage>(savedSession?.stage ?? "DIRECTION");
  const [answers, setAnswers] = useState<Answers>(savedSession?.answers ?? {});
  const [readingPresentation, setReadingPresentation] = useState<File | null>(savedSession?.readingPresentation ?? null);
  const [researchPresentation, setResearchPresentation] = useState<File | null>(savedSession?.researchPresentation ?? null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeCareerDnaResponse | null>(savedSession?.analysisResult ?? null);
  const [draftResult, setDraftResult] = useState<GenerateActivityRecordResponse | null>(savedSession?.draftResult ?? null);
  const [draftMaxLength, setDraftMaxLength] = useState(savedSession?.draftMaxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH);
  const [editedDraft, setEditedDraft] = useState(savedSession?.editedDraft ?? "");
  const [draftProgress, setDraftProgress] = useState<ActivityRecordDraftProgress | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const questions = useMemo(
    () => CAREER_DNA_QUESTIONS.filter((question) => question.stage === stage),
    [stage],
  );
  const completedCount = CAREER_DNA_QUESTIONS.filter(
    (question) => answers[question.session]?.trim(),
  ).length;
  const currentStageIndex = STAGES.indexOf(stage);
  const isComplete = completedCount === TOTAL_QUESTIONS && readingPresentation && researchPresentation;
  const isBusy = status !== "idle";

  useEffect(() => {
    saveDnaWorkbenchSession({
      stage,
      answers,
      readingPresentation,
      researchPresentation,
      analysisResult,
      draftResult,
      draftMaxLength,
      editedDraft,
    });
  }, [stage, answers, readingPresentation, researchPresentation, analysisResult, draftResult, draftMaxLength, editedDraft]);

  function invalidateResult(): void {
    setAnalysisResult(null);
    setDraftResult(null);
    setEditedDraft("");
    setDraftProgress(null);
    setDraftError(null);
    setError(null);
  }

  function updateAnswer(session: number, answer: string): void {
    setAnswers((current) => ({ ...current, [session]: answer }));
    invalidateResult();
  }

  function selectPresentation(kind: "READING" | "RESEARCH", file: File | null): void {
    invalidateResult();
    const inputRef = kind === "READING" ? readingInputRef : researchInputRef;
    const setter = kind === "READING" ? setReadingPresentation : setResearchPresentation;

    if (!file) {
      setter(null);
      return;
    }
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".pptx")) {
      setter(null);
      setError("발표자료는 PDF 또는 PPTX 형식만 선택할 수 있습니다.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setter(null);
      setError("발표자료는 파일당 20MB 이하만 선택할 수 있습니다.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setter(file);
  }

  function fillExamples(): void {
    setAnswers(
      Object.fromEntries(
        CAREER_DNA_QUESTIONS.map((question) => [question.session, question.example]),
      ),
    );
    invalidateResult();
  }

  function clearAll(): void {
    setAnswers({});
    setReadingPresentation(null);
    setResearchPresentation(null);
    setAnalysisResult(null);
    setDraftResult(null);
    setEditedDraft("");
    setDraftProgress(null);
    setDraftError(null);
    setError(null);
    if (readingInputRef.current) readingInputRef.current.value = "";
    if (researchInputRef.current) researchInputRef.current.value = "";
  }

  async function analyze(): Promise<void> {
    if (analysisRequestInFlightRef.current) return;

    if (!isComplete || !readingPresentation || !researchPresentation) {
      setError(`${TOTAL_QUESTIONS}개 필수 답변과 발표자료 2개를 모두 준비해 주세요.`);
      return;
    }

    analysisRequestInFlightRef.current = true;

    const formData = new FormData();
    formData.append("studentId", "ai-test-student");
    formData.append(
      "answers",
      JSON.stringify(
        CAREER_DNA_QUESTIONS.map((question) => ({
          session: question.session,
          answer: answers[question.session]?.trim() ?? "",
        })),
      ),
    );
    formData.append("readingPresentation", readingPresentation);
    formData.append("researchPresentation", researchPresentation);

    setStatus("analyzing");
    setError(null);
    setAnalysisResult(null);
    setDraftResult(null);
    try {
      const response = await fetch("/api/analyze-career-dna", { method: "POST", body: formData });
      const body = await responseBody(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "DNA 자료 분석에 실패했습니다."));
      }
      setAnalysisResult(body as AnalyzeCareerDnaResponse);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "DNA 자료 분석에 실패했습니다.");
    } finally {
      analysisRequestInFlightRef.current = false;
      setStatus("idle");
    }
  }

  async function generateDraft(): Promise<void> {
    if (!analysisResult) return;
    setStatus("generating");
    setError(null);
    setDraftError(null);
    setDraftResult(null);
    setDraftProgress({
      stage: "REQUESTING_DRAFT",
      attempt: 1,
      maxAttempts: 1,
      message: "초안 생성 요청을 서버로 보내고 있습니다.",
      requestedLength: Math.max(1, draftMaxLength - ACTIVITY_RECORD_REQUEST_OFFSET),
      maxLength: draftMaxLength,
    });
    try {
      const response = await fetch("/api/generate-activity-record?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: "ai-test-student",
          activityId: "career-dna",
          activityCode: "CAREER_DNA",
          analysis: analysisResult.analysis,
          maxLength: draftMaxLength,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/x-ndjson")) {
        const body = await responseBody(response);
        throw new Error(apiErrorMessage(body, "활동 기록 초안 생성에 실패했습니다."));
      }
      if (!response.body) throw new Error("초안 생성 진행 응답을 읽을 수 없습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedResult = false;

      const handleEvent = (line: string): void => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as GenerateActivityRecordStreamEvent;
        if (event.type === "progress") {
          setDraftProgress(event.progress);
          return;
        }
        if (event.type === "error") throw new Error(event.error.message);
        setDraftResult(event.data);
        setEditedDraft(event.data.draft);
        setDraftProgress(null);
        receivedResult = true;
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handleEvent);
        if (done) break;
      }
      handleEvent(buffer);
      if (!receivedResult) throw new Error("서버 응답이 완료되었지만 초안 결과가 없습니다.");
    } catch (caught: unknown) {
      setDraftProgress(null);
      setDraftError(caught instanceof Error ? caught.message : "활동 기록 초안 생성에 실패했습니다.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className={styles.page}>
      <ActivityTestNav active="DNA" />
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>CAREER ACTIVITY · DNA</span>
          <h1>진로 꿈 성취 인증제 입력 테스트</h1>
          <p>{TOTAL_QUESTIONS}개 차시의 성장 과정과 독서·융합 탐구 발표자료를 함께 분석합니다.</p>
        </div>
        <div className={styles.pipeline}><span>학생 응답</span><b>+</b><span>발표자료 2개</span><b>→</b><span>Gemini 분석</span><b>→</b><span>Groq 초안</span></div>
      </header>

      <aside className={styles.notice}>
        <strong>테스트 자료만 사용</strong>
        <span>실제 학생 개인정보를 제거한 자료를 사용하세요. 분석 결과는 Git에서 제외된 로컬 테스트 캐시에 저장됩니다.</span>
      </aside>

      <section className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.progressHeader}>
            <div><strong>{completedCount}</strong><span>/ {TOTAL_QUESTIONS}개 응답</span></div>
            <small>발표자료 {[readingPresentation, researchPresentation].filter(Boolean).length}/2</small>
          </div>
          <div className={styles.progressTrack}><span style={{ width: `${(completedCount / TOTAL_QUESTIONS) * 100}%` }} /></div>
          <nav className={styles.stageNav} aria-label="DNA 입력 단계">
            {STAGES.map((item, index) => {
              const stageQuestions = CAREER_DNA_QUESTIONS.filter((question) => question.stage === item);
              const stageCompleted = stageQuestions.filter((question) => answers[question.session]?.trim()).length;
              return (
                <button key={item} type="button" className={item === stage ? styles.activeStage : ""} onClick={() => setStage(item)}>
                  <span>{index + 1}</span>
                  <div><strong>{CAREER_DNA_STAGE_LABELS[item]}</strong><small>{stageCompleted}/{stageQuestions.length} 완료</small></div>
                </button>
              );
            })}
          </nav>
          <button className={styles.exampleButton} type="button" disabled={isBusy} onClick={fillExamples}>테스트용 예시 전체 입력</button>
          <button className={styles.clearButton} type="button" disabled={isBusy} onClick={clearAll}>전체 초기화</button>
        </aside>

        <div className={styles.content}>
          <section className={styles.materialsPanel}>
            <div className={styles.sectionHeading}>
              <div><span>FILES</span><h2>발표자료 첨부</h2></div>
              <p>{[readingPresentation, researchPresentation].filter(Boolean).length}/2 완료</p>
            </div>
            <p className={styles.materialsIntro}>질문 작성 단계와 관계없이 언제든 두 발표자료를 선택하거나 변경할 수 있습니다.</p>
            <div className={styles.presentationGrid}>
              <PresentationPicker
                inputRef={readingInputRef}
                title="독서 기반 심화 탐구 발표자료"
                description="도서를 바탕으로 진행한 심화 탐구 발표자료"
                file={readingPresentation}
                disabled={isBusy}
                onChange={(file) => selectPresentation("READING", file)}
              />
              <PresentationPicker
                inputRef={researchInputRef}
                title="융합 탐구 발표자료"
                description="두 분야를 연결한 최종 융합 탐구 발표자료"
                file={researchPresentation}
                disabled={isBusy}
                onChange={(file) => selectPresentation("RESEARCH", file)}
              />
            </div>
          </section>

          <section className={styles.formPanel}>
            <div className={styles.sectionHeading}>
              <div><span>STEP {currentStageIndex + 1}</span><h2>{CAREER_DNA_STAGE_LABELS[stage]}</h2></div>
              <p>{questions.length}개 문항</p>
            </div>

            <div className={styles.questionList}>
              {questions.map((question) => (
                <article className={styles.questionCard} key={question.session}>
                  <div className={styles.questionTitle}><span>{question.session}차시</span><h3>{question.title}</h3></div>
                  <label htmlFor={`session-${question.session}`}>{question.question}</label>
                  <textarea
                    id={`session-${question.session}`}
                    rows={question.rows}
                    maxLength={5000}
                    value={answers[question.session] ?? ""}
                    placeholder={question.placeholder}
                    disabled={isBusy}
                    onChange={(event) => updateAnswer(question.session, event.target.value)}
                  />
                  <div className={styles.answerMeta}>
                    <details><summary>답변 예시 보기</summary><p>{question.example}</p></details>
                    <span>{(answers[question.session] ?? "").length.toLocaleString()}/5,000</span>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.formNav}>
              <button type="button" disabled={currentStageIndex === 0} onClick={() => setStage(STAGES[currentStageIndex - 1] ?? stage)}>이전 단계</button>
              {currentStageIndex < STAGES.length - 1 ? (
                <button type="button" className={styles.nextButton} onClick={() => setStage(STAGES[currentStageIndex + 1] ?? stage)}>다음 단계</button>
              ) : (
                <button type="button" className={styles.analyzeButton} disabled={!isComplete || isBusy} onClick={analyze}>
                  {status === "analyzing" ? "Gemini 분석 중…" : "전체 자료 분석 요청"}
                </button>
              )}
            </div>
            {!isComplete && currentStageIndex === STAGES.length - 1 ? <p className={styles.requirement}>{TOTAL_QUESTIONS}개 필수 답변과 발표자료 2개를 모두 입력하면 분석할 수 있습니다.</p> : null}
            {error ? <div className={styles.error} role="alert">{error}</div> : null}
          </section>

          <AnalysisResults
            result={analysisResult}
            draft={draftResult}
            draftMaxLength={draftMaxLength}
            editedDraft={editedDraft}
            draftProgress={draftProgress}
            draftError={draftError}
            status={status}
            onDraftMaxLengthChange={setDraftMaxLength}
            onEditedDraftChange={setEditedDraft}
            onGenerateDraft={generateDraft}
          />
        </div>
      </section>
    </main>
  );
}

interface PresentationPickerProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  title: string;
  description: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
}

function PresentationPicker({ inputRef, title, description, file, disabled, onChange }: PresentationPickerProps) {
  return (
    <section className={styles.presentationBox}>
      <div><span>발표자료 첨부</span><h3>{title}</h3><p>{description}</p></div>
      <label className={styles.filePicker}>
        <input ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={disabled} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
        <strong>{file ? file.name : "PDF 또는 PPTX 선택"}</strong>
        <small>{file ? formatFileSize(file.size) : "파일당 최대 20MB · PDF 권장"}</small>
      </label>
      <p className={styles.fileHint}>PDF는 표·도식·이미지까지 분석하며, PPTX는 슬라이드의 텍스트를 추출해 분석합니다.</p>
    </section>
  );
}

function AnalysisResults({
  result,
  draft,
  draftMaxLength,
  editedDraft,
  draftProgress,
  draftError,
  status,
  onDraftMaxLengthChange,
  onEditedDraftChange,
  onGenerateDraft,
}: {
  result: AnalyzeCareerDnaResponse | null;
  draft: GenerateActivityRecordResponse | null;
  draftMaxLength: number;
  editedDraft: string;
  draftProgress: ActivityRecordDraftProgress | null;
  draftError: string | null;
  status: RequestStatus;
  onDraftMaxLengthChange: (value: number) => void;
  onEditedDraftChange: (value: string) => void;
  onGenerateDraft: () => void;
}) {
  if (!result) return null;
  return (
    <section className={styles.resultsPanel}>
      <div className={styles.sectionHeading}><div><span>ANALYSIS</span><h2>DNA 통합 분석 결과</h2></div><p>{TOTAL_QUESTIONS}개 답변 + 발표자료 2개</p></div>
      <div className={result.cacheHit ? styles.cacheHit : styles.cacheMiss} role="status">
        <strong>{result.cacheHit ? "저장된 분석 결과 사용" : "새 Gemini 분석 완료"}</strong>
        <span>{result.cacheHit ? "Gemini를 다시 호출하지 않았습니다." : "같은 답변과 파일을 다시 제출하면 이 결과를 재사용합니다."}</span>
      </div>
      <div className={styles.resultGrid}>
        <ResultBlock title="탐구 주제" items={[result.analysis.topic]} />
        <ResultBlock title="확인된 지식" items={result.analysis.knowledge} />
        <ResultBlock title="학생 행동과 근거" items={result.analysis.studentActions.map((item) => `${item.action}\n근거: ${item.evidence}`)} />
        <ResultBlock title="역량과 근거" items={result.analysis.skills.map((item) => `${item.name}\n근거: ${item.evidence}`)} />
        <ResultBlock title="주목할 점" items={result.analysis.notablePoints} />
      </div>
      <details className={styles.extracted}><summary>AI가 확인한 전체 자료 보기</summary><pre>{result.extractedText}</pre></details>
      <div className={styles.draftSettings}>
        <label htmlFor="draft-max-length"><span>초안 글자 수 제한</span><input id="draft-max-length" type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH} max={MAX_ACTIVITY_RECORD_MAX_LENGTH} step={10} value={draftMaxLength} disabled={status !== "idle"} onChange={(event) => onDraftMaxLengthChange(Number(event.target.value))} /></label>
        <p>설정값보다 70자 짧게 한 번만 요청합니다. 서버가 실제 글자 수를 표시하며, 길이는 교사가 초안에서 직접 수정합니다.</p>
      </div>
      <button className={styles.analyzeButton} type="button" disabled={status !== "idle" || draftMaxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || draftMaxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH} onClick={onGenerateDraft}>
        {status === "generating" ? "Groq 초안 생성 중…" : "분석 결과로 초안 생성"}
      </button>
      {draftProgress ? (
        <div className={styles.draftProgress} role="status" aria-live="polite">
          <span className={styles.progressSpinner} aria-hidden="true" />
          <div>
            <strong>{draftProgress.message}</strong>
            <p>AI 요청 목표 {draftProgress.requestedLength}자 · 설정 기준 {draftProgress.maxLength}자 · 요청 {draftProgress.attempt}/{draftProgress.maxAttempts}{draftProgress.characterCount === undefined ? "" : ` · 실제 ${draftProgress.characterCount}자`}</p>
          </div>
        </div>
      ) : null}
      {draftError ? (
        <div className={styles.draftError} role="alert">
          <strong>초안 생성 오류</strong>
          <span>{draftError}</span>
        </div>
      ) : null}
      {draft ? <div className={styles.draft}><div className={styles.draftHeader}><span>교사 검토용 초안</span><strong className={Array.from(editedDraft).length > draftMaxLength ? styles.overLimit : ""}>{Array.from(editedDraft).length.toLocaleString()}자 · 기준 {draftMaxLength.toLocaleString()}자</strong></div><textarea value={editedDraft} onChange={(event) => onEditedDraftChange(event.target.value)} aria-label="교사 검토용 활동 기록 초안" /><p className={styles.editHint}>기준 글자 수를 넘으면 이 영역에서 교사가 문장을 직접 줄일 수 있습니다.</p><h3>사용된 근거</h3><ul>{draft.usedEvidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
    </section>
  );
}

function ResultBlock({ title, items }: { title: string; items: string[] }) {
  return <section className={styles.resultBlock}><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p>확인된 내용 없음</p>}</section>;
}
