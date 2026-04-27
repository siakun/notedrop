import { describe, expect, it } from 'vitest'
import { isSplittableElement } from './paragraphSplit'

describe('isSplittableElement', () => {
  function el(tag: string): HTMLElement {
    return document.createElement(tag)
  }

  it('<p> → true', () => {
    expect(isSplittableElement(el('p'))).toBe(true)
  })

  it('<li> → true', () => {
    expect(isSplittableElement(el('li'))).toBe(true)
  })

  it('<h1>~<h6> → false', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(isSplittableElement(el(tag))).toBe(false)
    }
  })

  it('<pre>, <code>, <table>, <img>, <ul>, <ol>, <blockquote>, <div> → false', () => {
    for (const tag of ['pre', 'code', 'table', 'img', 'ul', 'ol', 'blockquote', 'div']) {
      expect(isSplittableElement(el(tag))).toBe(false)
    }
  })

  it('대소문자 무관', () => {
    const p = document.createElement('P')
    expect(isSplittableElement(p)).toBe(true)
  })
})
