<template>
  <el-dialog
    v-model="visible"
    @opened="onOpened()"
    @close="onClose()"
    destroy-on-close
    append-to-body
    align-center
    fullscreen
    width="80%">
    <template #header>
      <div class="title">
        查看分支
        <el-tooltip content="显示收藏" :enterable="false">
          <el-button
            @click="onClickMarkOnly"
            :icon="markOnly ? StarFilled : Star"
            size="small"
            circle>
          </el-button>
        </el-tooltip>
      </div>
    </template>
    <div class="flow-container">
      <VueFlow
        class="flow"
        ref="refFlow"
        :nodes="nodes"
        :edges="edges"
        @node-double-click="onDbClick"
        @node-click="onClick"
        :max-zoom="2"
        :min-zoom="0.1"
        :zoom-on-double-click="false">
        <Background :gap="15" />
        <template #edge-custom="props">
          <BezierEdge
            v-if="currentMessages[props.target]"
            v-bind="props"
            style="stroke-width: 50; opacity: 0.15; pointer-events: none !important;"
            :interactionWidth="0" />
          <BezierEdge
            v-else-if="hasTrackMessages[props.target]"
            v-bind="props"
            style="stroke-width: 15; opacity: 0.15; pointer-events: none !important;"
            :interactionWidth="0" />
          <BezierEdge
            v-bind="props"
            style="opacity: 0.5; pointer-events: none !important;"
            :interactionWidth="0" />
        </template>
        <template #node-custom="props">
          <Handle
            type="target"
            class="node-handle"
            :class="[`role-${props.data.role}`]"
            :position="Position.Top"
            connectable />
          <Handle
            type="source"
            class="node-handle"
            :class="[`role-${props.data.role}`]"
            :position="Position.Bottom"
            connectable />
          <div
            class="node vue-flow__node-default"
            :class="[
              `role-${props.data.role}`,
              {
                'marked': props.data.mark,
                'current': currentMessages[props.data.key],
              },
            ]">
            <div class="label">
              {{ props.label }}
            </div>
          </div>
        </template>
      </VueFlow>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, computed, watch, nextTick } from 'vue';
import { VueFlow, Handle, Position, type Node, type Edge, BezierEdge, type NodeMouseEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import type { ChatManager } from './ChatManager';
import dagre from 'dagre';
import type { DeepSeekSaveMessage } from '@/utils/DeepSeek';
import { StarFilled, Star, Avatar, HelpFilled, Tools } from '@element-plus/icons-vue';

const props = defineProps<{
  chat: ChatManager;
}>();

const visible = ref(false);
const targetKey = ref<number | undefined>();
const prevKeyMap = computed(() => props.chat.prevKeyMap.value);
const refFlow = ref();
const markOnly = ref(false);
const dagreGraph = ref<dagre.graphlib.Graph>();

const visibleMessages = computed(() => {
  return props.chat.allMessageList.value.filter(msg => {
    if (targetKey.value === msg.key) {
      return true;
    }
    return !markOnly.value || msg.mark;
  });
});

const visibleLinkMessages = computed(() => {
  const list: DeepSeekSaveMessage[] = [];
  const hasMessage = {} as { [key: number]: boolean };
  visibleMessages.value.forEach(msg => {
    if (hasMessage[msg.key]) {
      return;
    }
    list.push(msg);
    hasMessage[msg.key] = true;
    let prevKey = prevKeyMap.value[msg.key];
    while (prevKey && !hasMessage[prevKey]) {
      const prev = props.chat.messages[prevKey];
      if (!prev) {
        break;
      }
      list.push(prev);
      hasMessage[prevKey] = true;
      prevKey = prevKeyMap.value[prev.key];
    }
  });
  return list;
});

const currentMessages = computed(() => {
  return props.chat.messageList.value.reduce((acc, msg) => {
    acc[msg.key] = msg;
    return acc;
  }, {} as { [key: number | string]: DeepSeekSaveMessage });
});

const hasTrackMessages = computed(() => {
  return props.chat.allMessageList.value.reduce((acc, msg) => {
    if (msg.nextKey) {
      acc[msg.nextKey] = true;
    }
    return acc;
  }, {} as { [key: number | string]: boolean });
});

const nodes = computed(() => {
  const nodes: Node<DeepSeekSaveMessage, any, string>[] = [];
  if (!visible.value || !dagreGraph.value) {
    return nodes;
  }
  visibleLinkMessages.value.forEach(msg => {
    const id = String(msg.key);
    const dagreNode = dagreGraph.value!.node(id);
    const label = msg.content.slice(0, 50);
    nodes.push({
      id,
      label,
      data: msg,
      type: 'custom',
      position: {
        x: dagreNode.x,
        y: dagreNode.y,
      },
    });
  });
  return nodes;
});

const edges = computed(() => {
  const edges: Edge<DeepSeekSaveMessage[], any, string>[] = [];
  if (!visible.value) {
    return edges;
  }
  visibleLinkMessages.value.forEach(msg => {
    const prevKey = prevKeyMap.value[msg.key];
    const prev = props.chat.messages[prevKey];
    if (!prev) {
      return;
    }
    edges.push({
      id: `${prev.key}-${msg.key}`,
      source: String(prev.key),
      target: String(msg.key),
      data: [prev, msg],
      type: 'custom',
    });
  });
  return edges;
});

function updateGraph() {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'TB',
    ranker: 'tight-tree',
    ranksep: 50,
  });
  visibleLinkMessages.value.forEach(msg => {
    graph.setNode(String(msg.key), {
      width: 120,
      height: 90,
    });
  });
  edges.value.forEach(edge => {
    graph.setEdge(edge.source, edge.target);
  });
  dagre.layout(graph);
  dagreGraph.value = graph;
}

