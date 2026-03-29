# Contributing

## Scope

This repository is a public web-only OSS shell.

Good contribution areas:

- frontend UI improvements
- accessibility improvements
- admin experience improvements
- documentation fixes
- translation updates
- runtime API fixes
- AI / RAG runtime behavior improvements
- test coverage and code quality improvements

Out of scope for this public repo:

- requests for the private production crawler
- requests for private Everytime extraction scripts
- requests for internal production credentials or data

## Workflow

1. Fork the repository.
2. Create a focused branch.
3. Keep changes small and reviewable.
4. Update docs when behavior changes.
5. Open a pull request with a clear summary.

## Change Expectations

Please explain:

- what changed
- why the change is needed
- whether UI behavior changed
- whether API behavior changed
- whether docs were updated

## Documentation

If your change affects product behavior, also update one or more of:

- `README.md`
- `README.en.md`
- `README.ko.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/data-source.md`

## Security And Sensitive Data

Do not commit:

- secrets
- private datasets
- production exports
- Everytime credentials or session data
