import { chatStore, DeepSeekClient, normalizeThinkingType, setDeleteKey, isDeletedKey, type DeepSeekMessage, type DeepSeekSaveMessage } from "@/utils/DeepSeek";
import { computed, nextTick, reactive, ref, toRaw, watch, type Ref } from "vue";


export const MAX_TOKENS = 393216;


/**
 * 对话保存信息
 */
export type ChatSaveData = {
  key: number;
  label: string;
  firstKey?: number;
  messages: { [key: string]: DeepSeekSaveMessage };
  inputText?: string;
  openReasoning?: boolean;
  temperature?: number;
};


/**
 * 对话管理器
 */
export class ChatManager {
  key: number;
  label = ref<string>('');
  firstKey = ref<number>();
  isNew = ref(false);
  isLocal = ref(false);

  static refApiKeyEditor = ref();

  static NEW_CHAT_LABEL = '新对话';

  static hasShowedKeys = {} as { [key: number]: boolean };

  /**
   * 所有消息
   */
  messages = reactive<{ [key: string]: DeepSeekSaveMessage }>({});

  /**
   * 所有消息列表
   */
  allMessageList = computed(() => {
    return Object.values(this.messages).sort((a, b) => a.key - b.key);
  });

  /**
   * 消息分组
   */
  groupMap = computed(() => {
    const groupMap: { [key: number]: DeepSeekSaveMessage[] } = {};
    const msgList = this.allMessageList.value;
    msgList.forEach((msg) => {
      if (msg.groupKey) {
        if (!groupMap[msg.groupKey]) {
          groupMap[msg.groupKey] = [];
        }
        groupMap[msg.groupKey].unshift(msg);
      }
    });
    return groupMap;
  });

  /**
   * 当前对话的消息列表
   */
  messageList = computed(() => {
    const msgMap = this.messages;
    const msgList = this.allMessageList.value;
    let msg = msgMap[this.firstKey.value!] ?? msgList[0];
    if (!msg) {
      return [];
    }
    let count = 0;
    const maxCount = msgList.length;
    const list: DeepSeekSaveMessage[] = [msg];
    while (msg.nextKey && msgMap[msg.nextKey]) {
      msg = msgMap[msg.nextKey];
      list.push(msg);
      count++;
      if (count >= maxCount) {
        break;
      }
    }
    return list;
  });

  /**
   * 逆向关联映射表
   */
  prevKeyMap = computed(() => {
    return this.allMessageList.value.reduce((map, msg) => {
      const nextMsg = this.messages[msg.nextKey!];
      const nextGroup = this.groupMap.value[nextMsg?.groupKey];
      nextGroup?.forEach(next => {
        map[next.key] = msg.key;
      });
      return map;
    }, {} as { [key: number]: number });
  });

  /**
   * 根节点列表
   */
  rootMessageList = computed(() => {
    return this.messageList.value.filter((item) => {
      const prevKey = this.prevKeyMap.value[item.key];
      const prev = this.messages[prevKey];
      return !prev;
    });
  });

  /**
   * 加载中消息
   */
  loadingMessages = reactive<{
    [key: number]: {
      message: DeepSeekSaveMessage,
      controller: AbortController,
      retryCount: number,
    }
  }>({});

  /**
   * 是否展开
   */
  hasExpand = reactive<{ [key: string]: boolean }>({});

  inputText: Ref<string>;
  temperature: Ref<number>;
  openReasoning: Ref<boolean>;
  refChatMessages = ref();

  constructor(opt: {
    key: number,
    label: string,
    firstKey?: number,
    messages?: { [key: string]: DeepSeekSaveMessage },
    inputText?: string,
    openReasoning?: boolean,
    temperature?: number,
    isNew?: boolean,
    isLocal?: boolean,
  }) {
    this.key = opt.key;
    this.label.value = opt.label;
    this.firstKey.value = opt.firstKey;
    this.messages = reactive(opt.messages ?? {});
    this.inputText = ref(opt.inputText ?? '');
    this.openReasoning = ref(opt.openReasoning ?? false);
    this.temperature = ref(opt.temperature ?? 1);
    this.isNew.value = !!opt.isNew;
    this.isLocal.value = !!opt.isLocal;
    watch(() => this.inputText.value, () => this.saveChat());
    watch(() => this.openReasoning.value, () => this.saveChat());
    watch(() => this.temperature.value, () => this.saveChat());
  }

  send() {
    this.inputText.value = this.inputText.value.trim();
    if (this.inputText.value) {
      this.add();
    }
    const lastMessage = this.messageList.value[this.messageList.value.length - 1];
    if (lastMessage.role === 'assistant' && !lastMessage.content && !lastMessage.reasoning_content) {
      this.remove(lastMessage.key);
    }
    setTimeout(() => {
      this.fetchAnswer();
    }, 100);
  }

