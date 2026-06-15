# Deploy Granter to grants.nisria.co

Six-year-old steps. Do them in order.

## 1. Generate the secrets you will paste in step 4

Open Terminal and run these two commands. Copy each output. We will paste them in Railway in step 4.

```bash
# Session cookie key
python3 -c "import secrets; print('SESSION_SECRET =', secrets.token_urlsafe(48))"

# A strong password for Nur (write this down for her)
python3 -c "import secrets; print('NUR_PASSWORD =', secrets.token_urlsafe(18))"
```

Grab your Anthropic API key from https://console.anthropic.com . Copy the `sk-ant-...` string.

## 2. Log in to Railway from the terminal

```bash
railway login
```

A browser tab opens. Sign in with Github (use sinanagency). When the page says "Logged in", come back to the terminal.

## 3. Create the project and deploy

```bash
cd /Users/milaaj/Code/nisria-techops/granter
railway init
```

When it asks "Project name", type `nisria-granter` and press enter.

Then deploy the code:

```bash
railway up
```

Wait until the build finishes and it prints `Deployment live`. The first deploy takes about 3 minutes.

## 4. Paste the four env vars

```bash
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..." \
                  --set "NUR_EMAIL=nur@nisria.co" \
                  --set "NUR_PASSWORD=<the password from step 1>" \
                  --set "SESSION_SECRET=<the secret from step 1>"
```

(Paste your real values where the dots are. The quotes matter.)

Then redeploy so the vars take effect:

```bash
railway redeploy
```

## 5. Open the Railway URL once to confirm it boots

```bash
railway open
```

A browser tab opens at something like `nisria-granter-production-XXXX.up.railway.app`. You should see the Nisria login page. Do not log in yet, just confirm the page renders.

## 6. Attach the custom domain grants.nisria.co

```bash
railway domain
```

When asked, type `grants.nisria.co` and press enter. Railway prints a CNAME target like `nisria-granter-production-XXXX.up.railway.app`. Copy that target string.

Now open https://name.com in a browser, log in to the `taonac96` account, go to the `nisria.co` DNS settings, and add a new record:

- Type: `CNAME`
- Host: `grants`
- Answer: `<the CNAME target string Railway gave you>`
- TTL: `300`

Save. DNS takes 5 to 30 minutes to propagate.

## 7. Test it lives

Wait 10 minutes. Then in the terminal:

```bash
curl -I https://grants.nisria.co/login
```

You should see `HTTP/2 200`. Open the URL in your browser, log in with `nur@nisria.co` and the password from step 1, and you should land on the dashboard.

## 8. Send Nur her credentials

In WhatsApp, send Nur:

```
Hi Nur, your Grant Finder is live at https://grants.nisria.co .
Login: nur@nisria.co
Password: <the password from step 1>
You can change the password from the Settings page after logging in.
```

## If something breaks

- `railway logs` shows the server output.
- `railway redeploy` re-runs the deploy.
- If the bootstrap user did not get created on first boot, run:
  ```bash
  railway run python3 -c "from src.common.db import get_db; from src.common.auth import bootstrap_admin; bootstrap_admin(get_db())"
  ```
- DNS not resolving after 30 min: re-check the CNAME record at name.com matches exactly what Railway printed.

## What we did NOT do

- The local `granter/db/grants.db` on Nur's Mac is NOT migrated. Railway starts with a fresh database. The grant sources (Grants.gov, World Bank, IATI, USASpending) repopulate automatically on the first scheduler tick (within minutes of first boot). Nur's one pipeline card "Kenya Integrated Mechanisms for Poverty Reduction" will need to be re-added in the UI.
- Documents in the vault are NOT migrated. Upload them through the Settings page after first login.
