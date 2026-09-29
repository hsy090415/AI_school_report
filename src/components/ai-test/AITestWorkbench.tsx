"use client";

import { useRef, useState } from "react";
import type {
  ActivityCategory,
  ActivityCode,
  AnalyzeReportFileResponse,
  GenerateActivityRecordResponse,
} from "../../types";
import styles from "./ai-test.module.css";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface ActivityOption {
  code: ActivityCode;
  category: ActivityCategory;
  title: string;
  description: string;
}

interface AITestWorkbenchProps {
  activities: ActivityOption[];
}

type RequestStatus = "idle" | "analyzing" | "generating";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiErrorMessage(value: unknown, fallback: string): string {
  if (
    isObject(value) &&
    isObject(value.error) &&
    typeof value.error.message === "string"
  ) {
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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AITestWorkbench({ activities }: AITestWorkbenchProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activityCode, setActivityCode] = useState<ActivityCode>(activities[0]?.code ?? "AUTONOMOUS_ONE_TOPIC");
  const [file, setFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeReportFileResponse | null>(null);
  const [draftResult, setDraftResult] = useState<GenerateActivityRecordResponse | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const selectedActivity =
    activities.find((activity) => activity.code === activityCode) ?? activities[0];
  const isBusy = status !== "idle";

  function resetResults(): void {
    setAnalysisResult(null);
    setDraftResult(null);
    setError(null);
  }

  function selectFile(nextFile: File | null): void {
    resetResults();

    if (!nextFile) {
      setFile(null);
      return;
    }

    const lowerName = nextFile.name.toLowerCase();
    if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".txt")) {
      setFile(null);
      setError("현재 PDF와 TXT 파일만 지원합니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError("파일은 10MB 이하만 업로드할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFile(nextFile);
  }

  async function analyzeFile(): Promise<void> {
    if (!file || !selectedActivity) {
      setError("활동과 보고서 파일을 선택해 주세요.");
      return;
    }

    setStatus("analyzing");
    setError(null);
    setAnalysisResult(null);
    setDraftResult(null);

    const formData = new FormData();
    formData.append("studentId", "ai-test-student");
    formData.append("activityId", `ai-test-${selectedActivity.code.toLowerCase()}`);
    formData.append("activityCode", selectedActivity.code);
    formData.append("activityTitle", selectedActivity.title);
    formData.append("file", file);

    try {
      const response = await fetch("/api/analyze-report-file", {
        method: "POST",
        body: formData,
      });
      const body = await responseBody(response);

      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "보고서 파일 분석에 실패했습니다."));
      }

      setAnalysisResult(body as AnalyzeReportFileResponse);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "보고서 파일 분석에 실패했습니다.");
    } finally {
      setStatus("idle");
    }
  }

  async function generateDraft(): Promise<void> {
    if (!analysisResult || !selectedActivity) return;

    setStatus("generating");
    setError(null);
    setDraftResult(null);

    try {
      const response = await fetch("/api/generate-activity-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: "ai-test-student",
          activityId: `ai-test-${selectedActivity.code.toLowerCase()}`,
          activityCode: selectedActivity.code,
          analysis: analysisResult.analysis,
        }),
      });
      const body = await responseBody(response);

      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "활동 기록 초안 생성에 실패했습니다."));
      }

      setDraftResult(body as GenerateActivityRecordResponse);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "활동 기록 초안 생성에 실패했습니다.");
    } finally {
      setStatus("idle");
    }
  }

  function clearAll(): void {
    setFile(null);
    resetResults();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AI PIPELINE TEST</span>
          <h1>보고서 파일 분석 테스트</h1>
          <p>
            PDF 또는 TXT 보고서를 Gemini로 분석하고, 검증된 분석 결과로 Groq 초안을
            생성합니다.
          </p>
        </div>
        <div className={styles.pipeline} aria-label="AI 처리 단계">
          <span>파일</span><b>→</b><span>Gemini 분석</span><b>→</b><span>Groq 초안</span>
        </div>
      </section>

      <aside className={styles.notice}>
        <strong>테스트 전용</strong>
        <span>실제 학생 개인정보가 없는 가상·비식별 보고서만 사용하세요. 결과는 DB에 저장되지 않습니다.</span>
      </aside>

      <section className={styles.workspace}>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>
            <span className={styles.step}>01</span>
            <div><h2>입력 설정</h2><p>활동과 보고서 파일을 선택합니다.</p></div>
          </div>

          <label className={styles.field}>
            <span>활동</span>
            <select
              value={activityCode}
              disabled={isBusy}
              onChange={(event) => {
                setActivityCode(event.target.value as ActivityCode);
                resetResults();
              }}
            >
              {activities.map((activity) => (
                <option key={activity.code} value={activity.code}>
                  {activity.category === "AUTONOMOUS" ? "자율활동" : "진로활동"} · {activity.title}
                </option>
              ))}
            </select>
          </label>

          {selectedActivity ? <p className={styles.description}>{selectedActivity.description}</p> : null}

          <label className={styles.filePicker}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              disabled={isBusy}
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
            <span className={styles.fileIcon}>↑</span>
            <strong>{file ? file.name : "보고서 파일 선택"}</strong>
            <small>{file ? formatFileSize(file.size) : "PDF 또는 UTF-8 TXT · 최대 10MB"}</small>
          </label>

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={!file || isBusy}
              onClick={analyzeFile}
            >
              {status === "analyzing" ? "Gemini 분석 중…" : "보고서 분석 요청"}
            </button>
            <button className={styles.secondaryButton} type="button" disabled={isBusy} onClick={clearAll}>
              초기화
            </button>
          </div>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          <div className={styles.status} aria-live="polite">
            {status === "analyzing" ? "파일을 읽고 근거를 추출하고 있습니다." : null}
            {status === "generating" ? "검증된 근거로 초안을 생성하고 있습니다." : null}
          </div>
        </div>

        <div className={styles.results}>
          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <span className={styles.step}>02</span>
              <div><h2>추출 내용</h2><p>Gemini가 읽은 보고서 원문입니다.</p></div>
            </div>
            {analysisResult ? (
              <pre className={styles.extractedText}>{analysisResult.extractedText}</pre>
            ) : (
              <div className={styles.empty}>분석을 실행하면 추출된 내용이 표시됩니다.</div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <span className={styles.step}>03</span>
              <div><h2>구조화 분석</h2><p>응답 schema에 맞춰 검증된 결과입니다.</p></div>
            </div>
            {analysisResult ? (
              <div className={styles.analysisGrid}>
                <ResultBlock title="주제" items={[analysisResult.analysis.topic]} />
                <ResultBlock title="지식" items={analysisResult.analysis.knowledge} />
                <ResultBlock title="주목할 점" items={analysisResult.analysis.notablePoints} />
                <ResultBlock
                  title="학생 행동"
                  items={analysisResult.analysis.studentActions.map(
                    (item) => `${item.action}\n근거: ${item.evidence}`,
                  )}
                />
                <ResultBlock
                  title="기능"
                  items={analysisResult.analysis.skills.map(
                    (item) => `${item.name}\n근거: ${item.evidence}`,
                  )}
                />
              </div>
            ) : (
              <div className={styles.empty}>아직 분석 결과가 없습니다.</div>
            )}

            <button
              className={styles.primaryButton}
              type="button"
              disabled={!analysisResult || isBusy}
              onClick={generateDraft}
            >
              {status === "generating" ? "Groq 생성 중…" : "분석 결과로 초안 생성"}
            </button>
          </div>

          <div className={`${styles.panel} ${styles.draftPanel}`}>
            <div className={styles.panelHeading}>
              <span className={styles.step}>04</span>
              <div><h2>활동 기록 초안</h2><p>교사가 검토하고 수정할 AI 초안입니다.</p></div>
            </div>
            {draftResult ? (
              <>
                <div className={styles.draft}>{draftResult.draft}</div>
                <h3>사용된 근거</h3>
                <ul className={styles.evidenceList}>
                  {draftResult.usedEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                </ul>
              </>
            ) : (
              <div className={styles.empty}>분석 완료 후 초안 생성을 요청할 수 있습니다.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ResultBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={styles.resultBlock}>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul>
      ) : (
        <p className={styles.muted}>확인된 내용 없음</p>
      )}
    </section>
  );
}
