=== Lovewall ===
Contributors: nikhildhaliya
Tags: testimonials, reviews, wall of love, social proof, widget
Requires at least: 6.3
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.0
License: AGPL-3.0-or-later
License URI: https://www.gnu.org/licenses/agpl-3.0.html

Show your Lovewall testimonials on WordPress: a wall of love, carousel, marquee or badge, with a block or a shortcode.

== Description ==

[Lovewall](https://lovewall.tech) is a free, open-source testimonials app: collect testimonials with one link,
approve the ones you like, and show them on your site. This plugin puts your Lovewall widgets on WordPress pages.

* **Block:** add the "Lovewall" block and paste a widget ID.
* **Shortcode:** `[lovewall id="WIDGET_ID"]` anywhere shortcodes work.
* **Light:** the widget script loads only on pages that show a widget, deferred.
* **Self-hosted Lovewall:** set your own address under Settings → Lovewall.

Widgets resize to their content, follow your site's width, and update when you approve new testimonials in Lovewall.

== External services ==

This plugin shows widgets from Lovewall, so pages that contain a Lovewall block or shortcode load the widget script
(`/embed.js`) and the widget itself (`/embed/WIDGET_ID`, in an iframe) from your Lovewall address: by default
https://lovewall.tech, or the address you set under Settings → Lovewall.

* What is sent: the usual browser request for those files (the visitor's IP address, user agent and the page
  address as referrer) and the widget ID. The plugin sends nothing else and stores nothing about visitors.
* When: each time a visitor opens a page that shows a Lovewall widget. Other pages load nothing from Lovewall.
* Lovewall terms: https://lovewall.tech/terms
* Lovewall privacy policy: https://lovewall.tech/privacy

If you host Lovewall yourself, these requests go only to your own server.

== Installation ==

1. Install the plugin from Plugins → Add New (search "Lovewall"), or upload the `lovewall` folder to
   `/wp-content/plugins/`, and activate it.
2. In Lovewall, open Widgets, create a widget and copy its ID from the embed code.
3. Add the "Lovewall" block to a page and paste the ID, or use `[lovewall id="WIDGET_ID"]`.
4. Hosting Lovewall yourself? Set its address under Settings → Lovewall.

== Frequently Asked Questions ==

= Where do I find the widget ID? =

In Lovewall, open Widgets and pick a widget. The embed code contains `data-lovewall="WIDGET_ID"`.

= Does it slow down my site? =

The script is about 1 KB gzipped, deferred, and loads only on pages that show a widget. The widget itself loads lazily.

= Is Lovewall free? =

Lovewall is open source and free to self-host. The hosted version at lovewall.tech has a free trial and a paid plan.

== Screenshots ==

1. The Lovewall block in the editor.
2. A wall of love on a page.

== Changelog ==

= 0.1.0 =
* First release: Lovewall block, `[lovewall]` shortcode, Settings → Lovewall for the app address.
