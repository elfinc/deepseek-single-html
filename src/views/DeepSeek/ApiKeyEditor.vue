<template>
  <el-dialog
    v-model="visible"
    @opened="onOpened()"
    @close="onClose()"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
    width="500px">
    <template #header>
      <div class="title">
        设置
      </div>
    </template>
    <div class="edit-container">
      <el-form label-width="auto">
        <el-form-item label="API Key">
          <el-input
            ref="refInput"
            v-model="inputText"
            :disabled="loading"
            @input="onInput()"
            @keyup.enter="save()"
            placeholder="请输入 API Key"
            clearable>
            <template #append>
              <el-tooltip content="获取 API Key" placement="top">
                <el-button
                  type="text"
                  :icon="QuestionFilled"
                  @click="gotoApiKey()"
                />
              </el-tooltip>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="chatModel" placeholder="请选择模型" :disabled="loading || chatModels.length === 0">
            <el-option
              v-for="model in chatModels"
              :key="model.value"
              :label="model.label"
              :value="model.value">
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <div class="tips">
          <el-icon
            class="is-loading"
            v-if="loading"
            style="font-style: normal;">
            <Loading />
          </el-icon>
          <div class="error-tips" v-else-if="errorTips">{{ errorTips }}</div>
          <div v-else-if="balance !== 0">余额：{{ balance }}</div>
        </div>
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

const chatModel = ref('');
const chatModels = ref<{ label: string, value: string }[]>([]);

const promise = ref<Promise<string>>();
const resolve = ref((value: string | PromiseLike<string>) => { });
const reject = ref(() => { });
let validationRequestId = 0;
let validationTimer: ReturnType<typeof setTimeout> | undefined;

function open(tips?: string) {
  promise.value = new Promise<string>((res, rej) => {
    resolve.value = res;
    reject.value = rej;
  });

  const apikey = localStorage.getItem('DeepSeekAPIKey') || '';
  inputText.value = apikey;
  chatModel.value = localStorage.getItem('DeepSeekChatModel') || '';
  chatModels.value = [];
  balance.value = 0;
  errorTips.value = tips || '';
  visible.value = true;

  const requestId = ++validationRequestId;
  if (apikey) {
    void validateAndFetchModels(apikey, requestId);
  } else {
    errorTips.value ||= '请输入 API Key';
  }

  return promise.value;
}

function onOpened() {
  refInput.value?.focus();
}

function onInput() {
  if (validationTimer) {
    clearTimeout(validationTimer);
  }

  const requestId = ++validationRequestId;
  errorTips.value = '';
  balance.value = 0;
  chatModel.value = '';
  chatModels.value = [];
  loading.value = false;

  const key = inputText.value.trim();
  if (!key) {
    errorTips.value = '请输入 API Key';
    return;
  }

  validationTimer = setTimeout(() => {
    void validateAndFetchModels(key, requestId);
  }, 400);
}

async function validateAndFetchModels(key: string, requestId: number) {
  loading.value = true;
  try {
    const client = DeepSeekClient.getInstance(key);
    const valid = await client.checkKeyValid();
    if (requestId !== validationRequestId || key !== inputText.value.trim()) {
      return false;
    }

    balance.value = valid.balance;
    errorTips.value = valid.error;
    if (valid.error) {
      return false;
    }

    const models = await client.getModels();
    if (requestId !== validationRequestId || key !== inputText.value.trim()) {
      return false;
    }

    chatModels.value = models.map(model => ({ label: model, value: model }));
    if (chatModels.value.every(model => model.value !== chatModel.value)) {
      chatModel.value = chatModels.value[0]?.value || '';
    }
    if (!chatModel.value) {
      errorTips.value = '未获取到可用模型';
      return false;
    }
    return true;
  } catch (error) {
    if (requestId === validationRequestId && key === inputText.value.trim()) {
      chatModel.value = '';
      chatModels.value = [];
      errorTips.value = error instanceof Error ? error.message : '获取模型列表失败';
    }
    return false;
  } finally {
    if (requestId === validationRequestId) {
      loading.value = false;
    }
  }
}

async function save() {
  const value = inputText.value.trim();
  if (validationTimer) {
    clearTimeout(validationTimer);
  }

  const requestId = ++validationRequestId;
  const valid = await validateAndFetchModels(value, requestId);
  if (!valid) {
    return;
  }

  const chatModelValue = chatModel.value || (chatModels.value.length > 0 ? chatModels.value[0].value : '');
  if (!chatModelValue) {
    errorTips.value = '请选择模型';
    return;
  }

  visible.value = false;
  localStorage.setItem('DeepSeekAPIKey', value);
  localStorage.setItem('DeepSeekChatModel', chatModelValue);
  resolve.value(value);
}

function onClose() {
  if (validationTimer) {
    clearTimeout(validationTimer);
  }
  validationRequestId++;
  loading.value = false;
  reject.value();
}

function gotoApiKey() {
  window.open('https://platform.deepseek.com/api_keys', '_blank');
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
  text-align: left;

  .tips {
    flex: 1;
  
    .error-tips {
      color: #f56c6c;
    }
  }
}
</style>
