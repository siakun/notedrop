---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - spec
  - overview
summary: notedrop TL;DR, 핵심 결정 21항 표, 다른 문서 읽는 순서 안내
---
# 00. Overview

## TL;DR

`notedrop` 은 옵시디언 노트·책을 GitHub Pages에 발행하는 플러그인 + 뷰어 세트. 핵심 정체성은 *AirDrop 처럼 한 노트를 즉시 공개 URL 로 발행하는* 워크플로. 책에는 PDF Expert 같은 페이지 뷰어 (paged.js 기반) 가 따라붙고, 비공개 일기와 공개 콘텐츠가 같은 vault 에서 안전하게 공존하도록 화이트리스트 + 다층 누설 방지를 적용한다.

목표는 "사용자가 공개 책 원고를 자주 갱신하면서, 매번 zip 으로 압축해 전송하는 부담 없이 실시간으로 공유하고 피드백을 받기 위한" 본인 워크플로 우선 해결. 단일 사용자 만족 후 OSS 공개 검토.

## 핵심 결정 (21항)

| 영역 | 결정 | 출처 ADR |
|---|---|---|
| 플러그인명 / 기본 레포명 | `notedrop` | [0022](decisions/0022-플러그인명-notedrop.md) |
| GitHub URL | `https://siakun.github.io/notedrop/<hash>` | [0006](decisions/0006-url-flat-구조.md) |
| 레포 구조 | 2-레포 (vault private + notedrop public) | [0001](decisions/0001-2-레포-구조.md) |
| 발행 토글 | frontmatter `notedrop-publish: true` | [0002](decisions/0002-발행상태-frontmatter.md) |
| frontmatter 키 prefix | `notedrop-` 강제 (네임스페이스 충돌 방지) | [0003](decisions/0003-frontmatter-네임스페이스.md) |
| 인덱스 | MetadataCache 기반 인메모리, 이벤트 구독 | [0018](decisions/0018-vault-사이드카-금지-인메모리-캐시.md) |
| 책 식별 | Waypoint 패턴 (폴더 + 같은이름 .md), 챕터 추출 3단 폴백 | [0005](decisions/0005-책-식별-waypoint-패턴.md) |
| URL 구조 | `/notedrop/<hash>` 평면, 책·문서 prefix 분리 X | [0006](decisions/0006-url-flat-구조.md) |
| 책 내 챕터 네비 | 책 1권 = 1 URL, 챕터는 SPA 앵커 + 사이드바 TOC | [0007](decisions/0007-책-1권-1url-spa-앵커.md) |
| 렌더 정책 | 3-동작: HIDE / RENDER / PASSTHROUGH | [0008](decisions/0008-렌더-3동작-tier.md) |
| 미발행 ref 안전장치 | 위키링크 빨간 dead link, 임베드 placeholder, 임베드 깊이 1 제한 | [0009](decisions/0009-미발행-ref-안전장치.md) |
| 페이지 사이즈 | A3/A4(default)/A5/B5/B6 + 사이즈별 자동 프리셋 | [0016](decisions/0016-페이지-사이즈-customcss.md) |
| 페이지별 CSS | `notedrop-css` (인라인) 또는 `notedrop-css-file` (파일 참조) | [0016](decisions/0016-페이지-사이즈-customcss.md) |
| 페이지네이션 | paged.js 클라이언트 사이드 | [0011](decisions/0011-static-spa.md) |
| PDF | 브라우저 print API (on-demand) | [0011](decisions/0011-static-spa.md) |
| 자산 | 챕터별 hash 디렉터리에 `_assets/` 분리 복사 | [0017](decisions/0017-자산-챕터별-분리.md) |
| 커버 | `notedrop-cover` frontmatter (옵션), 없으면 entry 본문이 1페이지 | [0017](decisions/0017-자산-챕터별-분리.md) |
| 라이브 미리보기 | Node http + SSE, 명령어/설정 토글로 수동 시작 | [0014](decisions/0014-라이브-미리보기-http-sse.md), [0015](decisions/0015-미리보기-시작-수동.md) |
| 뷰어 | Next.js `output: 'export'` + `'use client'` Static SPA, paged.js, KaTeX, Mermaid | [0011](decisions/0011-static-spa.md) |
| 뷰어 위치 | 플러그인 레포 안 (option β) | [0013](decisions/0013-뷰어-위치-플러그인-레포.md) |
| 빌드/배포 | GH Actions 정적 파일 deploy (페이지별 SSG 빌드 X), push only no-pull | [0010](decisions/0010-approach-a-markdown-first.md), [0019](decisions/0019-발행-push-only-no-pull.md) |

## 읽는 순서

신규 onboarding: 00 → 01 → 04 → 05 → 06 까지 읽으면 전체 그림 잡힘. 그 다음은 작업 영역별:

- 데이터 형식 작업 → 07, 08
- 안전·보안 작업 → 09
- 테스트 작성 → 10
- MVP 일정 추적 → 11
- 모르는 용어 → 12
- 결정 근거 추적 → `decisions/` 의 해당 ADR

## 산출물 종류

- 옵시디언 플러그인 (TypeScript, esbuild 빌드, 단일 `main.js` + `manifest.json` + `styles.css`)
- 뷰어 (Next.js Static SPA, 정적 HTML/JS/CSS)
- public 레포 ([github.com/siakun/notedrop](https://github.com/siakun/notedrop)) 의 `viewer/` 디렉터리 + GH Actions deploy 설정

## 산출물 비-종류

- 백엔드 서버, DB, 인증, 결제 (없음)
- 모바일 옵시디언 publish (HTTP 서버 미지원으로 데스크톱 only)
- 옵시디언 외 마크다운 도구 호환 (단 Domain layer 는 옵시디언 의존 없으므로 미래 확장 가능)
