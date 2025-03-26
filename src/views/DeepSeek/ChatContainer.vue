<template>
  <div
    class="chat-container"
    :class="{ hideTabs, isMobile }"
    v-if="visible">
    <div class="chat-messages">
      <el-scrollbar ref="refChatMessages">
        <div class="list">
          <ChatMessage
            v-for="(item, index) in messageList"
            :key="index"
            :msg="item"
            :index="index"
            @openChatFlow="refChatFlow?.open"
            :chat="chat">
          </ChatMessage>
        </div>
      </el-scrollbar>
    </div>

    <div class="input-container">
      <el-input
        type="textarea"
        v-model="inputText"
        @keyup="enter"
        :autosize="{ minRows: 1, maxRows: 8 }"
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
          <el-button @click="openReasoning = !openReasoning">
            {{ openReasoning ? 'R1' : 'V3' }}
          </el-button>
          <!-- <div class="setting-item" v-if="!openReasoning">
            <div class="label">
              发散
            </div>
            <el-slider
              class="slider"
              v-model="temperature"
              :min="0"
              :max="2"
              :step="0.1">
            </el-slider>
          </div> -->
        </div>
        <div class="row" style="flex: 1;">
          <el-button
            @click="refChatFlow?.open(messageList[messageList.length - 1]?.key)"
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
          <!-- <el-button
            @click="add()"
            :disabled="!inputText.trim()">
            添加
          </el-button> -->
        </div>
      </div>
    </div>

    <div class="mask" @click="emit('update:hideTabs', true)"></div>

    <ChatFlow
      ref="refChatFlow"
      :chat="chat">
    </ChatFlow>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch, type UnwrapRef } from 'vue';
import type { ChatManager } from './ChatManager';
import ChatMessage from './ChatMessage.vue';
import ChatFlow from './ChatFlow.vue';
import { Top, Close, Star, Grape } from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const props = defineProps<{
  chat: ChatManager;
  visible: boolean;
  hideTabs: boolean;
}>();

const emit = defineEmits<{
  'update:hideTabs': [boolean];
}>();

const today = dayjs().format('M-DD');
const selectFilterInput = ref<string>('');
const messageList = computed(() => props.chat.messageList.value);
const lastMessage = computed(() => messageList.value[messageList.value.length - 1]);
const loadingMessage = computed(() => {
  const last = messageList.value[messageList.value.length - 1];
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
const openReasoning = props.chat.openReasoning;
const temperature = props.chat.temperature;
const refChatMessages = ref();
const refChatFlow = ref<UnwrapRef<typeof ChatFlow>>();

onMounted(() => {
  props.chat.refChatMessages = refChatMessages;
  onVisibleChange(props.visible);
});

watch(() => props.visible, onVisibleChange);

const isMobile = ref(window.innerWidth <= 500);
const onResize = () => isMobile.value = window.innerWidth <= 500;

function onVisibleChange(visible: boolean) {
  if (visible) {
    onResize();
    props.chat.isNew.value = false;
    props.chat.expandAll(false);
    expandAll(true);
    nextTick(() => {
      props.chat.scrollToBottom();
    });
    window.addEventListener('resize', onResize);
  } else {
    window.removeEventListener('resize', onResize);
  }
}

function selectFilter(e: string) {
  selectFilterInput.value = e
}

/**
 * 是否有展开
 */
const hasSomeExpand = computed(() => {
  return Object.values(props.chat.hasExpand).some((value) => value);
});

function add(index?: number) {
  props.chat.add(index);
}

function expandAll(expanded: boolean) {
  props.chat.expandAll(expanded);
}

function enter(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
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

function clear() {
  props.chat.clear();
}

function selectMark(key: number) {
  props.chat.switchToMessage(key);
}
</script>

<style lang="scss" scoped>
.chat-container {
  position: absolute;
  left: var(--side-width);
  width: calc(100% - var(--side-width));
  min-width: 320px;
  top: 0;
  bottom: 0;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1;
  transition: all 0.3s;

  &.hideTabs {
    left: 0;
    width: 100%;
  }

  &.isMobile {
    .mask {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: #0008;
      z-index: 2;
      transition: all 0.3s;
    }

    &.hideTabs .mask {
      background-color: #0000;
      pointer-events: none;
    }
  }
}

.chat-messages {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
  // overflow-y: auto;
  mask: linear-gradient(to bottom, transparent 0%, #fff 20px);

  .list {
    position: relative;
    padding-top: 40px;
    padding-bottom: 100px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
}

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

@media screen and (max-width: 800px) {
  .chat-container {
    width: 100%;
  }
}
</style>