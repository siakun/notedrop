declare module 'pagedjs' {
  export class Previewer {
    preview(
      input: HTMLElement | string,
      stylesheets: string[],
      target: HTMLElement
    ): Promise<unknown>
  }
  const _default: { Previewer: typeof Previewer }
  export default _default
}
