# Lovewall for Zapier

A Zapier CLI app (zapier-platform-core 19, ES modules) on the Lovewall REST API.

- **Connection:** Lovewall URL (default `https://lovewall.tech`, change it for a self-hosted Lovewall) and an API key.
  Zapier tests it with `GET /api/v1/space` and names the connection after the space.
- **Triggers (instant, REST hooks):** New Testimonial (`testimonial.created`), Testimonial Approved
  (`testimonial.approved`). Turning a Zap on calls `POST /hooks`, turning it off `DELETE /hooks/{id}`. Samples come
  from the 3 newest testimonials.
- **Actions:** Create Testimonial (`POST /testimonials`), Approve Testimonial (`POST /testimonials/{id}/approve`, with
  a dropdown of the inbox).
- API errors show Lovewall's own message; a revoked key asks the user to reconnect.

## Publish (owner)

1. Install the CLI and log in (one time):
   ```sh
   npm install -g zapier-platform-cli
   zapier login
   ```
2. From this folder:
   ```sh
   npm install
   zapier register "Lovewall"   # creates the integration, writes .zapierapprc (commit it)
   zapier validate
   zapier push                   # uploads version 1.0.0 as a private integration
   ```
3. Test in the Zap editor at [zapier.com/app/editor](https://zapier.com/app/editor): connect with a real key, build a
   Zap with each trigger and action, turn it on, add a testimonial in Lovewall and check it arrives within seconds.
   Then turn the Zap off and check the hook is gone.
4. In the [developer platform](https://developer.zapier.com), fill **Integration home**: logo (`src/app/icon.svg`
   as a 256×256 PNG), description, category (Marketing), homepage `https://lovewall.tech`, and the auth help text.
5. Invite a few testers with `zapier users:add <email> <version>` (or a share link). Zapier asks for live Zaps from
   users before public listing.
6. **Publish** → submit for review. Zapier checks naming, help text, samples and that every trigger and action works.
   After approval it is listed in the Zapier app directory (beta at first).

Later versions: bump `version` in `package.json`, `zapier push`, then `zapier promote <version>` and
`zapier migrate <old> <new>` to move existing users.
