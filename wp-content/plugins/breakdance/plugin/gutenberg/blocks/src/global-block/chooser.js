/* global breakdanceGlobalBlock */

const { SelectControl } = wp.components;
const name = window.breakdanceConfig.strings.globalBlock;

function getBlocks() {
	const emptyItem = {
		label: `– Select a ${name} –`,
		value: '',
	};

	const blocks = breakdanceGlobalBlock.blocks
		.map( ( block ) => ( {
			label: block.post_title,
			value: block.ID,
		} ) );

	return [ emptyItem, ...blocks ];
}

export default function BlockChooser( props ) {
	const blocks = getBlocks();

	return (
		<div className="breakdance-global-block-chooser">
			<SelectControl
				label={name}
				onChange={ props.setBlockId }
				value={ props.blockId }
				options={ blocks }
			/>
		</div>
	);
}
