<?php
/**
 * Plugin Name:       Lovewall
 * Plugin URI:        https://lovewall.tech
 * Description:       Show your Lovewall testimonials with a shortcode or a block.
 * Version:           0.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Nikhil Dhaliya
 * Author URI:        https://lovewall.tech
 * License:           AGPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/agpl-3.0.html
 * Text Domain:       lovewall
 *
 * @package Lovewall
 */

defined( 'ABSPATH' ) || exit;

const LOVEWALL_VERSION     = '0.1.0';
const LOVEWALL_DEFAULT_URL = 'https://lovewall.tech';

/**
 * An http(s) origin without a trailing slash, or '' when the value is not one.
 *
 * @param mixed $value A URL typed by an admin.
 * @return string
 */
function lovewall_clean_url( $value ) {
	if ( ! is_scalar( $value ) ) {
		return '';
	}
	$value = trim( (string) $value );
	if ( '' !== $value && ! preg_match( '#^[a-z][a-z0-9+.-]*://#i', $value ) ) {
		$value = 'https://' . $value;
	}
	$url = esc_url_raw( $value, array( 'https', 'http' ) );
	if ( '' === $url ) {
		return '';
	}
	$parts = wp_parse_url( $url );
	if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
		return '';
	}
	$port = isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '';
	return strtolower( $parts['scheme'] ) . '://' . strtolower( $parts['host'] ) . $port;
}

/**
 * The Lovewall address from Settings → Lovewall.
 *
 * @return string
 */
function lovewall_app_url() {
	$url = lovewall_clean_url( get_option( 'lovewall_app_url', LOVEWALL_DEFAULT_URL ) );
	return '' === $url ? LOVEWALL_DEFAULT_URL : $url;
}

/**
 * Settings sanitizer: keeps the old value and says why when the new one is not a URL.
 *
 * @param mixed $value Submitted value.
 * @return string
 */
function lovewall_sanitize_app_url( $value ) {
	if ( is_scalar( $value ) && '' === trim( (string) $value ) ) {
		return LOVEWALL_DEFAULT_URL;
	}
	$url = lovewall_clean_url( $value );
	if ( '' === $url ) {
		add_settings_error( 'lovewall_app_url', 'lovewall_app_url', __( 'Enter a web address like https://lovewall.tech.', 'lovewall' ) );
		return lovewall_app_url();
	}
	return $url;
}

/**
 * Widget IDs are letters and digits only.
 *
 * @param mixed $id Raw ID.
 * @return string
 */
function lovewall_widget_id( $id ) {
	return (string) preg_replace( '/[^A-Za-z0-9]/', '', (string) $id );
}

/**
 * The embed: a placeholder div that embed.js turns into the widget. Loads embed.js only on pages that use it.
 *
 * @param mixed $id Widget ID.
 * @return string
 */
function lovewall_render( $id ) {
	$id = lovewall_widget_id( $id );
	if ( '' === $id ) {
		return '';
	}
	wp_enqueue_script( 'lovewall-embed' );
	return '<div data-lovewall="' . esc_attr( $id ) . '"></div>';
}

/**
 * [lovewall id="WIDGET_ID"]
 *
 * @param array|string $atts Shortcode attributes.
 * @return string
 */
function lovewall_shortcode( $atts ) {
	$atts = shortcode_atts( array( 'id' => '' ), $atts, 'lovewall' );
	return lovewall_render( $atts['id'] );
}

/**
 * The "Lovewall" block, rendered on the server like the shortcode.
 *
 * @param array $attributes Block attributes.
 * @return string
 */
function lovewall_render_block( $attributes ) {
	$html = lovewall_render( isset( $attributes['widgetId'] ) ? $attributes['widgetId'] : '' );
	return '' === $html ? '' : '<div ' . get_block_wrapper_attributes() . '>' . $html . '</div>';
}

/**
 * Registers the embed script (enqueued on demand), the shortcode and the block.
 */
function lovewall_init() {
	wp_register_script(
		'lovewall-embed',
		lovewall_app_url() . '/embed.js',
		array(),
		LOVEWALL_VERSION,
		array(
			'strategy'  => 'defer',
			'in_footer' => true,
		)
	);
	add_shortcode( 'lovewall', 'lovewall_shortcode' );
	register_block_type( __DIR__ . '/block', array( 'render_callback' => 'lovewall_render_block' ) );
}
add_action( 'init', 'lovewall_init' );

/**
 * Settings → Lovewall: the app URL.
 */
function lovewall_admin_init() {
	register_setting(
		'lovewall',
		'lovewall_app_url',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'lovewall_sanitize_app_url',
			'default'           => LOVEWALL_DEFAULT_URL,
			'show_in_rest'      => false,
		)
	);
}
add_action( 'admin_init', 'lovewall_admin_init' );

/**
 * Adds the settings page.
 */
function lovewall_admin_menu() {
	add_options_page( __( 'Lovewall', 'lovewall' ), __( 'Lovewall', 'lovewall' ), 'manage_options', 'lovewall', 'lovewall_settings_page' );
}
add_action( 'admin_menu', 'lovewall_admin_menu' );

/**
 * A "Settings" link on the Plugins screen.
 *
 * @param array $links Action links.
 * @return array
 */
function lovewall_action_links( $links ) {
	$url = admin_url( 'options-general.php?page=lovewall' );
	array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'lovewall' ) . '</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'lovewall_action_links' );

/**
 * Renders Settings → Lovewall.
 */
function lovewall_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
		<form action="<?php echo esc_url( admin_url( 'options.php' ) ); ?>" method="post">
			<?php settings_fields( 'lovewall' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="lovewall_app_url"><?php esc_html_e( 'App URL', 'lovewall' ); ?></label></th>
					<td>
						<input name="lovewall_app_url" id="lovewall_app_url" type="url" class="regular-text code" value="<?php echo esc_attr( lovewall_app_url() ); ?>" />
						<p class="description"><?php esc_html_e( 'Keep https://lovewall.tech unless you host Lovewall yourself.', 'lovewall' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<h2><?php esc_html_e( 'Use', 'lovewall' ); ?></h2>
		<p>
			<?php esc_html_e( 'Add the Lovewall block, or this shortcode with the ID from Widgets in Lovewall:', 'lovewall' ); ?>
			<code>[lovewall id="WIDGET_ID"]</code>
		</p>
	</div>
	<?php
}
