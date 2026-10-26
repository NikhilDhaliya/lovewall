# Lovewall for Make

A Make (make.com) custom app on the Lovewall REST API, in the local-app layout of Make's VS Code extension
([Make Apps Editor](https://developers.make.com/custom-apps-documentation/make-apps-editor)): `makecomapp.json` lists
the components, each code block is its own `<component>.<code>.iml.json` file.

| Component                     | What it does                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `general/base.iml.json`       | Base URL `<Lovewall URL>/api/v1`, Bearer header, Lovewall's error message per status, key hidden in logs             |
| `connections/lovewall`        | Lovewall URL (hosted or your own server) and API key, checked with `GET /space`; the connection shows the space name |
| `webhooks/lovewall-events`    | Dedicated webhook: attach `POST /hooks` with `{{webhook.url}}` and the chosen event, detach `DELETE /hooks/{id}`     |
| `modules/watch-testimonials`  | Instant trigger "Watch testimonials" (new, approved, updated or deleted), one bundle per event                       |
| `modules/search-testimonials` | Search: status, text, tag, source, rating, featured; follows `next_cursor` up to the limit                           |
| `modules/create-testimonial`  | Action: `POST /testimonials`                                                                                         |
| `modules/approve-testimonial` | Action: `POST /testimonials/{id}/approve`, with a dropdown of the inbox (`rpcs/list-new-testimonials`)               |

## Publish

1. In Make, open **Custom apps** (left menu; turn on _Developer mode_ in your profile if it is hidden) and **Create a
   new app**: name `lovewall`, label `Lovewall`, description from `general/readme.md`, theme `#1c1c1b`, the heart
   logo (`src/app/icon.svg` as a 512×512 PNG). The next steps fill it.
2. In VS Code, install **Make Apps Editor**, add your Make API key (Profile → API access, scopes for custom apps) as an
   environment for your zone (for example `eu1.make.com`).
3. Open this folder in VS Code, right-click `makecomapp.json` → **Deploy to Make** → **Deploy into another app**. Fill
   the new origin in `makecomapp.json` (`baseUrl` of your zone, `appId` of the app from step 1, `appVersion: 1`,
   `apikeyFile` such as `../../.secrets/apikey`, which stays out of git), save, deploy again and choose **Deploy as
   new remote ... (and apply for all unmapped)**. Commit the origin's `idMapping` afterwards.
   Without VS Code: create each component in the web editor with the same names and paste each file's content into
   the tab of the same name (Communication, Mappable parameters, Interface, Samples, Attach, Detach...).
4. Test in a scenario: create the connection with a real key, run **Watch testimonials** (add a testimonial in Lovewall
   and see the bundle arrive), **Create a testimonial**, **Approve a testimonial** and **Search testimonials**. Delete
   the scenario's webhook and check the hook is gone in Lovewall.
5. Share the app with a few users (app page → **Share**), then **Request review** from the app page. Make reviews
   naming, help texts, samples and error handling before listing it publicly.
