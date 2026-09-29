// Offline parser regression checks; no AI calls or source-file modifications.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { deflateRawSync } = require('node:zlib');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'server-only') return {};
  return originalLoad.call(this, name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { extractOneTopicHwp } = require('../src/lib/files/one-topic-hwp.ts');
const { extractOneTopicReport } = require('../src/lib/files/one-topic-docx.ts');

function documentFixture(compressed = false, flags = 0) {
  const paragraphs = ['테스트 학교', '번호 / 이름', '99999 테스트', '발표 주제',
    '◈ 발표 영역 : 인권 교육', '◈ 발표 주제 : AI 편향', '관련 자료', '및 도서, 참고사이트',
    '참고자료 A', '참고자료 B', '발표 내용', '원인 분석\t내용', '두 번째 문단 😀', '소감 및 느낀점', '비판적 태도를 성찰함.'];
  const records = paragraphs.map((text) => {
    // Inline tab occupies eight UTF-16 units, unlike ordinary text.
    const body = Buffer.from(text.replace('\t', '\t\0\0\0\0\0\0\t') + '\r', 'utf16le');
    const head = Buffer.alloc(4); head.writeUInt32LE((body.length << 20) | 67);
    return Buffer.concat([head, body]);
  });
  let body = Buffer.concat(records);
  if (compressed) body = deflateRawSync(body);
  else {
    const padding = Buffer.alloc(4096 - body.length);
    padding.writeUInt32LE(((padding.length - 4) << 20) >>> 0);
    body = Buffer.concat([body, padding]);
  }
  const file = Buffer.alloc(19 * 512);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(file);
  file.writeUInt16LE(3, 26); file.writeUInt16LE(0xfffe, 28);
  file.writeUInt16LE(9, 30); file.writeUInt16LE(6, 32);
  file.writeUInt32LE(1, 44); file.writeUInt32LE(1, 48);
  file.writeUInt32LE(4096, 56); file.writeUInt32LE(0xfffffffe, 60);
  file.writeUInt32LE(0xfffffffe, 68);
  for (let i = 76; i < 512; i += 4) file.writeUInt32LE(0xffffffff, i);
  file.writeUInt32LE(0, 76);
  file.fill(255, 512, 1024);
  const fat = (id, next) => file.writeUInt32LE(next, 512 + id * 4);
  fat(0, 0xfffffffd); fat(1, 0xfffffffe);
  for (let i = 2; i <= 17; i++) fat(i, i === 9 || i === 17 ? 0xfffffffe : i + 1);
  function entry(id, name, type, start, size, child = 0xffffffff, right = 0xffffffff) {
    const offset = 1024 + id * 128;
    const nameBytes = Buffer.from(name + '\0', 'utf16le'); nameBytes.copy(file, offset);
    file.writeUInt16LE(nameBytes.length, offset + 64); file[offset + 66] = type;
    file.writeUInt32LE(0xffffffff, offset + 68); file.writeUInt32LE(right, offset + 72);
    file.writeUInt32LE(child, offset + 76); file.writeUInt32LE(start, offset + 116);
    file.writeBigUInt64LE(BigInt(size), offset + 120);
  }
  entry(0, 'Root Entry', 5, 0xfffffffe, 0, 1);
  entry(1, 'FileHeader', 2, 2, 4096, 0xffffffff, 2);
  entry(2, 'BodyText', 1, 0, 0, 3);
  entry(3, 'Section0', 2, 10, 4096);
  Buffer.from('HWP Document File').copy(file, 1536);
  file.writeUInt32LE(flags | Number(compressed), 1536 + 36);
  body.copy(file, 11 * 512);
  return file;
}
const expected = { area: '인권 교육', topic: 'AI 편향', references: '참고자료 A\n참고자료 B', content: '원인 분석\t내용\n두 번째 문단 😀', reflection: '비판적 태도를 성찰함.' };
assert.deepEqual(extractOneTopicHwp(documentFixture()), expected);
assert.deepEqual(extractOneTopicHwp(documentFixture(true)), expected);
assert.throws(() => extractOneTopicHwp(documentFixture(false, 2)), /보호/);
assert.throws(() => extractOneTopicHwp(documentFixture().subarray(0, 1800)), /읽을 수 없습니다/);
assert.throws(() => extractOneTopicHwp(Buffer.from('invalid')), /읽을 수 없습니다/);
const cycle = documentFixture(); cycle.writeUInt32LE(10, 512 + 10 * 4);
assert.throws(() => extractOneTopicHwp(cycle), /읽을 수 없습니다/);
if (process.argv[2]) {
  const blank = { area: '', topic: '', references: '', content: '', reflection: '' };
  assert.deepEqual(extractOneTopicHwp(fs.readFileSync(process.argv[2])), blank);
  if (process.argv[3]) assert.deepEqual(extractOneTopicReport(fs.readFileSync(process.argv[3])), blank);
}
console.log('PASS: HWP compressed/uncompressed, fields, multiline, controls, Unicode, protected/truncated/cyclic/invalid files, supplied templates');
