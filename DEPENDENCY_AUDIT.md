# Dependency audit

Baseline: `bbc6fdc` (`devin/1795093345-ci`). Validation used Node 24.22.2.
Counts below are npm's vulnerable-package counts, including propagated parent
findings, not unique advisories or demonstrated exploitable vulnerabilities.

## Vite migration (current)

Baseline: PR #11 head `f4f896a`. Migrated CRA/craco to Vite 8.3.8 with
`@vitejs/plugin-react` 6.3.0, Vitest 5.1.1 and TypeScript 5.9.3, pinned in the
lockfile. Removed `react-scripts`, `@craco/craco` and unused
`@tailwindcss/postcss7-compat`, including their webpack, Workbox and PostCSS 7
chains. No `.mjs` Babel workaround is needed. Tailwind remains on version 3.

| Audit | Low before → after | Moderate before → after | High before → after | Critical before → after | Total before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `npm audit --json` | 9 → 9 | 10 → 0 | 16 → 0 | 0 → 0 | **35 → 9** |
| `npm audit --omit=dev --json` | 9 → 0 | 9 → 0 | 16 → 0 | 0 → 0 | **34 → 0** |

No high or critical findings remain. The nine remaining low findings are all
in the unchanged server Jest 27 chain:
`jest` → `jest-cli` / `@jest/core` → `jest-config` / `jest-runner` →
`jest-environment-jsdom` → its nested `jsdom` → `http-proxy-agent` →
`@tootallnate/once` (GHSA-vpq2-c234-7xj6). These are development/test-only and
not installed by `npm ci --omit=dev`. npm recommends a Jest major upgrade;
server Jest is deliberately unchanged in this migration. The frontend's
separate jsdom 31 dependency is not affected.

Express, dotenv and Prisma are production dependencies as of `f4f896a`.
Vite, Vitest, jsdom, TypeScript and the explicit server Jest dependency are
development dependencies. The older dependency-classification notes and
remaining-high table below describe the pre-Vite historical snapshot, **not
the current dependency tree**. No audit suppressions or overrides were added.

Validation uses Node 24.22.2, a clean `npm ci`, typechecking, all 77 client
tests, 110 server tests, a production build, seven E2E tests with all 17
migrations applied to a new disposable PostgreSQL 16 database, and a browser
check against Express serving the production build under Helmet CSP.

## Previous dependency remediation (historical)

| Audit | State | Low | Moderate | High | Critical | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `npm audit --json` | Before | 9 | 15 | 29 | 3 | 56 |
| `npm audit --json` | After | 9 | 10 | 16 | 0 | 35 |
| `npm audit --omit=dev --json` | Before | 9 | 14 | 29 | 3 | 55 |
| `npm audit --omit=dev --json` | After | 9 | 9 | 16 | 0 | 34 |

`--omit=dev` is **not a runtime-only audit in this repository**. CRA, legacy
Tailwind/PostCSS compatibility tooling, Jest and type/test packages are listed
under `dependencies`. Express and dotenv are listed under `devDependencies`,
despite being required by the server; Express is also installed through CRA.
Dependency classifications were left unchanged rather than hiding findings by
moving packages between sections.

Classification by application dependency paths (a package shared with build
tooling is counted on the application side):

| Use | State | Low | Moderate | High | Critical | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| API/browser libraries | Before | 0 | 2 | 1 | 1 | 4 |
| Native-module installation chain, including shared packages | Before | 0 | 0 | 3 | 1 | 4 |
| Build/development/test only | Before | 9 | 13 | 25 | 1 | 48 |
| API/browser libraries and native installation chain | After | 0 | 0 | 0 | 0 | 0 |
| Build/development/test only | After | 9 | 10 | 16 | 0 | 35 |

The API/browser findings were `express -> body-parser` (high),
`express -> proxy-addr` (critical), `express -> qs` (moderate), and
`jspdf -> dompurify` (moderate). The installation chain was `bcrypt` (high),
`bcrypt -> @mapbox/node-pre-gyp` (high), its `tar` (critical), and
`rimraf -> glob -> minimatch -> brace-expansion` (high). The latter was shared
with build tools. bcrypt's application path uses the native binding; tar archive
extraction was in node-pre-gyp's installation/packaging commands, not password
comparison. The remaining baseline critical was build-time `shell-quote`.
The flagged baseline `nanoid` was PostCSS's 3.x copy, not docx's 5.x copy.
No audit findings were reported in the application dependency paths for Prisma,
Socket.IO, jsonwebtoken or docx. This is not a claim that those libraries have no
undiscovered vulnerabilities.

## Changes and constraints

- Ran `npm audit fix` without `--force`, updating compatible locked dependencies.
  This patched body-parser, proxy-addr, DOMPurify, PostCSS 8, nanoid 3,
  shell-quote, browserslist, js-yaml, node-forge, follow-redirects and other
  compatible transitive dependencies.
- Raised Express's direct requirement to `^4.22.3`, resolving `qs` to 6.16.2
  rather than the vulnerable range retained by Express 4.22.2.
- Used the explicitly permitted high/critical application-dependency exception
  for **bcrypt 5.1.1 -> 6.0.0**. It removes node-pre-gyp and the vulnerable tar
  chain; no incompatible tar override was introduced. bcrypt 6 requires Node
  >=18, compatible with the Node 24 CI/local environment. Its changelog lists
  prebuilt binary packaging, Node support and native-addon updates, not a password
  hash format change. Three dummy bcrypt-5 hashes (legacy short, ordinary ASCII,
  and 72-byte Unicode passwords) were accepted by bcrypt 6; wrong passwords were
  rejected. Existing server and E2E authentication coverage also passed.
