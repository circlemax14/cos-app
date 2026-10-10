/**
 * MOB-07 — query strings carry PHI and used to reach Sentry untouched.
 *
 * axios bakes GET params into the XHR URL, and the default breadcrumbs
 * integration records { method, url, status_code } from it. So every error
 * event shipped crumbs like
 *   /v1/labs/explanation?name=<lab test>&code=<LOINC>
 *   /v1/drug-label?name=<patient's medication>
 *   /v1/patients/me/social/search?q=<a person's name>
 * scrubBreadcrumb only removed BODIES on four route prefixes, and scrubEvent's
 * redactObject only masks emails/SSNs in strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scrubBreadcrumb,
  scrubEvent,
  scrubTransaction,
  stripQuery,
  buildSentryInitOptions,
} from '../../lib/sentry-config.ts';

const LAB = 'https://api.circlesupporthealth.ai/v1/labs/explanation?name=HIV%201%2F2%20Ab&code=7917-8&unit=';
const DRUG = 'https://api.circlesupporthealth.ai/v1/drug-label?name=sertraline';
const SEARCH = 'https://api.circlesupporthealth.ai/v1/patients/me/social/search?q=Jane%20Doe';

test('stripQuery drops query + fragment and redacts ids', () => {
  assert.equal(stripQuery(LAB), 'https://api.circlesupporthealth.ai/v1/labs/explanation');
  assert.equal(stripQuery('/v1/x/3f2504e0-4f89-11d3-9a0c-0305e82c3301?a=b#c'), '/v1/x/:id');
  assert.equal(stripQuery('/plain'), '/plain');
});

test('fetch/xhr breadcrumbs lose the query on EVERY route, not just four prefixes', () => {
  for (const [url, path] of [
    [LAB, '/v1/labs/explanation'],
    [DRUG, '/v1/drug-label'],
    [SEARCH, '/v1/patients/me/social/search'],
  ]) {
    for (const category of ['xhr', 'fetch']) {
      const crumb = scrubBreadcrumb({ category, data: { method: 'GET', url, status_code: 500 } } as never);
      const out = crumb!.data!.url as string;
      assert.ok(out.endsWith(path), out);
      assert.ok(!out.includes('?'), out);
      assert.equal(crumb!.data!.status_code, 500, 'triage fields survive');
    }
  }
});

test('the per-event breadcrumb tail is re-scrubbed (defence in depth)', () => {
  const ev = scrubEvent({
    breadcrumbs: [
      { category: 'xhr', data: { url: DRUG } },
      { category: 'navigation', data: { from: '/Home/labs?name=HIV', to: '/Home/x?q=Jane' } },
    ],
  } as never);
  const s = JSON.stringify(ev.breadcrumbs);
  assert.ok(!s.includes('sertraline') && !s.includes('HIV') && !s.includes('Jane'), s);
});

test('event.request.url loses its query too', () => {
  const ev = scrubEvent({ request: { url: SEARCH } } as never);
  assert.equal(ev.request!.url, 'https://api.circlesupporthealth.ai/v1/patients/me/social/search');
});

// Shaped like what @sentry/browser tracing/request.js:255-262 (xhr) and
// @sentry/core fetch.js:305-309 set on an http.client span: `url` is the
// stripped url but `http.url` is the FULL href, query included.
const spanData = () => ({
  url: LAB,
  'http.url': LAB,
  'url.full': LAB,
  'http.query': '?name=HIV%201%2F2%20Ab&code=7917-8',
  'http.fragment': '#x',
  'url.query': 'name=HIV',
  'http.method': 'GET',
});

test('transactions: every span url attribute (incl. http.url) and description are scrubbed', () => {
  const tx = scrubTransaction({
    type: 'transaction',
    transaction: '/Home/labs',
    spans: [{ description: `GET ${LAB}`, data: spanData() }],
  } as never);
  const s = JSON.stringify(tx);
  assert.ok(!s.includes('HIV') && !s.includes('7917-8'), s);
  const d = (tx.spans as any)[0].data;
  assert.equal(d['http.url'], 'https://api.circlesupporthealth.ai/v1/labs/explanation');
  assert.equal(d['http.method'], 'GET');
});

test('transactions: the ROOT span (contexts.trace.data) is scrubbed too', () => {
  const tx = scrubTransaction({
    type: 'transaction',
    transaction: 'GET /v1/labs/explanation',
    contexts: { trace: { op: 'http.client', description: `GET ${LAB}`, data: spanData() } },
  } as never);
  const s = JSON.stringify(tx);
  assert.ok(!s.includes('HIV') && !s.includes('7917-8'), s);
  assert.equal((tx.contexts as any).trace.data['http.method'], 'GET');
});

test('init options wire beforeSendTransaction', () => {
  const opts = buildSentryInitOptions('dsn', { mobileReplayIntegration: () => ({}) } as never);
  assert.equal(opts.beforeSendTransaction, scrubTransaction);
});
