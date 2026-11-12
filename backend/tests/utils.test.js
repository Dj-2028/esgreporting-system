'use strict';

const { parsePagination, buildMeta, searchRegex } = require('../src/utils/pagination');
const { sha256 } = require('../src/utils/hash');

describe('pagination utils', () => {
  test('defaults', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0, sort: { created_at: -1 } });
  });

  test('clamps limit to 1..100 and parses sort', () => {
    expect(parsePagination({ limit: '500' }).limit).toBe(100);
    expect(parsePagination({ limit: '-3' }).limit).toBe(1);
    expect(parsePagination({ page: '3', limit: '10', sort: 'kpi_code,-created_at' })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      sort: { kpi_code: 1, created_at: -1 },
    });
  });

  test('ignores sort fields not in allow-list', () => {
    expect(parsePagination({ sort: 'password_hash' }, { allowedSort: ['kpi_code'] }).sort).toEqual({
      _id: -1,
    });
  });

  test('meta', () => {
    expect(buildMeta({ page: 2, limit: 20 }, 45)).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      total_pages: 3,
    });
  });

  test('searchRegex escapes special characters', () => {
    expect(searchRegex('a.b*').test('A.B*')).toBe(true);
    expect(searchRegex('a.b').test('axb')).toBe(false);
    expect(searchRegex('')).toBeNull();
  });
});

describe('hash utils', () => {
  test('sha256 hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

