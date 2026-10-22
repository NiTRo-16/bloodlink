import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalMongoUri } from '../scripts/guard.js';

test('databases on this machine are local', () => {
  assert.equal(isLocalMongoUri('mongodb://127.0.0.1:27017/bloodlink'), true);
  assert.equal(isLocalMongoUri('mongodb://localhost/bloodlink'), true);
  assert.equal(isLocalMongoUri('mongodb://user:pass@localhost:27017/bloodlink?authSource=admin'), true);
  assert.equal(isLocalMongoUri('mongodb://[::1]:27017/bloodlink'), true);
  assert.equal(isLocalMongoUri('mongodb://localhost:27017,127.0.0.1:27018/bloodlink?replicaSet=rs0'), true);
});

test('Atlas and other servers are not', () => {
  assert.equal(isLocalMongoUri('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/bloodlink'), false);
  assert.equal(isLocalMongoUri('mongodb://db.example.com:27017/bloodlink'), false);
  assert.equal(isLocalMongoUri('mongodb://localhost:27017,db.example.com:27017/bloodlink'), false);
  // "localhost" inside a username must not fool it
  assert.equal(isLocalMongoUri('mongodb://localhost:pw@db.example.com/bloodlink'), false);
});

test('missing or malformed values are not local', () => {
  assert.equal(isLocalMongoUri(undefined), false);
  assert.equal(isLocalMongoUri(''), false);
  assert.equal(isLocalMongoUri('postgres://localhost/db'), false);
});
