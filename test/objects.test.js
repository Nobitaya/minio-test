const test = require('node:test');
const assert = require('node:assert/strict');
const { makeObjectName } = require('../src/objects.js');

test('creates a namespaced collision-resistant object name from an uploaded file name', () => {
  const objectName = makeObjectName('../../预算 报表.xlsx', {
    now: new Date('2026-06-23T08:30:45.123Z'),
    id: '550e8400-e29b-41d4-a716-446655440000'
  });

  assert.equal(
    objectName,
    'uploads/2026-06-23T08-30-45-123Z-550e8400-e29b-41d4-a716-446655440000-_.xlsx'
  );
});
