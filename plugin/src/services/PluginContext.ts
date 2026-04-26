import type { App } from 'obsidian'
import type { ObsidianVaultFs } from '../infrastructure/ObsidianVaultFs.js'
import type { ObsidianMetaCache } from '../infrastructure/ObsidianMetaCache.js'
import type { VaultEventBridge } from '../infrastructure/VaultEventBridge.js'
import type { PreviewServer } from '../infrastructure/PreviewServer.js'
import type { PublishIndex } from '../domain/PublishIndex.js'
import type { ContentResolver } from '../domain/ContentResolver.js'
import type { ContentTransformer } from '../domain/ContentTransformer.js'
import type { ManifestBuilder } from '../domain/ManifestBuilder.js'
import type { PublishOrchestrator } from '../domain/PublishOrchestrator.js'
import type { PluginSettings } from '../settings/PluginSettings.js'
import type { DirtyTracker } from './DirtyTracker.js'
import type { SeedPersistence } from './SeedPersistence.js'

/**
 * 의존 컨테이너 (DI Context). main.ts (Plugin entry) 가 build 후 commands/ +
 * SettingsTab 에 주입. 모든 use-case (commands) 와 UI 가 이 단일 객체에서
 * 의존을 가져온다 — main.ts 의 plugin instance 직접 참조 사라짐.
 *
 * 실 인스턴스가 아닌 *plain object* 로 두어 Hexagonal 원칙 유지 (단순
 * 데이터 + 함수, 행위 객체 없음). 단위 테스트 시 fake context 직접 생성 가능.
 */
export type PluginContext = {
  app: App
  vault: ObsidianVaultFs
  meta: ObsidianMetaCache
  index: PublishIndex
  resolver: ContentResolver
  transformer: ContentTransformer
  manifestBuilder: ManifestBuilder
  orchestrator: PublishOrchestrator
  bridge: VaultEventBridge
  preview: PreviewServer
  settings: PluginSettings
  saveSettings: () => Promise<void>
  dirtyTracker: DirtyTracker
  seedPersistence: SeedPersistence
}
