import { Plugin, PluginSettingTab, Setting } from 'obsidian'
import type { App } from 'obsidian'
import { deriveShareUrlBase } from './shareUrl.js'
import { showPublishDiff } from '../commands/showPublishDiff.js'
import { buildPublishDeps, publishVault } from '../commands/publishVault.js'
import type { PluginContext } from '../services/PluginContext.js'

/**
 * Settings 탭. plugin instance 직접 의존하지 않고 PluginContext 만 사용.
 *
 * Obsidian 의 PluginSettingTab 이 super constructor 에 Plugin 객체를 요구
 * 하므로 (UI 등록을 위해) main.ts 가 Plugin reference 를 별도 인자로 넘긴다.
 * 단 비즈니스 호출은 모두 ctx 경유 — settings, dirty 추적, preview 토글,
 * publish 명령어 호출 등.
 */
export class NotedropSettingTab extends PluginSettingTab {
  private revalidating = false

  constructor(
    app: App,
    plugin: Plugin,
    private readonly ctx: PluginContext
  ) {
    super(app, plugin)
  }

  display(): void {
    this.render()
    void this.revalidateInBackground()
  }

  private async revalidateInBackground(): Promise<void> {
    if (this.revalidating) return
    this.revalidating = true
    try {
      const before = this.ctx.dirtyTracker.isDirty()
      const after = await this.ctx.dirtyTracker.revalidate()
      if (before !== after && this.containerEl.isShown()) {
        this.render()
      }
    } catch (err) {
      console.warn('notedrop revalidateDirty 실패', err)
    } finally {
      this.revalidating = false
    }
  }

  private render(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Notedrop' })
    containerEl.createEl('p', {
      text: '선택한 노트를 GitHub Pages 정적 뷰어로 발행합니다. 알파 단계 (BRAT) 입니다.'
    })

    this.renderActions(containerEl)
    this.renderPublishSettings(containerEl)
    this.renderPreviewSettings(containerEl)
    this.renderBehaviorSettings(containerEl)
    this.renderSharedList(containerEl)
    this.renderAdvanced(containerEl)
  }

