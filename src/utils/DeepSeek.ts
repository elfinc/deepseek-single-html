import localforage from 'localforage';

const fileKey = (document.documentElement.outerHTML).match(/_DSFILEKEY_=\"([\s\S]*?)\";_DSFILEKEY_/)?.[1] || '';

export const chatStore = localforage.createInstance({
  name: 'DeepSeek' + fileKey,
  storeName: 'Chats',
});

export const deleteChatStore = localforage.createInstance({
  name: 'DeepSeek' + fileKey,
  storeName: 'DeleteChats',
});

export function setDeleteKey(chatKey: number | string, msgKey: number | string = '') {
  deleteChatStore.setItem(`${chatKey}_${msgKey}`, 1);
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
} & DeepSeekMessage;

export type DeepSeekRequest = {
  messages: DeepSeekMessage[];
  model?: 'deepseek-v4-pro' | 'deepseek-v4-flash';
  thinking?: {
    type: 'enabled' | 'disabled';
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
}

export type DeepSeekResponseChoice = {
  delta: {
    content: string | null;
    reasoning_content: string | null;
  };
  index: number;
  finish_reason: string | null;
}

export class DeepSeekClient {
  private static BASE_URL = 'https://api.deepseek.com';
  static instances: Record<string, DeepSeekClient> = {};

  private apiKey: string;
  private balanceCache: { value: number; timestamp: number } | null = null;

  private constructor(apiKey: string) {
    if (!apiKey) throw new Error('API key is required');
    this.apiKey = apiKey;
  }

  /**
   * 获取 DeepSeekClient 实例，基于 API key 进行单例管理
   */
  static getInstance(apiKey: string) {
    if (!DeepSeekClient.instances[apiKey]) {
      DeepSeekClient.instances[apiKey] = new DeepSeekClient(apiKey);
    }
    return DeepSeekClient.instances[apiKey];
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
        'Authorization': `Bearer ${this.apiKey}`,
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
  ): AsyncGenerator<DeepSeekResponseChoice, number, unknown> {
    const payload: DeepSeekRequest = {
      ...params,
      stream: true,
    };

    const response = await fetch(`${DeepSeekClient.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
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
              yield choice;
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
  async getBalance() {
    const now = Date.now();
    if (this.balanceCache && (now - this.balanceCache.timestamp < 5 * 60 * 1000)) {
      return this.balanceCache.value;
    }

    const response = await fetch(`${DeepSeekClient.BASE_URL}/user/balance`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error [${response.status}]: ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const balance = +data.balance_infos[0].total_balance || 0;
    this.balanceCache = { value: balance, timestamp: now };
    return balance;
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
}

