<template>
  <div class="input-container">
    <el-input
      type="textarea"
      v-model="inputText"
      @keyup="enter"
      :autosize="{ minRows: 1, maxRows: 8 }"
      @dblclick="emit('openChatEditor', inputText)"
      placeholder="Enter 换行，Ctrl+Enter 发送，双击打开编辑器"
      clearable />
    <el-button
      @click="send()"
      v-if="!loadingMessage"
      :disabled="!inputText.trim() && lastMessage?.role !== 'user'"
      :icon="Top"
      type="primary"
      circle>
    </el-button>
    <el-button
      @click="stop()"
      v-else
      :icon="Close"
      type="danger"
      circle>
    </el-button>

    <div class="bottom-btns">
      <div class="row">
        <el-tooltip
          :content="tokenInfo"
          placement="top-start"
          :enterable="false"
          :show-after="200"
          :hide-after="0">
          <el-tag
            class="token-count"
            disable-transitions
            size="large"
            type="info">
            <div class="progress" :style="{ width: (100 - usageTokenRate) + '%' }"></div>
            {{ usageTokenRate }}<small>%</small>
          </el-tag>
        </el-tooltip>
      </div>
      <div class="row" style="flex: 1;">
        <el-button
          @click="emit('openChatFlow', lastMessage?.key)"
          :disabled="!messageList.length"
          :icon="Grape">
          分支图
        </el-button>
        <el-select
          class="select"
          placeholder="收藏夹"
          :model-value="null"
          @change="selectMark($event)"
          :suffix-icon="Star"
          :filter-method="selectFilter"
          filterable>
          <el-option
            v-for="item in markedMessages"
            :label="item.label"
            :title="item.data.content"
            :value="item.value">
            <div class="message-select-option">
              <span class="label">{{ item.label }}</span>
              <div class="time" v-if="item.time !== today">
                {{ item.time }}
              </div>
              <el-tag
                class="tag"
                :style="{ visibility: item.nextCount ? 'visible' : 'hidden' }"
                disable-transitions
                size="small"
                type="info">
                {{ item.nextCount }}
              </el-tag>
            </div>
          </el-option>
        </el-select>
      </div>
      <div class="row">
        <el-button
          v-if="!hasSomeExpand"
          @click="expandAll(true)">
          展开
        </el-button>
        <el-button
          v-else
          @click="expandAll(false)">
          收起
        </el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { MAX_TOKENS, type ChatManager } from './ChatManager';
import { Top, Close, Star, Grape } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { DeepSeekClient } from '@/utils/DeepSeek';

const props = defineProps<{
  chat: ChatManager;
}>();

const emit = defineEmits<{
  openChatFlow: [number];
  openChatEditor: [string];
}>();

const today = dayjs().format('M-DD');
const selectFilterInput = ref<string>('');
const messageList = computed(() => props.chat.messageList.value);
const lastMessage = computed(() => messageList.value[messageList.value.length - 1]);
const usageTokenRate = computed(() => {
  return +((lastMessage.value?.total_tokens || 0) / MAX_TOKENS * 100).toFixed(1);
});

const tokenInfo = computed(() => {
  const last = lastMessage.value;
  let info = `已使用 ${last?.total_tokens || 0} 个Token，最大 ${MAX_TOKENS} 个Token`;
  const appkey = DeepSeekClient.instance?.data.apiKey || '';
  if (appkey) {
    const client = DeepSeekClient.getInstance(appkey);
    if (client.data.balance !== null) {
      info += `，余额：${client.data.balance}`;
    } else {
      info += `，正在查询余额...`;
    }
  }
  return info;
});

const loadingMessage = computed(() => {
  const last = lastMessage.value;
  return props.chat.loadingMessages[last?.key]?.message ?? undefined;
});

const markedMessages = computed(() => {
  const list = props.chat.allMessageList.value.filter(msg => msg.mark);
  const filterInput = selectFilterInput.value.trim();
  return list.filter(msg => {
    if (filterInput) {
      return msg.content.includes(filterInput);
    }
    return true;
  }).map(msg => {
    const next = props.chat.messages[msg.nextKey!];
    const nextGroup = props.chat.groupMap.value[next?.groupKey];
    return {
      label: msg.content.slice(0, 20),
      value: msg.key,
      data: msg,
      time: dayjs(msg.key).format('M-DD'),
      nextCount: nextGroup?.length ?? 0,
    };
  }).sort((a, b) => b.value - a.value);
});

const inputText = props.chat.inputText;

function selectFilter(e: string) {
  selectFilterInput.value = e
}

/**
 * 是否有展开
 */
const hasSomeExpand = computed(() => {
  return Object.values(props.chat.hasExpand).some((value) => value);
});

function expandAll(expanded: boolean) {
  props.chat.expandAll(expanded);
}

function enter(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.ctrlKey) {
    send();
  }
}

function send() {
  props.chat.send();
}

function stop() {
  const key = loadingMessage.value?.key;
  props.chat.stop(key);
}

function selectMark(key: number) {
  props.chat.switchToMessage(key);
}

function setInput(content: string) {
  inputText.value = content;
}

defineExpose({
  setInput,
});
</script>

<style lang="scss" scoped>
.input-container {
  position: relative;
  padding: 8px;
  padding-right: 10px;
  display: flex;
  gap: 8px;
  z-index: 2;
}

input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
}

input:focus {
  border-color: var(--primary-color);
}

.bottom-btns {
  position: absolute;
  left: 0;
  width: 100%;
  bottom: 100%;
  padding: 64px 8px 8px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  pointer-events: none;
  border-bottom: 1px solid #eee;
  background: linear-gradient(to top, #fff 0%, transparent 100%);

  >* {
    pointer-events: auto;
    margin: 0;
  }

  .row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    pointer-events: none;

    >* {
      pointer-events: auto;
      margin: 0;
    }
  }

  .select {
    max-width: 160px;
  }

  .token-count {
    position: relative;
    font-size: 12px;
    width: 64px;
    color: #666;
    background: #fffa;
    overflow: hidden;

    .progress {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      background: #00000008;
    }
  }

  .setting-item {
    padding: 0px 15px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 4px;
    display: flex;
    align-items: center;

    .label {
      color: var(--el-text-color-regular);
      word-break: keep-all;
    }

    .slider {
      width: 100px;
      margin: -2px 0;
      margin-left: 12px;
    }
  }
}

:deep(.message-select-option) {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin: 0 -18px 0 -6px;

  .label {
    flex: 1;
    word-break: keep-all;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    font-size: 10px;
    opacity: 0.6;
  }

  .tag {
    font-size: 10px;
    padding: 2px 4px;
    min-width: 20px;
    text-align: center;
    line-height: 1;
    color: #666;
  }
}
</style>