function open(key?: number) {
  targetKey.value = key;
  visible.value = true;
  updateGraph();
}

function onOpened() {
  fitView();
}

function onClose() {
  visible.value = false;
  markOnly.value = false;
  dagreGraph.value = undefined;
}

function onClick(event: NodeMouseEvent) {
  const node = event.node as Node<DeepSeekSaveMessage, any, string>;
  const key = node.data?.key!;
  props.chat.switchToMessage(key);
}

function onDbClick(event: NodeMouseEvent) {
  const node = event.node as Node<DeepSeekSaveMessage, any, string>;
  const key = node.data?.key!;
  props.chat.switchToMessage(key);
  visible.value = false;
}

async function onClickMarkOnly() {
  markOnly.value = !markOnly.value;
  updateGraph();
  await nextTick();
  fitView();
}

function fitView() {
  if (targetKey.value) {
    refFlow.value?.fitView({
      padding: 5,
      nodes: [String(targetKey.value)],
    });
  } else {
    const list = props.chat.messageList.value;
    const last = list[list.length - 1];
    if (last) {
      refFlow.value?.fitView({
        padding: 5,
        nodes: [String(last.key)],
        offset: { x: 0, y: 100 },
      });
    }
  }
}

defineExpose({
  open,
});
</script>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
</style>

<style lang="scss" scoped>
.flow-container {
  position: relative;
  height: calc(100vh - 45px);
  display: flex;
  align-items: stretch;
  justify-content: center;
  margin: -16px;
  border-top: 1px solid var(--el-border-color-light);
}

.flow {
  width: 100%;
  height: 100%;
  --role-user-color: #2d8cf0;
  --role-assistant-color: #f76b90;

  .node {
    color: #bbb;
    border: 1px solid currentColor;

    &.role-user {
      color: var(--role-user-color);
    }

    &.role-assistant {
      color: var(--role-assistant-color);
    }

    &.marked {
      box-shadow: 0 0 20px currentColor;
    }

    &.current {
      border-width: 2px;
    }

    .label {
      color: var(--vf-node-text);
    }
  }

  .node-handle {
    &.role-user {
      background: var(--role-user-color);
    }

    &.role-assistant {
      background: var(--role-assistant-color);
    }
  }
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: -6px;
  margin-bottom: 8px;
}
</style>
