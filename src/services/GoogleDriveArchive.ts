import { reactive } from 'vue';
import type { ChatSaveData } from '@/views/DeepSeek/ChatManager';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ARCHIVE_FILE_NAME = 'deepseek-chat-archive.json';
const AUTO_CONNECT_KEY = 'GoogleDriveAutoConnect';

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

export type GoogleDriveArchiveData = {
  version: 1;
  updatedAt: string;
  chats: ChatSaveData[];
  deletedKeys: string[];
};

export type GoogleDriveArchiveState = {
  configured: boolean;
  ready: boolean;
  restoring: boolean;
  connected: boolean;
  syncing: boolean;
  lastSyncedAt: string;
  error: string;
};

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
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

/**
 * Google Drive 存档服务。
 *
 * OAuth access token 只保存在内存中，不写入 localStorage / IndexedDB。
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
  });

  private accessToken = '';
  private syncQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (this.clientId) {
      // 提前加载脚本，确保用户点击登录按钮时仍处于浏览器允许弹窗的手势中。
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

  /**
   * 页面刷新后重新申请短期 token。只持久化连接意愿，不持久化 access token。
   */
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
    if (token && window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(token);
    }
  }

  async download(): Promise<GoogleDriveArchiveData | null> {
    this.assertConnected();
    const file = await this.findArchiveFile();
    if (!file) {
      return null;
    }
    const response = await this.authorizedFetch(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
    );
    const data: unknown = await response.json();
    if (!this.isArchiveData(data)) {
      throw new Error('Google Drive 中的存档格式无效');
    }
    this.state.lastSyncedAt = data.updatedAt || file.modifiedTime || '';
    return data;
  }

  /**
   * 每次调用都会入队执行，不合并连续的“对话完成”同步事件。
   */
  sync(data: GoogleDriveArchiveData): Promise<void> {
    const run = () => this.upload(data);
    const job = this.syncQueue.then(run, run);
    this.syncQueue = job.catch(() => undefined);
    return job;
  }

  private async upload(data: GoogleDriveArchiveData) {
    this.assertConnected();
    this.state.syncing = true;
    this.state.error = '';
    try {
      const existing = await this.findArchiveFile();
      const content = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = existing
        ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(existing.id)}?uploadType=resumable`
        : `${DRIVE_UPLOAD_API}/files?uploadType=resumable`;
      const metadata = existing
        ? { mimeType: 'application/json' }
        : { name: ARCHIVE_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
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
      await this.authorizedFetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      });
      this.state.lastSyncedAt = data.updatedAt;
    } catch (error) {
      this.state.error = getErrorMessage(error);
      throw error;
    } finally {
      this.state.syncing = false;
    }
  }

  private async findArchiveFile(): Promise<DriveFile | null> {
    const query = encodeURIComponent(`name = '${ARCHIVE_FILE_NAME}' and trashed = false`);
    const fields = encodeURIComponent('files(id,name,modifiedTime)');
    const response = await this.authorizedFetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=1`,
    );
    const data = await response.json() as { files?: DriveFile[] };
    return data.files?.[0] ?? null;
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
      throw new Error('Google 登录已过期，请重新连接');
    }
    const body = await response.json().catch(() => null) as {
      error?: { message?: string } | string;
    } | null;
    const apiMessage = typeof body?.error === 'string' ? body.error : body?.error?.message;
    throw new Error(apiMessage || `Google Drive 请求失败 (${response.status})`);
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

  private isArchiveData(value: unknown): value is GoogleDriveArchiveData {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const data = value as Partial<GoogleDriveArchiveData>;
    return data.version === 1
      && typeof data.updatedAt === 'string'
      && Array.isArray(data.chats)
      && Array.isArray(data.deletedKeys);
  }
}
