# Deploy The Non-GitHub CX AI Offer Page

The static page is self-contained in:

```text
revenue_engine/non_github/site/
```

Files:

- `index.html`
- `styles.css`
- `privacy.html`
- `robots.txt`
- `favicon.svg`
- `assets/cx-agent-replay-map.png`

## Upload Bundle

Build the no-GitHub upload bundle from the project root:

```bash
python3 revenue_engine/non_github/scripts/package_offer_site.py
```

Expected output:

```text
revenue_engine/non_github/output/cx_ai_offer_site_YYYYMMDD.zip
```

Upload the extracted folder contents, not the parent `output/` folder.

## Fastest Manual Options

### Cloudflare Pages Upload

1. Create a Pages project.
2. Upload the extracted offer-site bundle or the
   `revenue_engine/non_github/site/` folder.
3. Leave build command empty.
4. Use the generated public URL in warm replies and forms that require a
   truthful website/proof URL.

### Vercel Static Project

1. Create a new project.
2. Set project root to `revenue_engine/non_github/site/`.
3. Leave build command empty.
4. Output directory: `.`

## CTA

The page routes requests to:

```text
chinesegrove@gmail.com
```

Do not publish the page through GitHub while the non-GitHub direction is active.

## Deployment Guardrails

- Do not invent a business domain.
- Do not imply paid customer references.
- Do not add payment links to the public page before a verified payout route
  exists.
- Do not submit the generated URL to prospects until the page is public and
  reachable in a normal browser.
