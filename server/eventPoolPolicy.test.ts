import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('mysql2/promise',()=>({default:{createPool:vi.fn(()=>({execute:mocks.execute}))}}));
import { isPoolPassSuppressed } from '../shared/eventPoolPolicy';
import { loadDoorGuests, ensureReentryPool, getReentryPool, markTokenUsedForSync } from './db';

beforeEach(()=>{vi.clearAllMocks();process.env.DATABASE_URL='mysql://test.invalid/mock';mocks.execute.mockResolvedValue([[],[]]);});

describe('November is banquet-only',()=>{
 it('suppresses only the designated event including string input',()=>{
  expect(isPoolPassSuppressed(3960003)).toBe(true);expect(isPoolPassSuppressed('3960003')).toBe(true);
  for(const id of [3390003,1,null,undefined])expect(isPoolPassSuppressed(id)).toBe(false);
 });
 it('never exports November pool guests or reentry credentials',async()=>{
  expect(await loadDoorGuests(3960003,'pool')).toEqual([]);
  expect(await ensureReentryPool(3960003,'pool',()=>{throw Error('Must not generate');})).toEqual([]);
  expect(await getReentryPool(3960003,'pool')).toEqual([]);
  expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('retains pool roster behavior for other events, excluding banquet-only guest tokens',async()=>{
  await loadDoorGuests(3390003,'pool');expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(mocks.execute.mock.calls[1][0]).toContain("g.token NOT LIKE '%-BQ'");
  expect(mocks.execute.mock.calls[0][1]).toEqual([3390003]);
 });
 it('refuses to consume a stale November primary pool token during offline sync',async()=>{
  mocks.execute.mockResolvedValueOnce([[{id:8,eventId:3960003,legalFirstName:'Test',legalLastName:'Bowler'}],[]]);
  expect(await markTokenUsedForSync('old-pool','pool')).toBeNull();
  expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.execute.mock.calls[0][0]).not.toContain('UPDATE');
 });
 it('refuses to consume a stale November guest pool token during offline sync',async()=>{
  mocks.execute.mockResolvedValueOnce([[],[]]).mockResolvedValueOnce([[{id:9,eventId:3960003,legalFirstName:'Test',legalLastName:'Bowler'}],[]]);
  expect(await markTokenUsedForSync('old-guest','pool')).toBeNull();expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(mocks.execute.mock.calls[1][0]).toContain("g.token NOT LIKE '%-BQ'");
 });
 it('preserves November banquet used-marking behavior',async()=>{
  mocks.execute.mockResolvedValueOnce([[{id:8,eventId:3960003,legalFirstName:'Test',legalLastName:'Bowler'}],[]]);
  expect(await markTokenUsedForSync('actual-banquet','banquet')).toMatchObject({eventId:3960003,sheetType:'banquet'});
  expect(mocks.execute.mock.calls[1]).toEqual(['UPDATE bowlers SET banquetUsed = 1 WHERE id = ?',[8]]);
 });
});
