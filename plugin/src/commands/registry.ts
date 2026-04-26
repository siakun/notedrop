import { shareNoteCommand } from './shareNote.js'
import { unshareNoteCommand } from './unshareNote.js'
import { openSharedListCommand } from './openSharedList.js'
import { copyShareUrlCommand } from './copyShareUrl.js'
import { publishVaultCommand } from './publishVault.js'
import { forcePublishVaultCommand } from './forcePublishVault.js'
import { syncViewerAssetsCommand } from './syncViewerAssets.js'
import { resetPublishBaselineCommand } from './resetPublishBaseline.js'
import {
  openPreviewCommand,
  startPreviewCommand,
  stopPreviewCommand
} from './previewServer.js'
import type { CommandDef } from './types.js'

/**
 * 등록 순서 = Cmd+P 검색 결과 정렬 순서이자 Settings/문서에서의 메뉴 순서.
 * 자주 쓰는 액션 (share, publish) → 미리보기 → 보조 (open list, copy url).
 */
export const COMMAND_REGISTRY: readonly CommandDef[] = [
  shareNoteCommand,
  unshareNoteCommand,
  publishVaultCommand,
  forcePublishVaultCommand,
  syncViewerAssetsCommand,
  resetPublishBaselineCommand,
  startPreviewCommand,
  stopPreviewCommand,
  openPreviewCommand,
  openSharedListCommand,
  copyShareUrlCommand
]
