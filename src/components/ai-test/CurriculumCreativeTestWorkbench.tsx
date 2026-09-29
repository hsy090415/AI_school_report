"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../types";
import {
  CURRICULUM_CREATIVE_PARTS,
  type CurriculumCreativeAnswers,
  type GenerateCurriculumCreativeRecordResponse,
} from "../../types/curriculum-creative";
import { ActivityTestNav } from "./ActivityTestNav";
import styles from "./dna-test.module.css";

const emptyAnswers: CurriculumCreativeAnswers = {
  career: "", motivation: "", research: "", roleModel: "", preparation: "", plan: "",
};

interface Session {
  answers: CurriculumCreativeAnswers;
  maxLength: number;
  result: GenerateCurriculumCreativeRecordResponse | null;
  editedDraft: string;
}

let savedSession: Session | undefined;

function errorMessage(value: unknown, status: number): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return `초안 생성에 실패했습니다. (${status})`;
}

export function CurriculumCreativeTestWorkbench() {
  const [state, setState] = useState<Session>(() => savedSession ?? {
    answers: { ...emptyAnswers }, maxLength: DEFAULT_ACTIVITY_RECORD_MAX_LENGTH, result: null, editedDraft: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const requestLock = useRef(false);

  useEffect(() => { savedSession = state; }, [state]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [busy]);

  function updateAnswer(key: keyof CurriculumCreativeAnswers, value: string): void {
    setState((current) => ({
      ...current,
      answers: { ...current.answers, [key]: value },
      result: null,
      editedDraft: "",
    }));
    setError("");
  }

  async function generate(): Promise<void> {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setElapsedSeconds(0);
    setError("");
    try {
      const response = await fetch("/api/generate-curriculum-creative-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: state.answers, maxLength: state.maxLength }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`서버가 JSON이 아닌 응답을 반환했습니다. (${response.status})`);
      }
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, response.status));
      const result = body as GenerateCurriculumCreativeRecordResponse;
      setState((current) => ({ ...current, result, editedDraft: result.draft }));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "초안 생성에 실패했습니다.");
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  const filledCount = CURRICULUM_CREATIVE_PARTS.filter((part) => state.answers[part.key].trim()).length;
  const validLength = Number.isInteger(state.maxLength) &&
    state.maxLength >= MIN_ACTIVITY_RECORD_MAX_LENGTH && state.maxLength <= MAX_ACTIVITY_RECORD_MAX_LENGTH;
  const currentLength = Array.from(state.editedDraft).length;

  return <main className={styles.page}>
    <ActivityTestNav active="CURRICULUM_CREATIVE" />
    <header className={styles.hero}><div>
      <span className={styles.eyebrow}>CAREER ACTIVITY · 교과창체</span>
      <h1>교과창체 초안 테스트</h1>
      <p>진로 탐색의 여섯 파트를 직접 입력하고 Groq로 교사 검토용 초안을 생성합니다.</p>
    </div><div className={styles.pipeline}><span>6개 파트 입력</span><b>→</b><span>Groq 1회 생성</span><b>→</b><span>교사 수정</span></div></header>
    <aside className={styles.notice}><strong>테스트 자료 사용</strong><span>개인정보를 제거한 내용을 입력하세요. 현재까지 한 활동과 앞으로의 계획을 구분해 초안을 생성합니다.</span></aside>

    <div className={styles.singleColumn}>
      <section className={styles.materialsPanel}>
        <div className={styles.sectionHeading}><div><span>CAREER FORM</span><h2>진로 탐색 내용 입력</h2></div><p>{filledCount}/6개 파트 작성</p></div>
        <p className={styles.materialsIntro}>희망진로와 다른 파트 한 개 이상을 작성해 주세요. 경험이 없는 항목은 비워 둘 수 있습니다.</p>
        <div className={styles.questionList}>
          {CURRICULUM_CREATIVE_PARTS.map((part, index) => <article className={styles.questionCard} key={part.key}>
            <div className={styles.questionTitle}><span>파트 {index + 1}</span><h3>{part.title}</h3></div>
            <label htmlFor={`curriculum-${part.key}`}>{part.guide}</label>
            <textarea id={`curriculum-${part.key}`} rows={5} maxLength={5000} disabled={busy}
              value={state.answers[part.key]} placeholder="실제로 조사하거나 경험한 내용을 구체적으로 적어 주세요."
              onChange={(event) => updateAnswer(part.key, event.target.value)} />
            <div className={styles.answerMeta}><span>실제로 조사하거나 경험한 내용만 작성해 주세요.</span><span>{state.answers[part.key].length.toLocaleString()}/5,000</span></div>
          </article>)}
        </div>
        <div className={styles.draftSettings}>
          <label htmlFor="curriculum-max-length"><span>초안 글자 수 기준</span><input id="curriculum-max-length" type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH} max={MAX_ACTIVITY_RECORD_MAX_LENGTH} step={10} disabled={busy} value={state.maxLength} onChange={(event) => setState((current) => ({ ...current, maxLength: Number(event.target.value) }))} /></label>
          <p>설정한 글자 수를 목표로 한 번 요청합니다. 실제 글자 수를 표시하고 교사가 직접 수정할 수 있습니다.</p>
        </div>
        <button className={styles.analyzeButton} type="button" disabled={busy || !validLength || !state.answers.career.trim() || filledCount < 2} onClick={() => void generate()}>
          {busy ? `Groq 초안 생성 중… ${elapsedSeconds}초` : "교과창체 초안 생성"}
        </button>
        {error && <div className={styles.draftError} role="alert"><strong>초안 생성 오류</strong><span>{error}</span></div>}
      </section>

      {state.result && <section className={styles.resultsPanel}>
        <div className={styles.sectionHeading}><div><span>RESULT</span><h2>교사 검토용 초안</h2></div><p>로컬 기록에 저장됨</p></div>
        <div className={styles.draft}>
          <div className={styles.draftHeader}><span>수정 가능한 초안</span><strong className={currentLength > state.maxLength ? styles.overLimit : ""}>{currentLength.toLocaleString()}자 · 기준 {state.maxLength.toLocaleString()}자</strong></div>
          <textarea aria-label="교과창체 교사 수정 초안" value={state.editedDraft} onChange={(event) => setState((current) => ({ ...current, editedDraft: event.target.value }))} />
          <p className={styles.editHint}>AI 원본 {state.result.characterCount.toLocaleString()}자. 계획을 이미 수행한 일처럼 표현하지 않았는지 확인해 주세요.</p>
          <details><summary>AI 원본 초안</summary><p>{state.result.draft}</p></details>
        </div>
      </section>}
    </div>
  </main>;
}
