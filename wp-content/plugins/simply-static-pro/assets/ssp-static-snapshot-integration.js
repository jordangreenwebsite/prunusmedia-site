( function () {
	'use strict';

	const config = window.sspStaticSnapshotIntegration;
	const settingsRoot = document.getElementById( 'simplystatic-settings' );

	if ( ! config || ! settingsRoot ) {
		return;
	}

	let updateQueued = false;

	function updateSnapshotRow() {
		updateQueued = false;

		const integrations = window.options && window.options.integrations;
		const integration = integrations && integrations[ config.integrationId ];
		if ( ! integration || ! integration.name ) {
			return;
		}

		const expectedName = String( integration.name ).trim();
		const rows = settingsRoot.querySelectorAll( '.ss-integration' );

		for ( const row of rows ) {
			const heading = row.querySelector( 'strong' );
			if ( ! heading || heading.textContent.trim() !== expectedName ) {
				continue;
			}

			const actions = row.querySelector( '.ss-align-right' );
			if ( ! actions || actions.querySelector( '.ssp-static-studio-upsell' ) ) {
				return;
			}

			const button = document.createElement( 'a' );
			button.className = 'components-button is-primary ssp-static-studio-upsell';
			button.href = config.studioUrl;
			button.textContent = config.buttonLabel;

			actions.replaceChildren( button );
			return;
		}
	}

	function queueUpdate() {
		if ( updateQueued ) {
			return;
		}

		updateQueued = true;
		window.requestAnimationFrame( updateSnapshotRow );
	}

	new MutationObserver( queueUpdate ).observe( settingsRoot, {
		childList: true,
		subtree: true,
	} );

	queueUpdate();
}() );
