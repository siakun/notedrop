import { PluginSettingTab, Setting } from 'obsidian'
import type { App } from 'obsidian'
import type NotedropPlugin from '../main.js'
import { deriveShareUrlBase } from './shareUrl.js'

export class NotedropSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: NotedropPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Notedrop' })
    containerEl.createEl('p', {
      text: '선택한 노트를 GitHub Pages 정적 뷰어로 발행합니다. 알파 단계 (BRAT) 입니다.'
    })

    const dirty = this.plugin.hasUnpublishedChanges()
    const indexCount = this.plugin.indexList().length
    const canPublish = dirty && indexCount > 0
      && Boolean(this.plugin.settings.githubPat)
      && Boolean(this.plugin.settings.targetRepo)
    new Setting(containerEl)
      .setName('Publish to GitHub')
      .setDesc(
        indexCount === 0
          ? '공유된 노트가 없습니다. 노트 frontmatter 에 notedrop-publish: true 추가 후 발행 가능.'
          : !this.plugin.settings.githubPat || !this.plugin.settings.targetRepo
            ? 'PAT 와 target repository 가 필요합니다 (위 항목 입력 후 활성화).'
            : dirty
              ? `변경 사항 있음 (${indexCount}개 항목). 클릭하면 GitHub 에 push.`
              : `최신 상태 (${indexCount}개 항목 발행됨). 변경이 생기면 다시 활성화됩니다.`
      )
      .addButton((btn) => {
        btn.setButtonText(dirty ? '발행' : '발행됨')
        if (canPublish) btn.setCta()
        else btn.setDisabled(true)
        btn.onClick(async () => {
          btn.setDisabled(true)
          btn.setButtonText('발행 중…')
          try {
            await this.plugin.runPublish()
          } finally {
            this.display()
          }
        })
      })

    new Setting(containerEl)
      .setName('GitHub PAT')
      .setDesc('contents:write 권한 fine-grained PAT. data.json 에만 저장되고 콘솔로 노출되지 않습니다.')
      .addText((text) => {
        text.inputEl.type = 'password'
        text
          .setPlaceholder('github_pat_...')
          .setValue(this.plugin.settings.githubPat)
          .onChange(async (value) => {
            this.plugin.settings.githubPat = value.trim()
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Target repository')
      .setDesc('발행 대상 GitHub 레포 (형식: owner/repo).')
      .addText((text) =>
        text
          .setPlaceholder('siakun/notedrop')
          .setValue(this.plugin.settings.targetRepo)
          .onChange(async (value) => {
            this.plugin.settings.targetRepo = value.trim()
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Target branch')
      .setDesc('발행 commit 을 push 할 브랜치 (기본 main).')
      .addText((text) =>
        text
          .setPlaceholder('main')
          .setValue(this.plugin.settings.targetBranch)
          .onChange(async (value) => {
            this.plugin.settings.targetBranch = value.trim() || 'main'
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Public root')
      .setDesc('변환 산출물이 push 될 레포 내 경로. 기본 빈 값 = repo root (별도 share repo 권장). 모노레포면 viewer/public.')
      .addText((text) =>
        text
          .setPlaceholder('(empty = root)')
          .setValue(this.plugin.settings.publicRoot)
          .onChange(async (value) => {
            this.plugin.settings.publicRoot = value.trim().replace(/^\/|\/$/g, '')
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Publish viewer assets')
      .setDesc('publish 마다 뷰어 (index.html/app.js/style.css) 도 같이 push. 별도 share repo 면 ON.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.publishViewerAssets)
          .onChange(async (value) => {
            this.plugin.settings.publishViewerAssets = value
            await this.plugin.saveSettings()
          })
      )

    const derivedShareBase = deriveShareUrlBase(this.plugin.settings.targetRepo)
    new Setting(containerEl)
      .setName('Share URL base (선택)')
      .setDesc(
        derivedShareBase
          ? `비워두면 target repo 기준 자동: ${derivedShareBase}. 커스텀 도메인 (CNAME) 쓸 때만 입력.`
          : 'target repo 가 정해지면 자동 도출됩니다. 커스텀 도메인이면 직접 입력.'
      )
      .addText((text) =>
        text
          .setPlaceholder(derivedShareBase || 'https://blog.example.com')
          .setValue(this.plugin.settings.shareUrlBase)
          .onChange(async (value) => {
            this.plugin.settings.shareUrlBase = value.trim().replace(/\/$/, '')
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Preview port')
      .setDesc('로컬 프리뷰 서버 포트 (1024–65535). 향후 마일스톤에서 사용.')
      .addText((text) =>
        text
          .setPlaceholder('4321')
          .setValue(String(this.plugin.settings.previewPort))
          .onChange(async (value) => {
            const n = Number.parseInt(value, 10)
            if (Number.isFinite(n) && n >= 1024 && n <= 65535) {
              this.plugin.settings.previewPort = n
              await this.plugin.saveSettings()
            }
          })
      )

    const previewStatus = this.plugin.previewStatus()
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
                await this.plugin.togglePreview(false)
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
                await this.plugin.togglePreview(true)
              } catch (err) {
                console.error('preview start 실패', err)
              }
              this.display()
            })
        }
      })

    new Setting(containerEl)
      .setName('Auto start preview')
      .setDesc('Obsidian 시작 시 프리뷰 서버 자동 시작.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStartPreview)
          .onChange(async (value) => {
            this.plugin.settings.autoStartPreview = value
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Auto unpublish on delete')
      .setDesc('노트가 vault 에서 삭제되면 발행 인덱스에서도 자동 제거.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoUnpublish)
          .onChange(async (value) => {
            this.plugin.settings.autoUnpublish = value
            await this.plugin.saveSettings()
          })
      )

    containerEl.createEl('h3', { text: '공유된 노트' })
    const list = containerEl.createEl('ul')
    const items = this.plugin.indexList()
    if (items.length === 0) {
      list.createEl('li', { text: '아직 공유된 노트가 없습니다.' })
    } else {
      for (const item of items) {
        const li = list.createEl('li')
        li.setText(`${item.title}  (${item.render})  ${item.filePath}`)
      }
    }
  }
}
