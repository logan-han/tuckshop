# AWS setup

Same shape as the other han.life static sites (tax.han.life was the template). Everything lives in
account 977677890609.

| Resource                | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| S3 bucket               | `tuckshop.han.life` (ap-southeast-4, static website hosting, public read) |
| CloudFront distribution | see `CLOUDFRONT_DISTRIBUTION_ID` repo variable                        |
| Certificate             | shared `*.han.life` / `*.han.id.au` ACM cert in us-east-1             |
| DNS                     | Lightsail DNS zones `han.life` and `han.id.au`, CNAME to the distribution |
| IAM role                | `tuckshop-deploy`, assumed by GitHub Actions via OIDC                 |

## Bucket

Website hosting with `index.html` as both index and error document, so any path serves the app.
Objects are public-read through a bucket policy; the deploy role only needs list, put and delete.

## CloudFront

Custom origin on the bucket's website endpoint (`http-only`), redirect to HTTPS, the managed
`CachingOptimized` cache policy, compression on, HTTP/2 and 3, IPv6 on. Aliases `tuckshop.han.life`
and `tuckshop.han.id.au` on the shared certificate.

## Deploy role

Trust policy allows `sts:AssumeRoleWithWebIdentity` from the GitHub OIDC provider for
`repo:logan-han/tuckshop:ref:refs/heads/main` (both the plain and the id-annotated `sub` formats
GitHub issues). Inline policy: `s3:ListBucket` on the bucket, `s3:PutObject`/`s3:DeleteObject` on
its objects, `cloudfront:CreateInvalidation` on the distribution.

## Repository settings

- Secret `AWS_ROLE_ARN`: the role ARN
- Secret `AWS_S3_BUCKET`: `tuckshop.han.life`
- Variable `CLOUDFRONT_DISTRIBUTION_ID`: the distribution id (the invalidation step is skipped without it)
