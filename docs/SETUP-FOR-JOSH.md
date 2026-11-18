# Setup steps only Josh can do

Each step keeps a secret out of the repo and out of chat.

## 1. Turn on Google sign-in (about 15 minutes)

1. Google Cloud console, the Workspace project: APIs and Services > OAuth
   consent screen. User type **Internal**.
2. Credentials > Create credentials > OAuth client ID > Web application.
   Authorized redirect URI:
   `https://ruogtitymgvrdkmjvzxp.supabase.co/auth/v1/callback`
3. Supabase > snap-platform > Authentication > Sign In / Providers > Google:
   switch on, paste the client ID and client secret, save.
4. Supabase > Authentication > URL Configuration:
   - Site URL: the Vercel production URL.
   - Redirect URLs: add `https://*.vercel.app/**` and
     `http://localhost:3000/**`.

Your owner invite is already in the database, so your first sign-in lands on
the dashboard.

## 2. Vercel environment variables

Vercel > snap-platform > Settings > Environment Variables, for Production and
Preview:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase > Project settings > API keys >
  secret key.
- `ANTHROPIC_API_KEY`: the `snap-platform` key from your password manager.

## 3. Captura credentials into Vault

Supabase > SQL editor, run once with the three values from the iMac's
`captura.env`:

```sql
select private.set_integration_secret(
  (select id from public.companies where slug = 'snap'),
  'captura',
  '{"account_id": "...", "client_id": "...", "client_secret": "..."}'
);
```

## 4. Invite the team

Settings > Team in the app. Pick roles; the person signs in with Google.
Only an owner can make someone an admin.

## 5. Google Workspace mail (done Nov 18)

The platform reads mail through a service account (`snap-platform-mail`) with
domain-wide delegation, scope `gmail.modify`. Its JSON key is in Vault as the
`google_workspace` integration. The grant reaches every mailbox, so the code
opens only the addresses in the `mail.mailboxes` setting (today: the help@
user mailbox). Shared addresses that are groups include help@ as a member;
addresses that are aliases on a person's mailbox reach help@ through a Gmail
filter in that mailbox, so no one's own mailbox is ever read.
Settings > Test Gmail connection checks it (profile only, no message content).
