<?php
/**
 * Removes the plugin's one setting.
 *
 * @package Lovewall
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'lovewall_app_url' );
