# Render Staging source

Branch: staging-render. Root directory: repository root.
Build: npm ci --omit=dev && node staging-deploy/prepare-public.mjs
Start: node server/staging-start.mjs
Health: /healthz
Set PWC_STAGING_SUPABASE_URL, PWC_STAGING_PUBLISHABLE_KEY, PWC_STAGING_SERVICE_KEY in Render only. Never commit server credentials. PORT comes from Render.
