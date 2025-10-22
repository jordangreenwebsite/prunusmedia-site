(function () {
  const breakdanceData = window.breakdanceAdminbar || {};
  const blocks = breakdanceData.blocksInPage || {};
  const container = document.getElementById("wp-admin-bar-breakdance_global_blocks-default");
  const menu = document.getElementById("wp-admin-bar-breakdance_global_blocks");
  const templateItem = document.getElementById("wp-admin-bar-breakdance_global_block_%%block_id%%");

  if (!container) return;

  Object.keys(blocks).forEach(blockId => {
    const blockTitle = blocks[blockId];
    const blockMenuItem = templateItem.cloneNode(true);
    blockMenuItem.id = `wp-admin-bar-breakdance_global_block_${blockId}`;

    const link = blockMenuItem.querySelector(".ab-item");
    const currentLink = link.getAttribute("href");
    link.innerText = blockTitle;

    link.setAttribute(
      "href",
      currentLink.replace("%%block_id%%", blockId)
    );

    container.appendChild(blockMenuItem);
  });

  if (!Object.keys(blocks).length) {
    container.remove();
    menu.remove();
  }

  // Hide the template item
  templateItem.remove();
}());
