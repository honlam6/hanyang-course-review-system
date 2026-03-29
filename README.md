# 韩国汉阳大学选课评价系统 Web OSS

[English](./README.en.md) | [한국어](./README.ko.md)

一个面向韩国汉阳大学的课程评价与 AI 选课辅助系统公开版，保留 Web 前后台与 RAG 运行时链路，不公开私有生产数据维护脚本。

- 在线示范：<https://hanyang.eu.cc>
- GitHub 展示建议：[docs/github-metadata.md](./docs/github-metadata.md)
- 系统架构与网站逻辑：[docs/architecture.md](./docs/architecture.md)
- 数据结构：[docs/data-model.md](./docs/data-model.md)
- 数据来源与 Everytime 说明：[docs/data-source.md](./docs/data-source.md)
- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全说明：[SECURITY.md](./SECURITY.md)

## 示范截图

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## 这是什么

这是一个以汉阳大学为默认业务语境的 Web 版开源骨架，包含：

- 课程列表浏览、搜索、筛选
- 课程详情展示
- 课程评价 / 补充信息 / 更正信息提交
- 管理后台登录与审核流程
- AI 选课助手
- 基于 Supabase `pgvector` 的 RAG 检索问答

## 公开版保留了什么

- Web 前台
- Web 后台
- 基础 API
- 运行时 AI / RAG 链路
- Supabase 表结构与检索函数定义

## 公开版没有什么

- 微信小程序代码
- Everytime 抓取脚本实现
- 数据清洗、同步、embedding 批处理脚本实现
- 生产数据源与内部运营流程

也就是说，这个仓库公开的是产品壳、运行时逻辑和数据约定，不是完整的私有生产流水线。

## 数据来源说明

生产环境里的课程数据与历史评价信号，原本来自韩国学生社区软件 Everytime 的相关页面抓取与整理。这个公开版会明确说明数据来源是 Everytime，但不会公开实际抓取脚本、账号处理、规则细节和生产同步流程。

详见：[docs/data-source.md](./docs/data-source.md)

## AI + RAG

这个项目不是普通聊天框，而是检索增强生成流程：

1. 把用户问题转成 embedding
2. 用 Supabase `match_courses` 检索相关课程
3. 按校区、学期、分类做过滤
4. 把检索结果交给 Gemini 生成最终推荐

详见：[docs/architecture.md](./docs/architecture.md)

## 数据结构

核心围绕两张表和一个检索函数：

- `course_reviews`
- `course_feedback_submissions`
- `match_courses`

详见：[docs/data-model.md](./docs/data-model.md)

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

默认访问：

- 前台：`http://localhost:3000/`
- 后台：`http://localhost:3000/admin`

数据库初始化：

- 在 Supabase SQL Editor 执行 [`supabase_setup.sql`](./supabase_setup.sql)

## 它能否泛化到韩国其他高校

可以，但准确说法应该是：

- 当前项目：汉阳大学课程评价系统
- 架构层面：可迁移为韩国高校通用课程评价系统

原因是当前数据模型和检索逻辑围绕校区、学期、课程元数据、分类树、用户评价聚合和向量检索展开，这些能力具有跨学校复用性；但默认命名、文案、校区枚举和业务语境仍然是汉阳大学版本。
