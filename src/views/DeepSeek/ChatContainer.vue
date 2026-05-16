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
            :key="item.key"
            :msg="item"
            :index="index"
            @openChatFlow="refChatFlow?.open"
            @openChatEditor="refChatEditor?.openMsg(item)"
            :chat="chat">
          </ChatMessage>
        </div>
      </el-scrollbar>
    </div>

    <InputContainer
      ref="refInputContainer"
      @openChatFlow="refChatFlow?.open"
      @openChatEditor="refChatEditor?.openContent"
      :chat="chat">
    </InputContainer>

    <div class="mask" @click="emit('update:hideTabs', true)"></div>

    <ChatFlow
      ref="refChatFlow"
      :chat="chat">
    </ChatFlow>

    <ChatEditor
      ref="refChatEditor"
      @contentChange="refInputContainer?.setInput"
      :chat="chat">
    </ChatEditor>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch, type UnwrapRef } from 'vue';
import { ChatManager } from './ChatManager';
import ChatMessage from './ChatMessage.vue';
import ChatFlow from './ChatFlow.vue';
import ChatEditor from './ChatEditor.vue';
import InputContainer from './InputContainer.vue';

const props = defineProps<{
  chat: ChatManager;
  visible: boolean;
  hideTabs: boolean;
}>();

const emit = defineEmits<{
  'update:hideTabs': [boolean];
}>();

const messageList = computed(() => props.chat.messageList.value);

const refChatMessages = ref();
const refInputContainer = ref<UnwrapRef<typeof InputContainer>>();
const refChatFlow = ref<UnwrapRef<typeof ChatFlow>>();
const refChatEditor = ref<UnwrapRef<typeof ChatEditor>>();

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
    if (!ChatManager.hasShowedKeys[props.chat.key]) {
      props.chat.expandAll(true);
      ChatManager.hasShowedKeys[props.chat.key] = true;
    }
    nextTick(() => {
      props.chat.scrollToBottom();
    });
    window.addEventListener('resize', onResize);
  } else {
    window.removeEventListener('resize', onResize);
  }
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

@media screen and (max-width: 800px) {
  .chat-container {
    width: 100%;
  }
}
</style>