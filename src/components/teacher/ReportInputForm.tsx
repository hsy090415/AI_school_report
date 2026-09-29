"use client";

import { useState } from "react";
import { CAREER_DNA_QUESTIONS, CAREER_DNA_STAGE_LABELS, type CareerDnaStage } from "../../lib/career-dna-form";
import type { ActivityCode } from "../../types";
import type { OneTopicReport } from "../../types/one-topic";

export interface ActivityInputs {
  dnaAnswers: Record<number, string>;
  readingPresentation: File | null;
  researchPresentation: File | null;
  icanReport: File | null;
  icanReflection: string;
  oneTopicFile: File | null;
  oneTopicReport: OneTopicReport;
  curriculumText: string;
  curriculumPresentation: File | null;
}

export function emptyActivityInputs(): ActivityInputs {
  return {
    dnaAnswers: {}, readingPresentation: null, researchPresentation: null,
    icanReport: null, icanReflection: "", oneTopicFile: null,
    oneTopicReport: { area: "", topic: "", references: "", content: "", reflection: "" },
    curriculumText: "", curriculumPresentation: null,
  };
}

const ONE_TOPIC_FIELDS: { key: keyof OneTopicReport; label: string; required?: boolean }[] = [
  { key: "area", label: "발표 영역" },
  { key: "topic", label: "발표 주제", required: true },
  { key: "references", label: "관련 자료·도서·참고사이트" },
  { key: "content", label: "발표 내용", required: true },
  { key: "reflection", label: "소감 및 느낀점" },
];

async function responseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error?: { message?: unknown } }).error;
      if (typeof error?.message === "string") return error.message;
    }
  } catch { /* Preserve a readable error for non-JSON responses. */ }
  return "보고서에서 내용을 추출하지 못했습니다.";
}

