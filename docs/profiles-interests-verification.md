# Native Node profiles and interests

Base URL: **https://devenv.playctrl.me**. Use your username and valid profile/kink
IDs. These browser routes now render native JavaScript templates and use the
existing signed Node browser, accounts, social, tracker and moderation services.
Profile Markdown preparation and domain filtering also run in Node.

Check wording, spacing and controls against the original pages at desktop and
phone widths. No headless browser was run for this migration; verification used
lightweight template/HTTP tests and disposable live accounts.

| Page / flow | URL | Verify |
| --- | --- | --- |
| Public profile shell | `/users/USERNAME` | Own/other/signed-out profiles; the profile document fills the page and Report remains outside custom CSS. |
| Profile document | `/users/USERNAME/profile-document` | Loads inside the profile iframe. Direct top-level visits redirect to the profile shell. Check biography, custom CSS, links, history thumbnails, chart, interests and own-user controls. |
| Profile editor | `/users/USERNAME/edit` | Own account only. Original toolbar, Markdown formatting, theme colours, character count, Save and Cancel. |
| HTML editor | Use **HTML Mode** on the editor | HTML and CSS Monaco editors load; Ctrl/Cmd+S and Save work; live preview updates. Reopen to ensure HTML/CSS remain in the correct editor. |
| Simple editor | Use **Simple Mode** | Switching modes preserves content. Entered Markdown renders correctly after saving. |
| Details preview frame | `/users/USER_ID/details` | Normally loaded by the HTML editor; sanitized content and custom CSS render. |
| Style manager | Inside `/users/USERNAME/edit` | Select, New, Rename and Delete styles; delete dialog; existing style remains recoverable when installing another. |
| Share style | Public checkbox in the style manager | Toggle in place; refreshed checkbox and public gallery reflect the current state. |
| Public style gallery | `/profiles` | Names, authors, update times, usage counts, preview iframes, pagination and empty state. Requires login, as before. |
| User's public styles | `/users/USER_ID/profiles` | User-scoped results and own/other-user empty messages. |
| Style details/install | `/profiles/PROFILE_ID` | Original installation notice, preview and Install it. Use a shared style; another user's private style must remain inaccessible. |
| Style preview | `/profiles/PROFILE_ID/preview` | Custom design is visible, uses mock profile data and exposes no private account key. |
| User interests | `/users/USERNAME/kinks` | Embedded chip list. Own list has add/star/remove controls; another user's list is read-only. |
| Add interest form | `/kinks/new` | Add, normalization, validation errors and repeat submissions. |
| Interest details | `/kinks/KINK_ID` | Original title, user segments, e621 status/test and Find Links. |
| Browse by interest | `/link_lists` | Original headings, two sample cards per interest, counts, pagination and See more links. |
| Search/filter interests | `/link_lists?q=TAG` and `?filter=mine` | Enter a query, switch Just my kinks/All kinks, and preserve the query. Signed-out mine filter returns to all interests. |
| Interest's links | `/link_lists/KINK_ID` | Matching public links only; no private/expired link exposure; pagination. |
| Existing wallpaper shortcuts | Search tab on `/links/LINK_ID` | Kink shortcuts still populate e621 search and update results without leaving the page. |

Use a test account for API-key regeneration, style deletion and other destructive
checks. Own profile API keys must never appear in another viewer's document,
public previews or the outer profile shell.

Signup, password reset and account settings are now native too; see the
[account-flow checklist](account-flows-verification.md). Social/community pages
are native as described in the [social checklist](social-community-verification.md).
Tracker screens are also native; see the
[tracker/activity checklist](tracker-activity-verification.md). Profile logging
forms and pledge panels share those templates. Report submission and
administration are now native too; see the
[moderation checklist](moderation-remaining-verification.md).

## Verification performed

- Native HTTP/template suite, including profile/content tests and existing flows.
- Real disposable account checks for shell/documents/editors, privacy and CSRF.
- Markdown and HTML saves, blocked-domain removal and domain recording.
- Style rename/share/preview/install/create/select/delete and ownership rejection.
- Kink add/star/unstar/remove, By Kinks browsing/filtering and API-key rotation.
- Temporary users, profiles, links, interests, domain rules and sessions removed.
