# GitHub Launch Checklist

## Repository Identity

- Recommended repository name: `hanyang-course-guide-web-oss`
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
- Supabase service role keys
- private datasets
- private Everytime scripts
- Everytime login/session materials
- internal production automation

## Public Positioning Review

Confirm the wording stays accurate:

- This is a Hanyang University course review system
- The architecture can be generalized to other Korean universities
- The production data source included Everytime-related signals
- The private crawling and maintenance pipeline is not included in OSS

## Final Pre-Publish Check

1. Review `git status`
2. Review `README.md`
3. Review screenshot quality
4. Confirm no accidental private files exist
5. Create the first public commit only after final review
