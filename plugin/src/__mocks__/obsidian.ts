/**
 * vitest 환경의 obsidian 모듈 mock. plugin/src 의 commands 또는 services 가
 * Notice / Plugin 등 import 할 때 vite resolve 단계에서 fail 하지 않도록
 * 빈 placeholder 제공. 단위 테스트의 실제 동작 검증은 vi.mock 또는 직접
 * placeholder 활용.
 */
export class Notice {
  constructor(public message: string, public timeout?: number) {}
  setMessage(msg: string): void {
    this.message = msg
  }
  hide(): void {}
}

export class Plugin {
  app: unknown = {}
  manifest: unknown = {}
  addCommand(): void {}
  addRibbonIcon(): void {}
  addSettingTab(): void {}
  addStatusBarItem(): unknown { return {} }
  registerEvent(): void {}
  registerInterval(): void {}
  async loadData(): Promise<unknown> { return null }
  async saveData(): Promise<void> {}
  async onload(): Promise<void> {}
  async onunload(): Promise<void> {}
}

export class PluginSettingTab {
  containerEl: unknown = {}
  display(): void {}
  hide(): void {}
}

export class Modal {
  contentEl: unknown = {}
  open(): void {}
  close(): void {}
}

export class TFile {
  path = ''
  name = ''
}

export class TFolder {
  path = ''
  name = ''
  children: unknown[] = []
}

export type App = unknown
export type FileSystemAdapter = unknown
export type EventRef = unknown
