import { ref, watch, reactive, shallowReactive } from 'vue'
import { ChatManager, type ChatSaveData } from './ChatManager';
import { chatStore, setDeleteKey, isDeletedKey } from '@/utils/DeepSeek';
import dayjs from 'dayjs';

export class DeepSeekManager {
  chatList = shallowReactive<ChatManager[]>([]);
  currentChatKey = ref<number | null>(null);

  async init() {
    await this.initChatList();
    watch(() => this.currentChatKey.value, (value) => {
      if (value) {
        localStorage.setItem('lastChatKey', String(value));
      } else {
        localStorage.removeItem('lastChatKey');
      }
    });
  }

  addChat() {
    const chatItem = new ChatManager({
      key: Date.now(),
      label: '新对话',
      openReasoning: true,
    });
    this.chatList.unshift(chatItem);
    this.currentChatKey.value = chatItem.key;
    return chatItem;
  }

  removeChat(key: number) {
    const chatItem = this.chatList.find((item) => item.key === key);
    if (!chatItem) return;
    const index = this.chatList.indexOf(chatItem);
    this.chatList.splice(index, 1);
    if (chatItem.key === this.currentChatKey.value) {
      this.currentChatKey.value = this.chatList[index - 1]?.key ?? this.chatList[0]?.key ?? null;
    }
    chatStore.removeItem(String(chatItem.key));
    setDeleteKey(key);
  }

  async initChatList() {
    // 从本地存储中读取
    const keys = await chatStore.keys();
    for (const lsKey of keys) {
      try {
        const data = await chatStore.getItem(lsKey) as ChatSaveData;
        const chatItem = new ChatManager(data);
        this.chatList.push(chatItem);
      } catch (error) {
        console.error('读取聊天记录失败：', error);
      }
    }
    // 从文件中读取
    try {
      const str = (document.documentElement.outerHTML).match(/_DSDATA_=\"([\s\S]*?)\";_DSDATA_/)?.[1] || '';
      const chats = JSON.parse(decodeURIComponent(str)) as ChatSaveData[];
      if (chats?.length) {
        for (const data of chats) {
          const isDeleted = await isDeletedKey(data.key);
          if (isDeleted) {
            continue;
          }
          const hasChat = this.chatList.find((item) => item.key === data.key);
          if (hasChat) {
            await hasChat.mergeData(data, false);
            hasChat.saveChat();
            hasChat.isLocal.value = true;
          } else {
            const chatItem = new ChatManager(data);
            this.chatList.push(chatItem);
            chatItem.saveChat();
            chatItem.isLocal.value = true;
          }
        }
      }
    } catch (error) { }
    // 如果没有聊天记录，则添加一个
    if (this.chatList.length === 0) {
      this.addChat();
    } else {
      this.chatList.sort((a, b) => b.key - a.key);
      const lastChatKey = +localStorage.getItem('lastChatKey')!;
      if (lastChatKey && this.chatList.some((item) => item.key == lastChatKey)) {
        this.currentChatKey.value = lastChatKey;
      }
    }
  }

  async exportHTML(keys: number[], fileName: string, isolate = false) {
    const datas = [] as ChatSaveData[];
    for (const key of keys) {
      const data = await chatStore.getItem(String(key)) as ChatSaveData;
      if (data) {
        datas.push(data);
      }
    }
    const dataStr = encodeURIComponent(JSON.stringify(datas) || '[]');
    let str = (window as any)._DSHTML_ as string;
    str = str.replace(/_DSDATA_=\"[\s\S]*?\";_DSDATA_/, `_DSDATA_="${dataStr}";_DSDATA_`);
    if (isolate) {
      const fileKey = Date.now();
      str = str.replace(/_DSFILEKEY_=\"[\s\S]*?\";_DSFILEKEY_/, `_DSFILEKEY_="${fileKey}";_DSFILEKEY_`);
    }
    const blob = new Blob([str], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importHTML() {
    let resolve: Function, reject: Function;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject();
        return;
      }
      // 读取文件
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const str = (reader.result as string).match(/_DSDATA_=\"([\s\S]*?)\";_DSDATA_/)?.[1] || '';
          const datas = JSON.parse(decodeURIComponent(str)) as ChatSaveData[];
          datas.forEach((data) => {
            const hasChat = this.chatList.find((item) => item.key === data.key);
            if (hasChat) {
              hasChat.mergeData(data, true).then((isChanged) => {
                hasChat.isNew.value = isChanged;
                hasChat.saveChat();
              });
            } else {
              const chatItem = new ChatManager(data);
              this.chatList.push(chatItem);
              chatItem.isNew.value = true;
              chatItem.saveChat();
            }
          });
          this.chatList.sort((a, b) => b.key - a.key);
          resolve();
        } catch (error) {
          console.error('导入聊天记录失败：', error);
          reject();
        }
      };
      reader.onerror = () => {
        console.error('读取文件失败');
        reject();
      }
      reader.readAsText(file);
    };
    input.onabort = () => reject();
    input.oncancel = () => reject();
    input.click();
    await promise;
  }
}
