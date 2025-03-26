<template>
  <div class="page-container">
    <ChatTabs
      :hide="hideTabs"
      :DSManager="DSManager"
      v-loading="!isLoaded"></ChatTabs>
    <ChatContainer
      v-for="item in chatList"
      :key="item.key"
      v-model:hideTabs="hideTabs"
      :visible="currentChatKey === item.key"
      :chat="item">
    </ChatContainer>
    <ApiKeyEditor ref="refApiKeyEditor" />
    <div class="hideTabsBtn">
      <el-button
        @click="hideTabs = !hideTabs"
        :icon="Switch"
        size="small"
        circle>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import ChatTabs from './ChatTabs.vue';
import ChatContainer from './ChatContainer.vue';
import { DeepSeekManager } from './DeepSeekManager';
import { computed, onMounted, ref, watch } from 'vue';
import ApiKeyEditor from './ApiKeyEditor.vue';
import { ChatManager } from './ChatManager';
import { Switch } from '@element-plus/icons-vue';

const refApiKeyEditor = ref<typeof ApiKeyEditor>();
const DSManager = new DeepSeekManager();

const hideTabs = ref(window.innerWidth <= 800);
const isLoaded = ref(false);

onMounted(() => {
  ChatManager.refApiKeyEditor = refApiKeyEditor;
  DSManager.init().finally(() => {
    isLoaded.value = true;
  });
});

const chatList = DSManager.chatList;
const currentChatKey = DSManager.currentChatKey;

const loading = computed(() => {
  return chatList.some(chat => Object.keys(chat.loadingMessages).length > 0);
});

const writing = computed(() => {
  return chatList.some(chat => Object.values(chat.loadingMessages).some(msg => msg.message.content || msg.message.reasoning_content));
});

const status = computed(() => {
  if (writing.value) {
    return 'writing';
  }
  if (loading.value) {
    return 'loading';
  }
  return 'idle';
});

watch(() => status.value, (value) => {
  document.title = {
    writing: '回复中..',
    loading: '思考中..',
    idle: '摸鱼中..',
  }[value];
}, { immediate: true });
</script>

<style lang="scss" scoped>
.page-container {
  position: absolute;
  width: 100%;
  height: 100%;
}

.hideTabsBtn {
  position: absolute;
  left: 9px;
  top: 8px;
  z-index: 1;
  pointer-events: none;
  z-index: 3;

  >* {
    pointer-events: auto;
  }
}

@media screen and (max-width: 1000px) {
  .page-container {
    flex-direction: column;
  }
}
</style>
