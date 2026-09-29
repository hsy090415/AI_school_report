"use client";

import type {
  AnalyzeCareerDnaResponse,
  GenerateActivityRecordResponse,
  GenerateIcanWecanRecordResponse,
} from "../../types";
import type { CareerDnaStage } from "../../lib/career-dna-form";

export interface DnaWorkbenchSession {
  stage: CareerDnaStage;
  answers: Record<number, string>;
  readingPresentation: File | null;
  researchPresentation: File | null;
  analysisResult: AnalyzeCareerDnaResponse | null;
  draftResult: GenerateActivityRecordResponse | null;
  draftMaxLength: number;
  editedDraft: string;
}

export interface IcanWecanWorkbenchSession {
  reportFile: File | null;
  reflection: string;
  maxLength: number;
  result: GenerateIcanWecanRecordResponse | null;
  editedDraft: string;
}

let dnaSession: DnaWorkbenchSession | undefined;
let icanWecanSession: IcanWecanWorkbenchSession | undefined;

export function getDnaWorkbenchSession(): DnaWorkbenchSession | undefined {
  return dnaSession;
}

export function saveDnaWorkbenchSession(session: DnaWorkbenchSession): void {
  dnaSession = session;
}

export function getIcanWecanWorkbenchSession(): IcanWecanWorkbenchSession | undefined {
  return icanWecanSession;
}

export function saveIcanWecanWorkbenchSession(session: IcanWecanWorkbenchSession): void {
  icanWecanSession = session;
}
