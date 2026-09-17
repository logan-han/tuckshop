# tuckshop

[![codecov](https://codecov.io/gh/logan-han/tuckshop/graph/badge.svg?token=edAL7piUrc)](https://codecov.io/gh/logan-han/tuckshop)

Recurring school lunch orders for [Flexischools](https://www.flexischools.com.au), at
[tuckshop.han.life](https://tuckshop.han.life). "Chicken tenders every Thursday this term"
becomes one screen and one button instead of a dozen trips through the ordering portal.

- Sign in with your existing Flexischools account
- Pick the days of the week and the term (presets for the dates I care about, or any range)
- Pick anything from the canteen menu, options included
- Every date is checked first: canteen calendar, that day's menu and stock, orders already placed
- One request places the lot; each order can be cancelled from here, refunded to the wallet

Private repo; the site itself is public at the address above. Everything runs in the browser. Your email and password are sent only to the Cognito login service
that Flexischools' own site uses, and the orders go to the same ordering API their site calls. There
is no server, no database and nothing is stored beyond your own browser tab.

## How it talks to Flexischools

Flexischools has no public API. This app reproduces the calls their ordering portal makes, which
were mapped by watching the portal in a browser; see `src/api/flexischools.ts` for the endpoint list
and `src/engine/orders.ts` for the place-order payload. If Flexischools changes their portal, expect
this to break until it is updated. It is a personal tool, unaffiliated with Flexischools, and using
it is your own call under their terms of use.

## Develop

```
npm install
npm run dev
npm run test        # unit tests
npm run test:e2e    # Playwright, against canned Flexischools responses
npm run build
```

TypeScript + React + Vite + SCSS.

## Deploy

GitHub Actions lints, tests, builds, then syncs `build/` to S3 via OIDC and invalidates CloudFront.
Repository settings: secrets `AWS_ROLE_ARN`, `AWS_S3_BUCKET`; variable `CLOUDFRONT_DISTRIBUTION_ID`.
AWS resource details: `docs/aws-setup.md`.

