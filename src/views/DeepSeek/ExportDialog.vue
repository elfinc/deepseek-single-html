<template>
  <el-dialog
    v-model="visible"
    title="存档管理"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
    width="720px">
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
import { ElCheckbox, ElMessageBox } from 'element-plus'
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
  height: 65vh;
  overflow: hidden;
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
</style>
