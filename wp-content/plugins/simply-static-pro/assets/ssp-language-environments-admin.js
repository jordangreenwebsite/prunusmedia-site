( function () {
	const wp = window.wp || {};
	const apiFetch = wp.apiFetch;
	const components = wp.components;
	const element = wp.element;

	if ( ! apiFetch || ! components || ! element || ! element.createElement || ! ( element.createRoot || element.render ) || ! components.Button || ! components.Modal ) {
		return;
	}

	const __ = wp.i18n && wp.i18n.__ ? wp.i18n.__ : ( text ) => text;
	const createElement = element.createElement;
	const Button = components.Button;
	const Modal = components.Modal;
	let mounted = false;
	let modalRoot = null;
	let modalRenderer = null;
	let placementObserver = null;
	let triggerContainer = null;
	let previouslyFocused = null;

	const state = {
		languages: [],
		environments: [],
		mappings: {},
		draftMappings: {},
		isModalOpen: false,
		isSaving: false,
		message: '',
		messageType: '',
	};

	function optionLabel( environment ) {
		if ( ! environment.destination_url ) {
			return environment.label;
		}

		return `${ environment.label } - ${ environment.destination_url }`;
	}

	function escapeHtml( value ) {
		return String( value || '' )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	function getMappingsCopy( mappings ) {
		return Object.assign( {}, mappings || {} );
	}

	function ensureModalRoot() {
		if ( modalRoot ) {
			return modalRoot;
		}

		modalRoot = document.createElement( 'div' );
		modalRoot.className = 'ssp-language-environments__modal-root';
		document.body.appendChild( modalRoot );

		return modalRoot;
	}

	function renderElement( component, container ) {
		if ( element.createRoot ) {
			if ( ! modalRenderer ) {
				modalRenderer = element.createRoot( container );
			}

			modalRenderer.render( component );
			return;
		}

		element.render( component, container );
	}

	function renderModal() {
		renderElement(
			state.isModalOpen ? createElement( LanguageEnvironmentsModal ) : null,
			ensureModalRoot()
		);
	}

	function setModalMessage( message, type ) {
		state.message = message || '';
		state.messageType = type || '';
	}

	function updateDraftMapping( language, environment ) {
		if ( ! environment ) {
			delete state.draftMappings[ language ];
		} else {
			state.draftMappings[ language ] = environment;
		}

		setModalMessage( '', '' );
		renderModal();
	}

	function saveMappings() {
		if ( state.isSaving ) {
			return;
		}

		state.isSaving = true;
		setModalMessage( __( 'Saving...', 'simply-static-pro' ), '' );
		renderModal();

		apiFetch( {
			path: '/simplystatic/v1/language-environments',
			method: 'PUT',
			data: { mappings: state.draftMappings },
		} ).then( ( response ) => {
			state.mappings = response.mappings || {};
			state.draftMappings = getMappingsCopy( state.mappings );
			setModalMessage( __( 'Saved.', 'simply-static-pro' ), 'success' );
		} ).catch( ( error ) => {
			setModalMessage( error && error.message ? error.message : __( 'Could not save language domains.', 'simply-static-pro' ), 'error' );
		} ).finally( () => {
			state.isSaving = false;
			renderModal();
		} );
	}

	function openModal() {
		previouslyFocused = document.activeElement;
		state.draftMappings = getMappingsCopy( state.mappings );
		state.isModalOpen = true;
		state.isSaving = false;
		setModalMessage( '', '' );
		renderModal();
	}

	function closeModal() {
		state.isModalOpen = false;
		state.draftMappings = getMappingsCopy( state.mappings );
		setModalMessage( '', '' );
		renderModal();

		if ( previouslyFocused && typeof previouslyFocused.focus === 'function' ) {
			previouslyFocused.focus();
		}
	}

	function shouldAutoOpenModal() {
		try {
			return new URLSearchParams( window.location.search ).get( 'ssp-map-language-environments' ) === '1';
		} catch ( error ) {
			return window.location.search.indexOf( 'ssp-map-language-environments=1' ) !== -1;
		}
	}

	function LanguageEnvironmentsModal() {
		const messageClassName = `ssp-language-environments__message${ state.messageType ? ` ssp-language-environments__message--${ state.messageType }` : '' }`;

		return createElement(
			Modal,
			{
				className: 'ssp-language-environments__modal',
				onRequestClose: closeModal,
				shouldCloseOnClickOutside: true,
				title: __( 'Map languages to environments', 'simply-static-pro' ),
			},
			createElement(
				'p',
				{ className: 'ssp-language-environments__description' },
				__( 'Connect each export language to the environment that owns its destination domain.', 'simply-static-pro' )
			),
			createElement(
				'div',
				{ className: 'ssp-language-environments__rows' },
				state.languages.map( renderMappingRow )
			),
			createElement(
				'div',
				{ className: 'ssp-language-environments__footer' },
				createElement(
					'span',
					{ className: messageClassName },
					state.message
				),
				createElement(
					'div',
					{ className: 'ssp-language-environments__actions' },
					createElement(
						Button,
						{
							disabled: state.isSaving,
							isSecondary: true,
							onClick: closeModal,
							variant: 'secondary',
						},
						__( 'Cancel', 'simply-static-pro' )
					),
					createElement(
						Button,
						{
							disabled: state.isSaving,
							isBusy: state.isSaving,
							isPrimary: true,
							onClick: saveMappings,
							variant: 'primary',
						},
						__( 'Save language domains', 'simply-static-pro' )
					)
				)
			)
		);
	}

	function renderMappingRow( language ) {
		const value = language.value || '';
		const label = language.label || value;
		const selected = state.draftMappings[ value ] || '';
		const fieldId = `ssp-language-env-${ value.replace( /[^a-zA-Z0-9_-]/g, '-' ) }`;

		return createElement(
			'div',
			{ className: 'ssp-language-environments__row', key: value },
			createElement(
				'label',
				{ className: 'ssp-language-environments__label', htmlFor: fieldId },
				label
			),
			createElement(
				'select',
				{
					className: 'ssp-language-environments__select',
					disabled: state.isSaving,
					id: fieldId,
					onChange: ( event ) => updateDraftMapping( value, event.target.value ),
					value: selected,
				},
				createElement(
					'option',
					{ value: '' },
					__( 'No environment', 'simply-static-pro' )
				),
				state.environments.map( ( environment ) => {
					const envValue = environment.value || '';

					return createElement(
						'option',
						{ key: envValue, value: envValue },
						optionLabel( environment )
					);
				} )
			)
		);
	}

	function renderTrigger( container ) {
		if ( ! state.languages.length || ! state.environments.length ) {
			container.style.display = 'none';
			return;
		}

		container.style.display = '';
		container.innerHTML = `<button type="button" class="ssp-language-environments__trigger">${ escapeHtml( __( 'Want to map your languages to environments?', 'simply-static-pro' ) ) }</button>`;

		container.querySelector( '.ssp-language-environments__trigger' ).addEventListener( 'click', openModal );
	}

	function loadLanguageEnvironments( container, autoOpenModal = false ) {
		apiFetch( { path: '/simplystatic/v1/language-environments' } ).then( ( response ) => {
			state.languages = response.languages || [];
			state.environments = response.environments || [];
			state.mappings = response.mappings || {};
			renderTrigger( container );

			if ( state.isModalOpen ) {
				renderModal();
			}

			if ( autoOpenModal && state.languages.length && state.environments.length ) {
				openModal();
			}
		} ).catch( () => {
			container.style.display = 'none';
		} );
	}

	function getTriggerAnchor( environmentContainer ) {
		const pluginNav = environmentContainer.closest( '.plugin-nav' ) || document.querySelector( '.plugin-nav' );
		const deleteButton = pluginNav ? pluginNav.querySelector( '.environment-delete-button' ) : null;

		if ( deleteButton ) {
			return deleteButton.closest( '.components-flex' ) || deleteButton.parentElement;
		}

		const selects = environmentContainer.querySelectorAll( 'select' );
		const select = selects.length ? selects[ selects.length - 1 ] : null;

		if ( ! select ) {
			return null;
		}

		return select.closest( '.components-base-control' ) || select.parentElement;
	}

	function placeContainer( environmentContainer, container ) {
		const slot = environmentContainer.querySelector( '[data-ss-environment-sidebar-slot]' );

		if ( slot ) {
			if ( container.parentElement !== slot ) {
				slot.appendChild( container );
			}

			return true;
		}

		const anchor = getTriggerAnchor( environmentContainer );

		if ( anchor && anchor.parentElement ) {
			if ( anchor.nextElementSibling !== container ) {
				anchor.insertAdjacentElement( 'afterend', container );
			}

			return true;
		}

		if ( ! container.parentElement ) {
			environmentContainer.appendChild( container );
		}

		return false;
	}

	function insertContainer( environmentContainer, container ) {
		placeContainer( environmentContainer, container );
	}

	function mount() {
		const environmentContainer = document.querySelector( '.environment-container' );

		if ( ! environmentContainer ) {
			return false;
		}

		const shouldLoad = ! mounted;
		const container = triggerContainer || document.createElement( 'div' );

		if ( ! triggerContainer ) {
			container.className = 'ssp-language-environments';
			container.style.display = 'none';
		} else if ( ! container.className ) {
			container.className = 'ssp-language-environments';
		}

		insertContainer( environmentContainer, container );
		triggerContainer = container;
		mounted = true;

		if ( shouldLoad ) {
			loadLanguageEnvironments( container, shouldAutoOpenModal() );
		}

		return true;
	}

	function observePlacement() {
		if ( placementObserver || ! window.MutationObserver ) {
			return;
		}

		placementObserver = new MutationObserver( () => {
			mount();
		} );
		placementObserver.observe( document.body, { childList: true, subtree: true } );
	}

	document.addEventListener( 'ssp:environments-updated', () => {
		if ( triggerContainer ) {
			loadLanguageEnvironments( triggerContainer );
		}
	} );

	mount();
	observePlacement();
}() );
