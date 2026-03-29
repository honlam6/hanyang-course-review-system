# Security Policy

## Supported Scope

This repository is a public web-only OSS shell.

Security issues that matter here include:

- authentication and authorization flaws
- admin access-control problems
- API validation gaps
- secret exposure
- dependency vulnerabilities with real impact
- unsafe data handling in public code paths

## Reporting

Please do not open a public issue for sensitive vulnerabilities.

Report privately to the maintainer first.

If you are preparing this repository for public GitHub release, replace this section with your preferred private contact channel, for example:

- email
- GitHub private security advisory
- another private reporting address

## What Not To Publish

Never publish:

- production credentials
- Supabase service role keys
- private datasets
- Everytime login/session material
- internal operational details that are intentionally omitted from this OSS repository
