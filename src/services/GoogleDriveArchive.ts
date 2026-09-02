import { reactive } from 'vue';
import { driveSyncStore } from '@/utils/DeepSeek';
import type { ChatSaveData } from '@/views/DeepSeek/ChatManager';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const LEGACY_ARCHIVE_FILE_NAME = 'deepseek-chat-archive.json';
const CHAT_FILE_PREFIX = 'deepseek-chat-v2-';
const CHAT_FILE_SUFFIX = '.json';
const DELETIONS_FILE_NAME = 'deepseek-chat-deletions-v2.json';
const AUTO_CONNECT_KEY = 'GoogleDriveAutoConnect';
const SYNC_CACHE_KEY = 'v2';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (options: {
      client_id: string;
      scope: string;
      include_granted_scopes?: boolean;
      callback: (response: GoogleTokenResponse) => void;
      error_callback?: (error: { type?: string }) => void;
    }) => GoogleTokenClient;
    revoke: (token: string, callback?: () => void) => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

/** 旧版单文件存档，仅用于无损迁移。 */
export type GoogleDriveArchiveData = {
  version: 1;
  updatedAt: string;
  chats: ChatSaveData[];
  deletedKeys: string[];
};

export type GoogleDriveSyncSnapshot = {
  chats: ChatSaveData[];
  deletedKeys: string[];
};

export type GoogleDriveRemoteChat = {
  data: ChatSaveData;
  /** 本地内容自上次成功同步后没有变化，可安全采用完整云端版本。 */
  localUnchanged: boolean;
};

export type GoogleDriveRemoteChanges = {
  chats: GoogleDriveRemoteChat[];
  deletedKeys: string[];
};

export type GoogleDriveSyncAdapter = {
  getSnapshot: () => Promise<GoogleDriveSyncSnapshot>;
  applyRemoteChanges: (changes: GoogleDriveRemoteChanges) => Promise<void>;
};

export type GoogleDriveArchiveState = {
  configured: boolean;
  ready: boolean;
  restoring: boolean;
  connected: boolean;
  syncing: boolean;
  lastSyncedAt: string;
  error: string;
  downloadedChats: number;
  uploadedChats: number;
};

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
};

type DriveChange = {
  fileId: string;
  removed?: boolean;
  file?: DriveFile;
};

type SyncCache = {
  version: 2;
  pageToken: string;
  files: Record<string, DriveFile>;
  chatHashes: Record<string, string>;
};

type ChatFileData = {
  version: 2;
  updatedAt: string;
  chat: ChatSaveData;
};

type DeletionsFileData = {
  version: 2;
  updatedAt: string;
  deletedKeys: string[];
};

let identityScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityScript() {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }
  if (identityScriptPromise) {
    return identityScriptPromise;
  }
  identityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Google 登录组件加载失败')), { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return identityScriptPromise;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function chatFileName(key: number) {
  return `${CHAT_FILE_PREFIX}${key}${CHAT_FILE_SUFFIX}`;
}

function chatKeyFromFile(file: DriveFile) {
  const propertyKey = Number(file.appProperties?.chatKey);
  if (Number.isFinite(propertyKey) && propertyKey > 0) {
    return propertyKey;
  }
  const match = file.name.match(/^deepseek-chat-v2-(\d+)\.json$/);
  return match ? Number(match[1]) : null;
}

function isManagedFile(file: DriveFile) {
  return file.name === LEGACY_ARCHIVE_FILE_NAME
    || file.name === DELETIONS_FILE_NAME
    || chatKeyFromFile(file) !== null;
}

function emptyCache(): SyncCache {
  return {
    version: 2,
    pageToken: '',
    files: {},
    chatHashes: {},
  };
}

/**
 * Google Drive 增量存档服务。
 *
 * - 每个对话独立存储，避免全量传输。
 * - 使用 Drive Changes 游标只发现远端增量。
 * - OAuth access token 只保存在内存中。
 */
export class GoogleDriveArchive {
  readonly clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  readonly state = reactive<GoogleDriveArchiveState>({
    configured: !!this.clientId,
    ready: false,
    restoring: false,
    connected: false,
    syncing: false,
    lastSyncedAt: '',
    error: '',
    downloadedChats: 0,
    uploadedChats: 0,
  });

