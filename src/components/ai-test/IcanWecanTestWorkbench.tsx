"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
  type GenerateIcanWecanRecordResponse,
} from "../../types";
import { ActivityTestNav } from "./ActivityTestNav";
import {
  getIcanWecanWorkbenchSession,
  saveIcanWecanWorkbenchSession,
} from "./workbench-session";
import styles from "./dna-test.module.css";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const REFLECTION_EXAMPLE =
  "처음에는 반도체와 AI 두 분야의 지식을 동시에 요구하는 논문을 이해하는 데 어려움이 있었지만, 관련 반도체 검사 장비 기업의 기술 설명 자료와 딥러닝 기초 강의를 함께 찾아보며 개념을 정리한 결과, 논문에서 제시한 연구 방법의 논리와 실험 설계 방식을 스스로 해석할 수 있을 만큼 성장할 수 있었다. 특히 기술을 이해하는 것을 넘어, 실제 장비의 특성과 산업 현장에서의 적용 가능성까지 분석해 보는 경험을 통해 융합적 사고 역량을 키울 수 있었다.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown): string {
  return isObject(value) && isObject(value.error) && typeof value.error.message === "string"
    ? value.error.message
    : "I CAN WE CAN 초안 생성에 실패했습니다.";
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IcanWecanTestWorkbench() {
  const savedSession = useRef(getIcanWecanWorkbenchSession()).current;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reportFile, setReportFile] = useState<File | null>(savedSession?.reportFile ?? null);
  const [reflection, setReflection] = useState(savedSession?.reflection ?? "");
  const [maxLength, setMaxLength] = useState(savedSession?.maxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH);
  const [result, setResult] = useState<GenerateIcanWecanRecordResponse | null>(savedSession?.result ?? null);
  const [editedDraft, setEditedDraft] = useState(savedSession?.editedDraft ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveIcanWecanWorkbenchSession({ reportFile, reflection, maxLength, result, editedDraft });
  }, [reportFile, reflection, maxLength, result, editedDraft]);

  function selectFile(file: File | null): void {
    setResult(null);
    setEditedDraft("");
    setError(null);
    if (!file) {
      setReportFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setReportFile(null);
      setError("보고서는 XLSX 형식만 선택할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setReportFile(null);
      setError("엑셀 보고서는 10MB 이하만 선택할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setReportFile(file);
  }

  async function generate(): Promise<void> {
    if (!reportFile || !reflection.trim()) {
      setError("엑셀 보고서와 느낀점을 모두 입력해 주세요.");
      return;
    }
    const formData = new FormData();
    formData.append("studentId", "ai-test-student");
    formData.append("reportFile", reportFile);
    formData.append("reflection", reflection.trim());
    formData.append("maxLength", String(maxLength));
    setBusy(true);
    setError(null);
    setResult(null);
    setEditedDraft("");
    try {
      const response = await fetch("/api/generate-ican-wecan-record", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) throw new Error(errorMessage(body));
      const generated = body as GenerateIcanWecanRecordResponse;
      setResult(generated);
      setEditedDraft(generated.draft);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "초안 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const currentLength = Array.from(editedDraft).length;
  return (
    <main className={styles.page}>
      <ActivityTestNav active="ICAN_WECAN" />
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AUTONOMOUS ACTIVITY · I CAN WE CAN</span>
          <h1>협동심화탐구프로젝트 초안 테스트</h1>
          <p>정해진 엑셀 보고서와 학생의 느낀점을 서버에서 추출해 Groq로 초안을 생성합니다.</p>
        </div>
        <div className={styles.pipeline}><span>XLSX 보고서</span><b>+</b><span>느낀점</span><b>→</b><span>Groq 1회 생성</span></div>
      </header>
      <aside className={styles.notice}>
        <strong>Gemini 미사용</strong>
        <span>정해진 엑셀 셀을 서버에서 직접 읽습니다. 실제 학생 개인정보를 제거한 테스트 자료를 사용하세요.</span>
      </aside>

      <div className={styles.singleColumn}>
        <section className={styles.materialsPanel}>
          <div className={styles.sectionHeading}>
            <div><span>REPORT</span><h2>보고서와 느낀점 입력</h2></div>
            <p>{reportFile && reflection.trim() ? "입력 완료" : "2개 항목 필수"}</p>
          </div>
          <div className={styles.presentationBox}>
            <div><span>엑셀 보고서</span><h3>I CAN WE CAN 논문 요약 파일</h3><p>제1논문~제8논문 시트에서 작성된 논문 정보와 요약을 추출합니다.</p></div>
            <label className={styles.filePicker}>
              <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
              <strong>{reportFile ? reportFile.name : "XLSX 파일 선택"}</strong>
              <small>{reportFile ? formatFileSize(reportFile.size) : "최대 10MB"}</small>
            </label>
          </div>

          <article className={styles.questionCard}>
            <div className={styles.questionTitle}><span>느낀점</span><h3>탐구 과정에서의 성장과 배운 점</h3></div>
            <label htmlFor="ican-reflection">어려웠던 점, 해결을 위해 추가로 찾아본 자료나 강의, 이해가 확장된 과정, 적용 가능성에 대한 생각을 작성해 주세요.</label>
            <textarea id="ican-reflection" rows={8} maxLength={5000} value={reflection} disabled={busy} placeholder="탐구 과정에서 겪은 어려움과 해결 과정, 새롭게 이해한 점을 구체적으로 작성해 주세요." onChange={(event) => { setReflection(event.target.value); setResult(null); setEditedDraft(""); }} />
            <div className={styles.answerMeta}>
              <button className={styles.inlineExampleButton} type="button" disabled={busy} onClick={() => setReflection(REFLECTION_EXAMPLE)}>예시 입력</button>
              <span>{reflection.length.toLocaleString()}/5,000</span>
            </div>
          </article>

          <div className={styles.draftSettings}>
            <label htmlFor="ican-max-length"><span>초안 글자 수 기준</span><input id="ican-max-length" type="number" min={MIN_ACTIVITY_RECORD_MAX_LENGTH} max={MAX_ACTIVITY_RECORD_MAX_LENGTH} step={10} value={maxLength} disabled={busy} onChange={(event) => setMaxLength(Number(event.target.value))} /></label>
            <p>설정값보다 70자 짧게 Groq에 한 번 요청하고, 생성된 결과는 교사가 직접 수정합니다.</p>
          </div>
          <button className={styles.analyzeButton} type="button" disabled={busy || !reportFile || !reflection.trim() || maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH} onClick={generate}>
            {busy ? `Groq에 ${Math.max(1, maxLength - 70)}자 초안 요청 중…` : "I CAN WE CAN 초안 생성"}
          </button>
          {error ? <div className={styles.draftError} role="alert"><strong>초안 생성 오류</strong><span>{error}</span></div> : null}
        </section>

        {result ? (
          <section className={styles.resultsPanel}>
            <div className={styles.sectionHeading}><div><span>RESULT</span><h2>교사 검토용 초안</h2></div><p>논문 {result.papers.length}편 추출</p></div>
            <div className={styles.paperList}>
              {result.papers.map((paper) => <div key={`${paper.sheetName}-${paper.title}`}><strong>{paper.title}</strong><span>{[paper.author, paper.publisher, paper.publishedAt].filter(Boolean).join(" · ")}</span></div>)}
            </div>
            <div className={styles.draft}>
              <div className={styles.draftHeader}><span>수정 가능한 초안</span><strong className={currentLength > maxLength ? styles.overLimit : ""}>{currentLength.toLocaleString()}자 · 기준 {maxLength.toLocaleString()}자</strong></div>
              <textarea value={editedDraft} onChange={(event) => setEditedDraft(event.target.value)} aria-label="I CAN WE CAN 활동 기록 초안" />
              <p className={styles.editHint}>모든 문장은 -(으)ㅁ 종결을 사용합니다. 기준을 넘으면 교사가 직접 수정할 수 있습니다.</p>
              <h3>사용된 근거</h3>
              <ul>{result.usedEvidence.map((evidence, index) => <li key={`${index}-${evidence}`}>{evidence}</li>)}</ul>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
