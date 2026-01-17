# Deployment & Configuration

## Accounts & Access

| Service | Account | Role |
|---------|---------|------|
| **Vercel** | berenger.ouadi@gmail.com | Owner |
| **GitHub** | berengerouadi | Owner |

---

## GitHub OAuth App

| Field | Value |
|-------|-------|
| **App Name** | Intent |
| **Settings URL** | https://github.com/settings/applications/3342234 |
| **Client ID** | (see Vercel env vars) |
| **Client Secret** | (see Vercel env vars) |
| **Callback URL** | `https://intent-app.vercel.app/api/auth/callback` |
| **Scopes** | `repo`, `read:user` |

### To regenerate Client Secret:
1. Go to https://github.com/settings/applications/3342234
2. Click "Generate a new client secret"
3. Update in Vercel env vars

---

## Vercel

| Field | Value |
|-------|-------|
| **Account** | berenger.ouadi@gmail.com (Google) |
| **Project** | intent |
| **Dashboard** | https://vercel.com/berengerouadis-projects/intent |
| **Production URL** | https://intent-app.vercel.app |
| **Framework** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### Environment Variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `GITHUB_CLIENT_ID` | OAuth App Client ID | GitHub OAuth App settings |
| `GITHUB_CLIENT_SECRET` | OAuth App Secret | GitHub OAuth App settings |
| `JWT_SECRET` | Random 32-byte hex | `openssl rand -hex 32` |

### To update env vars:
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Update the value
3. Redeploy (or it applies on next deploy)

---

## Deployment

### Automatic (recommended)
Push to `main` branch → Vercel auto-deploys

### Manual
```bash
npx vercel --prod
```

### Preview deployment
```bash
npx vercel
```

---

## DNS / Custom Domain (future)

To add a custom domain:
1. Vercel Dashboard → Project → Settings → Domains
2. Add domain (e.g., `intent.dev`)
3. Update DNS records as instructed
4. Update GitHub OAuth callback URL to new domain

---

## Troubleshooting

### OAuth callback error
- Check callback URL matches exactly in GitHub OAuth App settings
- Ensure env vars are set in Vercel

### 500 errors on API routes
- Check Vercel Function Logs: Dashboard → Project → Logs
- Verify env vars are set

### Private repo access not working
- User must be logged in
- Check GitHub token has `repo` scope
