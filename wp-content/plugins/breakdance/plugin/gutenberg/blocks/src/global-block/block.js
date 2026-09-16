/**
 * BLOCK: Breakdance Global Block
 *
 * Registering a basic block with Gutenberg.
 * Simple block, renders and saves the same content without any interactivity.
 */

//  Import CSS.
import "./editor.css";

import { __, sprintf } from "@wordpress/i18n";
import { registerBlockType } from "@wordpress/blocks";
import { useCallback, useRef } from "@wordpress/element";
import { useBlockProps } from "@wordpress/block-editor";

import Logo from "../logo";
import Sidebar from "./sidebar";
import BlockSSR from "./ssr";
import BlockChooser from "./chooser";

const { builderName, strings } = breakdanceConfig;

function Edit(props) {
	const { setAttributes, attributes } = props;
	const blockId = attributes.blockId;
	const blockPostTypeUrl = breakdanceGlobalBlock.blockPostTypeUrl;
	const iframe = useRef(null);
	const blockProps = useBlockProps({
		className: blockId ? "" : "breakdance-global-block-picker",
	});

	const setBlockId = (id) => {
		setAttributes({ blockId: id });
	};

	const refreshIframe = useCallback(() => {
		const copyId = blockId;
		setBlockId(-1);

		setTimeout(() => {
			setBlockId(copyId);
		});
	}, [blockId]);

	const blockChooser = (
		<BlockChooser blockId={blockId} setBlockId={setBlockId} />
	);

	const sidebar = (
		<Sidebar blockId={blockId} onRefreshClick={refreshIframe}>
			{blockChooser}
		</Sidebar>
	);

	if (blockId) {
		return (
			<div {...blockProps}>
				<BlockSSR blockId={blockId} iframeRef={iframe} />
				{sidebar}
			</div>
		);
	}

	return (
		<div {...blockProps}>
			<p>
				Choose a {strings.globalBlock} from your library or{" "}
				<a href={blockPostTypeUrl} target="_blank" rel="noreferrer">
					create a new one
				</a>
				.
			</p>

			{blockChooser}
			{sidebar}
		</div>
	);
}

registerBlockType("breakdance/global-block", {
	apiVersion: 3,
	title: `${builderName} ${strings.globalBlocks}`,
	icon: Logo, // Block icon from Dashicons → https://developer.wordpress.org/resource/dashicons/.
	description: sprintf(
		// translators: %1$s: the builder name (Breakdance or Oxygen), %2$s: the "Global Blocks" label.
		__("Add %1$s %2$s to your Gutenberg Page", "breakdance"),
		builderName,
		strings.globalBlocks
	),
	category: "text", // Block category — Group blocks together based on common traits E.g. text, media, design, widgets, embed.
	attributes: {
		blockId: {
			default: "",
			type: "string",
		},
	},
	edit: Edit,
	save: () => {
		return null;
	},
});
