<template>
  <el-dialog
    v-model="visible"
    @opened="onOpened()"
    title="编辑标签"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
    width="500px">
    <div class="edit-container">
      <el-input
        ref="refInput"
        v-model="inputText"
        @keyup.enter="save()"
        placeholder="请输入标签"
        clearable />
    </div>
    <template #footer>
      <div class="dialog-footer">
        <!-- <el-button @click="visible = false">
          取消
        </el-button> -->
        <el-button type="primary" :disabled="!inputText" @click="save()">
          确定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, toRef, unref } from 'vue';
import type { DeepSeekManager } from './DeepSeekManager';

const refInput = ref<HTMLInputElement>();

const props = defineProps<{
  DSManager: DeepSeekManager;
}>();

const visible = ref(false);
const targetKey = ref<number>();
const inputText = ref('');

function open(key: number) {
  targetKey.value = key;
  const chat = props.DSManager.chatList.find(chat => chat.key === key);
  if (!chat) {
    return;
  }
  visible.value = true;
  inputText.value = unref(chat.label);
}

function onOpened() {
  refInput.value?.focus();
}

function save() {
  const chat = props.DSManager.chatList.find(chat => chat.key === targetKey.value);
  if (chat) {
    chat.label.value = inputText.value;
    chat.saveChat();
  }
  visible.value = false;
}

defineExpose({
  open,
});
</script>

<style lang="scss" scoped>
</style>
