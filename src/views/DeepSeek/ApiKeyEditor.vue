<template>
  <el-dialog
    v-model="visible"
    @opened="onOpened()"
    @close="reject()"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
    width="500px">
    <template #header>
      <div class="title">
        API Key
        <el-tooltip content="获取Key" :enterable="false" placement="top">
          <a href="https://platform.deepseek.com/api_keys" target="_blank">
            <el-icon color="#409EFF" size="16">
              <QuestionFilled />
            </el-icon>
          </a>
        </el-tooltip>
      </div>
    </template>
    <div class="edit-container">
      <el-input
        ref="refInput"
        v-model="inputText"
        @keyup.enter="save()"
        placeholder="请输入 API Key"
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
import { ref } from 'vue';
import { QuestionFilled } from '@element-plus/icons-vue';

const refInput = ref<HTMLInputElement>();

const visible = ref(false);
const inputText = ref('');

const promise = ref<Promise<string>>();
const resolve = ref((value: string | PromiseLike<string>) => { });
const reject = ref(() => { });

async function open() {
  visible.value = true;
  inputText.value = localStorage.getItem('DeepSeekAPIKey') || '';
  promise.value = new Promise<string>((res, rej) => {
    resolve.value = res;
    reject.value = rej;
  });
  return promise.value;
}

function onOpened() {
  refInput.value?.focus();
}

function save() {
  visible.value = false;
  resolve.value(inputText.value.trim());
}

defineExpose({
  open,
});
</script>

<style lang="scss" scoped>
.title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: -6px;
  margin-bottom: 8px;

  a {
    display: flex;
  }
}
</style>
