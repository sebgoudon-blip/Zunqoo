<?php
/**
 * Plugin Name: Avis Fidelio – Publication par Claude
 * Description: Ajoute au connecteur MCP les fonctions « publier un article » et « lister les articles », réservées aux comptes autorisés à publier.
 * Version: 1.0.0
 * Requires at least: 6.9
 * Requires PHP: 7.4
 * Author: Sébastien Goudon
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'wp_abilities_api_categories_init', function () {
	wp_register_ability_category( 'avis-fidelio', array(
		'label'       => 'Avis Fidelio',
		'description' => 'Publication des articles du blog.',
	) );
} );

add_action( 'wp_abilities_api_init', function () {
	$meta = array(
		'show_in_rest' => true,
		'mcp'          => array( 'public' => true ),
	);

	wp_register_ability( 'avis-fidelio/publish-post', array(
		'label'               => 'Publier un article',
		'description'         => 'Crée un article de blog (publié ou brouillon), ou met à jour un article existant si post_id est fourni. Renseigne aussi la méta description et le mot-clé principal Rank Math.',
		'category'            => 'avis-fidelio',
		'input_schema'        => array(
			'type'       => 'object',
			'required'   => array( 'title', 'content' ),
			'properties' => array(
				'post_id'       => array( 'type' => 'integer', 'description' => 'ID d’un article existant à mettre à jour.' ),
				'title'         => array( 'type' => 'string' ),
				'content'       => array( 'type' => 'string', 'description' => 'Contenu HTML.' ),
				'excerpt'       => array( 'type' => 'string' ),
				'slug'          => array( 'type' => 'string' ),
				'status'        => array( 'type' => 'string', 'enum' => array( 'publish', 'draft' ), 'default' => 'publish' ),
				'categories'    => array( 'type' => 'array', 'items' => array( 'type' => 'string' ), 'description' => 'Noms de catégories (créées si absentes).' ),
				'tags'          => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ),
				'focus_keyword' => array( 'type' => 'string', 'description' => 'Mot-clé principal Rank Math.' ),
				'seo_description' => array( 'type' => 'string', 'description' => 'Méta description Rank Math.' ),
			),
		),
		'output_schema'       => array(
			'type'       => 'object',
			'properties' => array(
				'id'     => array( 'type' => 'integer' ),
				'link'   => array( 'type' => 'string' ),
				'status' => array( 'type' => 'string' ),
			),
		),
		'permission_callback' => function () {
			return current_user_can( 'publish_posts' );
		},
		'execute_callback'    => 'avis_fidelio_publish_post',
		'meta'                => $meta,
	) );

	wp_register_ability( 'avis-fidelio/list-posts', array(
		'label'               => 'Lister les articles',
		'description'         => 'Renvoie les derniers articles (titre, lien, date, statut) pour éviter les doublons.',
		'category'            => 'avis-fidelio',
		'input_schema'        => array(
			'type'       => 'object',
			'properties' => array(
				'limit' => array( 'type' => 'integer', 'default' => 20 ),
			),
		),
		'output_schema'       => array(
			'type'  => 'array',
			'items' => array( 'type' => 'object' ),
		),
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
		'execute_callback'    => function ( $input = array() ) {
			$posts = get_posts( array(
				'post_status'    => array( 'publish', 'draft', 'future' ),
				'posts_per_page' => min( 100, max( 1, (int) ( $input['limit'] ?? 20 ) ) ),
			) );
			return array_map( function ( $p ) {
				return array(
					'id'     => $p->ID,
					'title'  => get_the_title( $p ),
					'link'   => get_permalink( $p ),
					'date'   => $p->post_date,
					'status' => $p->post_status,
				);
			}, $posts );
		},
		'meta'                => $meta,
	) );
} );

function avis_fidelio_publish_post( $input ) {
	$post = array(
		'post_type'    => 'post',
		'post_title'   => sanitize_text_field( $input['title'] ),
		'post_content' => wp_kses_post( $input['content'] ),
		'post_excerpt' => sanitize_textarea_field( $input['excerpt'] ?? '' ),
		'post_status'  => ( $input['status'] ?? 'publish' ) === 'draft' ? 'draft' : 'publish',
	);
	if ( ! empty( $input['slug'] ) ) {
		$post['post_name'] = sanitize_title( $input['slug'] );
	}
	if ( ! empty( $input['post_id'] ) ) {
		if ( ! current_user_can( 'edit_post', (int) $input['post_id'] ) ) {
			return new WP_Error( 'forbidden', 'Modification de cet article non autorisée.' );
		}
		$post['ID'] = (int) $input['post_id'];
		$id         = wp_update_post( $post, true );
	} else {
		$post['post_author'] = get_current_user_id();
		$id                  = wp_insert_post( $post, true );
	}
	if ( is_wp_error( $id ) ) {
		return $id;
	}

	if ( ! empty( $input['categories'] ) ) {
		$cat_ids = array();
		foreach ( $input['categories'] as $name ) {
			$term = term_exists( $name, 'category' ) ?: wp_insert_term( $name, 'category' );
			if ( ! is_wp_error( $term ) ) {
				$cat_ids[] = (int) $term['term_id'];
			}
		}
		wp_set_post_categories( $id, $cat_ids );
	}
	if ( ! empty( $input['tags'] ) ) {
		wp_set_post_tags( $id, array_map( 'sanitize_text_field', $input['tags'] ) );
	}
	if ( ! empty( $input['focus_keyword'] ) ) {
		update_post_meta( $id, 'rank_math_focus_keyword', sanitize_text_field( $input['focus_keyword'] ) );
	}
	if ( ! empty( $input['seo_description'] ) ) {
		update_post_meta( $id, 'rank_math_description', sanitize_textarea_field( $input['seo_description'] ) );
	}

	return array(
		'id'     => $id,
		'link'   => get_permalink( $id ),
		'status' => get_post_status( $id ),
	);
}
