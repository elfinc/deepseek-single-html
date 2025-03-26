<template>
  <div class="chat-tabs" :class="{ hide }">
    <div class="bg"></div>
    <div class="head">
      <div style="flex: 1;"></div>
      <el-tooltip content="新对话" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="addChat()"
          :icon="Plus"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <el-tooltip content="设置" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="showSetting()"
          :icon="Setting"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
      <!-- <el-tooltip content="读取" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="importData()"
          :disabled="importLoading"
          :icon="FolderOpened"
          size="small"
          circle>
        </el-button>
      </el-tooltip> -->
      <el-tooltip content="存档" :enterable="false" :show-after="200" :hide-after="0">
        <el-button
          @click="exportData()"
          :icon="Folder"
          size="small"
          circle>
        </el-button>
      </el-tooltip>
    </div>
    <div class="list">
      <el-scrollbar>
        <div
          class="chat-item"
          :class="{ active: currentChatKey === item.key }"
          :title="unref(item.label)"
          @click="showChat(item.key)"
          v-for="item in chatList"
          :key="item.key">
          <div class="loading" v-if="Object.keys(item.loadingMessages).length > 0">
            <el-icon class="is-loading" style="font-style: normal;">
              <Loading />
            </el-icon>
          </div>
          <div class="label">
            {{ item.label }}
          </div>
          <div class="btns">
            <el-tooltip content="改名" :enterable="false" :show-after="200" :hide-after="0">
              <el-button
                @click="refLabelEditor?.open(item.key)"
                :icon="Edit"
                size="small"
                circle>
              </el-button>
            </el-tooltip>
            <el-popconfirm
              title="删除这个聊天?"
              @confirm="removeChat(item.key)">
              <template #reference>
                <div>
                  <el-tooltip content="删除" :enterable="false" :show-after="200" :hide-after="0">
                    <el-button
                      :icon="Close"
                      size="small"
                      circle>
                    </el-button>
                  </el-tooltip>
                </div>
              </template>
            </el-popconfirm>
          </div>
          <el-badge
            v-if="ref(item.isNew).value"
            class="badge"
            is-dot>
          </el-badge>
          <el-icon
            v-if="ref(item.isLocal).value"
            class="checked">
            <FolderChecked />
          </el-icon>
          <el-tag
            class="tag"
            size="small"
            type="info">
            {{ Object.keys(item.messages).length }}
          </el-tag>
        </div>
      </el-scrollbar>
    </div>

    <LabelEditor ref="refLabelEditor" :DSManager="DSManager">
    </LabelEditor>

    <ExportDialog ref="refExportDialog" :DSManager="DSManager">
    </ExportDialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, toRaw, unref } from 'vue'
import { Plus, Close, Loading, Edit, FolderOpened, Folder, Setting, FolderChecked } from '@element-plus/icons-vue';
import type { DeepSeekManager } from './DeepSeekManager';
import LabelEditor from './LabelEditor.vue';
import ExportDialog from './ExportDialog.vue';
import { ChatManager } from './ChatManager';

const props = defineProps<{
  DSManager: DeepSeekManager;
  hide: boolean;
}>();

const chatList = ref(props.DSManager.chatList);
const currentChatKey = ref(props.DSManager.currentChatKey);
const refLabelEditor = ref<typeof LabelEditor>();
const refExportDialog = ref<typeof ExportDialog>();

function showChat(key: number) {
  currentChatKey.value = key;
}

function addChat() {
  props.DSManager.addChat();
}

function removeChat(key: number) {
  props.DSManager.removeChat(key);
}

function showSetting() {
  ChatManager.refApiKeyEditor.value.open();
}

const importLoading = ref(false);
function importData() {
  importLoading.value = true;
  props.DSManager.importHTML().finally(() => {
    importLoading.value = false;
  }).catch(() => { });
}

function exportData() {
  refExportDialog.value?.open();
}
</script>

<style lang="scss" scoped>
.chat-tabs {
  position: absolute;
  width: var(--side-width);
  left: 0;
  top: 0;
  bottom: 0;
  background: white;
  border-right: 1px solid #eee;
  background-color: #f5f5f5;
  overflow: hidden;
  transition: all 0.3s;
  z-index: 0;

  &.hide {
    left: -120px;
    filter: brightness(0.6);
  }

  .head {
    position: relative;
    padding: 0 10px;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 4px;

    >* {
      margin: 0;
    }
  }

  .list {
    position: absolute;
    left: 0;
    top: 40px;
    width: 100%;
    bottom: 0;
  }

  .chat-item {
    position: relative;
    padding: 0 10px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    background: linear-gradient(to right, #f5f5f5e0 40%, transparent 100%);

    .label {
      flex: 1;
      word-break: keep-all;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 0 5px #fff;
    }

    .btns {
      flex: none;
      display: none;
      gap: 4px;

      >* {
        margin: 0;
      }
    }

    .tag {
      font-size: 10px;
      margin-left: 4px;
      padding: 2px 4px;
      min-width: 24px;
      text-align: center;
      line-height: 1;
      color: #666;
      background: #fff5;
    }

    .badge {
      position: absolute;
      display: flex;
      right: 7px;
      top: 7px;
      pointer-events: none;
    }

    .checked {
      margin-right: 3px;
      color: #bfc8d3;
    }

    .loading {
      flex: none;
      display: flex;
      margin-right: 4px;
    }

    &:last-child {
      margin-bottom: 200px;
    }

    &.active,
    &:hover {
      background: #f5f5f5a0;

      .btns {
        display: flex;
      }

      .tag {
        display: none;
      }

      .checked {
        display: none;
      }
    }

    &.active {
      background: #fffa;
    }
  }
}

.bg {
  position: absolute;
  bottom: -20px;
  right: -90px;
  width: 240px;
  height: 240px;
  transform: rotate(-42deg);
  background-image: url(@/assets/favicon.png);
  background-size: contain;
  background-repeat: no-repeat;
  opacity: 0.3;
  pointer-events: none;
}

</style>