  private accessToken = '';
  private syncQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (this.clientId) {
      loadGoogleIdentityScript().then(() => {
        this.state.ready = true;
      }).catch(error => {
        this.state.error = getErrorMessage(error);
      });
    }
  }

  async connect() {
    if (!this.clientId) {
      throw new Error('未配置 VITE_GOOGLE_CLIENT_ID');
    }
    if (!this.state.ready) {
      throw new Error('Google 登录组件仍在加载，请稍后重试');
    }
    await this.requestToken();
    localStorage.setItem(AUTO_CONNECT_KEY, '1');
  }

  async restoreConnection() {
    if (!this.clientId || localStorage.getItem(AUTO_CONNECT_KEY) !== '1') {
      return false;
    }
    this.state.restoring = true;
    this.state.error = '';
    try {
      await loadGoogleIdentityScript();
      this.state.ready = true;
      await this.requestToken('');
      return true;
    } catch (error) {
      this.state.error = `自动恢复 Google Drive 连接失败：${getErrorMessage(error)}`;
      return false;
    } finally {
      this.state.restoring = false;
    }
  }

  disconnect() {
    const token = this.accessToken;
    this.accessToken = '';
    this.state.connected = false;
    this.state.syncing = false;
    this.state.error = '';
    localStorage.removeItem(AUTO_CONNECT_KEY);
    void driveSyncStore.removeItem(SYNC_CACHE_KEY);
    if (token && window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(token);
    }
  }

  /** 每个同步请求都会依次执行完整的“拉取增量 → 合并 → 上传增量”。 */
  sync(adapter: GoogleDriveSyncAdapter): Promise<void> {
    const run = () => this.performSync(adapter);
    const job = this.syncQueue.then(run, run);
    this.syncQueue = job.catch(() => undefined);
    return job;
  }

  hashChat(chat: ChatSaveData) {
    return this.hashText(JSON.stringify(chat));
  }

  private async performSync(adapter: GoogleDriveSyncAdapter) {
    this.assertConnected();
    this.state.syncing = true;
    this.state.error = '';
    this.state.downloadedChats = 0;
    this.state.uploadedChats = 0;
    try {
      const cache = await this.loadCache();
      const before = await adapter.getSnapshot();
      const localHashes = await this.getChatHashes(before.chats);
      const localDeletionHash = await this.hashDeletedKeys(before.deletedKeys);
      const changedNames = await this.refreshRemoteIndex(cache);
      const remoteChanges = await this.downloadRemoteChanges(
        cache,
        changedNames,
        localHashes,
        localDeletionHash,
      );

      await adapter.applyRemoteChanges(remoteChanges);

      const merged = await adapter.getSnapshot();
      const deletedKeys = [...new Set(merged.deletedKeys)].sort();
      const deletedChatKeys = new Set(
        deletedKeys
          .filter(key => key.endsWith('_'))
          .map(key => Number(key.slice(0, -1)))
          .filter(Number.isFinite),
      );
      const chats = merged.chats.filter(chat => !deletedChatKeys.has(chat.key));
      const finalHashes = await this.getChatHashes(chats);

      await this.uploadDeletionsIfChanged(cache, deletedKeys);
      await this.uploadChatsIfChanged(cache, chats, finalHashes);

      cache.chatHashes = finalHashes;
      await driveSyncStore.setItem(SYNC_CACHE_KEY, cache);
      this.state.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      this.state.error = getErrorMessage(error);
      throw error;
    } finally {
      this.state.syncing = false;
    }
  }

  private async downloadRemoteChanges(
    cache: SyncCache,
    changedNames: Set<string>,
    localHashes: Record<string, string>,
    localDeletionHash: string,
  ): Promise<GoogleDriveRemoteChanges> {
    const chats: GoogleDriveRemoteChat[] = [];
    let deletedKeys: string[] = [];
    const hasV2Chats = Object.values(cache.files).some(file => chatKeyFromFile(file) !== null);

    const deletionFile = cache.files[DELETIONS_FILE_NAME];
    if (deletionFile && changedNames.has(DELETIONS_FILE_NAME)
      && deletionFile.appProperties?.hash !== localDeletionHash) {
      const data = await this.downloadJson(deletionFile) as unknown;
      if (this.isDeletionsFileData(data)) {
        deletedKeys = data.deletedKeys;
      }
    }

    for (const name of changedNames) {
      const file = cache.files[name];
      if (!file) {
        continue;
      }
      const chatKey = chatKeyFromFile(file);
      if (chatKey === null || file.appProperties?.hash === localHashes[String(chatKey)]) {
        continue;
      }
      const data = await this.downloadJson(file) as unknown;
      if (!this.isChatFileData(data) || data.chat.key !== chatKey) {
        continue;
      }
      chats.push({
        data: data.chat,
        localUnchanged: !!cache.chatHashes[String(chatKey)]
          && cache.chatHashes[String(chatKey)] === localHashes[String(chatKey)],
      });
      this.state.downloadedChats++;
    }

    // v1 只有一个全量文件。发现 v2 文件后忽略它，避免陈旧副本覆盖增量数据。
    const legacyFile = cache.files[LEGACY_ARCHIVE_FILE_NAME];
    if (!hasV2Chats && legacyFile) {
      const legacy = await this.downloadJson(legacyFile) as unknown;
      if (this.isLegacyArchiveData(legacy)) {
        deletedKeys.push(...legacy.deletedKeys);
        for (const chat of legacy.chats) {
          chats.push({ data: chat, localUnchanged: false });
          this.state.downloadedChats++;
        }
      }
    }

    return {
      chats,
      deletedKeys: [...new Set(deletedKeys)],
    };
  }

  private async uploadDeletionsIfChanged(cache: SyncCache, deletedKeys: string[]) {
    const hash = await this.hashDeletedKeys(deletedKeys);
    const existing = cache.files[DELETIONS_FILE_NAME];
    if (existing?.appProperties?.hash === hash || (!existing && deletedKeys.length === 0)) {
      return;
    }
    const data: DeletionsFileData = {
      version: 2,
      updatedAt: new Date().toISOString(),
      deletedKeys,
    };
    cache.files[DELETIONS_FILE_NAME] = await this.uploadJson(
      DELETIONS_FILE_NAME,
      data,
      existing,
      { kind: 'deletions', schema: '2', hash },
    );
  }

  private async uploadChatsIfChanged(
    cache: SyncCache,
    chats: ChatSaveData[],
    hashes: Record<string, string>,
  ) {
    const changed = chats.filter(chat => {
      const remote = cache.files[chatFileName(chat.key)];
      return remote?.appProperties?.hash !== hashes[String(chat.key)];
    });

    // 限制并发，避免首次迁移大量对话时触发 Drive API 限流。
    for (let index = 0; index < changed.length; index += 3) {
      const group = changed.slice(index, index + 3);
      const uploaded = await Promise.all(group.map(async chat => {
        const name = chatFileName(chat.key);
        const data: ChatFileData = {
          version: 2,
          updatedAt: new Date().toISOString(),
          chat,
        };
        const file = await this.uploadJson(
          name,
          data,
          cache.files[name],
          {
            kind: 'chat',
            schema: '2',
            chatKey: String(chat.key),
            hash: hashes[String(chat.key)],
          },
        );
        this.state.uploadedChats++;
        return [name, file] as const;
      }));
      uploaded.forEach(([name, file]) => {
        cache.files[name] = file;
      });
    }
  }

  private async refreshRemoteIndex(cache: SyncCache): Promise<Set<string>> {
    const changedNames = new Set<string>();
    if (!cache.pageToken) {
      const startToken = await this.getStartPageToken();
      const files = await this.listManagedFiles();
      cache.files = {};
      for (const file of files) {
        const current = cache.files[file.name];
        if (!current || (file.modifiedTime || '') > (current.modifiedTime || '')) {
          cache.files[file.name] = file;
        }
        changedNames.add(file.name);
      }
      cache.pageToken = await this.applyChanges(startToken, cache, changedNames);
      return changedNames;
    }

    try {
      cache.pageToken = await this.applyChanges(cache.pageToken, cache, changedNames);
    } catch (error) {
      if (!(error instanceof GoogleDriveRequestError)
        || ![400, 404, 410].includes(error.status)) {
        throw error;
      }
      const reset = emptyCache();
      cache.pageToken = reset.pageToken;
      cache.files = reset.files;
      cache.chatHashes = reset.chatHashes;
      return this.refreshRemoteIndex(cache);
    }
    return changedNames;
  }

  private async applyChanges(
    startToken: string,
    cache: SyncCache,
    changedNames: Set<string>,
  ) {
    let pageToken = startToken;
    let newStartPageToken = '';
    do {
      const fields = encodeURIComponent(
        'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,modifiedTime,size,appProperties))',
      );
      const response = await this.authorizedFetch(
        `${DRIVE_API}/changes?pageToken=${encodeURIComponent(pageToken)}`
          + `&spaces=appDataFolder&includeRemoved=true&pageSize=1000&fields=${fields}`,
      );
      const data = await response.json() as {
        changes?: DriveChange[];
        nextPageToken?: string;
        newStartPageToken?: string;
      };
      for (const change of data.changes ?? []) {
        const knownName = Object.keys(cache.files)
          .find(name => cache.files[name].id === change.fileId);
        if (change.removed || !change.file) {
          if (knownName) {
            delete cache.files[knownName];
            changedNames.add(knownName);
          }
          continue;
        }
        if (!isManagedFile(change.file)) {
          continue;
        }
        cache.files[change.file.name] = change.file;
        changedNames.add(change.file.name);
      }
      newStartPageToken = data.newStartPageToken || newStartPageToken;
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return newStartPageToken || await this.getStartPageToken();
  }

  private async getStartPageToken() {
    const response = await this.authorizedFetch(
      `${DRIVE_API}/changes/startPageToken`,
    );
    const data = await response.json() as { startPageToken?: string };
    if (!data.startPageToken) {
      throw new Error('Google Drive 未返回同步游标');
    }
    return data.startPageToken;
  }

  private async listManagedFiles() {
    const files: DriveFile[] = [];
    let pageToken = '';
    do {
      const fields = encodeURIComponent('nextPageToken,files(id,name,modifiedTime,size,appProperties)');
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const response = await this.authorizedFetch(
        `${DRIVE_API}/files?spaces=appDataFolder&fields=${fields}&pageSize=1000${token}`,
      );
      const data = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
      files.push(...(data.files ?? []).filter(isManagedFile));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  private async downloadJson(file: DriveFile) {
    const response = await this.authorizedFetch(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
    );
    return response.json();
  }

  private async uploadJson(
    name: string,
    data: unknown,
    existing: DriveFile | undefined,
    appProperties: Record<string, string>,
  ) {
    const content = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const fields = encodeURIComponent('id,name,modifiedTime,size,appProperties');
    const url = existing
      ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(existing.id)}?uploadType=resumable&fields=${fields}`
      : `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=${fields}`;
    const metadata = {
      name,
      mimeType: 'application/json',
      appProperties,
      ...(existing ? {} : { parents: ['appDataFolder'] }),
    };
    const initResponse = await this.authorizedFetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/json',
        'X-Upload-Content-Length': String(content.size),
      },
      body: JSON.stringify(metadata),
    });
    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Google Drive 未返回上传地址');
    }
    const uploadResponse = await this.authorizedFetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    return await uploadResponse.json() as DriveFile;
  }

  private async getChatHashes(chats: ChatSaveData[]) {
    const entries = await Promise.all(
      chats.map(async chat => [String(chat.key), await this.hashChat(chat)] as const),
    );
    return Object.fromEntries(entries);
  }

  private hashDeletedKeys(keys: string[]) {
    return this.hashText(JSON.stringify([...new Set(keys)].sort()));
  }

  private async hashText(text: string) {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // file:// 等不支持 Web Crypto 的环境使用双 FNV-1a，仍可稳定检测内容变化。
    let first = 0x811c9dc5;
    let second = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
      first = Math.imul(first ^ text.charCodeAt(index), 0x01000193);
      second = Math.imul(second ^ text.charCodeAt(text.length - index - 1), 0x01000193);
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }

  private async loadCache() {
    const value = await driveSyncStore.getItem<SyncCache>(SYNC_CACHE_KEY);
    if (!value || value.version !== 2 || !value.files || !value.chatHashes) {
      return emptyCache();
    }
    return value;
  }

  private async authorizedFetch(url: string, init: RequestInit = {}) {
    this.assertConnected();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.accessToken}`);
    const response = await fetch(url, { ...init, headers });
    if (response.ok) {
      return response;
    }
    if (response.status === 401) {
      this.accessToken = '';
      this.state.connected = false;
      throw new GoogleDriveRequestError(401, 'Google 登录已过期，请重新连接');
    }
    const body = await response.json().catch(() => null) as {
      error?: { message?: string } | string;
    } | null;
    const apiMessage = typeof body?.error === 'string' ? body.error : body?.error?.message;
    throw new GoogleDriveRequestError(
      response.status,
      apiMessage || `Google Drive 请求失败 (${response.status})`,
    );
  }

  private async requestToken(prompt?: string) {
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) {
      throw new Error('Google 登录组件不可用');
    }
    const response = await new Promise<GoogleTokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: true,
        callback: resolve,
        error_callback: error => reject(new Error(error.type || 'Google 登录失败')),
      });
      client.requestAccessToken(prompt === undefined ? undefined : { prompt });
    });
    if (!response.access_token) {
      throw new Error(response.error_description || response.error || 'Google 登录失败');
    }
    this.accessToken = response.access_token;
    this.state.connected = true;
    this.state.error = '';
  }

  private assertConnected() {
    if (!this.accessToken || !this.state.connected) {
      throw new Error('请先连接 Google Drive');
    }
  }

  private isLegacyArchiveData(value: unknown): value is GoogleDriveArchiveData {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const data = value as Partial<GoogleDriveArchiveData>;
    return data.version === 1
      && typeof data.updatedAt === 'string'
      && Array.isArray(data.chats)
      && Array.isArray(data.deletedKeys);
  }

  private isChatFileData(value: unknown): value is ChatFileData {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const data = value as Partial<ChatFileData>;
    return data.version === 2
      && typeof data.updatedAt === 'string'
      && !!data.chat
      && typeof data.chat.key === 'number'
      && typeof data.chat.label === 'string'
      && !!data.chat.messages;
  }

  private isDeletionsFileData(value: unknown): value is DeletionsFileData {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const data = value as Partial<DeletionsFileData>;
    return data.version === 2
      && typeof data.updatedAt === 'string'
      && Array.isArray(data.deletedKeys);
  }
}

class GoogleDriveRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'GoogleDriveRequestError';
  }
}
