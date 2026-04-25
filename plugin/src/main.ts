import { Plugin } from 'obsidian'

export default class NotedropPlugin extends Plugin {
  override async onload(): Promise<void> {
    console.log('notedrop loaded')
  }

  override onunload(): void {
    console.log('notedrop unloaded')
  }
}
