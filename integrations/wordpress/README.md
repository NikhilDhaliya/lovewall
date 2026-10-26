# Lovewall for WordPress

`lovewall/` is the plugin: a "Lovewall" block and a `[lovewall id="WIDGET_ID"]` shortcode that print
`<div data-lovewall="WIDGET_ID"></div>` and load `<app url>/embed.js` (deferred) only on pages that use them, plus
Settings → Lovewall for a self-hosted address. No build step: the block's editor script is plain JS on WordPress
globals and renders on the server through the same PHP function as the shortcode.

## Try it

Copy (or symlink) `lovewall/` into `wp-content/plugins/`, activate **Lovewall**, add the block to a page and paste a
widget ID from Lovewall → Widgets.

## Publish on WordPress.org (owner)

1. Check it: install the [Plugin Check](https://wordpress.org/plugins/plugin-check/) plugin on a test site, run it on
   Lovewall and fix anything it flags. In `readme.txt`, set **Contributors** to your WordPress.org username and
   **Tested up to** to the current WordPress version.
2. Make sure https://lovewall.tech/terms and https://lovewall.tech/privacy exist (the readme's "External services"
   section links to them; reviewers check).
3. Zip the folder: `cd integrations/wordpress && zip -r lovewall.zip lovewall`.
4. Log in at wordpress.org (create an account with 2FA), open
   [Add your plugin](https://wordpress.org/plugins/developers/add/), upload the zip and accept the guidelines. The
   review takes a few days to a few weeks; answer the reviewer's email from the same account.
5. When approved you get an SVN repository (`https://plugins.svn.wordpress.org/lovewall/`):
   ```sh
   svn co https://plugins.svn.wordpress.org/lovewall lovewall-svn
   cp -r lovewall/* lovewall-svn/trunk/
   mkdir -p lovewall-svn/assets   # icon-256x256.png, banner-1544x500.png, screenshot-1.png, screenshot-2.png
   cd lovewall-svn && svn add --force trunk assets
   svn cp trunk tags/0.1.0
   svn ci -m "Lovewall 0.1.0" --username <your wp.org username>
   ```
   Use an SVN password from your WordPress.org profile (Account & Security), not your login password.
6. Updates: bump `Version` in `lovewall.php`, `Stable tag` in `readme.txt` and the changelog, copy to `trunk/`,
   `svn cp trunk tags/<version>`, commit.
