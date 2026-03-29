# Hanyang University Course Review System Web OSS

[中文](./README.md) | [한국어](./README.ko.md)

A public web-only OSS shell of a Hanyang University course review and AI-assisted course selection system.

- Live demo: <https://hanyang.eu.cc>
- GitHub metadata: [docs/github-metadata.md](./docs/github-metadata.md)
- Architecture and site logic: [docs/architecture.md](./docs/architecture.md)
- Data model: [docs/data-model.md](./docs/data-model.md)
- Data source and Everytime note: [docs/data-source.md](./docs/data-source.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security: [SECURITY.md](./SECURITY.md)

## Preview

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## Included

- Web frontend
- Admin dashboard
- Core APIs
- Runtime AI / RAG flow
- Supabase schema and retrieval function

## Not Included

- Mini-program code
- Everytime crawling implementation
- Private data normalization / sync / embedding batch scripts
- Internal production operations

## About the Data Source

In production, the course data and historical review signals were originally collected and organized from relevant pages in the Korean student community software Everytime. This public repository keeps the product shell and runtime logic, but omits the actual private extraction and production pipeline.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Run [`supabase_setup.sql`](./supabase_setup.sql) in Supabase SQL Editor before starting.

## Positioning

Accurate wording:

- Current product: Hanyang University course review system
- Architecture: adaptable to a broader Korean university course review platform
