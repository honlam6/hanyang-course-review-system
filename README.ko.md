# 한양대학교 수강후기 시스템 Web OSS

[中文](./README.md) | [English](./README.en.md)

한양대학교 수강후기 및 AI 기반 수강 보조 시스템의 공개 웹 버전입니다.

- 라이브 데모: <https://hanyang.eu.cc>
- GitHub 메타데이터: [docs/github-metadata.md](./docs/github-metadata.md)
- 아키텍처 및 사이트 로직: [docs/architecture.md](./docs/architecture.md)
- 데이터 모델: [docs/data-model.md](./docs/data-model.md)
- 데이터 소스 및 Everytime 설명: [docs/data-source.md](./docs/data-source.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 보안 안내: [SECURITY.md](./SECURITY.md)

## 미리보기

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## 포함된 범위

- 웹 프런트엔드
- 관리자 대시보드
- 핵심 API
- 런타임 AI / RAG 흐름
- Supabase 스키마 및 검색 함수

## 제외된 범위

- 미니프로그램 코드
- Everytime 크롤링 구현
- 비공개 데이터 정리 / 동기화 / 임베딩 배치 스크립트
- 내부 운영 절차

## 데이터 소스 안내

운영 환경의 강의 데이터와 과거 후기 신호는 한국 학생 커뮤니티 소프트웨어 Everytime 관련 페이지를 바탕으로 수집 및 정리되었습니다. 이 공개 저장소는 제품 껍데기와 런타임 로직만 남기고, 실제 추출 및 운영 파이프라인은 제외합니다.

## 빠른 시작

```bash
npm install
cp .env.example .env
npm run dev
```

시작 전에 Supabase SQL Editor 에서 [`supabase_setup.sql`](./supabase_setup.sql) 을 실행해야 합니다.

## 포지셔닝

정확한 표현은 다음과 같습니다.

- 현재 제품: 한양대학교 수강후기 시스템
- 아키텍처: 한국 대학 전반으로 확장 가능한 구조
