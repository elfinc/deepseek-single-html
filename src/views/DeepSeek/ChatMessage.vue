<template>
  <div
    class="chat-message"
    :data-key="msg.key"
    :class="[`${msg.role}-role`]">
    <div class="options">
      <!-- <el-select
        class="role-select"
        v-model="msg.role"
        size="small"
        :disabled="!!loadingMessage">
        <el-option label="系统" value="system" />
        <el-option label="我" value="user" />
        <el-option label="AI酱" value="assistant" />
      </el-select> -->
      <el-select
        class="message-select"
        :model-value="messageList[index - 1]?.nextKey ?? currentChat?.firstKey.value"
        @change="switchToMessage($event)"
        size="small"
        :filter-method="selectFilter"
        filterable>
        <template #label="{ label, value }">
          <div class="message-select-label">
            <span class="num" v-if="messageOptions.length > 1">
              {{ messageOptions.length }}
            </span>
            <span class="label">
              {{ label }}
            </span>
          </div>
        </template>
        <el-option
          v-for="item in messageOptions"
          :label="item.label"
          :title="item.data.content"
          :value="item.value">
          <div class="message-select-option">
            <el-icon
              v-if="item.data.mark"
              :size="14"
              color="#ff53a9">
              <Star />
            </el-icon>
            <span class="label">
              {{ item.label }}
            </span>
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
      <el-tooltip content="修改" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="edit()"
          :disabled="!!loadingMessage"
          :icon="Edit"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <!-- <el-button
        @click="edit(true)"
        :disabled="!!loadingMessage"
        :icon="Plus"
        size="small"
        circle>
      </el-button> -->
      <!-- <el-button
        @click="add()"
        :icon="Upload"
        size="small"
        circle>
      </el-button> -->
      <!-- <el-popconfirm title="删除这一条?" @confirm="remove(msg.key, true)">
        <template #reference>
          <el-button
            :disabled="!!loadingMessage"
            :icon="Minus"
            size="small"
            circle>
          </el-button>
        </template>
      </el-popconfirm> -->
      <el-popconfirm v-if="!loadingMessage" title="删除以下所有?" @confirm="remove(msg.key)">
        <template #reference>
          <div>
            <el-tooltip content="删除" :enterable="false" :show-after="200" :hide-after="0">
              <el-button
                :icon="Delete"
                size="small"
                circle>
              </el-button>
            </el-tooltip>
          </div>
        </template>
      </el-popconfirm>
      <el-tooltip v-else content="删除" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          disabled
          :icon="Delete"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <template v-if="msg.role === 'assistant'">
        <el-tooltip content="重新生成" :enterable="false" :show-after="200" :hide-after="0">
          <el-button
            @click="refresh(msg.key)"
            :disabled="!!loadingMessage"
            :icon="Refresh"
            size="small"
            circle>
          </el-button>
        </el-tooltip>
      </template>
      <el-divider direction="vertical" style="margin: 0px 1px;" />
      <el-tooltip content="收藏" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          v-if="msg.mark"
          @click="mark(msg)"
          size="small"
          color="#ff53a9"
          plain
          circle>
          <el-icon :size="13">
            <StarFilled />
          </el-icon>
        </el-button>
        <el-button
          v-else
          @click="mark(msg)"
          size="small"
          circle>
          <el-icon>
            <Star />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="查看分支" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="emit('openChatFlow', msg.key)"
          :icon="Grape"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <el-tooltip v-if="chat.hasExpand[`${msg.key}_content`]" content="折叠" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="expand(msg.key)"
          :icon="ArrowUp"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <el-tooltip v-else content="展开" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="expand(msg.key)"
          :icon="ArrowDown"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
    </div>
    <div
      class="reasoning_content"
      :class="{ expanded: chat.hasExpand[`${msg.key}_reasoning_content`] }"
      @click="chat.hasExpand[`${msg.key}_reasoning_content`] = !chat.hasExpand[`${msg.key}_reasoning_content`]"
      v-if="msg.reasoning_content && chat.hasExpand[`${msg.key}_content`]">
      <div class="text">
        {{ msg.reasoning_content }}
      </div>
    </div>
    <div class="loading-tips" v-else-if="loadingMessage && !msg.content">
      <el-icon class="is-loading" style="font-style: normal;">
        <Loading />
      </el-icon>
      <span class="text">
        <span v-if="retryCount == 0">少女思考中...</span>
        <span v-else-if="retryCount == 1">少女疑惑中...</span>
        <span v-else-if="retryCount <= 3">少女摸鱼中...</span>
        <span v-else-if="retryCount <= 5">少女躺平中...</span>
        <span v-else>少女摆烂中...</span>
      </span>
    </div>
    <div
      class="content"
      v-if="msg.content"
      :class="{ expanded: chat.hasExpand[`${msg.key}_content`] }"
      @click="chat.hasExpand[`${msg.key}_content`] ? null : expand(msg.key)">
      <!-- <v-md-preview :text="msg.content"></v-md-preview> -->
      <v-md-editor v-model="msg.content" mode="preview"></v-md-editor>
      <div
        v-if="msg.content.length > 500 && chat.hasExpand[`${msg.key}_content`]"
        class="content-bottom-btns">
        <el-button
          @click.stop="expand(msg.key)"
          :icon="chat.hasExpand[`${msg.key}_content`] ? ArrowUp : ArrowDown"
          size="small"
          circle>
        </el-button>
      </div>
      <div class="text-count">
        {{ (msg.reasoning_content?.length ?? 0) + msg.content.length }}
      </div>
    </div>

    <el-dialog
      v-model="editVisible"
      title="修改"
      :fullscreen="fullscreenDialog"
      append-to-body
      destroy-on-close
      align-center
      width="80%">
      <div
        class="edit-container"
        :class="{ fullscreen: fullscreenDialog }">
        <v-md-editor
          v-model="editContent"
          :toolbar="{ save: false }"
          mode="edit">
        </v-md-editor>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button
            type="primary"
            :disabled="editContent == msg.content"
            @click="saveMessage()">
            修改
          </el-button>
          <el-button type="primary" @click="saveMessage(true)">
            新分支
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { DeepSeekSaveMessage } from '@/utils/DeepSeek';
import { computed, onMounted, onUnmounted, ref, watch, type UnwrapRef } from 'vue';
import type { ChatManager } from './ChatManager';
import { Delete, Upload, ArrowDown, ArrowUp, Edit, Plus, Refresh, Minus, Loading, StarFilled, Star, Grape } from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const props = defineProps<{
  msg: DeepSeekSaveMessage;
  index: number;
  chat: ChatManager;
}>();

