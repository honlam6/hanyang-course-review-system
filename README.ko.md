# 한양대학교 수강후기 시스템

[中文](./README.md) | [English](./README.en.md)

한양대학교 학생을 위한 수강후기 및 AI 기반 수강 보조 웹사이트입니다.

- 라이브 데모: <https://hanyang.eu.cc>
- GitHub 메타데이터: [docs/github-metadata.md](./docs/github-metadata.md)
- 아키텍처 및 사이트 로직: [docs/architecture.md](./docs/architecture.md)
- 데이터 모델: [docs/data-model.md](./docs/data-model.md)
- 데이터 소스 설명: [docs/data-source.md](./docs/data-source.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 보안 안내: [SECURITY.md](./SECURITY.md)

## 미리보기

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## 프로젝트가 하는 일

현재 프로젝트에는 다음이 포함됩니다.

- 강의 목록 탐색, 검색, 필터링
- 강의 상세 페이지
- 후기 / 보완 / 정정 제출
- 관리자 검수 흐름
- AI 수강 도우미
- Supabase `pgvector` 기반 RAG 검색

## 데이터 준비 방식

제가 사용한 방식은 대략 이렇습니다.

1. 크롤링 스크립트나 브라우저 개발자 도구를 사용해서 Everytime 관련 페이지에서 강의 정보와 사용자 후기 데이터를 정리한다
2. 같은 강의에 대한 여러 후기들을 한데 모은다
3. 그것들을 AI로 분석해서 다음처럼 보기 좋고 검색에 쓰기 좋은 필드로 정리한다
   - 장점
   - 단점
   - 조언
   - 과제량
   - 팀플 부담
   - 학점 스타일
   - 출석 방식
   - 시험 횟수
4. 그 결과를 웹사이트 데이터 테이블에 저장한다
5. 처리된 강의 레코드를 검색, 프런트 표시, AI 도우미에 활용한다

데이터 준비 방식은 꼭 이 방법일 필요는 없고, 다른 방식으로 해도 괜찮습니다.

자세한 설명:

- [docs/data-source.md](./docs/data-source.md)
- [docs/architecture.md](./docs/architecture.md)

## AI 도우미와 RAG

이 도우미는 단순 채팅창이 아닙니다.

대략적인 흐름은 다음과 같습니다.

1. 사용자가 질문한다
2. 질문을 embedding 으로 바꾼다
3. `match_courses` 로 관련 강의를 찾는다
4. 캠퍼스, 학기, 분류 조건을 적용한다
5. 찾은 강의들을 모델에 넘겨 최종 답변을 만든다

## 데이터 구조

핵심은 다음 세 가지입니다.

- `course_reviews`
- `course_feedback_submissions`
- `match_courses`

자세한 필드 설명:

- [docs/data-model.md](./docs/data-model.md)

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

기본 주소:

- 프런트엔드: `http://localhost:3000/`
- 관리자: `http://localhost:3000/admin`

데이터베이스 초기화:

- Supabase SQL Editor 에서 [`supabase_setup.sql`](./supabase_setup.sql) 실행

## 다른 한국 대학으로 확장

현재 프로젝트는 한양대학교 기준으로 만들어졌지만, 구조 자체가 한양대학교에만 묶여 있지는 않습니다.

다른 한국 대학으로 옮기려면 보통 다음을 조정하게 됩니다.

- 학교 이름과 문구
- 캠퍼스 정의
- 분류 체계
- 데이터 수집 방식
- 정리 규칙
- embedding 생성 방식

그래서 정확한 표현은 다음과 같습니다.

- 현재 프로젝트: 한양대학교 수강후기 시스템
- 아키텍처: 한국 대학 전반으로 확장 가능한 구조
