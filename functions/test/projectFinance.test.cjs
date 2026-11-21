const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInvoices, matchInvoices } = require('../lib/projectFinance/ledger');

function source(rows) {
  return async (sql) => {
    if (sql.includes('COUNT(*)'))
      return { QueryResponse: { totalCount: rows.length } };
    const start = Number(sql.match(/STARTPOSITION (\d+)/)[1]) - 1;
    return { QueryResponse: { Invoice: rows.slice(start, start + 250) } };
  };
}
const invoice = {
  Id: '5',
  CustomerRef: { value: '8' },
  TotalAmt: 120,
  Balance: 35,
  CurrencyRef: { value: 'USD' },
};

test('collects every historical invoice, including closed and partially paid invoices', async () => {
  const rows = Array.from({ length: 1730 }, (_, i) => ({
    ...invoice,
    Id: String(i + 1),
    Balance: i % 2 ? 35 : 0,
  }));
  const data = await loadInvoices(source(rows));
  assert.equal(data.length, 1730);
  assert.equal(
    data.reduce((sum, i) => sum + i.balance, 0),
    865 * 35
  );
  assert.equal((await loadInvoices(source([]))).length, 0);
});

test('rejects incomplete pages, duplicates and a changing count', async () => {
  await assert.rejects(loadInvoices(source([invoice, invoice])), /repeated/);
  await assert.rejects(
    loadInvoices(async (sql) =>
      sql.includes('COUNT')
        ? { QueryResponse: { totalCount: 10 } }
        : { QueryResponse: { Invoice: [invoice] } }
    ),
    /changed/
  );
  let count = 0;
  await assert.rejects(
    loadInvoices(async (sql) =>
      sql.includes('COUNT')
        ? { QueryResponse: { totalCount: ++count } }
        : { QueryResponse: { Invoice: [invoice] } }
    ),
    /changed/
  );
  await assert.rejects(
    loadInvoices(async () => ({})),
    /count/
  );
});

test('retains unknown amounts and prioritizes open balances', async () => {
  const data = await loadInvoices(source([{ Id: '1' }, invoice]));
  const ordered = matchInvoices(data, [], new Map());
  assert.equal(ordered[0].id, '5');
  assert.equal(ordered[1].total, null);
  assert.equal(ordered[1].balance, null);
});

test('requires human approval for legacy customer links and gives individual decisions precedence', async () => {
  const data = await loadInvoices(source([invoice]));
  const first = { id: 'p1', name: 'First phase', customerId: '8' };
  const second = { id: 'p2', name: 'Second phase', customerId: '8' };
  assert.equal(matchInvoices(data, [first], new Map())[0].suggestedId, 'p1');
  assert.equal(matchInvoices(data, [first], new Map())[0].projectId, '');
  assert.equal(
    matchInvoices(data, [first, second], new Map())[0].match,
    'Multiple projects'
  );
  const customer = new Map([['8', 'p1']]);
  assert.equal(
    matchInvoices(data, [first, second], new Map(), customer)[0].projectId,
    'p1'
  );
  assert.equal(
    matchInvoices(data, [first, second], new Map([['5', 'p2']]), customer)[0]
      .projectId,
    'p2'
  );
  assert.equal(
    matchInvoices(data, [first], new Map([['5', 'p2']]), customer)[0].projectId,
    ''
  );
});

test('finance HTTP routes enforce staff read and admin actions before accessing data', async () => {
  const express = require('express');
  const { registerProjectFinance } = require('../lib/projectFinance/routes');
  const app = express();
  app.use((req, res, next) => {
    const role = req.get('x-test-role');
    if (role) {
      req.user = { uid: 'fixture' };
      req.userProfile = { role };
    }
    next();
  });
  let reads = 0;
  const db = {
    collection() {
      reads++;
      return { doc: () => ({ get: async () => ({ data: () => undefined }) }) };
    },
  };
  registerProjectFinance(app, db);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url =
    'http://127.0.0.1:' + server.address().port + '/api/project-finance';
  try {
    assert.equal((await fetch(url)).status, 401);
    for (const role of ['client', 'sub', 'projectManager']) {
      assert.equal(
        (await fetch(url, { headers: { 'x-test-role': role } })).status,
        403
      );
    }
    for (const action of ['refresh', 'approve', 'connections']) {
      assert.equal(
        (
          await fetch(url + '/' + action, {
            method: 'POST',
            headers: { 'x-test-role': 'gc' },
          })
        ).status,
        403
      );
    }
    assert.equal(reads, 0);
    const result = await fetch(url, { headers: { 'x-test-role': 'gc' } });
    assert.deepEqual(await result.json(), { connected: false });
    assert.equal(reads, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