const emit = defineEmits<{
  openChatFlow: [number];
}>();

const messageList = computed(() => props.chat.messageList.value);
const currentChat = computed(() => props.chat);
const loadingMessage = computed(() => props.chat.loadingMessages[props.msg.key] ?? undefined);
const retryCount = computed(() => loadingMessage.value.retryCount);
const groupMessages = computed(() => props.chat.groupMap.value[props.msg.groupKey] ?? []);
const today = dayjs().format('M-DD');
const selectFilterInput = ref<string>('');

const messageOptions = computed(() => {
  const list = [...groupMessages.value];
  if (props.index === 0) {
    props.chat.rootMessageList.value.forEach(msg => {
      if (!list.includes(msg)) {
        list.push(msg);
      }
    });
  }
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
  });
});

function selectFilter(e: string) {
  selectFilterInput.value = e
}

function add() {
  props.chat.add(props.index);
}

function remove(key: number, isSlice = false) {
  props.chat.remove(key, isSlice);
}

function refresh(key: number) {
  props.chat.refresh(key);
}

function mark(msg: DeepSeekSaveMessage) {
  if (msg.mark) {
    delete msg.mark;
  } else {
    msg.mark = true;
  }
  props.chat.saveChat();
}

function expand(key: number) {
  props.chat.expand(key);
}

function switchToMessage(key: number) {
  props.chat.switchToMessage(key);
}

const editVisible = ref<boolean>(false);
const editContent = ref<string>('');

function edit() {
  editContent.value = props.msg.content;
  editVisible.value = true;
}

function saveMessage(isAdd = false) {
  props.chat.saveMessage(props.msg.key, editContent.value, isAdd);
  editVisible.value = false;
}

const fullscreenDialog = ref<boolean>(false);
function updateFullscreenDialog() {
  fullscreenDialog.value = window.innerWidth < 1000;
}

onMounted(() => {
  updateFullscreenDialog();
  window.addEventListener('resize', updateFullscreenDialog);
})

onUnmounted(() => {
  window.removeEventListener('resize', updateFullscreenDialog);
})
</script>

