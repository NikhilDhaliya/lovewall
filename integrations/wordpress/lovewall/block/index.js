/* Lovewall block editor script: plain JS on WordPress globals, no build step. The page renders on the server
   (lovewall_render_block in lovewall.php), so the editor only collects the widget ID. */
(function (wp) {
  "use strict";

  var el = wp.element.createElement;
  var __ = wp.i18n.__;
  var useBlockProps = wp.blockEditor.useBlockProps;
  var InspectorControls = wp.blockEditor.InspectorControls;
  var PanelBody = wp.components.PanelBody;
  var Placeholder = wp.components.Placeholder;
  var TextControl = wp.components.TextControl;

  function cleanId(value) {
    return String(value || "").replace(/[^A-Za-z0-9]/g, "");
  }

  // The block in the editor: the widget ID, in the block and in the sidebar.
  function Edit(props) {
    var id = props.attributes.widgetId || "";
    function idField(key) {
      return el(TextControl, {
        key: key,
        label: __("Widget ID", "lovewall"),
        value: id,
        help: __("In Lovewall: Widgets, then the ID in the embed code.", "lovewall"),
        onChange: function (value) {
          props.setAttributes({ widgetId: cleanId(value) });
        },
        __next40pxDefaultSize: true,
        __nextHasNoMarginBottom: true,
      });
    }
    return el(
      "div",
      useBlockProps(),
      el(InspectorControls, null, el(PanelBody, { title: __("Widget", "lovewall") }, idField("sidebar"))),
      el(
        Placeholder,
        {
          icon: "heart",
          label: __("Lovewall", "lovewall"),
          instructions: id ? __("The widget shows on the published page.", "lovewall") : __("Paste a widget ID from Lovewall.", "lovewall"),
        },
        idField("placeholder"),
      ),
    );
  }

  wp.blocks.registerBlockType("lovewall/widget", {
    edit: Edit,
    // Dynamic block: nothing saved in the post but the attributes.
    save: function () {
      return null;
    },
  });
})(window.wp);
