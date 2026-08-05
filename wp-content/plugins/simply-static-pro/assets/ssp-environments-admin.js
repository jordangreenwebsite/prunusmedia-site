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
	const TextControl = components.TextControl;

	let mounted = false;
	let modalRoot = null;
	let modalRenderer = null;
	let placementObserver = null;
	let selectedEnvironmentSelect = null;
	let previouslyFocused = null;
	let environmentsLoaded = false;

	const state = {
		environments: {},
		currentEnvironment: '',
		selectedVersion: '',
		draftTitle: '',
		isModalOpen: false,
		isSaving: false,
		message: '',
		messageType: '',
	};

	function normalizeEnvironments( environments ) {
		const normalized = {};

		if ( Array.isArray( environments ) ) {
			environments.forEach( ( environment ) => {
				if ( environment && environment.value ) {
					normalized[ environment.value ] = environment.label || environment.value;
				}
			} );

			return normalized;
		}

		Object.keys( environments || {} ).forEach( ( version ) => {
			normalized[ version ] = environments[ version ];
		} );

		return normalized;
	}

	function ensureModalRoot() {
		if ( modalRoot ) {
			return modalRoot;
		}

		modalRoot = document.createElement( 'div' );
		modalRoot.className = 'ssp-environment-rename__modal-root';
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
			state.isModalOpen ? createElement( RenameEnvironmentModal ) : null,
			ensureModalRoot()
		);
	}

	function setModalMessage( message, type ) {
		state.message = message || '';
		state.messageType = type || '';
	}

	function getEnvironmentContainer() {
		return document.querySelector( '.environment-container' );
	}

	function getEnvironmentSelect( environmentContainer ) {
		const selects = environmentContainer ? environmentContainer.querySelectorAll( 'select' ) : [];

		return selects.length ? selects[ selects.length - 1 ] : null;
	}

	function getSelectedVersion() {
		if ( selectedEnvironmentSelect && selectedEnvironmentSelect.value ) {
			return selectedEnvironmentSelect.value;
		}

		if ( state.currentEnvironment ) {
			return state.currentEnvironment;
		}

		return Object.keys( state.environments )[0] || '';
	}

	function getSelectedLabel() {
		const version = getSelectedVersion();

		if ( version && state.environments[ version ] ) {
			return state.environments[ version ];
		}

		if ( selectedEnvironmentSelect && selectedEnvironmentSelect.selectedOptions.length ) {
			return selectedEnvironmentSelect.selectedOptions[0].textContent.trim();
		}

		return version;
	}

	function updateVisibleEnvironmentLabels( response ) {
		const environments = normalizeEnvironments( response.environments || {} );

		state.environments = environments;
		state.currentEnvironment = response.current_environment || state.currentEnvironment;

		document.querySelectorAll( '.environment-container select option' ).forEach( ( option ) => {
			if ( environments[ option.value ] ) {
				option.textContent = environments[ option.value ];
			}
		} );

		if ( window.ssWidget && Array.isArray( window.ssWidget.environments ) ) {
			window.ssWidget.environments = window.ssWidget.environments.map( ( environment ) => {
				if ( environment && environments[ environment.value ] ) {
					return Object.assign( {}, environment, { label: environments[ environment.value ] } );
				}

				return environment;
			} );
		}

		if ( window.CustomEvent ) {
			document.dispatchEvent( new CustomEvent( 'ssp:environments-updated', { detail: response } ) );
		}
	}

	function loadEnvironments() {
		if ( environmentsLoaded ) {
			return;
		}

		environmentsLoaded = true;

		apiFetch( { path: '/simplystatic/v1/environment' } ).then( ( response ) => {
			state.environments = normalizeEnvironments( response.environments || {} );
			state.currentEnvironment = response.current_environment || '';
		} ).catch( () => {
			environmentsLoaded = false;
		} );
	}

	function openModal() {
		const version = getSelectedVersion();

		if ( ! version ) {
			return;
		}

		previouslyFocused = document.activeElement;
		state.selectedVersion = version;
		state.draftTitle = getSelectedLabel();
		state.isModalOpen = true;
		state.isSaving = false;
		setModalMessage( '', '' );
		renderModal();
	}

	function closeModal() {
		state.isModalOpen = false;
		state.draftTitle = '';
		setModalMessage( '', '' );
		renderModal();

		if ( previouslyFocused && typeof previouslyFocused.focus === 'function' ) {
			previouslyFocused.focus();
		}
	}

	function updateDraftTitle( value ) {
		state.draftTitle = value;
		setModalMessage( '', '' );
		renderModal();
	}

	function saveRename() {
		const title = String( state.draftTitle || '' ).trim();

		if ( state.isSaving ) {
			return;
		}

		if ( ! title ) {
			setModalMessage( __( 'Name is required', 'simply-static-pro' ), 'error' );
			renderModal();
			return;
		}

		state.isSaving = true;
		setModalMessage( __( 'Saving...', 'simply-static-pro' ), '' );
		renderModal();

		apiFetch( {
			path: '/simplystatic/v1/environment/rename',
			method: 'PUT',
			data: {
				version: state.selectedVersion,
				title,
			},
		} ).then( ( response ) => {
			updateVisibleEnvironmentLabels( response );
			closeModal();
		} ).catch( ( error ) => {
			state.isSaving = false;
			setModalMessage( error && error.message ? error.message : __( 'Could not rename environment.', 'simply-static-pro' ), 'error' );
			renderModal();
		} );
	}

	function renderTitleControl() {
		if ( TextControl ) {
			return createElement(
				TextControl,
				{
					disabled: state.isSaving,
					label: __( 'Environment name', 'simply-static-pro' ),
					onChange: updateDraftTitle,
					value: state.draftTitle,
				}
			);
		}

		return createElement(
			'label',
			{ className: 'ssp-environment-rename__native-label' },
			__( 'Environment name', 'simply-static-pro' ),
			createElement( 'input', {
				className: 'ssp-environment-rename__input',
				disabled: state.isSaving,
				onChange: ( event ) => updateDraftTitle( event.target.value ),
				type: 'text',
				value: state.draftTitle,
			} )
		);
	}

	function RenameEnvironmentModal() {
		const messageClassName = `ssp-environment-rename__message${ state.messageType ? ` ssp-environment-rename__message--${ state.messageType }` : '' }`;

		return createElement(
			Modal,
			{
				className: 'ssp-environment-rename__modal',
				onRequestClose: closeModal,
				shouldCloseOnClickOutside: true,
				title: __( 'Rename environment', 'simply-static-pro' ),
			},
			createElement(
				'form',
				{
					onSubmit: ( event ) => {
						event.preventDefault();
						saveRename();
					},
				},
				createElement(
					'p',
					{ className: 'ssp-environment-rename__description' },
					__( 'Only the visible name changes. The environment ID and deployment settings stay the same.', 'simply-static-pro' )
				),
				renderTitleControl(),
				createElement(
					'div',
					{ className: 'ssp-environment-rename__footer' },
					createElement(
						'span',
						{ className: messageClassName },
						state.message
					),
					createElement(
						'div',
						{ className: 'ssp-environment-rename__actions' },
						createElement(
							Button,
							{
								disabled: state.isSaving,
								isSecondary: true,
								onClick: closeModal,
								type: 'button',
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
								type: 'submit',
								variant: 'primary',
							},
							__( 'Save name', 'simply-static-pro' )
						)
					)
				)
			)
		);
	}

	function createRenameButton() {
		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'ssp-environment-rename__button';
		button.title = __( 'Rename environment', 'simply-static-pro' );
		button.setAttribute( 'aria-label', __( 'Rename environment', 'simply-static-pro' ) );

		const icon = document.createElement( 'span' );
		icon.className = 'dashicons dashicons-edit';
		icon.setAttribute( 'aria-hidden', 'true' );

		const text = document.createElement( 'span' );
		text.className = 'screen-reader-text';
		text.textContent = __( 'Rename environment', 'simply-static-pro' );

		button.appendChild( icon );
		button.appendChild( text );
		button.addEventListener( 'click', openModal );

		return button;
	}

	function getExistingRenameButton( environmentContainer ) {
		const pluginNav = environmentContainer.closest( '.plugin-nav' ) || document.querySelector( '.plugin-nav' );

		return environmentContainer.querySelector( '.ssp-environment-rename__button' ) ||
			( pluginNav ? pluginNav.querySelector( '.ssp-environment-rename__button' ) : null );
	}

	function getActionAnchor( environmentContainer ) {
		const pluginNav = environmentContainer.closest( '.plugin-nav' ) || document.querySelector( '.plugin-nav' );
		const deleteButton = pluginNav ? pluginNav.querySelector( '.environment-delete-button' ) : null;

		if ( deleteButton ) {
			return {
				insert: ( button ) => deleteButton.insertAdjacentElement( 'beforebegin', button ),
				target: deleteButton,
			};
		}

		const select = getEnvironmentSelect( environmentContainer );
		const baseControl = select ? select.closest( '.components-base-control' ) || select.parentElement : null;

		if ( baseControl && baseControl.parentElement ) {
			return {
				insert: ( button ) => {
					let row = environmentContainer.querySelector( '.ssp-environment-rename__row' );

					if ( ! row ) {
						row = document.createElement( 'div' );
						row.className = 'ssp-environment-rename__row';
						baseControl.insertAdjacentElement( 'afterend', row );
					}

					row.appendChild( button );
				},
				target: baseControl,
			};
		}

		return null;
	}

	function placeButton( environmentContainer, button ) {
		const anchor = getActionAnchor( environmentContainer );

		if ( ! anchor ) {
			return false;
		}

		anchor.insert( button );

		return true;
	}

	function mount() {
		const environmentContainer = getEnvironmentContainer();
		selectedEnvironmentSelect = getEnvironmentSelect( environmentContainer );

		if ( ! environmentContainer || ! selectedEnvironmentSelect ) {
			return false;
		}

		if ( getExistingRenameButton( environmentContainer ) ) {
			mounted = true;
			loadEnvironments();
			return true;
		}

		const button = createRenameButton();

		if ( ! placeButton( environmentContainer, button ) ) {
			return false;
		}

		if ( selectedEnvironmentSelect.dataset.sspEnvironmentRenameBound !== '1' ) {
			selectedEnvironmentSelect.addEventListener( 'change', () => {
				state.currentEnvironment = selectedEnvironmentSelect.value || state.currentEnvironment;
			} );
			selectedEnvironmentSelect.dataset.sspEnvironmentRenameBound = '1';
		}

		mounted = true;
		loadEnvironments();

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

	mount();
	observePlacement();
}() );