<style lang="scss" scoped>
.chat-message {
  display: flex;
  flex-direction: column;
  width: 100%;

  +.chat-message {
    margin-top: 16px;
  }

  .options {
    margin: 0 20px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;

    .role-select {
      width: 80px;
      min-width: 80px;
    }

    .message-select {
      flex: 1;
      max-width: 160px;
      margin: 0 1px;
    }

    .el-button+.el-button {
      margin-left: 0;
    }
  }

  .reasoning_content {
    font-size: 12px;
    background: #f0f3f7;
    color: #38636b;
    margin: 0 20px;
    padding: 10px 12px;
    width: calc(100% - var(--side-width));
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 10px;
    opacity: 0.5;
    display: flex;
    overflow: hidden;
    mask: linear-gradient(to right, transparent, #000 10%, #000 95%, transparent);

    .text {
      display: flex;
      justify-content: flex-end;
      overflow: hidden;
    }

    &.expanded {
      opacity: 1;
      white-space: pre-wrap;
      text-overflow: unset;
      display: block;
      mask: none;

      .text {
        display: block;
      }
    }
  }

  .content {
    position: relative;
    margin: 0 20px;
    margin-top: 10px;
    border-radius: 15px;
    width: calc(100% - var(--side-width));
    max-height: 100px;
    border: 1px solid #eee;

    :deep(.v-md-editor--preview) {
      max-height: inherit;
      overflow: hidden;
      background: none;

      .github-markdown-body {
        padding: 12px 16px;
        font-size: 14px;
      }
    }

    :deep(.v-md-editor__preview-wrapper) {
      mask: linear-gradient(to bottom, #fff 0%, #fff0 90%);
      opacity: 0.6;
    }

    :deep(.scrollbar__wrap) {
      overflow: hidden;
    }

    &.expanded {
      max-height: none;

      :deep(.v-md-editor__preview-wrapper) {
        mask: none;
        opacity: 1;
      }
    }

    &.editing {
      width: 100%;
      max-width: none;
      max-height: none;
    }

    .content-bottom-btns {
      position: absolute;
      left: 100%;
      bottom: 0;
      margin-left: 10px;
    }

    .text-count {
      position: absolute;
      right: 12px;
      bottom: 4px;
      font-size: 10px;
      color: #666;
      opacity: 0.6;
      pointer-events: none;
      user-select: none;
    }
  }

  &.user-role {
    align-items: flex-end;

    .options {
      flex-direction: row-reverse;
    }

    .content {
      width: 600px;
      min-width: 30%;
      max-width: calc(100% - var(--side-width));
      border-top-right-radius: 5px;
      background-color: var(--user-bg);
      border-color: transparent;

      .content-bottom-btns {
        left: auto;
        right: 100%;
        margin-right: 10px;
      }
    }
  }

  &.assistant-role {
    align-items: flex-start;

    .content {
      min-width: 600px;
      border-top-left-radius: 5px;
      background-color: var(--assistant-bg);
    }
  }

  &.system-role {
    align-items: center;
    justify-content: center;

    .reasoning_content {
      width: 80%;
    }

    .content {
      border-radius: 5px;
      width: 80%;
      background-color: var(--system-bg);
      border-color: transparent;
    }
  }
}

.loading-tips {
  display: flex;
  align-items: center;
  margin: 0 20px;
  padding: 10px 4px;
  gap: 2px;

  .text {
    font-size: 12px;
    opacity: 0.5;
  }
}

.edit-container {
  height: 80vh;
  display: flex;
  align-items: stretch;
  justify-content: center;
  margin: 0 -16px;

  :deep(.v-md-editor) {
    box-shadow: 0 0 1px;
    border-radius: 0;
  }

  &.fullscreen {
    height: calc(100vh - 115px);
  }
}

:deep(.message-select-label) {
  display: flex;
  align-items: center;
  gap: 0.2em;

  .num {
    font-size: 10px;
    color: #666;
    border-radius: 100px;
    padding: 2px 4px;
    text-align: center;
    line-height: 1;
    background: #f0f0f0;
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

@media screen and (max-width: 1000px) {
  .chat-message {
    .options {
      margin: 0 10px;
    }

    .reasoning_content {
      margin-left: 0;
      margin-right: 0;
      width: 100%;
    }

    .content {
      width: 100%;
      max-width: 100%;
      border: none;
    }

    &.user-role {
      .content {
        width: 100%;
        max-width: calc(100% - 50px);
        margin-left: 10px;
        margin-right: 10px;

        .content-bottom-btns {
          left: auto;
          right: 100%;
          bottom: 0;
          margin-right: 7px;
        }

        .text-count {
          right: 12px;
        }
      }
    }

    &.assistant-role {
      .content {
        max-width: 100%;
        min-width: 80%;
        margin: 0;

        .content-bottom-btns {
          left: auto;
          right: 10px;
          bottom: 0;
          margin-left: 0;
        }

        .content-bottom-btns+.text-count {
          right: 40px;
        }
      }
    }
  }
}
</style>
