// No external API calls: verify one-topic has no application deadline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const load = Module._load;
Module._load = function (name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { GeminiAIProvider } = require('../src/lib/ai/gemini-provider.ts');
const provider = new GeminiAIProvider({ provider: 'gemini', apiKey: 'unused', model: 'test' });
const input = { activityCode: 'AUTONOMOUS_ONE_TOPIC', activityTitle: '1인 1주제 융합활동', reportText: '학생 보고서', documents: [] };
let deadline, abort, cleared, calls;
global.setTimeout = (callback, ms) => { deadline = ms; abort = callback; return 1; };
global.clearTimeout = () => { cleared = true; };
function reset() { deadline = 0; cleared = false; calls = 0; }
async function main() {
  reset();
  global.fetch = async (_, options) => {
    calls++;
    return { ok: true, json: async () => {
      assert.equal(cleared, false, 'deadline must cover body reading');
      assert.equal(deadline, 0, 'one-topic must not install a timer');
      assert.equal(options.signal.aborted, false);
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ extractedText: 'PDF 근거', analysis: { topic: '테스트', studentActions: [], knowledge: [], skills: [], notablePoints: [] } }) }] } }] };
    } };
  };
  const oneTopicResult = await provider.analyzeReportMaterials(input);
  assert.equal(oneTopicResult.analysis.topic, '테스트');
  assert.equal(deadline, 0); assert.equal(calls, 1); assert.equal(cleared, false);
  reset();
  global.fetch = async () => { calls++; return { ok: false, status: 503 }; };
  await assert.rejects(provider.analyzeReportMaterials(input), (e) => e.status === 503);
  assert.equal(calls, 1); assert.equal(cleared, false);
  reset();
  global.fetch = async (_, options) => { calls++; abort(); assert.equal(options.signal.aborted, true); throw new DOMException('Aborted', 'AbortError'); };
  await assert.rejects(provider.analyzeReportMaterials({ ...input, activityCode: 'CAREER_DNA' }), (e) => e.code === 'AI_TIMEOUT' && e.message.includes('60초'));
  assert.equal(deadline, 60000); assert.equal(calls, 1); assert.equal(cleared, true);
  reset();
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ extractedText: 'PDF 근거', analysis: { topic: '테스트', studentActions: [], knowledge: [], skills: [], notablePoints: [] } }) }] } }] }) });
  const result = await provider.analyzeReportMaterials(input);
  assert.equal(result.analysis.topic, '테스트'); assert.equal(cleared, false);
  console.log('PASS: no one-topic timer, single request, HTTP error preservation, existing DNA 60s deadline');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
