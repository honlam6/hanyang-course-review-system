# GitHub Launch Checklist

## Repository Identity

- Recommended repository name: `hanyang-course-guide`
- About text: use one of the versions in [`github-metadata.md`](./github-metadata.md)
- Topics: copy from [`github-metadata.md`](./github-metadata.md)
- Website: `https://hanyang.eu.cc`
- Social preview image: use `docs/images/homepage-desktop.png`

## Repository Content

Before publishing, confirm that the repo contains:

- `README.md`
- `README.en.md`
- `README.ko.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/*`
- `PULL_REQUEST_TEMPLATE.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/data-source.md`
- `docs/github-metadata.md`

## Sensitive Data Review

Confirm none of the following are present:

- production credentials
- service-role keys
- session tokens
- sensitive user data
- internal database exports

## Wording Review

Confirm the wording stays consistent:

- This is a Hanyang University course review system
- The current data flow uses Everytime-related pages
- Data is grouped and summarized before being written into the site tables
- The processed records are used in display, search, and the AI assistant

## Final Check

1. Review `git status`
2. Review `README.md`
3. Review screenshot quality
4. Confirm no accidental sensitive files exist
5. Commit and publish
