'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { setupTestApp, teardown } = require('./helpers');
const withTransaction = require('../src/utils/withTransaction');

let app;

beforeAll(async () => {
  app = await setupTestApp();
});

afterAll(teardown);

describe('foundation', () => {
  test('GET /api/v1/health reports db up', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('security headers are set', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('unknown route returns standard error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.request_id).toBeDefined();
  });

  test('malformed JSON returns VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('transactions work on the replica set (commit and rollback)', async () => {
    const Tmp = mongoose.model('tmp_tx', new mongoose.Schema({ n: Number }));
    await Tmp.createCollection();

    await withTransaction(async (session) => {
      await Tmp.create([{ n: 1 }], { session });
    });
    await expect(
      withTransaction(async (session) => {
        await Tmp.create([{ n: 2 }], { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const docs = await Tmp.find().lean();
    expect(docs.map((d) => d.n)).toEqual([1]);
  });
});

