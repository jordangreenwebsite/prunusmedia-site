import { useState, useEffect, useRef } from "@wordpress/element";
import { Spinner } from "@wordpress/components";

export default function BlockSSR( props ) {
	const { blockPreviewUrl } = breakdanceGlobalBlock;
	const { strings } = breakdanceConfig;
	const iframeUrl = blockPreviewUrl.replace( '%%BLOCKID%%', props.blockId );

	const [ isLoading, setIsLoading ] = useState( true );
	const [ isEmpty, setIsEmpty ] = useState( false );
	const [ iframeHeight, setIframeHeight ] = useState( null );
	const hasReportedSize = useRef( false );

	useEffect( () => {
		setIsLoading( true );
		setIsEmpty( false );
		hasReportedSize.current = false;
	}, [ props.blockId ] );

	useEffect( () => {
		const onMessage = ( event ) => {
			const data = event.data;

			if ( ! data || data.type !== 'breakdance-global-block-preview' ) {
				return;
			}

			const iframe = props.iframeRef.current;

			if ( ! iframe || event.source !== iframe.contentWindow ) {
				return;
			}

			hasReportedSize.current = true;
			setIframeHeight( data.height + 'px' );
			setIsLoading( false );
			setIsEmpty( !! data.isEmpty );
		};

		window.addEventListener( 'message', onMessage );

		return () => window.removeEventListener( 'message', onMessage );
	}, [ props.iframeRef ] );

	const onLoad = ( event ) => {
		const iframeDocument = event.target.contentDocument;

		if ( ! iframeDocument ) {
			if ( ! hasReportedSize.current ) {
				setIframeHeight( '500px' );
			}
			setIsLoading( false );
			return;
		}

		const height = iframeDocument.documentElement.scrollHeight;
		const hasChildren = ! iframeDocument.body.classList.contains( 'is-breakdance-block-empty' );

		setIframeHeight( height + 'px' );
		setIsLoading( false );
		setIsEmpty( ! hasChildren );
	};

	const emptyContent = (
		<div className="breakdance-global-block-placeholder">
			The current {strings.globalBlock.toLowerCase()} is empty.
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
