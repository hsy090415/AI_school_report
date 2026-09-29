import "server-only";

import { AiRequestError } from "../ai/errors";
import { decodeXmlText, extractZipEntries } from "./zip";

export interface IcanWecanPaper {
  sheetName: string;
  studentName: string;
  title: string;
  author: string;
  publisher: string;
  publishedAt: string;
  purpose: string;
  method: string;
  result: string;
  conclusion: string;
}

function attribute(source: string, name: string): string {
  const match = source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"));
  return decodeXmlText(match?.[1] ?? "");
}

function xmlText(source: string): string {
  return Array.from(
    source.matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/gu),
  )
    .map((match) => decodeXmlText(match[1] ?? ""))
    .join("")
    .trim();
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return Array.from(
    xml.matchAll(/<(?:[\w-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?si>/gu),
  ).map((match) => xmlText(match[1] ?? ""));
}

function worksheetCells(xml: string, strings: string[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const match of xml.matchAll(
    /<(?:[\w-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?c>)/gu,
  )) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const reference = attribute(attributes, "r");
    const type = attribute(attributes, "t");
    if (!reference) continue;
    let value = "";
    if (type === "inlineStr") {
      value = xmlText(body);
    } else {
      const raw = decodeXmlText(
        body.match(
          /<(?:[\w-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?v>/u,
        )?.[1] ?? "",
      );
      value = type === "s" ? strings[Number(raw)] ?? "" : raw;
    }
    if (value.trim()) cells.set(reference, value.trim());
  }
  return cells;
}

function normalizeDecimal(value: string): string {
  if (!/^-?\d+\.\d{6,}$/u.test(value)) return value;
  return Number(value).toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
}

function workbookSheets(workbookXml: string, relationshipsXml: string): Array<{
  name: string;
  path: string;
}> {
  const relationships = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gu)) {
    const attributes = match[1] ?? "";
    relationships.set(attribute(attributes, "Id"), attribute(attributes, "Target"));
  }

  return Array.from(
    workbookXml.matchAll(
      /<(?:[\w-]+:)?sheet\b([^>]*)\/?>(?:<\/(?:[\w-]+:)?sheet>)?/gu,
    ),
  )
    .map((match) => {
      const attributes = match[1] ?? "";
      const target = relationships.get(attribute(attributes, "r:id")) ?? "";
      const normalizedTarget = target.replace(/^\//u, "").replace(/\\/gu, "/");
      return {
        name: attribute(attributes, "name"),
        path: normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget}`,
      };
    })
    .filter((sheet) => sheet.name && sheet.path);
}

export function extractIcanWecanWorkbook(bytes: Uint8Array): IcanWecanPaper[] {
  const files = extractZipEntries(
    bytes,
    (name) =>
      name === "xl/workbook.xml" ||
      name === "xl/_rels/workbook.xml.rels" ||
      name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/u.test(name),
    12 * 1024 * 1024,
  );
  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8");
  const relationshipsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbookXml || !relationshipsXml) {
    throw new AiRequestError("INVALID_REQUEST", "엑셀 통합 문서 구조를 읽을 수 없습니다.");
  }
  const strings = sharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const papers: IcanWecanPaper[] = [];

  for (const sheet of workbookSheets(workbookXml, relationshipsXml)) {
    if (!/^제\d+논문$/u.test(sheet.name)) continue;
    const sheetXml = files.get(sheet.path)?.toString("utf8");
    if (!sheetXml) continue;
    const cells = worksheetCells(sheetXml, strings);
    const paper: IcanWecanPaper = {
      sheetName: sheet.name,
      studentName: cells.get("B3") ?? "",
      title: cells.get("B4") ?? "",
      author: cells.get("B5") ?? "",
      publisher: cells.get("B6") ?? "",
      publishedAt: normalizeDecimal(cells.get("B7") ?? ""),
      purpose: cells.get("B11") ?? "",
      method: cells.get("B12") ?? "",
      result: cells.get("B13") ?? "",
      conclusion: cells.get("B14") ?? "",
    };
    if (paper.title && [paper.purpose, paper.method, paper.result, paper.conclusion].some(Boolean)) {
      papers.push(paper);
    }
  }

  if (papers.length === 0) {
    throw new AiRequestError(
      "INVALID_REQUEST",
      "엑셀에서 작성된 논문 요약을 찾을 수 없습니다. 제1논문~제8논문 양식을 확인해 주세요.",
    );
  }
  return papers;
}