- No CRA upgrade/downgrade, other direct major upgrade, `--force`, audit
  suppression, or overrides were used. In particular, npm's suggested
  `react-scripts@0.0.0` is not a usable remediation.

## Every remaining high finding

All 16 findings below are **build/development execution only**, not application
API or browser-runtime dependency paths. They nevertheless remain physically
installed by `npm ci --omit=dev` under the current manifest. Production serves
the built frontend through Express, not webpack-dev-server. Build-tool exposure
still matters for developer machines and CI processing untrusted source/assets.
There are **no remaining critical findings**.

`CRA` below means `react-scripts@5.0.1`; paths are dependency chains from the
project root. Parent findings can propagate the same leaf advisory.

| Package | Path(s) | Why not fixed within this task's constraints |
| --- | --- | --- |
| `@svgr/webpack@5.5.0` | CRA -> @svgr/webpack | Propagates the old SVGO chain; replacing the constrained build toolchain needs an incompatible upgrade. |
| `@svgr/plugin-svgo@5.5.0` | CRA -> @svgr/webpack -> @svgr/plugin-svgo | Pins the SVGO 1 major; patched SVGO is outside its supported dependency range. |
| `svgo@1.3.2` | CRA -> @svgr/webpack -> @svgr/plugin-svgo -> svgo | Needs SVGO >=2.8.4 for the reported SVG advisories and a compatible updated consumer; build-only major changes are excluded. |
| `css-select@2.1.0` | CRA -> @svgr/webpack -> @svgr/plugin-svgo -> svgo -> css-select | Propagates nth-check; its dependency range does not accept patched nth-check 2.x. |
| `nth-check@1.0.2` | CRA -> @svgr/webpack -> @svgr/plugin-svgo -> svgo -> css-select -> nth-check | Fix starts at 2.0.1, outside css-select 2's supported range; no build-only override. |
| `bfj@7.1.0` | CRA -> bfj | Propagates jsonpath/underscore. Latest allowed bfj 7 still depends on the affected jsonpath chain. |
| `jsonpath@1.3.0` | CRA -> bfj -> jsonpath | Pins underscore exactly to 1.13.6; no compatible automatic update. |
| `underscore@1.13.6` | CRA -> bfj -> jsonpath -> underscore | Patched 1.13.8 exists, but jsonpath pins exactly 1.13.6; overriding build-only dependencies is excluded. |
| `postcss@7.0.39`, `postcss@6.0.23` | @tailwindcss/postcss7-compat -> postcss; @tailwindcss/postcss7-compat -> postcss-functions -> postcss; CRA -> resolve-url-loader -> postcss | These three installed copies require incompatible PostCSS major/consumer upgrades. Root PostCSS 8 is patched at 8.5.33. |
| `serialize-javascript@4.0.0`, `serialize-javascript@6.0.2` | CRA -> workbox-webpack-plugin -> workbox-build -> rollup-plugin-terser -> serialize-javascript; CRA -> css-minimizer-webpack-plugin -> serialize-javascript | Both installed copies require >=7.1.3 for all reported advisories, outside consumer ranges. |
| `rollup-plugin-terser@7.0.2` | CRA -> workbox-webpack-plugin -> workbox-build -> rollup-plugin-terser | Propagates serialize-javascript 4; requires replacement/update of Workbox's build plugin chain. |
| `workbox-build@6.6.0` | CRA -> workbox-webpack-plugin -> workbox-build | Propagates rollup-plugin-terser/serialization; the constrained Workbox 6 chain has no safe automatic fix. |
| `workbox-webpack-plugin@6.6.0` | CRA -> workbox-webpack-plugin | Propagates the Workbox build chain; requires a separate build-toolchain migration. |
| `webpack-dev-middleware@5.3.4` | CRA -> webpack-dev-server -> webpack-dev-middleware | Fix starts at 7.4.5, outside webpack-dev-server 4's supported range. |
| `webpack-dev-server@4.15.2` | CRA -> webpack-dev-server | Direct development-server advisories plus vulnerable middleware; fixed consumer chain requires unsupported build-only major upgrades. |
| `react-scripts@5.0.1` | CRA (direct) | Aggregates the constrained SVG, PostCSS, Workbox and development-server findings; no supported non-breaking CRA fix is offered. |

Some audit entries still say `fixAvailable: true` (for example bfj/underscore),
but the non-force fix leaves their exact/constrained dependency chain unchanged.
A build-only override is deliberately not used to bypass those constraints.

## Validation

After a clean `npm ci`, with `CI=true`:

```text
Typecheck exit: 0
Test Suites: 19 passed, 19 total
Tests:       77 passed, 77 total
Test Suites: 10 passed, 10 total
Tests:       110 passed, 110 total
Build exit: 0
All migrations have been successfully applied.
  7 passed (40.4s)
E2E exit: 0
```

E2E used a fresh disposable PostgreSQL 16 database and all 17 committed
migrations. Existing Node/CRA deprecation warnings remain. Follow-up work is a
separately reviewed CRA/build-tool migration and dependency classification
cleanup, not a force fix or moving packages solely to change audit totals.
