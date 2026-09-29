import "server-only";
import { inflateRawSync } from "node:zlib";
import { AiRequestError } from "../ai/errors";

const LIMIT = 16 * 1024 * 1024;
const END = 0xfffffffe;
const FREE = 0xffffffff;

// CFB sector chains are bounded and cycle checked before reading HWP streams.
function compoundStreams(bytes: Uint8Array): Map<string, Buffer> {
  const data = Buffer.from(bytes);
  function requireValid(condition: boolean): asserts condition {
    if (!condition) throw new Error("Invalid compound document");
  }
  requireValid(data.length >= 512 && data.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")));
  const shift = data.readUInt16LE(30);
  requireValid((shift === 9 || shift === 12) && data.readUInt16LE(32) === 6);
  const sectorSize = 2 ** shift;
  const sectorCount = Math.floor(data.length / sectorSize) - 1;
  function sector(id: number): Buffer {
    requireValid(id >= 0 && id < sectorCount);
    return data.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  }
  function words(buffer: Buffer): number[] {
    return Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readUInt32LE(i * 4));
  }
  const fatIds = words(data.subarray(76, 512)).filter((id) => id !== FREE);
  let difat = data.readUInt32LE(68);
  const difatSeen = new Set<number>();
  const difatCount = data.readUInt32LE(72);
  requireValid(difatCount <= sectorCount);
  for (let i = 0; i < difatCount; i += 1) {
    requireValid(!difatSeen.has(difat)); difatSeen.add(difat);
    const ids = words(sector(difat));
    difat = ids.pop()!;
    fatIds.push(...ids.filter((id) => id !== FREE));
  }
  requireValid(fatIds.length === data.readUInt32LE(44) && fatIds.length <= sectorCount);
  const fat = fatIds.flatMap((id) => words(sector(id)));
  function chain(start: number, table: number[], read: (id: number) => Buffer, size?: number): Buffer {
    const seen = new Set<number>(); const parts: Buffer[] = []; let total = 0; let id = start;
    requireValid(size === undefined || size <= LIMIT);
    if (size === 0) return Buffer.alloc(0);
    while (id !== END) {
      requireValid(id < table.length && !seen.has(id)); seen.add(id);
      const part = read(id); total += part.length; requireValid(total <= LIMIT);
      parts.push(part); id = table[id]!;
    }
    requireValid(size === undefined || total >= size);
    return Buffer.concat(parts).subarray(0, size);
  }
  const directory = chain(data.readUInt32LE(48), fat, sector);
  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const length = directory.readUInt16LE(offset + 64);
    const type = directory[offset + 66];
    requireValid(!type || (length >= 2 && length <= 64 && length % 2 === 0));
    const size = Number(directory.readBigUInt64LE(offset + 120));
    entries.push({ name: type ? directory.subarray(offset, offset + length - 2).toString("utf16le") : "", type,
      left: directory.readUInt32LE(offset + 68), right: directory.readUInt32LE(offset + 72), child: directory.readUInt32LE(offset + 76),
      start: directory.readUInt32LE(offset + 116), size });
  }
  const root = entries[0]; requireValid(root?.type === 5);
  const miniStream = chain(root.start, fat, sector, root.size);
  const miniFat = words(chain(data.readUInt32LE(60), fat, sector, data.readUInt32LE(64) * sectorSize));
  const streams = new Map<string, Buffer>();
  const visited = new Set<number>();
  const stack = [{ id: root.child, parent: "" }];
  while (stack.length) {
    const { id, parent } = stack.pop()!;
    if (id === FREE) continue;
    requireValid(id < entries.length && !visited.has(id)); visited.add(id);
    const entry = entries[id]!;
    stack.push({ id: entry.left, parent }, { id: entry.right, parent });
    const path = parent + entry.name;
    if (entry.type === 1) stack.push({ id: entry.child, parent: path + "/" });
    if (entry.type === 2 && (path === "FileHeader" || /^BodyText\/Section\d+$/u.test(path))) {
      const content = entry.size < 4096
        ? chain(entry.start, miniFat, (miniId) => {
            requireValid((miniId + 1) * 64 <= miniStream.length);
            return miniStream.subarray(miniId * 64, (miniId + 1) * 64);
          }, entry.size)
        : chain(entry.start, fat, sector, entry.size);
      streams.set(path, content);
    }
  }
  return streams;
}

function paragraphText(data: Buffer): string {
  if (data.length % 2) throw new Error("Invalid text record");
  const parts: string[] = [];
  const extended = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  for (let offset = 0; offset < data.length;) {
    const code = data.readUInt16LE(offset);
    if (extended.has(code)) {
      if (offset + 16 > data.length) throw new Error("Invalid control record");
      if (code === 9) parts.push("\t");
      offset += 16;
    } else {
      if (code >= 32) parts.push(String.fromCharCode(code));
      else if (code === 10 || code === 13) parts.push("\n");
      else if (code === 30 || code === 31) parts.push(" ");
      else if (code === 24) parts.push("-");
      offset += 2;
    }
  }
  return parts.join("").trim();
}

export function extractHwpParagraphs(bytes: Uint8Array): string[] {
  try {
    const streams = compoundStreams(bytes);
    const header = streams.get("FileHeader");
    if (!header || header.length < 40 || header.subarray(0, 17).toString("ascii") !== "HWP Document File") throw new Error("Not HWP 5");
    const flags = header.readUInt32LE(36);
    if (flags & 6) throw new AiRequestError("INVALID_REQUEST", "암호 또는 배포용 보호가 설정된 HWP입니다. 보호를 해제한 파일을 사용해 주세요.");
    const sections = [...streams.entries()].filter(([name]) => name.startsWith("BodyText/"))
      .sort(([a], [b]) => Number(a.split("Section")[1]) - Number(b.split("Section")[1]));
    if (!sections.length) throw new Error("Missing body");
    const paragraphs: string[] = []; let total = 0;
    for (const [, stream] of sections) {
      const data = flags & 1 ? inflateRawSync(stream, { maxOutputLength: LIMIT }) : stream;
      total += data.length;
      if (total > LIMIT) throw new Error("Body too large");
      let offset = 0;
      while (offset < data.length) {
        const record = data.readUInt32LE(offset); offset += 4;
        let size = record >>> 20;
        if (size === 4095) { size = data.readUInt32LE(offset); offset += 4; }
        if (offset + size > data.length) throw new Error("Truncated record");
        if ((record & 1023) === 67) paragraphs.push(paragraphText(data.subarray(offset, offset + size)));
        offset += size;
      }
    }
    return paragraphs;
  } catch (error: unknown) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError("INVALID_REQUEST", "HWP 본문을 읽을 수 없습니다. 일반 HWP 5.0 파일 또는 DOCX로 저장해 주세요.");
  }
}
