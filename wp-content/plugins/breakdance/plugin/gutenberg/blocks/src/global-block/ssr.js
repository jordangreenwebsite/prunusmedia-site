/* global breakdanceGlobalBlock */
const { useState, useEffect } = wp.element;
const { Spinner } = wp.components;

export default function BlockSSR( props ) {
	const { blockPreviewUrl } = breakdanceGlobalBlock;
	const { strings } = breakdanceConfig;
	const iframeUrl = blockPreviewUrl.replace( '%%BLOCKID%%', props.blockId );

	const [ isLoading, setIsLoading ] = useState( true );
	const [ isEmpty, setIsEmpty ] = useState( false );
	const [ iframeHeight, setIframeHeight ] = useState( null );

	useEffect( () => {
		setIsLoading( true );
		setIsEmpty( false );
	}, [ props.blockId ] );

	const onLoad = ( event ) => {
		const iframeDocument = event.target.contentDocument.documentElement;
		const height = iframeDocument.scrollHeight;

		// Check if a .section-container exists, otherwise show an "empty" message.
		const hasChildren = iframeDocument.querySelector( '.section-container' );

		setIframeHeight( height + 'px' );
		setIsLoading( false );
		setIsEmpty( ! hasChildren );
	};

	const emptyContent = (
		<div className="breakdance-global-block-placeholder">
			The current {strings.globalBlock} is empty.
		</div>
	);

	const loader = (
		<div className="breakdance-global-block-placeholder">
			Loading {strings.globalBlock}
			<Spinner />
		</div>
	);

	let classes = 'breakdance-global-block-ssr';

	if ( isLoading ) {
		classes += ' breakdance-global-block-ssr--loading';
	}

	return (
		<div className={ classes }>
			{ isLoading ? loader : null }

			{ isEmpty ? emptyContent : (
				<iframe
					title={strings.globalBlock}
					className="breakdance-global-block-iframe"
					src={ iframeUrl }
					style={ { height: iframeHeight } }
					ref={ props.iframeRef }
					onLoad={ onLoad }
				/>
			) }
		</div>
	);
}
