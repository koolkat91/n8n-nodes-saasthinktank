const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseRpc, toolArguments, createPublicResearchClient, QUESTIONS, PUBLIC_ENDPOINT } = require('../dist/nodes/SaasThinkTank/publicResearch.js');
const { SaasThinkTank } = require('../dist/nodes/SaasThinkTank/SaasThinkTank.node.js');
const comparison = require('./fixtures/public-comparison.json');
const node = { id: 'test', name: 'SaaS Think Tank', type: 'n8n-nodes-saasthinktank.saasThinkTank', typeVersion: 1, position: [0, 0], parameters: {} };

function harness(overrides = {}) {
  const requests = [];
  return {
    requests,
    request: async options => {
      requests.push(options);
      const body = JSON.parse(options.body);
      if (overrides.respond) return overrides.respond(body, options);
      if (body.method === 'notifications/initialized') return { statusCode: 202, headers: {}, body: '' };
      const result = body.method === 'initialize' ? {
        protocolVersion: '2025-11-25', serverInfo: { name: 'com.saasthinktank/evidence', version: '1.0.1' },
      } : { structuredContent: comparison, content: [{ type: 'text', text: JSON.stringify(comparison) }] };
      return { statusCode: 200, headers: {}, body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n` };
    },
  };
}

test('accepts complete JSON and SSE responses, including comments and progress notifications', () => {
  const result = { jsonrpc: '2.0', id: 3, result: { ok: true } };
  assert.deepEqual(parseRpc(JSON.stringify(result), 3), result);
  assert.deepEqual(parseRpc(': keepalive\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: ' + JSON.stringify(result) + '\r\n\r\n', 3), result);
  assert.throws(() => parseRpc('{"jsonrpc":"2.0","id":7,"result":{}}', 3));
  assert.throws(() => parseRpc('data: {"id":3}\n\n', 3));
  assert.throws(() => parseRpc('x'.repeat(1024 * 1024 + 1), 3));
});

test('question choices map to the actual public release, including filtered comparisons', () => {
  const expected = new Map(comparison.capabilities.map(capability => [capability.id, capability.question]));
  assert.equal(expected.get(QUESTIONS.find(q => q.name === 'Code Export').value), 'Export app source code');
  assert.equal(expected.get(QUESTIONS.find(q => q.name === 'GitHub Sync').value), 'GitHub sync');
  assert.equal(expected.get(QUESTIONS.find(q => q.name === 'Backend Connections').value), 'Bring your own backend');
  assert.equal(expected.get(QUESTIONS.find(q => q.name === 'Built-in Database').value), 'Built-in database & data management');
  const selected = QUESTIONS.find(q => q.name === 'Code Export').value;
  assert.deepEqual(toolArguments('compare', { products: ['bubble', 'lovable'], questions: [selected] }), {
    name: 'compare_products', arguments: { products: ['bubble', 'lovable'], capability_ids: [selected] },
  });
});

test('rejects invalid or unsupported selections before making any request', () => {
  for (const values of [
    { query: '', products: [], limit: 16 },
    { query: 'x'.repeat(501), products: [], limit: 16 },
    { query: 'export\ncode', products: [], limit: 16 },
    { query: 'export code', products: [], limit: 17 },
    { query: 'export code', products: [], limit: 1.5 },
    { query: 'export code', products: ['shopify'], limit: 16 },
  ]) assert.throws(() => toolArguments('search', values));
  assert.throws(() => toolArguments('get', { recordId: '../private' }));
  assert.throws(() => toolArguments('compare', { products: ['bubble', 'bubble'], questions: [] }));
  assert.throws(() => toolArguments('compare', { products: ['bubble'], questions: [] }));
  assert.throws(() => toolArguments('compare', { products: ['bubble', 'lovable'], questions: ['unknown'] }));
  assert.throws(() => createPublicResearchClient(async () => {}, 0, node));
});

test('uses only the fixed public endpoint with no credentials, redirects or implicit retries', async () => {
  const h = harness();
  const client = createPublicResearchClient(h.request, 60000, node);
  const tool = toolArguments('compare', { products: ['bubble', 'lovable'], questions: [] });
  assert.deepEqual(await client.call(tool), comparison);
  assert.deepEqual(await client.call(tool), comparison);
  assert.deepEqual(h.requests.map(r => JSON.parse(r.body).method), ['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
  for (const request of h.requests) {
    assert.equal(request.url, PUBLIC_ENDPOINT);
    assert.equal(request.method, 'POST');
    assert.equal(request.disableFollowRedirect, true);
    assert.equal(request.timeout, 60000);
    assert.equal(request.headers.Authorization, undefined);
    assert.equal(request.headers.Cookie, undefined);
  }
  const findings = comparison.capabilities.flatMap(c => c.findings);
  assert.equal(findings.length, 16);
  assert.equal(findings.filter(f => f.status === 'unknown').length, 1);
});

test('stops on a rate limit or redirect instead of returning an empty or invented answer', async () => {
  for (const [status, code] of [[429, 'RATE_LIMITED'], [302, 'SERVICE_UNAVAILABLE'], [503, 'SERVICE_UNAVAILABLE']]) {
    const h = harness({ respond: () => ({ statusCode: status, headers: { location: 'https://other.example/' }, body: '' }) });
    await assert.rejects(createPublicResearchClient(h.request, 60000, node).call({ name: 'search_findings', arguments: {} }), e => e.code === code);
    assert.equal(h.requests.length, 1);
  }
});

test('rejects a changed service or missing scope, and keeps transport diagnostics out of results', async () => {
  const broken = harness({ respond: body => ({ statusCode: 200, headers: {}, body: {
    jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-11-25', serverInfo: { name: 'other-service' } },
  } }) });
  await assert.rejects(createPublicResearchClient(broken.request, 60000, node).call({ name: 'get_finding', arguments: {} }), e => e.code === 'INCOMPATIBLE_SERVICE');
  await assert.rejects(createPublicResearchClient(async () => { throw new Error('PRIVATE_DIAGNOSTIC_SENTINEL'); }, 60000, node).call({ name: 'get_finding', arguments: {} }), e => !e.message.includes('PRIVATE_DIAGNOSTIC_SENTINEL'));
  const h = harness();
  const bad = async options => {
    const response = await h.request(options);
    if (JSON.parse(options.body).method === 'tools/call') response.body = JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(options.body).id, result: { structuredContent: { ok: true, coverage: {} } } });
    return response;
  };
  await assert.rejects(createPublicResearchClient(bad, 60000, node).call({ name: 'get_finding', arguments: {} }), e => e.code === 'INVALID_RESPONSE');
});

test('native node preserves input pairing and never forwards incoming private fields', async () => {
  const h = harness();
  const parameters = [
    { operation: 'search', query: '', products: [], maxFindings: 16, options: {} },
    { operation: 'compare', productsToCompare: ['bubble', 'lovable'], questions: [], options: {} },
  ];
  const context = {
    getInputData: () => [{ json: { customerSecret: 'PRIVATE_ITEM_SENTINEL' } }, { json: { customerSecret: 'PRIVATE_ITEM_SENTINEL' } }],
    getNodeParameter: (key, index) => parameters[index][key],
    getNode: () => node,
    continueOnFail: () => true,
    helpers: { httpRequest: h.request },
  };
  const [outputs] = await new SaasThinkTank().execute.call(context);
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0].json.ok, false);
  assert.equal(outputs[0].json.error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(outputs[1].json, comparison);
  assert.deepEqual(outputs.map(o => o.pairedItem), [{ item: 0 }, { item: 1 }]);
  assert.ok(!JSON.stringify(h.requests).includes('PRIVATE_ITEM_SENTINEL'));
  assert.equal(h.requests.length, 3);
});

test('ordinary node runs stop on invalid input instead of silently continuing', async () => {
  const context = {
    getInputData: () => [{ json: {} }], getNode: () => node,
    getNodeParameter: key => ({ operation: 'get', recordId: 'invalid', options: {} })[key],
    continueOnFail: () => false,
    helpers: { httpRequest: async () => { throw new Error('Must not make a request.'); } },
  };
  await assert.rejects(new SaasThinkTank().execute.call(context), /Record ID/);
});