  add(index?: number) {
    const key = Date.now();
    const newItem: DeepSeekSaveMessage = reactive({
      key,
      groupKey: Date.now(),
      role: 'user',
      content: this.inputText.value,
      reasoning_content: '',
      summary: '',
      total_tokens: this.inputText.value.length * 0.5,
    });
    if (this.messageList.value.length == 0) {
      this.firstKey.value = key;
      newItem.role = 'system';
    }
    if (this.label.value === ChatManager.NEW_CHAT_LABEL && newItem.content) {
      this.label.value = newItem.content;
    }
    if (index !== undefined) {
      const prevMessage = this.messageList.value[index - 1];
      const nextMessage = this.messageList.value[index];
      if (prevMessage) {
        prevMessage.nextKey = key;
        newItem.total_tokens += prevMessage.total_tokens;
      } else {
        this.firstKey.value = key;
      }
      if (nextMessage) {
        newItem.nextKey = nextMessage.key;
      }
    } else {
      const prevMessage = this.messageList.value[this.messageList.value.length - 1];
      if (prevMessage) {
        prevMessage.nextKey = key;
        newItem.total_tokens += prevMessage.total_tokens;
      } else {
        this.firstKey.value = key;
      }
      this.scrollToBottom();
    }
    this.messages[key] = newItem;
    this.inputText.value = '';
    this.hasExpand[`${newItem.key}_content`] = true;
    this.isLocal.value = false;
    this.saveChat();
    return newItem;
  }

  remove(key: number, isSlice = false) {
    const index = this.messageList.value.findIndex((item) => item.key === key);
    if (index === -1) {
      return;
    }
    // 删除消息时，如果不是切分消息，则同时删除后续关联的消息
    const removeKeys = new Set<number>([key]);
    if (!isSlice) {
      const queue = [key];
      while (queue.length) {
        const currKey = queue.shift()!;
        const nextKey = this.messages[currKey]?.nextKey;
        const next = this.messages[nextKey!];
        if (nextKey && next) {
          const groupKey = next.groupKey;
          this.groupMap.value[groupKey]?.forEach(item => {
            if (!removeKeys.has(item.key)) {
              queue.push(item.key);
              removeKeys.add(item.key);
            }
          });
          if (!removeKeys.has(nextKey)) {
            queue.push(nextKey);
            removeKeys.add(nextKey);
          }
        }
      }
    }
    // 调整关联关系，或切换到同组的其他消息
    const prev = this.messageList.value[index - 1];
    if (prev) {
      const curr = this.messageList.value[index];
      if (isSlice) {
        prev.nextKey = curr.nextKey;
      } else {
        prev.nextKey = undefined;
      }
      if (!prev.nextKey) {
        const groupItem = this.groupMap.value[curr.groupKey]?.find(item => {
          return item.key !== key;
        });
        if (groupItem) {
          prev.nextKey = groupItem.key;
          this.expand(groupItem.key, true);
        }
      }
    }
    removeKeys.forEach((key) => {
      delete this.messages[key];
      setDeleteKey(this.key, key);
    });
    this.isLocal.value = false;
    this.saveChat();
    // 如果为空，则添加一个默认消息
    if (this.messageList.value.length === 0) {
      this.add();
    }
  }

  refresh(key: number) {
    const message = this.messageList.value.find((item) => item.key === key);
    if (message) {
      const prev = this.messageList.value.find((item) => item.nextKey === key);
      const newKey = Date.now();
      const groupKey = message.groupKey;
      const isLast = this.messageList.value[this.messageList.value.length - 1]?.key === key;
      if (isLast && !message.content && !message.reasoning_content) {
        this.remove(key);
      }
      if (prev) {
        prev.nextKey = newKey;
      }
      this.isLocal.value = false;
      this.saveChat();
      this.fetchAnswer(newKey, groupKey);
    }
  }

  chainChange(prevKey: number, nextKey: number) {
    const prev = this.messages[prevKey];
    const next = this.messages[nextKey];
    if (!prev || !next || prev.nextKey === nextKey || prevKey === nextKey) {
      return;
    }
    // 切换旧组
    const nextPrevKey = this.prevKeyMap.value[next.key];
    const nextPrev = this.messages[nextPrevKey];
    if (nextPrev) {
      const groupKey = this.messages[next.key]?.groupKey;
      const group = this.groupMap.value[groupKey!];
      const otherKey = group?.find((item) => item.key !== next.key)?.key;
      nextPrev.nextKey = otherKey;
    }
    // 切换新组
    const groupKey = this.messages[prev.nextKey!]?.groupKey;
    if (groupKey) {
      next.groupKey = groupKey;
    } else {
      next.groupKey = Date.now();
      prev.nextKey = next.key;
    }
    if (this.firstKey.value === next.key) {
      this.trackFirstKey(next.key);
    }
    this.isLocal.value = false;
    this.saveChat();
  }

