import "server-only";

import { inflateRawSync } from "node:zlib";
import { AiRequestError } from "../ai/errors";

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new AiRequestError("INVALID_REQUEST", "압축 문서 구조를 읽을 수 없습니다.");
}

function readEntries(buffer: Buffer): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new AiRequestError("INVALID_REQUEST", "압축 문서의 파일 목록을 읽을 수 없습니다.");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      compressionMethod: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new AiRequestError("INVALID_REQUEST", "압축 문서의 파일 데이터를 읽을 수 없습니다.");
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);
  throw new AiRequestError("INVALID_REQUEST", "지원하지 않는 압축 방식의 문서입니다.");
}

export function extractZipEntries(
  bytes: Uint8Array,
  include: (name: string) => boolean,
  maxExtractedBytes = 10 * 1024 * 1024,
): Map<string, Buffer> {
  const buffer = Buffer.from(bytes);
  const selected = readEntries(buffer).filter((entry) => include(entry.name));
  let totalBytes = 0;
  const files = new Map<string, Buffer>();
  for (const entry of selected) {
    totalBytes += entry.uncompressedSize;
    if (totalBytes > maxExtractedBytes) {
      throw new AiRequestError("INVALID_REQUEST", "문서에서 추출할 텍스트 데이터가 너무 큽니다.");
    }
    files.set(entry.name, readEntry(buffer, entry));
  }
  return files;
}

export function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}
