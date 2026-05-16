<template>
  <el-dialog
    v-model="editVisible"
    title="修改"
    :fullscreen="fullscreenDialog"
    @opened="refEditor?.focus()"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    append-to-body
    destroy-on-close
    align-center
    width="80%">
    <div
      class="edit-container"
      :class="{ fullscreen: fullscreenDialog }">
      <v-md-editor
        ref="refEditor"
        v-model="editContent"
        :toolbar="{ save: false }"
        mode="edit">
      </v-md-editor>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button
          type="primary"
          :disabled="editContent === msgContent"
          @click="saveMessage()">
          修改
        </el-button>
        <el-button
          v-if="msgKey"
          type="primary"
          @click="saveMessage(true)">
          新分支
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { DeepSeekSaveMessage } from '@/utils/DeepSeek';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ChatManager } from './ChatManager';

const msgKey = ref<number>();
const msgContent = ref<string>('');

const editVisible = ref<boolean>(false);
const editContent = ref<string>('');

const refEditor = ref();

const props = defineProps<{
  chat: ChatManager;
}>();

const emit = defineEmits<{
  contentChange: [string];
}>();

async function openContent(content: string) {
  msgKey.value = undefined;
  msgContent.value = content;
  editContent.value = content;
  editVisible.value = true;
}

async function openMsg(data: DeepSeekSaveMessage) {
  msgKey.value = data.key;
  msgContent.value = data.content;
  editContent.value = data.content;
  editVisible.value = true;
}

function saveMessage(isAdd = false) {
  if (msgKey.value) {
    props.chat.saveMessage(msgKey.value, editContent.value, isAdd);
  } else {
    emit('contentChange', editContent.value);
  }
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

defineExpose({
  openContent,
  openMsg,
});
</script>

<style lang="scss" scoped>
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
</style>