  trackFirstKey(key: number) {
    const hasKey = {} as { [key: number]: boolean };
    while (true) {
      if (hasKey[key]) {
        break;
      }
      hasKey[key] = true;
      const prevKey = this.prevKeyMap.value[key];
      const prev = this.messages[prevKey];
      if (!prev) {
        this.firstKey.value = key;
        break;
      }
      prev.nextKey = key;
      key = prevKey;
    }
  }

  switchToMessage(targetKey: number) {
    this.trackFirstKey(targetKey);
    this.expandAll(false);
    this.expandAll(true);
    this.scrollToKey(targetKey);
    this.saveChat();
  }

  getBranchMessages(targetKey: number) {
    const list: DeepSeekSaveMessage[] = [];
    const hasKey = {} as { [key: number]: boolean };
    let key = targetKey;
    while (key && !hasKey[key]) {
      const message = this.messages[key];
      if (!message) {
        break;
      }
      list.unshift(message);
      hasKey[key] = true;
      key = this.prevKeyMap.value[key];
    }
    return list;
  }

  getBranchMarkdown(targetKey: number) {
    const messages = this.getBranchMessages(targetKey);
    const separator = '\n\n---\n---\n\n';
    return messages.map((message) => {
      const parts = [
        `## role: ${message.role}`,
        message.content || '',
      ];
      return parts.join('\n\n').trimEnd();
    }).join(separator);
  }

