# 한양대학교 수강후기 시스템

[中文](./README.md) | [English](./README.en.md)

한양대학교 학생을 위한 수강후기, 시간표, AI 기반 수강 보조 웹사이트입니다.

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
- 시간표 기능
- 시간 충돌 감지
- 후기 / 보완 / 정정 제출
- 관리자 검수 흐름
- AI 수강 도우미
- Supabase `pgvector` 기반 RAG 검색

## 핵심은 Everytime 데이터를 그대로 가져오는 것이 아님

더 중요한 부분은 데이터 처리 방식입니다.

제가 사용한 방식은 대략 이렇습니다.

1. 크롤링 스크립트나 브라우저 개발자 도구를 사용해서 Everytime 관련 페이지에서 강의 정보와 사용자 후기 데이터를 정리한다
2. 같은 강의에 대한 여러 후기들을 한데 모은다
3. 그 원본 후기들을 AI로 정리해서 다음과 같은 고정 필드로 만든다
   - `pros`
   - `cons`
   - `advice`
   - `assignment`
   - `team_project`
   - `grading`
   - `attendance`
   - `exam_count`
4. 처리된 강의 레코드에 embedding 을 생성한다
5. 그 결과를 웹사이트 테이블과 벡터 검색 흐름에 저장한다
6. 처리된 데이터를 화면 표시, 검색, AI 도우미에 활용한다

즉 이 사이트는 Everytime 내용을 그대로 옮겨 놓은 형태가 아니라, 흩어진 후기 신호를 강의 단위의 일관된 구조로 정리한 뒤 검색과 AI 응답에 연결한 구조입니다.

데이터 준비 방식은 꼭 이 방법일 필요는 없고, 다른 방식으로 해도 괜찮습니다.

자세한 설명:

- [docs/data-source.md](./docs/data-source.md)
- [docs/architecture.md](./docs/architecture.md)

## AI 도우미, Embedding, Google API

이 부분이 프로젝트에서 중요한 축입니다.

대략적인 흐름은 다음과 같습니다.

1. 사용자가 수강 관련 질문을 한다
2. Google Gemini API 로 질의 embedding 을 만든다
3. `match_courses` 로 벡터 검색을 수행한다
4. 캠퍼스, 학기, 분류 조건을 적용한다
5. 매칭된 강의 요약을 바탕으로 Gemini 가 최종 답변을 만든다

즉 단순 채팅 UI 가 아니라 다음이 함께 묶여 있습니다.

- Google Gemini API
- AI 기반 강의 요약 필드
- embedding 검색
- Supabase `pgvector`
- RAG 답변 생성

## 시간표와 충돌 감지

웹사이트에는 시간표 기능도 들어 있습니다.

사용자가 강의를 시간표에 추가하면, 시스템이 파싱된 수업 시간을 기준으로 자동으로 충돌을 감지합니다. 시간표 화면은 이미지로 내보내는 것도 가능합니다.

관련 구현:

- [`src/components/Timetable.tsx`](./src/components/Timetable.tsx)
- [`src/components/UserView.tsx`](./src/components/UserView.tsx)
- [`src/lib/courseTime.ts`](./src/lib/courseTime.ts)

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
- AI 요약 규칙
- embedding 생성 방식

그래서 정확한 표현은 다음과 같습니다.

- 현재 프로젝트: 한양대학교 수강후기 시스템
- 아키텍처: 한국 대학 전반으로 확장 가능한 구조
