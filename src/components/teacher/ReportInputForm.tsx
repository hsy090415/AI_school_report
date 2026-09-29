"use client";

import { useState } from "react";

import type { ActivityCode } from "../../types";
import { DNA_QUESTIONS, REPORT_FILE_SLOTS, type FileSlotDefinition } from "./report-form-content";

export interface ReportInputFormProps {
  activityCode: ActivityCode;
  reportText: string;
  dnaAnswers: readonly string[];
  onReportTextChange: (value: string) => void;
  onDnaAnswerChange: (index: number, value: string) => void;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function FileSlot({ slot }: { slot: FileSlotDefinition }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  return (
    <div className="report-file-slot">
      <div className="report-file-heading">
        <strong>{slot.label}</strong>
        <span>{slot.help} · 최대 20MB</span>
      </div>
      <label className="report-file-picker">
        <span aria-hidden="true">↑</span>
        <span>{file ? file.name : "파일 선택"}</span>
        <input
          type="file"
          accept={slot.accept}
          aria-label={`${slot.label} 파일 선택`}
          onChange={(event) => {
            const candidate = event.target.files?.[0];
            if (!candidate) return;
            const name = candidate.name.toLowerCase();
            if (!slot.extensions.some((extension) => name.endsWith(extension))) {
              setFile(null);
              setError(`${slot.help} 형식의 파일만 선택할 수 있습니다.`);
              event.target.value = "";
              return;
            }
            if (candidate.size > MAX_FILE_BYTES) {
              setFile(null);
              setError("파일 크기는 20MB 이하여야 합니다.");
              event.target.value = "";
              return;
            }
            setFile(candidate);
            setError("");
            event.target.value = "";
          }}
        />
      </label>
      {file && <button className="report-file-remove" type="button" onClick={() => setFile(null)}>선택 해제</button>}
      {error && <p className="report-file-error" role="alert">{error}</p>}
    </div>
  );
}

export function ReportInputForm({ activityCode, reportText, dnaAnswers, onReportTextChange, onDnaAnswerChange }: ReportInputFormProps) {
  const isDna = activityCode === "CAREER_DNA";

  return (
    <div className="activity-report-form">
      <div className="report-extra-text">
        <label className="field-label" htmlFor="student-report-text">학생 본문</label>
        <textarea
          id="student-report-text"
          className="report-textarea"
          value={reportText}
          onChange={(event) => onReportTextChange(event.target.value)}
          placeholder="학생이 작성한 활동 내용을 입력하세요."
          rows={6}
        />
        <p className="report-field-help">네 활동에 공통으로 사용합니다. {isDna ? "DNA에서는 아래 차시별 답변도 AI 분석에 포함됩니다." : "AI 분석에는 이 본문만 전달됩니다."}</p>
      </div>
      {isDna && (
        <div className="report-question-section">
          <div className="report-question-heading">
            <strong>DNA 20차시 질문과 학생 답변</strong>
            <span>{dnaAnswers.filter((answer) => answer.trim()).length}/20개 입력</span>
          </div>
          <div className="report-question-list">
            {DNA_QUESTIONS.map((question, index) => (
              <div className="report-question" key={index}>
                <label htmlFor={`dna-answer-${index}`}><span>{index + 1}차시</span>{question}</label>
                <textarea
                  id={`dna-answer-${index}`}
                  value={dnaAnswers[index] ?? ""}
                  onChange={(event) => onDnaAnswerChange(index, event.target.value)}
                  placeholder="학생이 제출한 답변을 입력하세요."
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="report-file-section">
        <div className="report-question-heading"><strong>제출 파일</strong><span>{REPORT_FILE_SLOTS[activityCode].length}개 항목</span></div>
        {REPORT_FILE_SLOTS[activityCode].map((slot) => <FileSlot key={slot.id} slot={slot} />)}
        <p className="report-file-notice">현재는 화면 시연용 파일 선택입니다. 선택한 파일은 서버에 저장되거나 AI 분석에 전달되지 않습니다.</p>
      </div>
    </div>
  );
}