  exportBranchMarkdown(targetKey: number) {
    const markdown = this.getBranchMarkdown(targetKey);
    if (!markdown) {
      return false;
    }
    const fileName = this.getBranchMarkdownFileName(targetKey);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  private getBranchMarkdownFileName(targetKey: number) {
    const label = (this.label.value || ChatManager.NEW_CHAT_LABEL)
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .replace(/^[ .]+|[ .]+$/g, '')
      .slice(0, 80) || ChatManager.NEW_CHAT_LABEL;
    return `${label}-${targetKey}`;
  }

  saveMessage(editKey: number, content: string, isAdd = false) {
    const editItem = this.messageList.value.find((item) => item.key === editKey);
    if (!editItem) {
      return;
    }
    if (!isAdd) {
      editItem.content = content;
      this.isLocal.value = false;
      if (this.label.value === ChatManager.NEW_CHAT_LABEL && editItem.content) {
        this.label.value = editItem.content;
      }
      this.saveChat();
      return;
    }
    const prev = this.messageList.value.find((item) => item.nextKey === editItem?.key);
    const newKey = Date.now();
    const groupKey = editItem.groupKey;
    const role = editItem.role;
    if (prev) {
      prev.nextKey = newKey;
    } else {
      this.firstKey.value = newKey;
    }
    const newItem: DeepSeekSaveMessage = {
      key: newKey,
      groupKey,
      role,
      content,
      reasoning_content: '',
      total_tokens: (prev?.total_tokens || 0) + content.length * 0.5,
    };
    this.messages[newKey] = newItem;
    this.isLocal.value = false;
    this.saveChat();
  }

  async getApiKey(): Promise<string> {
    let error = '';
    const apiKey = localStorage.getItem('DeepSeekAPIKey');
    if (apiKey) {
      const client = DeepSeekClient.getInstance(apiKey);
      error = (await client.checkKeyValid()).error;
      if (!error && localStorage.getItem('DeepSeekChatModel')) {
        return apiKey;
      }
      error ||= '请选择模型';
    } else {
      error = '请设置 API Key';
    }
    const newApiKey = await ChatManager.refApiKeyEditor.value?.open(error);
    if (newApiKey) {
      localStorage.setItem('DeepSeekAPIKey', newApiKey);
      return newApiKey;
    }
    throw new Error('未设置 API Key');
  }

  async fetchAnswer(key = Date.now(), groupKey?: number) {
    const apiKey = await this.getApiKey();
    const client = DeepSeekClient.getInstance(apiKey);
    const controller = new AbortController();

    const chatModel = localStorage.getItem('DeepSeekChatModel');
    if (!chatModel) {
      throw new Error('请设置模型');
    }

    const thinkingType = normalizeThinkingType(localStorage.getItem('DeepSeekThinkingType'));

    try {
      const messages: DeepSeekMessage[] = this.messageList.value.map((message) => ({
        content: message.content,
        role: message.role,
      }));
      const prevMessage = this.messageList.value[this.messageList.value.length - 1];
      if (prevMessage) {
        prevMessage.nextKey = key;
      }
      const message = reactive<DeepSeekSaveMessage>({
        key: key,
        groupKey: groupKey || Date.now(),
        role: 'assistant',
        content: '',
        reasoning_content: '',
        total_tokens: prevMessage.total_tokens || 0,
      });
      this.messages[key] = message;
      const loadingMessage = reactive({ message, controller, retryCount: 0 });
      this.loadingMessages[key] = loadingMessage;
      this.isLocal.value = false;
      this.saveChat();
      this.scrollToBottom();

      let gotReasoning = false;
      let gotContent = false;

      const params = {
        messages,
        max_tokens: MAX_TOKENS,
        temperature: this.temperature.value,
        top_p: 1,
        model: chatModel,
        thinking: {
          type: thinkingType,
        },
        ...(thinkingType === 'enabled' ? { reasoning_effort: 'high' } : {}),
      } as const;
      let gen = client.createStreamingChatCompletion(params, controller.signal);
      loadingMessage.retryCount = 0;

      while (true) {
        if (!this.loadingMessages[key]) {
          controller.abort();
          return;
        }
        const { done, value } = await gen.next();
        if (done) {
          const keepAlive = value;
          if (keepAlive >= 5 && !controller.signal.aborted) {
            await new Promise(r => setTimeout(r, 1000));
            gen = client.createStreamingChatCompletion(params, controller.signal);
            loadingMessage.retryCount++;
            continue;
          }
          break;
        }
        if (value.content) {
          if (!gotContent) {
            gotContent = true;
            this.hasExpand[`${message.key}_content`] = true;
          }
          message.content += value.content;
          message.total_tokens += value.content.length * 0.5;
        }
        if (value.reasoning_content) {
          if (!gotReasoning) {
            gotReasoning = true;
            this.hasExpand[`${message.key}_content`] = true;
          }
          message.reasoning_content += value.reasoning_content;
          message.total_tokens += value.reasoning_content.length * 0.5;
        }
        if (value.total_tokens) {
          message.total_tokens = value.total_tokens;
        }
        this.isLocal.value = false;
        this.saveChat();
        if (this.messageList.value[this.messageList.value.length - 1].key === key) {
          this.scrollToBottom(true);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('请求被用户中止');
      } else {
        console.error('请求处理失败：', error.message);
      }
    } finally {
      delete this.loadingMessages[key];
    }
  }

  stop(key?: number) {
    const data = this.loadingMessages[key!];
    if (key && data) {
      data.controller.abort();
      delete this.loadingMessages[key];
      this.remove(key);
    }
  }

  clear() {
    Object.keys(this.messages).forEach((key) => {
      delete this.messages[key];
      setDeleteKey(this.key, key);
    });
    Object.keys(this.loadingMessages).forEach((key) => {
      this.stop(+key);
    });
    this.firstKey.value = undefined;
    this.isLocal.value = false;
    this.saveChat();
  }

  saveChat() {
    const data = this.getSaveData();
    chatStore.setItem(String(this.key), data);
  }

  getSaveData(): ChatSaveData {
    return {
      key: this.key,
      label: this.label.value,
      firstKey: this.firstKey.value,
      messages: toRaw(this.messages),
      inputText: this.inputText.value,
      openReasoning: this.openReasoning.value,
      temperature: this.temperature.value,
    };
  }

  async mergeData(data: ChatSaveData, overwrite = false): Promise<boolean> {
    let isChanged = false;
    for (const key in data.messages) {
      const isDeleted = await isDeletedKey(this.key, key);
      if (isDeleted) {
        continue;
      }
      if (this.messages[key]?.content != data.messages[key]?.content) {
        isChanged = true;
      }
      if (overwrite || !this.messages[key]) {
        this.messages[key] = data.messages[key];
      }
    }
    return isChanged;
  }

  async scrollToBottom(follow = false) {
    await nextTick();
    const el = this.refChatMessages.value.wrapRef;
    if (!el) {
      return;
    }
    if (!follow || el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
      el.scrollTo({
        top: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  async scrollToKey(key?: number) {
    await nextTick();
    const el = this.refChatMessages.value.wrapRef;
    if (!el || !key) {
      return;
    }
    el.querySelector(`[data-key="${key}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  expand(key: any, expanded?: boolean) {
    expanded = expanded ?? !this.hasExpand[`${key}_content`];
    this.hasExpand[`${key}_content`] = expanded;
    if (!expanded) {
      this.hasExpand[`${key}_reasoning_content`] = false;
    }
  }

  expandAll(expanded: boolean) {
    if (expanded) {
      this.messageList.value.forEach((item) => {
        if (item.role === 'system') {
          return;
        }
        this.hasExpand[`${item.key}_content`] = true;
      });
    } else {
      Object.keys(this.hasExpand).forEach((key) => {
        if (key.endsWith('_content')) {
          delete this.hasExpand[key];
        }
      });
    }
  }
}
