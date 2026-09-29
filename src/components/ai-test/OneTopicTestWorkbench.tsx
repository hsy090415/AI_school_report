"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_ACTIVITY_RECORD_MAX_LENGTH, MIN_ACTIVITY_RECORD_MAX_LENGTH, MAX_ACTIVITY_RECORD_MAX_LENGTH } from "../../types";
import type { OneTopicReport, GenerateOneTopicRecordResponse } from "../../types/one-topic";
import { ActivityTestNav } from "./ActivityTestNav";
import styles from "./dna-test.module.css";

const labels: Record<keyof OneTopicReport, string> = { area: "발표 영역", topic: "발표 주제", references: "관련 자료·도서·참고사이트", content: "발표 내용", reflection: "소감 및 느낀점" };
const emptyReport: OneTopicReport = { area: "", topic: "", references: "", content: "", reflection: "" };
interface Session {
  report: OneTopicReport | null;
  reportName: string;
  draft: GenerateOneTopicRecordResponse | null;
  edited: string;
  maxLength: number;
}
let saved: Session | undefined;

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (response.status === 404) {
      throw new Error("개발 서버가 이전 버전의 요청으로 처리했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
    }
    throw new Error(`서버가 JSON이 아닌 응답을 반환했습니다. (${response.status})`);
  }
  let body: unknown;
  try { body = await response.json() as unknown; }
  catch { throw new Error(`서버 JSON 응답을 읽을 수 없습니다. (${response.status})`); }
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : `요청 실패 (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function OneTopicTestWorkbench() {
  const [state, setState] = useState<Session>(() => saved ?? { report: null, reportName: "", draft: null, edited: "", maxLength: DEFAULT_ACTIVITY_RECORD_MAX_LENGTH });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const lock = useRef(0);
  useEffect(() => { saved = state; }, [state]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [busy]);
  function invalidate(update: Partial<Session>) {
    setState((s) => ({ ...s, ...update, draft: null, edited: "" }));
    setError("");
  }
  async function run(message: string, operation: () => Promise<void>) {
    if (lock.current && Date.now() - lock.current < 45_000) return;
    lock.current = Date.now(); setElapsedSeconds(0); setBusy(message); setError("");
    try { await operation(); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다."); }
    finally { lock.current = 0; setBusy(""); }
  }
  async function extract(file: File | undefined) {
    if (!file) return;
    invalidate({ report: null, reportName: "" });
    await run("보고서 텍스트 추출 중…", async () => {
      if (!(/\.(docx|hwp)$/iu.test(file.name)) || file.size > 10 * 1024 * 1024) throw new Error("10MB 이하의 DOCX 또는 HWP를 선택해 주세요.");
      const form = new FormData(); form.append("reportFile", file);
      const report = await readResponse<OneTopicReport>(await fetch("/api/extract-one-topic-report", { method: "POST", body: form }));
      setState((s) => ({ ...s, report, reportName: file.name }));
    });
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || Array.isArray(value) ||
        (Object.keys(labels) as (keyof OneTopicReport)[]).some((key) =>
          typeof (value as Record<string, unknown>)[key] !== "string")) {
        throw new Error("입력 백업 JSON 형식이 올바르지 않습니다.");
      }
      const report = Object.fromEntries((Object.keys(labels) as (keyof OneTopicReport)[]).map((key) =>
        [key, (value as Record<string, string>)[key]])) as unknown as OneTopicReport;
      invalidate({ report, reportName: file.name });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "입력 백업을 읽을 수 없습니다.");
    }
  }
  async function generate() {
    if (!state.report) return;
    await run("초안 생성 중…", async () => {
      const draft = await readResponse<GenerateOneTopicRecordResponse>(await fetch("/api/generate-one-topic-record", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: state.report, maxLength: state.maxLength }),
      }));
      setState((s) => ({ ...s, draft, edited: draft.draft }));
    });
  }
  const validLength = Number.isInteger(state.maxLength) && state.maxLength >= MIN_ACTIVITY_RECORD_MAX_LENGTH && state.maxLength <= MAX_ACTIVITY_RECORD_MAX_LENGTH;
  return <main className={styles.page}>
    <ActivityTestNav active="ONE_TOPIC" />
    <header className={styles.hero}><div><h1>1인 1주제 융합활동 초안 테스트</h1><p>보고서 원문으로 초안을 바로 생성합니다. 발표자료와 발표 활동은 별도 업로드 없이 완료된 것으로 간주합니다.</p></div></header>
    <aside className={styles.notice}><strong>테스트 자료 사용</strong><span>개인정보를 제거한 파일을 사용하세요. 초안 생성 시 보고서 원문만 Groq에 전송하고, 생성된 초안은 서버의 로컬 기록에 저장합니다.</span></aside>
    <div className={styles.singleColumn}>
      <section className={styles.materialsPanel}>
        <h2>보고서</h2>
        <label className={styles.filePicker}>보고서 DOCX 또는 HWP · 최대 10MB<input aria-label="보고서 DOCX 또는 HWP" type="file" accept=".docx,.hwp" disabled={!!busy} onChange={(e) => void extract(e.target.files?.[0])} /><strong>{state.reportName}</strong></label>
        <label className={styles.filePicker}>이전 입력 백업 JSON 불러오기<input aria-label="이전 입력 백업 JSON" type="file" accept=".json,application/json" disabled={!!busy} onChange={(e) => void restore(e.target.files?.[0])} /></label>
        {!state.report && <button type="button" className={styles.analyzeButton} disabled={!!busy} onClick={() => invalidate({ report: { ...emptyReport }, reportName: "직접 입력" })}>보고서 내용 직접 입력</button>}
        {state.report && <><p>추출한 내용을 확인하고 수정하세요. 빈 양식은 발표 주제와 내용을 작성한 뒤 초안을 생성할 수 있습니다. 이름·학번·일자는 추출 대상에서 제외합니다.</p>
          {(Object.keys(labels) as (keyof OneTopicReport)[]).map((key) => <article className={styles.questionCard} key={key}>
            <label htmlFor={`one-${key}`}>{labels[key]}{key === "topic" || key === "content" ? " (필수)" : ""}</label>
            <textarea id={`one-${key}`} rows={key === "content" ? 7 : 3} maxLength={10000} disabled={!!busy} value={state.report![key]} onChange={(e) => invalidate({ report: { ...state.report!, [key]: e.target.value } })} />
          </article>)}
        </>}
        <div className={styles.draftSettings}><label>초안 글자 수 기준<input aria-label="초안 글자 수 기준" type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH} max={MAX_ACTIVITY_RECORD_MAX_LENGTH} disabled={!!busy} value={state.maxLength} onChange={(e) => setState((s) => ({ ...s, maxLength: Number(e.target.value) }))} /></label><p>원문으로 한 번 생성합니다. 실제 글자 수를 확인하고 교사가 수정할 수 있습니다.</p></div>
        <button className={styles.analyzeButton} disabled={!!busy || !validLength || !state.report?.topic.trim() || !state.report?.content.trim()} onClick={() => void generate()}>보고서 원문으로 초안 생성</button>
        {busy && <div role="status"><p>{busy} · {elapsedSeconds}초 경과</p></div>}
        {error && <div className={styles.draftError} role="alert">{error}</div>}
      </section>
      {state.draft && <section className={styles.resultsPanel}>
        <div className={styles.draft}><div className={styles.draftHeader}><h3>교사 검토용 초안</h3><strong className={Array.from(state.edited).length > state.maxLength ? styles.overLimit : ""}>{Array.from(state.edited).length}자 · 기준 {state.maxLength}자</strong></div>
          <textarea aria-label="1인 1주제 교사 수정 초안" value={state.edited} onChange={(e) => setState((s) => ({ ...s, edited: e.target.value }))} />
          <details><summary>AI 원본 초안 · {state.draft.characterCount}자</summary><p>{state.draft.draft}</p></details>
        </div>
      </section>}
    </div>
  </main>;
}
