import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildReport, DEFAULT_OVERHEAD } from '../src/utils/reportingCalculator.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const bundle = await build({ stdin: { contents: `export * from './src/components/ReportingViews.jsx'; export { default as CostEditor } from './src/components/ReportingCostEditor.jsx'; export { default as ReportsPage } from './src/pages/ReportsPage.jsx';`, resolveDir: resolve('.') }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, plugins: [{ name: 'local-report-fixtures', setup(builder) {
  builder.onResolve({ filter: /reportingService$/ }, () => ({ path: 'service', namespace: 'fixture' }));
  builder.onResolve({ filter: /useReporting$/ }, () => ({ path: 'hook', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'service' ? 'export const saveReportingOverhead = async () => { throw new Error("No production writes in tests"); };' : 'export const useMalaysiaToday = () => "2026-10-28"; export const useReporting = () => globalThis.__reportViewFixture;' }));
} }] });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const components = module.exports;
const report = buildReport({ from: '2026-10-28', to: '2026-10-28', today: '2026-10-28' });
const render = (name, props) => renderToStaticMarkup(React.createElement(components[name], props));

test('overhead editor starts with Excel values and explicit daily units and effective date', () => {
  const html = render('CostEditor', { versions: [], today: '2026-10-28' });
  for (const value of Object.values(DEFAULT_OVERHEAD)) assert.ok(html.includes(`value="${value}"`));
  assert.match(html, /Rent \(RM\/day\)/); assert.match(html, /Effective from/); assert.match(html, /Royalty is excluded/); assert.match(html, /value="2026-10-28"/);
});
test('daily table renders overhead losses rather than hiding zero-revenue days', () => {
  const html = render('DailyReportTable', { report });
  assert.match(html, /RM-30.45/); assert.match(html, /No trading records/); assert.doesNotMatch(html, /NaN|undefined/);
});
test('pending and cached data remain explicit and cached exports disabled', () => {
  const incomplete = buildReport({ from: '2026-10-28', to: '2026-10-28', today: '2026-10-28', reports: [{ date: '2026-10-28', status: 'draft' }], fromCache: true });
  assert.match(render('ReportMetrics', { report: incomplete }), /Pending/);
  assert.match(render('CoverageNotice', { report: incomplete }), /Cached results/);
  assert.equal((render('ReportActions', { report: incomplete }).match(/disabled=""/g) || []).length, 4);
});
test('reports page renders current period, live metric components and all report sections without sample data', () => {
  globalThis.__reportViewFixture = { report, sources: {}, loading: false, error: null, refresh: () => {} };
  const html = render('ReportsPage', {});
  assert.match(html, /2026-10-01/); assert.match(html, /2026-10-28/); assert.match(html, /Daily profit &amp; loss/); assert.match(html, /CoS &amp; StaffCosts/); assert.match(html, /Fried waste/);
  assert.doesNotMatch(html, /Nov 2025|Outlet A|Outlet B|NaN/);
});
