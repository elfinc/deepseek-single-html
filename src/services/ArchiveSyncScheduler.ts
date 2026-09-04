type ArchiveSyncAction = () => Promise<void>;
type ArchiveSyncErrorHandler = (error: unknown) => void;

/**
 * 合并同一轮事件循环内的存档变更，并保证同步任务始终串行执行。
 *
 * schedule() 返回的 Promise 永不 reject，适合 UI 事件中的自动同步；手动同步
 * 仍应直接调用 GoogleDriveArchive.sync()，以便把错误反馈给用户。
 */
export class ArchiveSyncScheduler {
  private requested = false;
  private pendingChanges: PromiseLike<unknown>[] = [];
  private running?: Promise<void>;

  constructor(
    private readonly sync: ArchiveSyncAction,
    private readonly onError: ArchiveSyncErrorHandler,
  ) { }

  schedule(change: PromiseLike<unknown> = Promise.resolve()): Promise<void> {
    this.pendingChanges.push(change);
    this.requested = true;

    if (!this.running) {
      // 延迟到微任务中启动，让一次连续 UI 操作产生的多个变更合并为一次同步。
      this.running = Promise.resolve()
        .then(() => this.drain())
        .finally(() => {
          this.running = undefined;
        });
    }

    return this.running;
  }

  private async drain() {
    while (this.requested) {
      this.requested = false;
      const changes = this.pendingChanges.splice(0);
      const results = await Promise.allSettled(changes);
      const failures = results.filter(result => result.status === 'rejected');

      if (failures.length) {
        failures.forEach(result => this.reportError(result.reason));
        continue;
      }

      try {
        await this.sync();
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private reportError(error: unknown) {
    try {
      this.onError(error);
    } catch (handlerError) {
      console.error('处理自动同步错误失败：', handlerError);
    }
  }
}
