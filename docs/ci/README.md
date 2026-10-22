# CI workflow — staged copy (one-time owner activation required)

`docs/ci/ci.yml` is the **complete, ready-to-run GitHub Actions workflow** for
this repository. It belongs at `.github/workflows/ci.yml`, but it is staged
here temporarily for one reason only:

> GitHub rejected pushes adding `.github/workflows/ci.yml` because the
> Arena GitHub App installation for this repository does not have the
> `workflows` permission:
> *"refusing to allow a GitHub App to create or update workflow
> `.github/workflows/ci.yml` without `workflows` permission"*.
>
> The file content is finished and tested (its required steps are asserted by
> `tests/integration/package.test.js` and `scripts/verify-superpowers.sh`,
> which accept either the canonical path or this staged copy). Only the
> file's **location** is pending, and only the repository owner (or an App
> with `workflows` permission) can put it there.

The workflow runs `npm ci`, `npm test`, the two measurement gates
(`npm run probe:classifier -- --strict` and `npm run probe:feed -- --strict`),
`scripts/verify-superpowers.sh`, an independent release-archive verification, and
`REQUIRE_CHROME=1 npm run test:browser`, then uploads the browser evidence as an
artifact.

Until activation, **CI does not run on GitHub** and the
`REQUIRE_CHROME=1 npm run test:browser` gate has not executed in CI — this
remains an open gate in `docs/store/release-checklist.md`. Do not treat this
staged file as a passing CI run.

## Activate it (≈1 minute, web UI)

Your own GitHub account has the permission the App lacks:

1. On the remediation branch, choose **Add file → Create new file**.
2. Name it exactly `.github/workflows/ci.yml`.
3. Paste the full contents of `docs/ci/ci.yml` (open it and use **Raw** to copy
   verbatim), then commit directly to the same branch.
4. In a follow-up commit (or via a local clone), delete `docs/ci/` — the
   verifier and package test prefer the canonical path once it exists, so
   nothing else needs to change.

Equivalent local activation:

```sh
mkdir -p .github/workflows
git mv docs/ci/ci.yml .github/workflows/ci.yml
git rm docs/ci/README.md
git commit -m "ci: activate GitHub Actions workflow"
git push
```

Alternatively, grant the Arena GitHub App **Workflows: Read and write** for
this repository and let Arena push the move.
