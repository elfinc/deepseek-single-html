<template>
  <el-dialog
    v-model="visible"
    title="存档管理"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
    width="720px">
    <div class="drive-panel">
      <div class="drive-info">
        <div class="drive-title">
          <span>Google Drive</span>
          <el-tag v-if="driveState.connected" type="success" size="small">自动同步已开启</el-tag>
          <el-tag v-else type="info" size="small">未连接</el-tag>
        </div>
        <div v-if="!driveState.configured" class="drive-description error">
          未配置 VITE_GOOGLE_CLIENT_ID，暂时无法连接。
        </div>
        <div v-else-if="!driveState.ready && !driveState.error" class="drive-description">
          正在加载 Google 登录组件…
        </div>
        <div v-else-if="driveState.restoring" class="drive-description">
          正在恢复 Google Drive 连接…
        </div>
        <div v-else-if="driveState.error" class="drive-description error">
          {{ driveState.error }}
        </div>
        <div v-else class="drive-description">
          <template v-if="driveState.connected">
            AI 回复接收完成后会自动同步；最近同步：{{ lastSyncText }}
          </template>
          <template v-else>
            登录后，存档将保存到 Drive 的应用专属私有目录。
          </template>
        </div>
      </div>
      <div class="drive-actions">
        <template v-if="driveState.connected">
          <el-button
            :loading="driveState.syncing"
            @click="syncGoogleDrive">
            立即同步
          </el-button>
          <el-button @click="disconnectGoogleDrive">断开</el-button>
        </template>
        <el-button
          v-else
          type="primary"
          :disabled="!driveState.configured || !driveState.ready || driveState.restoring"
          :loading="connectLoading || driveState.restoring"
          @click="connectGoogleDrive">
          登录 Google Drive
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-auto-resizer>
        <template #default="{ height, width }">
          <el-table-v2
            row-key="key"
            :columns="columns"
            :data="data"
            :width="width"
            :height="height"
            :row-event-handlers="{ onClick: rowClick }"
            fixed
          />
        </template>
      </el-auto-resizer>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <div class="options">
          <el-button
            :disabled="importLoading"
            @click="importData()">
            读取
          </el-button>
        </div>
        <el-button
          type="danger"
          :disabled="selected.length == 0"
          @click="remove()">
          删除
        </el-button>
        <el-button
          type="primary"
          :disabled="exportLoading || selected.length == 0"
          @click="save()">
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="tsx" setup>
import { ref, computed, unref } from 'vue';
import type { DeepSeekManager } from './DeepSeekManager';
import { ElCheckbox, ElMessage, ElMessageBox } from 'element-plus'
import type { FunctionalComponent } from 'vue'
import type { CheckboxValueType, Column, RowEventHandlerParams, RowProps } from 'element-plus'
import dayjs from 'dayjs'

const props = defineProps<{
  DSManager: DeepSeekManager;
}>();

type SelectionCellProps = {
  value: boolean
  intermediate?: boolean
  onChange?: (value: CheckboxValueType) => void
}

const SelectionCell: FunctionalComponent<SelectionCellProps> = ({
  value,
  intermediate = false,
  onChange,
}) => {
  return (
    <ElCheckbox
      onChange={onChange}
      modelValue={value}
      indeterminate={intermediate}
    />
  )
}

const visible = ref(false);
const isolate = ref(true);
const driveState = props.DSManager.googleDrive.state;
const connectLoading = ref(false);

