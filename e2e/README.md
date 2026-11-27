# End-to-end tests

The real app, driven in a browser, against a throwaway local Supabase. They
never reach the hosted project, Gmail, Twilio, Captura or the Claude API.

    npm run test:e2e          # resets the local database, builds, runs everything
    E2E_DEV=1 npm run test:e2e -- e2e/support-path.spec.ts   # one file, dev server

Needs Docker and `psql`. `scripts/e2e-db.sh` starts Supabase from
`e2e/supabase/config.toml`, applies the first migration, adds the test company
(`fixtures/company.sql`), applies the other migrations, then loads
`fixtures/seed.sql`. Each run starts from a clean database
(`E2E_SKIP_RESET=1` skips the reset).

| Spec | Path it proves |
| --- | --- |
| `booking-path` | Season board hold, portal link, coordinator signs, adds teams, schedule blocked until complete, submitted |
| `support-path` | Customer email read from the mailbox, reply sent, test mode holds it to the test address; a drafted offer approved in the queue and sent |
| `staffing-path` | Shifts added and published, taken on a phone, pay added, approved and marked paid |
| `help-path` | A parent books a makeup on a phone, gets the confirmation, cancels |
| `test-set` | A finished support conversation is added to the agent test set; a run refuses cleanly with no Claude key |
| `smoke` | Signed-out visitors go to sign in; the main staff pages load |

**Mail.** `fake-gmail.ts` stands in for Google on 127.0.0.1:3199. Setup stores
a throwaway Workspace key whose token address points there, and the app reads
`E2E_GMAIL_API`, which `lib/gmail/client.ts` accepts only for a loopback
address. Tests read what was sent from the fake.

**Sign-in.** Tests sign in with a password through the local auth, not Google.
Users and roles come from the staff invites in the seed.

**Docker images.** The script pulls from Docker Hub
(`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`) because some networks block the
default registry.
