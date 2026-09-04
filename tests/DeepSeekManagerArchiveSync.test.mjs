import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.navigator = dom.window.navigator;

const result = await build({
  stdin: {
    contents: `
      export { DeepSeekManager } from './src/views/DeepSeek/DeepSeekManager.ts';
      export { chatStore, deleteChatStore } from './src/utils/DeepSeek.ts';
    `,
    loader: 'ts',
    resolveDir: projectRoot,
  },
  bundle: true,
  alias: {
    '@': path.join(projectRoot, 'src'),
  },
  define: {
    'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""',
  },
  format: 'esm',
  platform: 'node',
  write: false,
});
const code = result.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { DeepSeekManager, chatStore, deleteChatStore } = await import(moduleUrl);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('标签、回答完成和删除聊天均安全触发自动同步', async () => {
  chatStore.setItem = async (_key, value) => value;
  chatStore.removeItem = async () => undefined;
  deleteChatStore.setItem = async (_key, value) => value;

  const manager = new DeepSeekManager();
  manager.googleDrive.state.connected = true;
  let syncCount = 0;
  manager.syncGoogleDrive = async () => {
    syncCount += 1;
  };

  const chat = manager.createChatManager({
    key: 1,
    label: '新对话',
    messages: {},
  });
  manager.chatList.push(chat);
  manager.currentChatKey.value = chat.key;
  chat.label.value = '新标题';
  await chat.notifyArchiveChange();
  assert.equal(syncCount, 1);

  await chat.onAnswerComplete();
  assert.equal(syncCount, 2);

  const chatRemoval = deferred();
  const deletionMarker = deferred();
  chatStore.removeItem = () => chatRemoval.promise;
  deleteChatStore.setItem = () => deletionMarker.promise;

  const removing = manager.removeChat(chat.key);
  await Promise.resolve();
  assert.equal(syncCount, 2, '删除记录落盘前不应开始同步');

  chatRemoval.resolve();
  deletionMarker.resolve();
  await removing;
  assert.equal(syncCount, 3);
});
