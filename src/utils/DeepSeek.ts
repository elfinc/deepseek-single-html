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
  model?: 'deepseek-chat' | 'deepseek-reasoner';
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
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.deepseek.com/v1') {
    if (!apiKey) throw new Error('API key is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * 直接返回聊天内容
   */
  async createChatCompletion(params: DeepSeekRequest): Promise<DeepSeekResponseChoice> {
    const payload: DeepSeekRequest = {
      ...params,
      stream: false,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
}

