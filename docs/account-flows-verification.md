# Native Node account flows

Base URL: **https://devenv.playctrl.me**. These pages now use native JavaScript
templates, the shared Node layout/assets and existing Node browser/accounts
services. The password-reset email also uses native HTML, with the original
wording, through the existing Node SMTP delivery worker.

Check desktop/mobile layout, wording, spacing, validation and navigation. Use a
disposable account for password changes, API-key rotation and deletion.

| Page / flow | URL | Verify |
| --- | --- | --- |
| Signup | `/signup` | Original four fields, validation errors, retained email/username and empty password fields on failure. Successful signup signs in and opens Your Links. |
| Signup alias | `/users/new` | Same form; this URL must not be treated as a username. |
| Invite signup | `/signup?invite_code=CODE` | When invite-only mode is enabled, code is prefilled; missing/invalid/redeemed codes fail and a valid code is redeemed once. The migration does not change the site's invite-only setting. |
| Reset request | `/i-forgor` | Original text, Gray link and Reset Password button. Known/unknown emails both redirect to login with the same neutral notice. |
| Reset email | Use a disposable account's email | Original wording and subject, valid reset URL, one-hour expiry notice. External email delivery needs a mailbox check; no external email was sent during verification. |
| Set new password | `/i-forgor/commit/TOKEN` | Original password/confirmation fields and Save new password button. Mismatch, invalid, expired and reused tokens fail with the original generic notice. Successful reset revokes existing sessions and allows login with the new password. |
| Settings | `/settings` | Original theme, username, password and Danger Zone sections. Signed-out access goes to login. |
| Settings alias | `/settings/index` | Same settings page. The old GET `/settings/save` redirects to settings without changing anything. |
| Theme mode | Theme Mode on `/settings` | Light, Dark and Automatic; correct radio selected; Save redirects to the user's profile with the original notice. |
| Username | Username on `/settings` | Valid rename redirects to the new profile URL; duplicate/invalid names fail. One-week cooldown shows its next available date. System accounts have no credential/deletion sections. |
| Password change | Password on `/settings` | Current password required; confirmation validated; successful change displays the original notice and permits login with the new password. |
| API-key rotation | Own `/users/USERNAME` profile | Generate/randomize from the existing Your API key block. Only the owner can rotate; the new key appears only in their own profile document. |
| Account deletion | Danger Zone on `/settings` | Original confirmation dialog; wrong password leaves account intact. Correct password performs the existing soft deletion, revokes sessions, clears browser/legacy identity cookies and redirects to login. |
| Delegated settings | `/settings` during a delegated session | Existing controller-versus-subject policy remains enforced by Node. Crafted target/actor fields cannot choose another account. |

## Verification performed

- Lightweight account HTTP tests with the Rails fallback unavailable, plus the
  existing web/profile/wallpaper suite: 66 tests passed.
- Native reset-email escaping and local SMTP authentication/envelope/MIME checks;
  both use a mock transport/server and send no external email.
- Live disposable-account signup, invite handling where enabled, theme/username/
  password changes, username cooldown, key rotation and CSRF rejection.
- Live reset expiry, single-use token consumption, session revocation, login with
  the new password and password-protected deletion. Tokens were prepared only
  for the disposable account without enqueueing a reset email.
- Temporary account, invite and verification records removed.

No headless browser was launched. Visual checks and the confirmation dialog are
left for manual review under the lightweight-checks preference.
