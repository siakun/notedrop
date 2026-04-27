---
date: 2026-04-26
type: 기록
generated_by: ai
tags:
  - ai-generated
  - notedrop
  - adr
summary: 플러그인은 Hexagonal Architecture, 뷰어 마크다운은 unified.js (remark/rehype) 표준 파이프라인
---
# ADR-0012: Hexagonal Architecture + Unified.js Pipeline

- **Status**: Accepted (2026-04-26)

## Context

설계 패턴 선택 필요. 두 영역에서:

1. **플러그인 아키텍처**: 옵시디언 의존성을 어떻게 격리해서 테스트 가능하게 할까
2. **뷰어 마크다운 렌더**: 옵시디언 문법 (위키링크, 임베드, 콜아웃 등) 을 어떻게 모듈화할까

알려진 표준 패턴 검토:
- Hexagonal Architecture (Cockburn 2005) - Ports & Adapters
- Clean Architecture (Uncle Bob) - 비슷한 개념, 더 엄격한 layer
- Onion Architecture - 비슷
- Layered (전통적) - top-down dependency

마크다운:
- unified.js (remark + rehype) - JS 생태계 사실상 표준
- Markdown-it - 다른 패밀리, 플러그인 모델 유사
- 자체 파서 - 폭발적 작업량

## Decision

### 1. 플러그인 = Hexagonal Architecture

3-layer 분해:
- **UI** (commands, SettingsTab) - 사용자 인터페이스
- **Infrastructure** (Adapters) - 외부 시스템 연결 (Obsidian API, Node http, git)
- **Domain** (순수 TS 비즈니스 로직) - 옵시디언 의존 0

Domain 이 외부에 요구하는 인터페이스 = **Ports** (VaultFs, MetaCache, GitClient). Adapter 가 Port 의 실제 구현.

테스트에서는 Port 를 fake 로 교체 (InMemoryVaultFs, FakeMetaCache, FakeGitClient) → 옵시디언 미실행 상태에서도 Domain 단위 테스트 가능.

### 2. 뷰어 마크다운 = unified.js

```
markdown 텍스트
  ↓ remark-parse           (markdown → mdast AST)
  ↓ remark-gfm             (GFM 확장)
  ↓ remark-math            (수식 인식)
  ↓ remark-wikilink        (← 우리가 작성)
  ↓ remark-obsidian-embed  (← 우리가 작성)
  ↓ remark-callout         (← 우리가 작성)
  ↓ remark-rehype          (mdast → hast)
  ↓ rehype-katex           (수식 렌더)
  ↓ rehype-mermaid         (mermaid 렌더)
  ↓ rehype-react           (hast → React 엘리먼트)
```

옵시디언 문법은 각각 remark/rehype plugin 1개로 모듈화. 새 문법 지원 = plugin 1개 추가.

## Consequences

### Hexagonal

긍정:
- Domain 단위 테스트가 옵시디언 없이 가능 → CI 친화
- 의존 방향 명확 (UI → Infrastructure → Domain → Ports)
- 미래에 옵시디언 외 vault 형식 지원 시 Adapter 추가만으로 가능
- *요구사항 변경 시 몇 곳을 고치는가* 일관되게 적음

부정:
- 초기 셋업에 Port 인터페이스 + Adapter + fake 필요 (boilerplate 약간)
- 단순 기능에도 layer 통과 → 코드 위치 결정 시간

### Unified

긍정:
- 새 문법 = plugin 1개 추가, 다른 곳 변경 X (몇 곳을 고치는가 = 1)
- mdast/hast 표준 AST → 다른 도구 (예: MDX) 로 옮길 때 호환
- 거의 모든 표준 마크다운 확장이 npm 에 plugin 으로 존재 (math, gfm, footnotes 등)
- 옵시디언 community 에 이미 unified 기반 마크다운 도구 다수 - 참고 자료 풍부

부정:
- unified plugin 작성에 mdast/hast 트리 조작 학습 필요
- 일부 옵시디언 특이 문법은 plugin 새로 작성 필요 (existing OSS plugin 도 있지만 quality 천차만별)

## 두 패턴이 만족하는 결정 원칙

> *코드의 깔끔함은 가독성이 아니라 요구사항이 바뀌었을 때 몇 곳을 고쳐야 하는가로 판단한다.*

### Hexagonal 검증

| 변경 | 영향 |
|---|---|
| 옵시디언 API 변경 | Adapter 1개만 |
| 옵시디언 외 vault 형식 추가 | Adapter 추가, Domain 무관 |
| 새 안전장치 | ContentTransformer 1곳 |
| 새 변환 규칙 | Transformer 1곳 |

### Unified 검증

| 변경 | 영향 |
|---|---|
| 새 옵시디언 문법 지원 | plugin 1개 추가 |
| KaTeX → MathJax 교체 | rehype plugin 1개 교체 |
| Mermaid 버전 업그레이드 | rehype-mermaid plugin 만 |

거의 모든 변경이 한 모듈 / 한 plugin 에 국한. 산탄총 수정 발생하면 설계 잘못된 것.

## Alternatives Considered

### Hexagonal 대신 Clean Architecture / Onion

차이는 미세. Hexagonal 이 더 단순·일반적. Clean 의 엄격한 4-layer 는 우리 규모에 과함.

### Unified 대신 Markdown-it

Markdown-it 도 plugin 모델 우수. 단 옵시디언 community 가 unified 쪽이라 참고·재사용 가치 ↑.

### 자체 마크다운 파서

거부 - 폭발적 작업량 + 표준 호환성 손실.

### Layered Architecture

전통적 top-down. 거부 - Port 추상이 없어 Domain 테스트가 외부 의존에 끌려감.

## Related

- [05-building-blocks.md](../05-building-blocks.md) 5.1 (플러그인 아키텍처)
- [05-building-blocks.md](../05-building-blocks.md) 5.2 (뷰어 마크다운 파이프라인)
- [08-interfaces.md](../08-interfaces.md) 8.1 (Ports)
- 외부: [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/), [unified.js](https://unifiedjs.com/)
