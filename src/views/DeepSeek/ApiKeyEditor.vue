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
        :disabled="loading"
        @input="onInput()"
        @keyup.enter="save()"
        placeholder="请输入 API Key"
        clearable />
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-icon
          class="is-loading"
          v-if="loading"
          style="font-style: normal;">
          <Loading />
        </el-icon>
        <div class="error-tips" v-else-if="errorTips">{{ errorTips }}</div>
        <div v-else-if="balance !== 0">余额：{{ balance }}</div>
        <div v-else></div>
        <el-button type="primary" :disabled="!inputText" @click="save()" :loading="loading">
          确定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { QuestionFilled } from '@element-plus/icons-vue';
import { DeepSeekClient } from '@/utils/DeepSeek';
import { Loading } from '@element-plus/icons-vue';

const refInput = ref<HTMLInputElement>();

const visible = ref(false);
const loading = ref(false);
const inputText = ref('');
const errorTips = ref('');
const balance = ref(0);

const promise = ref<Promise<string>>();
const resolve = ref((value: string | PromiseLike<string>) => { });
const reject = ref(() => { });

async function open(tips?: string) {
  visible.value = true;
  const apikey = localStorage.getItem('DeepSeekAPIKey') || '';
  inputText.value = apikey;
  errorTips.value = tips ?? await checkKeyValid(apikey);
  promise.value = new Promise<string>((res, rej) => {
    resolve.value = res;
    reject.value = rej;
  });
  return promise.value;
}

function onOpened() {
  refInput.value?.focus();
}

function onInput() {
  errorTips.value = '';
}

async function checkKeyValid(key: string) {
  loading.value = true;
  const client = DeepSeekClient.getInstance(key);
  const valid = await client.checkKeyValid();
  balance.value = valid.balance;
  errorTips.value = valid.error;
  loading.value = false;
  return valid.error;
}

async function save() {
  const value = inputText.value.trim();

  const error = await checkKeyValid(value);
  if (error) {
    return;
  }

  visible.value = false;
  localStorage.setItem('DeepSeekAPIKey', value);
  resolve.value(value);
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

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-tips {
  color: #f56c6c;
}
</style>
