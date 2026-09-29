// Explicit live diagnostic: one Gemini call, no retry, no cache writes.
// node --env-file=.env.local scripts/diagnose-one-topic.cjs <presentation.pdf>
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const load = Module._load;
Module._load = function (name, ...args) { return name === 'server-only' ? {} : load.call(this, name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { GeminiAIProvider } = require('../src/lib/ai/gemini-provider.ts');
const started = Date.now();
if (!process.argv[2] || !process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) throw new Error('PDF path and Gemini environment required');
const provider = new GeminiAIProvider({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
provider.analyzeReportMaterials({
  activityCode: 'AUTONOMOUS_ONE_TOPIC', activityTitle: '1인 1주제 융합활동',
  reportText: '[진단] 보고서 본문은 제공되지 않음. 발표자료에서 확인되는 내용만 분석.',
  documents: [{ label: '발표자료', fileName: 'presentation.pdf', mimeType: 'application/pdf', dataBase64: fs.readFileSync(process.argv[2]).toString('base64') }],
}).then((result) => {
  console.log(JSON.stringify({ success: true, elapsedMs: Date.now() - started, schemaAndEvidenceValidated: true,
    actions: result.analysis.studentActions.length, skills: result.analysis.skills.length, extractedCharacters: result.extractedText.length }));
}).catch((error) => {
  console.log(JSON.stringify({ success: false, elapsedMs: Date.now() - started, code: error.code, message: error.message }));
  process.exitCode = 1;
});
