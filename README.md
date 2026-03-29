# 韩国汉阳大学选课评价系统

[English](./README.en.md) | [한국어](./README.ko.md)

这是一个给汉阳大学学生用的选课评价和 AI 选课辅助网站。

- 在线示范：<https://hanyang.eu.cc>
- GitHub 展示建议：[docs/github-metadata.md](./docs/github-metadata.md)
- 系统架构与网站逻辑：[docs/architecture.md](./docs/architecture.md)
- 数据结构：[docs/data-model.md](./docs/data-model.md)
- 数据来源说明：[docs/data-source.md](./docs/data-source.md)
- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全说明：[SECURITY.md](./SECURITY.md)

## 示范截图

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## 这个项目做什么

项目现在主要包含这些部分：

- 课程列表浏览、搜索、筛选
- 课程详情展示
- 用户提交评价、补充信息、更正信息
- 管理后台审核
- AI 选课助手
- 基于 Supabase `pgvector` 的 RAG 检索

## 数据是怎么来的

我自己的做法是：

1. 使用爬虫脚本或者开发者工具，从 Everytime 相关页面整理课程信息和用户评价
2. 把同一门课的多条用户评价汇总起来
3. 用 AI 分析总结出更适合展示和检索的字段，比如：
   - 优点
   - 缺点
   - 建议
   - 作业量
   - 小组项目
   - 给分情况
   - 出勤方式
   - 考试次数
4. 把这些结果写进网站的数据表里
5. 再把处理后的课程记录用于搜索、前台展示和 AI 助手

如果你有别的采集方式，也完全可以按你自己的方式来做，不一定非得照这个流程。

更细的说明在这里：

- [docs/data-source.md](./docs/data-source.md)
- [docs/architecture.md](./docs/architecture.md)

## AI 助手和 RAG

这个项目不是单纯接一个聊天框。

大致流程是：

1. 用户提问
2. 把问题转成 embedding
3. 用 `match_courses` 检索相关课程
4. 结合校区、学期、分类做过滤
5. 把命中的课程交给模型生成最终回答

## 数据结构

核心围绕三部分：

- `course_reviews`
- `course_feedback_submissions`
- `match_courses`

详细字段说明见：

- [docs/data-model.md](./docs/data-model.md)

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

## 迁移到其他韩国高校

这个项目现在是按汉阳大学来做的，但结构上不只适用于汉阳大学。

如果你想迁移到别的韩国高校，通常要调整这些内容：

- 学校名称和页面文案
- 校区枚举
- 分类体系
- 数据采集方式
- 数据清洗规则
- embedding 生成方式

所以更准确的说法是：

- 当前项目：汉阳大学选课评价系统
- 架构层面：可以迁移成韩国高校通用的课程评价系统
