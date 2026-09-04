import localforage from 'localforage';
import { reactive } from 'vue';

const fileKey = (document.documentElement.outerHTML).match(/_DSFILEKEY_=\"([\s\S]*?)\";_DSFILEKEY_/)?.[1] || '';

export const chatStore = localforage.createInstance({
  name: 'DeepSeek' + fileKey,
  storeName: 'Chats',
});

export const deleteChatStore = localforage.createInstance({
  name: 'DeepSeek' + fileKey,
  storeName: 'DeleteChats',
});

export const driveSyncStore = localforage.createInstance({
  name: 'DeepSeek' + fileKey,
  storeName: 'GoogleDriveSync',
});

export function setDeleteKey(chatKey: number | string, msgKey: number | string = '') {
  return deleteChatStore.setItem(`${chatKey}_${msgKey}`, 1);
}

export async function isDeletedKey(chatKey: number | string, msgKey: number | string = '') {
  return deleteChatStore.getItem(`${chatKey}_${msgKey}`).then((value) => !!value);
}

export type DeepSeekMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string;
}

export type DeepSeekSaveMessage = {
  key: number;
  /**
   * 消息分组的 key
   */
  groupKey: number;
  /**
   * 下一条消息的 key
   */
  nextKey?: number;
  /**
   * 是否收藏
   */
  mark?: boolean;
  /**
   * 消息总 tokens 数
   */
  total_tokens: number;
} & DeepSeekMessage;

export type DeepSeekThinkingType = 'enabled' | 'disabled';

export function normalizeThinkingType(value: string | null): DeepSeekThinkingType {
  return value === 'disabled' ? 'disabled' : 'enabled';
}

export type DeepSeekRequest = {
  messages: DeepSeekMessage[];
  model?: string;
  thinking?: {
    type: DeepSeekThinkingType;
  }
  stream?: boolean;
  /**
   * 生成的文本长度
   */
  max_tokens?: number;
  /**
   * 温度参数，用于控制生成文本的多样性
   */
  temperature?: number;
  /**
   * 顶层概率截断，用于控制生成文本的多样性
   */
  top_p?: number;
  /**
   * 重复惩罚，用于控制生成文本的多样性
   */
  repetition_penalty?: number;
}

export type DeepSeekResponseChunk = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
}

export type DeepSeekResponseChoice = {
  delta: {
    content: string | null;
    reasoning_content: string | null;
  };
  index: number;
  finish_reason: string | null;
}

export type DeepSeekResponseChat = {
  content: string | null;
  reasoning_content: string | null;
  total_tokens?: number;
}

export class DeepSeekClient {
  private static BASE_URL = 'https://api.deepseek.com';
  static instance?: DeepSeekClient;

  data = reactive({
    apiKey: '',
    balance: null as number | null,
    balancePromise: null as Promise<number> | null,
    timestamp: 0,
  });

  /**
   * 获取 DeepSeekClient 实例，基于 API key 进行单例管理
   */
  static getInstance(apiKey: string): DeepSeekClient {
    let instance = DeepSeekClient.instance;
    if (!instance) {
      instance = DeepSeekClient.instance = new DeepSeekClient();
    }
    if (instance.data.apiKey !== apiKey) {
      instance.data.apiKey = apiKey;
      instance.data.balance = null;
      instance.data.balancePromise = null;
      instance.data.timestamp = 0;
      instance.getBalance(true);
    }
    return instance;
  }

  /**
   * 直接返回聊天内容
   */
  async createChatCompletion(params: DeepSeekRequest): Promise<DeepSeekResponseChoice> {
    const payload: DeepSeekRequest = {
      ...params,
      stream: false,
    };

    const response = await fetch(`${DeepSeekClient.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.data.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error [${response.status}]: ${errorData.message || 'Unknown error'}`);
    }

    const data: DeepSeekResponseChunk = await response.json();
    return data.choices[0];
  }

  /**
   * 创建流式聊天补全
   * @param params 请求参数
   * @param abortSignal 可选的 AbortSignal，用于中止请求
   * @returns 返回一个异步生成器，逐块产生响应内容
   */
  async *createStreamingChatCompletion(
    params: DeepSeekRequest,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<DeepSeekResponseChat, number, unknown> {
    const payload: DeepSeekRequest = {
      ...params,
      stream: true,
    };

    const response = await fetch(`${DeepSeekClient.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.data.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: abortSignal, // 绑定 AbortSignal
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error [${response.status}]: ${errorData.message || 'Unknown error'}`);
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let keepAlive = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 处理可能的多条消息
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || ''; // 最后一条可能是未完成的消息

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const data = chunk.replace('data: ', '').trim();
          if (data === ': keep-alive') {
            keepAlive++;
            continue;
          }
          keepAlive = 0;
          if (data === '[DONE]') return 0;

          try {
            const parsed: DeepSeekResponseChunk = JSON.parse(data);
            // console.log('Parsed chunk:', parsed);
            const choice = parsed.choices[0];
            if (choice) {
              yield {
                content: choice.delta.content,
                reasoning_content: choice.delta.reasoning_content,
                total_tokens: parsed.usage?.total_tokens,
              };
            }
          } catch (error) {
            console.error('Error parsing chunk:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error reading response:', error);
    } finally {
      reader.releaseLock(); // 释放资源
      return keepAlive;
    }
  }

  /**
   * 查询余额
   */
  async getBalance(force = false): Promise<number> {
    if (!this.data.apiKey) {
      throw new Error('API Key is not set');
    }

    const now = Date.now();
    const { apiKey, balance, timestamp } = this.data;

    if (!force && balance !== null && now - timestamp < 5 * 60 * 1000) {
      return balance;
    }

    const getPromise = async () => {
      const response = await fetch(`${DeepSeekClient.BASE_URL}/user/balance`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (apiKey !== this.data.apiKey) {
        throw new Error('API Key has changed');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error [${response.status}]: ${errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const balance = +data.balance_infos[0].total_balance || 0;
      this.data.balance = balance;
      this.data.timestamp = now;
      return balance;
    };

    if (this.data.balancePromise) {
      return this.data.balancePromise;
    }

    this.data.balancePromise = getPromise();
    try {
      const balance = await this.data.balancePromise;
      return balance;
    } finally {
      this.data.balancePromise = null;
    }
  }

  /**
   * 检查 API key 是否有效
   */
  async checkKeyValid() {
    let balance = 0;
    let error = '';
    try {
      balance = await this.getBalance();
      if (balance === 0) {
        error = '余额不足';
      }
    } catch (e) {
      error = 'API Key 无效';
    }
    return {
      balance,
      error,
    };
  }

  /**
   * 获取模型列表
   */
  async getModels(): Promise<string[]> {
    const apiKey = this.data.apiKey;
    if (!apiKey) {
      throw new Error('API Key is not set');
    }

    const response = await fetch(`${DeepSeekClient.BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (apiKey !== this.data.apiKey) {
      throw new Error('API Key has changed');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || errorData.message || 'Unknown error';
      throw new Error(`API Error [${response.status}]: ${message}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.data)) {
      throw new Error('Invalid models response');
    }
    return data.data
      .map((model: { id?: unknown }) => model.id)
      .filter((id: unknown): id is string => typeof id === 'string');
  }
}
