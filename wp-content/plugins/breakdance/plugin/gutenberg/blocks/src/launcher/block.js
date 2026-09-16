/**
 * BLOCK: breakdance-launcher
 *
 * Registering a basic block with Gutenberg.
 * Simple block, renders and saves the same content without any interactivity.
 */

import { __, sprintf } from "@wordpress/i18n";
import { registerBlockType } from "@wordpress/blocks";
import { useEffect } from "@wordpress/element";
import { useBlockProps } from "@wordpress/block-editor";
import { useDispatch } from "@wordpress/data";
import Logo from "../logo";

const { builderName } = window.breakdanceConfig;

function Edit(props) {
	const { strings } = breakdanceConfig;
	const { removeBlock } = useDispatch("core/block-editor");
	const blockProps = useBlockProps({
		className: builderName.toLowerCase() === "oxygen" ? "oxygen-mode" : "",
	});

	useEffect(() => {
		breakdanceUtils.enableGutenbergReadOnlyModeIfLauncherIsPresent();
	}, []);

	const editWithBreakdance = (event) => {
		const newTab = breakdanceUtils.isAuxClick(event);

		breakdanceUtils.autogenerateTitleIfNotSet().saveGutenberg(() => {
			breakdanceUtils.redirectToBuilder(newTab);
		});
	};

	const remove = () => {
		breakdanceUtils.disableGutenbergReadOnlyMode();
		removeBlock(props.clientId);
	};

	const disableBreakdance = () => {
		if (breakdanceConfig.mode === "wordpress") {
			return remove();
		}

		breakdanceUtils.disableAndExtractContent(remove);
	};

	return (
		<div {...blockProps}>
			<div className="breakdance-launcher">
				<p className="breakdance-launcher__description">
					{strings.description}
				</p>

				<div className="breakdance-launcher__buttons">
					{breakdanceConfig.hasEditAccess ? (
						<button
							className="breakdance-launcher-button"
							data-test-id="launcher-edit"
							type="button"
							onClick={editWithBreakdance}
						>
							{strings.openButton}
						</button>
					) : null}
					{breakdanceConfig.canUseDefaultEditor ? (
						<button
							className="breakdance-launcher-link"
							data-test-id="launcher-disable"
							type="button"
							onClick={disableBreakdance}
						>
							{strings.disableButton}
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}

registerBlockType("breakdance/block-breakdance-launcher", {
	apiVersion: 3,
	// translators: %s: the builder name (Breakdance or Oxygen).
	title: sprintf(__("%s Launcher", "breakdance"), builderName),
	icon: Logo,
	category: "text",
	supports: {
		multiple: false,
		html: false,
		customClassName: false,
		reusable: false,
		inserter: false,
	},
	edit: Edit,
	save: () => {
		return null;
	},
});