const lastSyncText = computed(() => {
  if (!driveState.lastSyncedAt) {
    return '尚未同步';
  }
  return dayjs(driveState.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss');
});

const data = ref<{
  key: number;
  label: string;
  checked: boolean;
}[]>([]);

const selected = computed(() => {
  return data.value.filter(row => row.checked);
});

const columns: Column<any>[] = [
  {
    key: 'selection',
    width: 30,
    cellRenderer: ({ rowData }) => {
      // const onChange = (value: CheckboxValueType) => (rowData.checked = value)
      return <SelectionCell value={rowData.checked} />
    },

    headerCellRenderer: () => {
      const _data = unref(data);
      const onChange = (value: CheckboxValueType) =>
        (data.value = _data.map((row) => {
          row.checked = value === true
          return row
        }));
      const allSelected = _data.every((row) => row.checked);
      const containsChecked = _data.some((row) => row.checked);

      return (
        <SelectionCell
          value={allSelected}
          intermediate={containsChecked && !allSelected}
          onChange={onChange}
        />
      )
    },
  },
  {
    title: '标签',
    key: 'label',
    dataKey: 'label',
    width: 400,
  },
  {
    title: '时间',
    key: 'time',
    dataKey: 'key',
    width: 170,
    cellRenderer: ({ cellData: key }) => <span>{dayjs(key).format('YYYY-MM-DD HH:mm:ss')}</span>,
  },
  {
    title: '消息数',
    key: 'count',
    dataKey: 'count',
    align: 'center',
    width: 80,
  },
];

function rowClick(e: RowEventHandlerParams) {
  e.rowData.checked = !e.rowData.checked;
}

function open() {
  visible.value = true;
  data.value = props.DSManager.chatList.map(chat => ({
    key: chat.key,
    label: chat.label.value,
    count: Object.keys(chat.messages).length,
    checked: false,
  }));
}

async function connectGoogleDrive() {
  connectLoading.value = true;
  try {
    await props.DSManager.connectGoogleDrive();
    open();
    ElMessage.success('Google Drive 已连接，存档已同步');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Google Drive 连接失败');
  } finally {
    connectLoading.value = false;
  }
}

async function syncGoogleDrive() {
  try {
    await props.DSManager.syncGoogleDrive();
    ElMessage.success('Google Drive 同步完成');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Google Drive 同步失败');
  }
}

function disconnectGoogleDrive() {
  props.DSManager.googleDrive.disconnect();
  ElMessage.success('已断开 Google Drive');
}

async function remove() {
  await ElMessageBox.confirm(`确定删除所选的 ${selected.value.length} 个对话吗？`, '提示');
  selected.value.forEach(row => {
    props.DSManager.removeChat(row.key);
  });
  data.value = data.value.filter(row => !row.checked);
}

const exportLoading = ref(false);
async function save() {
  const fileName = await ElMessageBox.prompt('文件名：', '保存文件', {
    inputPattern: /^(?![ .])(?!.*[. ]$)(?!.*[\\\/:*?"<>|\x00-\x1F]).{1,255}$/,
    inputErrorMessage: '文件名无效',
    confirmButtonText: '保存',
    cancelButtonText: '取消',
  }).then(({ value }) => value.trim());
  if (!fileName) {
    return;
  }
  exportLoading.value = true;
  const keys = selected.value.map(row => row.key);
  props.DSManager.exportHTML(keys, fileName, isolate.value).then(() => {
    visible.value = false;
  }).finally(() => {
    exportLoading.value = false;
  });
}

const importLoading = ref(false);
function importData() {
  importLoading.value = true;
  props.DSManager.importHTML().finally(() => {
    importLoading.value = false;
  }).catch(() => { });
}

defineExpose({
  open,
});
</script>

<style lang="scss" scoped>
.table-container {
  height: 58vh;
  overflow: hidden;
}

.drive-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;

  .drive-info {
    flex: 1;
    min-width: 0;
  }

  .drive-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .drive-description {
    color: #606266;
    font-size: 13px;
    line-height: 1.5;

    &.error {
      color: #f56c6c;
    }
  }

  .drive-actions {
    display: flex;
    flex: none;

    > * {
      margin-left: 8px;
    }
  }
}

.dialog-footer {
  display: flex;
  align-items: center;
  .options {
    flex: 1;
    display: flex;
    padding: 0 8px;
  }
}

@media screen and (max-width: 720px) {
  .drive-panel {
    align-items: stretch;
    flex-direction: column;

    .drive-actions > *:first-child {
      margin-left: 0;
    }
  }
}
</style>
