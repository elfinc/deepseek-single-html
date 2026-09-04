import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const sourceUrl = new URL('../src/services/ArchiveSyncScheduler.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const { code } = await transform(source, { format: 'esm', loader: 'ts' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { ArchiveSyncScheduler } = await import(moduleUrl);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('等待本地写入，并合并同一轮连续触发', async () => {
  const write = deferred();
  let syncCount = 0;
  const scheduler = new ArchiveSyncScheduler(async () => {
    syncCount += 1;
  }, assert.fail);

  const first = scheduler.schedule(write.promise);
  const second = scheduler.schedule(Promise.resolve());
  await Promise.resolve();
  assert.equal(syncCount, 0);

  write.resolve();
  await Promise.all([first, second]);
  assert.equal(syncCount, 1);
});

test('同步期间的新变更只追加一次串行同步', async () => {
  const firstSync = deferred();
  const syncStarted = deferred();
  let syncCount = 0;
  let active = 0;
  let maxActive = 0;
  const scheduler = new ArchiveSyncScheduler(async () => {
    syncCount += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (syncCount === 1) {
      syncStarted.resolve();
      await firstSync.promise;
    }
    active -= 1;
  }, assert.fail);

  const first = scheduler.schedule();
  await syncStarted.promise;
  assert.equal(syncCount, 1);

  const second = scheduler.schedule();
  const third = scheduler.schedule();
  firstSync.resolve();
  await Promise.all([first, second, third]);

  assert.equal(syncCount, 2);
  assert.equal(maxActive, 1);
});

test('本地写入和同步失败均被处理，且后续仍可重试', async () => {
  const errors = [];
  let syncCount = 0;
  const scheduler = new ArchiveSyncScheduler(async () => {
    syncCount += 1;
    if (syncCount === 1) {
      throw new Error('upload failed');
    }
  }, error => errors.push(error));

  await scheduler.schedule(Promise.reject(new Error('save failed')));
  assert.equal(syncCount, 0);

  await scheduler.schedule();
  await scheduler.schedule();
  assert.equal(syncCount, 2);
  assert.deepEqual(errors.map(error => error.message), ['save failed', 'upload failed']);
});
