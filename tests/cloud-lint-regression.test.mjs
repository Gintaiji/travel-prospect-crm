import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { createHookHarness, jsx, text } from './helpers/resourceHookHarness.mjs';

const current = file => fs.readFileSync(file, 'utf8');
// Fixed pre-98C-1 baseline keeps the comparison reproducible after committing.
const baseline = 'f7fb832ce2df9def5ae72706cc092727e3898b1e';
const before = file => execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' });
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
function clock() {
  let id = 0; const pending = new Map();
  return { setTimeout(fn) { pending.set(++id, fn); return id; }, clearTimeout(key) { pending.delete(key); }, flush() { while (pending.size) { const batch = [...pending]; pending.clear(); batch.forEach(([, fn]) => fn()); } }, count: () => pending.size };
}
// Execute the actual AST effect, not a copy of its implementation.
function effect(source, marker, globals) {
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.getText(ast).includes(marker)) found = node.arguments[0].getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found, marker);
  return vm.runInNewContext(compile(`(${found})();`), globals);
}
for (const search of ['', '?mode=qualification', '?action=add', '?action=quick-add', '?focus=p-fiction', '?mode=qualification&action=add']) {
  function run(source, cancel = false) {
    const timers = clock(), trace = [];
    const globals = { URLSearchParams, hasLoadedProspects: true, hasHandledInitialUrlRef: { current: false }, window: { ...timers, location: { search } },
      setProspectDisplayMode: v => trace.push(['display', v]), setProspectActionMode: v => trace.push(['action', v]), setFocusedProspectId: v => trace.push(['focus', v]),
      openNewProspectForm: v => trace.push(['add', v]), openQuickAddForm: () => trace.push(['quick-add']),
      quickAddFormRef: { current: { scrollIntoView: v => trace.push(['scroll-quick', JSON.stringify(v)]) } }, newProspectFormRef: { current: { scrollIntoView: v => trace.push(['scroll-add', JSON.stringify(v)]) } } };
    const cleanup = effect(source, 'hasHandledInitialUrlRef', globals);
    if (cancel) { cleanup?.(); timers.flush(); assert.equal(timers.count(), 0); return trace; }
    timers.flush(); const settled = [...trace]; effect(source, 'hasHandledInitialUrlRef', globals); timers.flush(); assert.deepEqual(trace, settled, 'URL handled once'); cleanup?.(); return trace;
  }
  assert.deepEqual(run(current('app/prospects/page.tsx')), run(before('app/prospects/page.tsx')));
  assert.deepEqual(run(current('app/prospects/page.tsx'), true), []);
}
for (const scenario of ['unconfigured', 'disconnected', 'error', 'connected']) {
  async function run(source) {
    const h = createHookHarness(); let queries = 0;
    const exports = {};
    vm.runInNewContext(compile(source), { exports, require(name) {
      if (name === 'react') return h.react;
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'next/link') return { default: 'a' };
      if (name === '../lib/supabaseClient') return { createBrowserSupabaseClient: () => scenario === 'unconfigured' ? null : { auth: { async getSession() { queries++; return { data: { session: scenario === 'connected' ? { user: { email: 'fiction@fake.invalid' } } : null }, error: scenario === 'error' ? { message: 'fictional error' } : null }; } } } };
      assert.fail(name);
    } });
    h.render(() => exports.default()); h.effects(); await new Promise(setImmediate);
    const result = text(h.render(() => exports.default())); h.effects(); await new Promise(setImmediate);
    assert.equal(queries, scenario === 'unconfigured' ? 0 : 1); h.unmount(); return result;
  }
  assert.equal(await run(current('app/connexion/page.tsx')), await run(before('app/connexion/page.tsx')));
}
// Raw external reads: compare final values and loader counts; cancel deferred reads on unmount.
for (const marker of ['loadStreetMarketingSurvey()', 'const loadedProspects = loadProspects()']) {
  function run(source, cancel = false) {
    const timers = clock(), result = {}; let reads = 0;
    const survey = { id: 'fiction', name: 'Fiction', questions: ['Q?'] };
    const data = [{ id: 'old', createdAt: '2026-01-01' }, { id: 'new', createdAt: '2026-02-01' }, { id: 'excluded', createdAt: '2026-03-01' }];
    const globals = { window: timers, loadStreetMarketingSurvey() { reads++; return { activeSurveyId: 'fiction', surveys: [survey] }; }, loadProspects() { reads++; return data; }, isStreetMarketingProspect: p => p.id !== 'excluded' };
    for (const setter of ['setSurveyStorage', 'setDraftSurveyName', 'setDraftQuestions', 'setStreetMarketingProspects']) globals[setter] = v => { result[setter] = JSON.stringify(v); };
    const cleanup = effect(source, marker, globals); if (cancel) cleanup?.(); timers.flush(); cleanup?.(); return { result, reads };
  }
  assert.deepEqual(run(current('app/street-marketing/page.tsx')), run(before('app/street-marketing/page.tsx')));
  assert.equal(run(current('app/street-marketing/page.tsx'), true).reads, 0);
}
// Compare answer resizing with the old effect, preserving fields and index mapping.
for (const questions of [[], ['Q1'], ['Q1', 'Q2', 'Q3']]) {
  const initial = { firstName: 'Fiction', phone: '000', answers: ['A1', 'A2'], fieldNote: 'conserv?e' };
  function resize(source, old) {
    let form = initial;
    const globals = { activeSurvey: { questions }, setQuickContactForm: update => { form = update(form); } };
    if (old) effect(source, 'answers: activeSurvey.questions.map', globals);
    else {
      const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let statement;
      function visit(node) { if (ts.isIfStatement(node) && node.expression.getText(ast) === 'previousQuestions !== activeSurvey.questions') statement = node.getText(ast); ts.forEachChild(node, visit); }
      visit(ast); assert.ok(statement);
      vm.runInNewContext(compile(statement), { ...globals, previousQuestions: ['old'], setPreviousQuestions() {} });
    }
    return JSON.stringify(form);
  }
  assert.equal(resize(current('app/street-marketing/page.tsx'), false), resize(before('app/street-marketing/page.tsx'), true));
}
// Browser speech API is fake; no microphone or network is used.
for (const available of [false, true]) {
  const h = createHookHarness(), exports = {}; const instances = []; let aborts = 0;
  class Recognition { constructor() { instances.push(this); } start() { this.onstart(); } stop() { this.onend(); } abort() { aborts++; } }
  const updates = [];
  vm.runInNewContext(compile(current('app/hooks/useSpeechRecognition.ts')), { exports, window: available ? { SpeechRecognition: Recognition } : {}, require: () => ({ ...h.react, useSyncExternalStore: (_subscribe, snapshot) => snapshot() }) });
  const render = () => h.render(() => exports.useSpeechRecognition(value => updates.push(value)));
  let state = render(); h.effects(); assert.equal(state.isSupported, available); state.startListening(); state = render();
  if (available) {
    const recognition = instances.at(-1);
    assert.equal(state.isListening, true); assert.equal(recognition.lang, 'fr-FR'); assert.equal(recognition.interimResults, false);
    const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '  commande fictive  ' } }] };
    recognition.onresult(event); state = render(); assert.equal(state.transcript, 'commande fictive');
    recognition.onresult(event); assert.deepEqual(updates, ['commande fictive']);
    recognition.onerror({ error: 'not-allowed' }); assert.ok(render().error.includes('microphone'));
    render().stopListening(); assert.equal(render().isListening, false);
    h.unmount(); assert.equal(aborts, 1);
  } else { assert.ok(state.error.includes('non disponible')); h.unmount(); }
}
// Security-critical files must stay byte-identical to the pre-change commit.
for (const file of ['app/lib/cloudSnapshotContract.ts', 'app/lib/cloudRawDiagnostics.ts', 'app/lib/cloudSync.ts', 'app/lib/cloudSyncSuspension.ts', 'app/lib/resourceIsolationSettings.ts', 'app/sauvegarde/page.tsx']) assert.equal(current(file).replaceAll('\r\n', '\n'), before(file).replaceAll('\r\n', '\n'), file);
console.log('PASS: before/after URL modes/actions/focus, session states, terrain loaders/filter/sort, cancellation, fake speech events, unchanged security contracts.');

