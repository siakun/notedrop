import type { PluginContext } from '../services/PluginContext.js'

/**
 * 명령어 정의. 각 commands/<name>.ts 가 자기 export 로 CommandDef 노출 →
 * commands/registry.ts 가 array 로 모음 → main.ts 가 iterate 후 addCommand.
 *
 * 새 명령어 추가 = commands/ 안에 파일 1 개 + registry array 에 1 줄.
 * main.ts 변경 없음.
 */
export type CommandDef = {
  id: string
  name: string
  /**
   * 옵시디언이 callback 동기 시그니처를 받지만 내부 비동기 작업을 fire &
   * forget 으로 처리하는 패턴이 표준. 본 인터페이스도 동일.
   */
  callback: (ctx: PluginContext) => void | Promise<void>
}
