import type { PluginSettings } from '../settings/PluginSettings.js'
import {
  VIEWER_FINGERPRINT,
  buildViewerCacheKey,
  deriveRepoSegment
} from './PlanFactory.js'

/**
 * v0.1.48: viewer 자산 fingerprint mismatch 감지 + Notice 의 *공통 helper*.
 *
 * Why:
 * - v0.1.46 옵션 B 의 일반 publish 가 fingerprint mismatch 시 baseline 의
 *   viewer 자산을 cached entry 로 등록 → push 없음. 단 *publish 진행 시점만*
 *   Notice 표시. dirty=false (노트 변경 없음) 시 publishVault 가 early
 *   return → Notice 미표시 → 사용자 영원히 sync 의무 인지 없음.
 * - 본 helper 가 *settings 만으로* mismatch 감지 (string compare, 0 ms 비용).
 *   plugin onload + publishVault 의 dirty=false 분기 두 진입점 호출.
 */

export type ViewerSyncCheckResult = {
  needsSync: boolean
  currentFingerprint: string | null
  baselineFingerprint: string | null
}

/** Notice 메시지 + timeout 상수화 — 진입점 마다 동일 등록 의무 */
export const VIEWER_SYNC_NOTICE_MESSAGE =
  'notedrop: viewer 자산 갱신 의무 — Cmd+P 의 "Sync viewer assets" 명령어 실행'
export const VIEWER_SYNC_NOTICE_TIMEOUT_MS = 12000

/**
 * settings 만으로 *현재 viewer fingerprint* vs *baseline fingerprint* 비교.
 * buildPlan 수행하지 말 것 — viewer.zip unpack 비용 의무 X.
 *
 * needsSync=true 분기:
 * - publishViewerAssets=true
 * - VIEWER_FINGERPRINT 임베드 (빌드 산출물 정상)
 * - baseline 저장 (첫 publish 아님)
 * - current !== baseline (실 mismatch)
 */
export function checkViewerFingerprintMismatch(
  settings: PluginSettings
): ViewerSyncCheckResult {
  if (!settings.publishViewerAssets) {
    return {
      needsSync: false,
      currentFingerprint: null,
      baselineFingerprint: settings.lastViewerCacheKey
    }
  }
  if (VIEWER_FINGERPRINT === '') {
    // viewer 미빌드 상태 — fingerprint 비교 의미 X
    return {
      needsSync: false,
      currentFingerprint: null,
      baselineFingerprint: settings.lastViewerCacheKey
    }
  }
  const segment = deriveRepoSegment(settings.targetRepo)
  const current = buildViewerCacheKey(
    VIEWER_FINGERPRINT,
    settings.publicRoot,
    segment
  )
  const baseline = settings.lastViewerCacheKey
  if (baseline === null) {
    // 첫 publish 또는 baseline reset — sync 의무 X. publishVault 의 전체
    // push 가 자동으로 viewer 자산 갱신.
    return {
      needsSync: false,
      currentFingerprint: current,
      baselineFingerprint: null
    }
  }
  return {
    needsSync: current !== baseline,
    currentFingerprint: current,
    baselineFingerprint: baseline
  }
}