  private renderActions(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '액션' })

    const dirty = this.ctx.dirtyTracker.isDirty()
    const indexCount = this.ctx.index.list().length
    const settings = this.ctx.settings
    const canPublish = dirty && indexCount > 0
      && Boolean(settings.githubPat)
      && Boolean(settings.targetRepo)
    new Setting(containerEl)
      .setName('Publish to GitHub')
      .setDesc(
        indexCount === 0
          ? '공유된 노트가 없습니다. 노트 frontmatter 에 notedrop-publish: true 추가 후 발행 가능.'
          : !settings.githubPat || !settings.targetRepo
            ? 'PAT 와 target repository 가 필요합니다 (아래 발행 설정 입력 후 활성화).'
            : dirty
              ? `변경 사항 있음 (${indexCount}개 항목). 클릭하면 GitHub 에 push.`
              : `최신 상태 (${indexCount}개 항목 발행됨). 변경이 생기면 다시 활성화됩니다.`
      )
      .addButton((btn) => {
        btn.setButtonText('변경 보기')
        if (indexCount === 0) btn.setDisabled(true)
        btn.onClick(() => showPublishDiff(this.ctx))
      })
      .addButton((btn) => {
        btn.setButtonText(dirty ? '발행' : '발행됨')
        if (canPublish) btn.setCta()
        else btn.setDisabled(true)
        btn.onClick(async () => {
          btn.setDisabled(true)
          btn.setButtonText('발행 중…')
          try {
            await publishVault(buildPublishDeps(this.ctx), settings, {
              isDirty: () => this.ctx.dirtyTracker.revalidate()
            })
          } finally {
            this.display()
          }
        })
      })

    const previewStatus = this.ctx.preview.getStatus()
    const isRunning = previewStatus.state === 'running'
    const previewDesc = createFragment((frag) => {
      if (isRunning) {
        frag.appendText('실행 중 — ')
        const link = frag.createEl('a', {
          text: previewStatus.url,
          href: previewStatus.url
        })
        link.setAttr('target', '_blank')
        link.setAttr('rel', 'noopener')
      } else {
        frag.appendText('중지됨. 시작하면 로컬 라이브 프리뷰가 활성화됩니다.')
      }
    })
    new Setting(containerEl)
      .setName('Preview server')
      .setDesc(previewDesc)
      .addButton((btn) => {
        if (isRunning) {
          btn
            .setButtonText('중지')
            .setWarning()
            .onClick(async () => {
              try {
                await this.ctx.preview.stop()
              } catch (err) {
                console.error('preview stop 실패', err)
              }
              this.display()
            })
        } else {
          btn
            .setButtonText('시작')
            .setCta()
            .onClick(async () => {
              try {
                await this.ctx.preview.start()
              } catch (err) {
                console.error('preview start 실패', err)
              }
              this.display()
            })
        }
      })
  }

  private renderPublishSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '발행 설정' })

    new Setting(containerEl)
      .setName('GitHub PAT')
      .setDesc('contents:write 권한 fine-grained PAT. data.json 에만 저장되고 콘솔로 노출되지 않습니다.')
      .addText((text) => {
        text.inputEl.type = 'password'
        text
          .setPlaceholder('github_pat_...')
          .setValue(this.ctx.settings.githubPat)
          .onChange(async (value) => {
            this.ctx.settings.githubPat = value.trim()
            await this.ctx.saveSettings()
          })
      })

    const pagesUrl = deriveShareUrlBase(this.ctx.settings.targetRepo)
    const targetRepoDesc = createFragment((frag) => {
      frag.appendText('발행 대상 GitHub 레포 (형식: owner/repo).')
      if (pagesUrl) {
        frag.createEl('br')
        frag.appendText('GH Pages: ')
        const link = frag.createEl('a', { text: pagesUrl, href: pagesUrl })
        link.setAttr('target', '_blank')
        link.setAttr('rel', 'noopener')
      }
    })
    new Setting(containerEl)
      .setName('Target repository')
      .setDesc(targetRepoDesc)
      .addText((text) =>
        text
          .setPlaceholder('username/repo')
          .setValue(this.ctx.settings.targetRepo)
          .onChange(async (value) => {
            this.ctx.settings.targetRepo = value.trim()
            await this.ctx.saveSettings()
          })
      )

  }

  private renderPreviewSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '미리보기 설정' })

    new Setting(containerEl)
      .setName('Auto start preview')
      .setDesc('Obsidian 시작 시 프리뷰 서버 자동 시작.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.ctx.settings.autoStartPreview)
          .onChange(async (value) => {
            this.ctx.settings.autoStartPreview = value
            await this.ctx.saveSettings()
          })
      )
  }

  private renderBehaviorSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '동작 옵션' })

    new Setting(containerEl)
      .setName('Auto unpublish on delete')
      .setDesc('노트가 vault 에서 삭제되면 발행 인덱스에서도 자동 제거.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.ctx.settings.autoUnpublish)
          .onChange(async (value) => {
            this.ctx.settings.autoUnpublish = value
            await this.ctx.saveSettings()
          })
      )
  }

  private renderSharedList(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '공유된 노트' })
    const list = containerEl.createEl('ul')
    const items = this.ctx.index.list()
    if (items.length === 0) {
      list.createEl('li', { text: '아직 공유된 노트가 없습니다.' })
      return
    }
    for (const item of items) {
      const li = list.createEl('li')
      li.setText(`${item.title}  (${item.render})  ${item.filePath}`)
    }
  }

  private renderAdvanced(containerEl: HTMLElement): void {
    const details = containerEl.createEl('details', { cls: 'notedrop-advanced' })
    const summary = details.createEl('summary')
    summary.createSpan({ cls: 'notedrop-advanced-chevron', text: '▶' })
    summary.createSpan({
      cls: 'notedrop-advanced-label',
      text: '고급 설정 (기본값 권장)'
    })

    new Setting(details)
      .setName('Target branch')
      .setDesc('발행 commit 을 push 할 브랜치 (기본 main).')
      .addText((text) =>
        text
          .setPlaceholder('main')
          .setValue(this.ctx.settings.targetBranch)
          .onChange(async (value) => {
            this.ctx.settings.targetBranch = value.trim() || 'main'
            await this.ctx.saveSettings()
          })
      )

    new Setting(details)
      .setName('Public root')
      .setDesc('변환 산출물이 push 될 레포 내 경로. 기본 빈 값 = repo root (별도 share repo 권장). 모노레포면 viewer/public.')
      .addText((text) =>
        text
          .setPlaceholder('(empty = root)')
          .setValue(this.ctx.settings.publicRoot)
          .onChange(async (value) => {
            this.ctx.settings.publicRoot = value.trim().replace(/^\/|\/$/g, '')
            await this.ctx.saveSettings()
          })
      )

    new Setting(details)
      .setName('Publish viewer assets')
      .setDesc('publish 마다 뷰어 자산 (zip 풀어 모든 파일) 도 같이 push. 별도 share repo 면 ON.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.ctx.settings.publishViewerAssets)
          .onChange(async (value) => {
            this.ctx.settings.publishViewerAssets = value
            await this.ctx.saveSettings()
          })
      )

    new Setting(details)
      .setName('Preview port')
      .setDesc('로컬 프리뷰 서버 포트 (1024–65535).')
      .addText((text) =>
        text
          .setPlaceholder('4321')
          .setValue(String(this.ctx.settings.previewPort))
          .onChange(async (value) => {
            const n = Number.parseInt(value, 10)
            if (Number.isFinite(n) && n >= 1024 && n <= 65535) {
              this.ctx.settings.previewPort = n
              await this.ctx.saveSettings()
            }
          })
      )
  }
}