function FilePicker({ label, help, file, accept, extensions, maxMB, disabled, onChange }: {
  label: string; help: string; file: File | null; accept: string;
  extensions: readonly string[]; maxMB: number; disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const [error, setError] = useState("");
  return <div className="report-file-slot">
    <div className="report-file-heading"><strong>{label}</strong><span>{help} · 최대 {maxMB}MB</span></div>
    <label className="report-file-picker"><span aria-hidden="true">↑</span><span>{file?.name ?? "파일 선택"}</span>
      <input type="file" accept={accept} disabled={disabled} aria-label={`${label} 파일 선택`}
        onChange={(event) => {
          const candidate = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (!candidate) return;
          if (candidate.size === 0) {
            setError("내용이 있는 파일을 선택해 주세요.");
            return;
          }
          if (!extensions.some((extension) => candidate.name.toLowerCase().endsWith(extension))) {
            setError(`${help} 형식의 파일만 선택할 수 있습니다.`);
            return;
          }
          if (candidate.size > maxMB * 1024 * 1024) {
            setError(`파일 크기는 ${maxMB}MB 이하여야 합니다.`);
            return;
          }
          setError("");
          onChange(candidate);
        }} />
    </label>
    {file && <button className="report-file-remove" type="button" disabled={disabled} onClick={() => onChange(null)}>선택 해제</button>}
    {error && <p className="report-file-error" role="alert">{error}</p>}
  </div>;
}

export function ReportInputForm({ activityCode, value, onChange, disabled }: {
  activityCode: ActivityCode; value: ActivityInputs;
  onChange: (next: ActivityInputs) => void; disabled?: boolean;
}) {
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");

  async function extractOneTopic(file: File | null) {
    if (!file) { onChange({ ...value, oneTopicFile: null }); return; }
    setExtracting(true);
    setExtractError("");
    try {
      const form = new FormData();
      form.append("reportFile", file);
      const response = await fetch("/api/extract-one-topic-report", { method: "POST", body: form });
      if (!response.ok) throw new Error(await responseError(response));
      const report = await response.json() as OneTopicReport;
      onChange({ ...value, oneTopicFile: file, oneTopicReport: report });
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "보고서를 읽지 못했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  if (activityCode === "CAREER_DNA") {
    const stages: CareerDnaStage[] = ["DIRECTION", "READING", "RESEARCH", "REFLECTION"];
    const answered = CAREER_DNA_QUESTIONS.filter((question) => value.dnaAnswers[question.session]?.trim()).length;
    return <div className="activity-report-form">
      <p className="report-form-intro">차시별 답변 20개를 입력하세요. 발표자료는 질문 작성 단계와 관계없이 아래에서 따로 첨부할 수 있습니다.</p>
      <div className="report-question-heading"><strong>DNA 학생 답변</strong><span>{answered}/20개 입력</span></div>
      {stages.map((stage) => {
        const questions = CAREER_DNA_QUESTIONS.filter((question) => question.stage === stage);
        return <details className="report-stage" key={stage}>
          <summary>{CAREER_DNA_STAGE_LABELS[stage]} <span>{questions.filter((question) => value.dnaAnswers[question.session]?.trim()).length}/{questions.length}</span></summary>
          <div className="report-question-list">{questions.map((question) => <div className="report-question" key={question.session}>
            <label htmlFor={`dna-${question.session}`}><span>{question.session}차시</span>{question.question}</label>
            <textarea id={`dna-${question.session}`} rows={Math.min(question.rows, 5)} maxLength={5000} disabled={disabled}
              placeholder={question.placeholder} value={value.dnaAnswers[question.session] ?? ""}
              onChange={(event) => onChange({ ...value, dnaAnswers: { ...value.dnaAnswers, [question.session]: event.target.value } })} />
          </div>)}</div>
        </details>;
      })}
      <div className="report-file-section">
        <div className="report-question-heading"><strong>발표자료 첨부</strong><span>독서 탐구 · 융합 탐구</span></div>
        <FilePicker label="독서 기반 심화 탐구 발표자료" help="PDF 또는 PPTX" file={value.readingPresentation}
          accept=".pdf,.pptx" extensions={[".pdf", ".pptx"]} maxMB={20} disabled={disabled}
          onChange={(file) => onChange({ ...value, readingPresentation: file })} />
        <FilePicker label="융합 탐구 발표자료" help="PDF 또는 PPTX" file={value.researchPresentation}
          accept=".pdf,.pptx" extensions={[".pdf", ".pptx"]} maxMB={20} disabled={disabled}
          onChange={(file) => onChange({ ...value, researchPresentation: file })} />
      </div>
    </div>;
  }

  if (activityCode === "AUTONOMOUS_ICAN_WECAN") return <div className="activity-report-form">
    <p className="report-form-intro">정해진 엑셀 보고서와 학생의 느낀점을 입력합니다. 보고서의 논문 정보는 서버에서 직접 추출합니다.</p>
    <FilePicker label="I CAN WE CAN 논문 요약 엑셀 보고서" help="XLSX" file={value.icanReport}
      accept=".xlsx" extensions={[".xlsx"]} maxMB={10} disabled={disabled}
      onChange={(file) => onChange({ ...value, icanReport: file })} />
    <div className="report-extra-text"><label className="field-label" htmlFor="ican-reflection">탐구 과정에서의 느낀점</label>
      <textarea id="ican-reflection" className="report-textarea" rows={8} maxLength={5000} disabled={disabled}
        placeholder="어려웠던 점, 해결을 위해 찾아본 자료, 새롭게 이해한 점과 적용 가능성을 적어 주세요."
        value={value.icanReflection} onChange={(event) => onChange({ ...value, icanReflection: event.target.value })} />
    </div>
  </div>;

  if (activityCode === "AUTONOMOUS_ONE_TOPIC") return <div className="activity-report-form">
    <p className="report-form-intro">DOCX/HWP 보고서에서 내용을 추출한 뒤 각 항목을 확인·수정할 수 있습니다. 파일 없이 직접 입력해도 됩니다.</p>
    <FilePicker label="1인 1주제 융합활동 보고서" help="DOCX 또는 HWP" file={value.oneTopicFile}
      accept=".docx,.hwp" extensions={[".docx", ".hwp"]} maxMB={10} disabled={disabled || extracting}
      onChange={(file) => void extractOneTopic(file)} />
    {extracting && <p className="report-field-help" role="status">보고서 내용을 추출하고 있습니다…</p>}
    {extractError && <p className="report-file-error" role="alert">{extractError}</p>}
    <div className="report-question-list">{ONE_TOPIC_FIELDS.map(({ key, label, required }) => <div className="report-question" key={key}>
      <label htmlFor={`one-topic-${key}`}>{label}{required ? " (필수)" : ""}</label>
      <textarea id={`one-topic-${key}`} rows={key === "content" ? 7 : 3} maxLength={10000} disabled={disabled || extracting}
        value={value.oneTopicReport[key]}
        onChange={(event) => onChange({ ...value, oneTopicReport: { ...value.oneTopicReport, [key]: event.target.value } })} />
    </div>)}</div>
    <p className="report-field-help">발표자료는 기존 테스트와 같이 준비된 것으로 간주하며 별도로 분석하지 않습니다.</p>
  </div>;

  return <div className="activity-report-form">
    <p className="report-form-intro">교과창체 활동 전체 내용을 자유롭게 입력하세요. 파트별로 나눌 필요가 없습니다.</p>
    <div className="report-extra-text"><label className="field-label" htmlFor="curriculum-text">학생 활동 내용</label>
      <textarea id="curriculum-text" className="report-textarea" rows={14} maxLength={20000} disabled={disabled}
        placeholder="희망 진로, 관심을 갖게 된 계기, 조사·학교 활동, 배운 점과 앞으로의 계획을 자유롭게 작성해 주세요."
        value={value.curriculumText} onChange={(event) => onChange({ ...value, curriculumText: event.target.value })} />
    </div>
    <div className="report-file-section">
      <div className="report-question-heading"><strong>발표자료 첨부</strong><span>1개</span></div>
      <FilePicker label="교과창체 발표자료" help="PDF, PPT 또는 PPTX" file={value.curriculumPresentation}
        accept=".pdf,.ppt,.pptx" extensions={[".pdf", ".ppt", ".pptx"]} maxMB={20} disabled={disabled}
        onChange={(file) => onChange({ ...value, curriculumPresentation: file })} />
      <p className="report-file-notice">현재 초안 생성에는 위 텍스트만 사용합니다. 발표자료는 이 화면에 첨부되며 내용 분석은 아직 연결되지 않았습니다.</p>
    </div>
  </div>;
}
