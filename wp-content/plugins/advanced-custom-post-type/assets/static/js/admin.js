var $ = jQuery.noConflict();

/**
 * Main admin JS
 */
jQuery(function ($) {

    /**
     *
     * @param selector
     * @param context
     * @return {jQuery|HTMLElement}
     */
    function $$(selector, context){
        return jQuery(selector.replace(/(\[|\])/g, '\\$1'),
            context)
    }

    /**
     * ===================================================================
     * HELPERS
     * ===================================================================
     */

    /**
     *
     * @param uuid
     * @return {boolean}
     */
    function isUUID ( uuid ) {
        let s = "" + uuid;

        s = s.match('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
        if (s === null) {
            return false;
        }

        return true;
    }

    /**
     * ===================================================================
     * TRANSLATIONS SECTION
     * ===================================================================
     */

    /**
     *
     * @param string
     * @returns {*}
     */
    const useTranslation = (string) => {

        if(typeof document.adminjs === 'undefined'){
            return string;
        }

        const translations = document.adminjs.translations;

        if(typeof translations === 'undefined'){
            return string;
        }

        if(typeof translations[string] !== 'undefined' && translations[string] !== ''){
            return translations[string]
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                ;
        }

        return string;
    };

    /**
     * Fetch all translations
     *
     * @returns {Promise<Response>}
     */
    const fetchLanguages = () => {

        const baseAjaxUrl = (typeof ajaxurl === 'string') ? ajaxurl : '/wp-admin/admin-ajax.php';

        let formData;
        formData = new FormData();
        formData.append('action', 'languagesAction');

        return fetch(baseAjaxUrl, {
            method: 'POST',
            body: formData
        });
    };

    fetchLanguages()
        .then((response) => response.json())
        .then((translations) => {
            document.adminjs = {
                translations: translations
            };
        })
        .catch((err) => {
            console.error("Something went wrong!", err);
        });

    /**
     * ===================================================================
     * MISC FUNCTIONS SECTION
     * ===================================================================
     */

    /**
     * Option pages
     */
    $('.acpt-toggle-indicator').on('click', function () {
        const target = $(this).data('target');
        $(`#${target}`).toggleClass('closed');
    });

    /**
     * Input range
     */
    $('.acpt-range').on('change', function () {
        const id = $(this).attr('id');
        const value = $(this).val();

        $(`#${id}_value`).text(value);
    });

    /**
     * Add 'multipart/form-data' type to comment form
     */
    if($('#commentform').length){
        $('#commentform')[0].encoding = 'multipart/form-data';
    }


    /**
     * This is a fix for creating a new term with editor fields associated
     *
     * This fix was taken from: https://github.com/sheabunge/visual-term-description-editor/blob/master/src/php/class-editor.php
     */
    $('#addtag').on('mousedown', '#submit', function () {
        if(typeof tinyMCE !== 'undefined'){
            tinyMCE.triggerSave();

            $(document).bind('ajaxSuccess.vtde_add_term', function () {
                if (tinyMCE.activeEditor) {
                    tinyMCE.activeEditor.setContent('');
                }

                $(document).unbind('ajaxSuccess.vtde_add_term', false);
            });
        }
    });

    /**
     * ===================================================================
     * RELATION SELECTOR SECTION
     * ===================================================================
     */

    /**
     * Select item
     */
    $('body').on('click', '.acpt-relation-field-selector .options .value', function(e) {
        e.preventDefault();

        const $this = $(this);
        const id = $this.attr('id');
        const parent = $this.parent();
        const originalId = parent.attr('id').replace("options_", "");
        const maxItems = parent.data('max');
        const targetId = `selected_items_${originalId}`;
        const title = `title_${originalId}`;
        const valuesId = `values_${originalId}`;
        const value = $this.data('value');
        const html = $this.html();

        if(maxItems){
            if($(`#${targetId}`).children().length >= maxItems){
                return;
            }
        }

        let $saveValues = $(`#${valuesId}`).val() ? $(`#${valuesId}`).val().split(',') : [];
        $saveValues.push(value);
        $(`#${valuesId}`).val($saveValues.join(','));

        $(`#${targetId}`).append(`
            <div id="${id}" class="value" data-value="${value}">
                <span class="placeholder">${html}</span> 
                <a class="delete" href="#">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                        <path d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8h2V6h-4V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H3v2h2zM9 4h6v2H9zM8 8h9v12H7V8z"></path><path d="M9 10h2v8H9zm4 0h2v8h-2z"></path>
                    </svg>
                </a>
            </div>
        `);

        // dispatch change event on change
        document.getElementById(valuesId).dispatchEvent(new Event("change"));

        $this.addClass('hidden');
        $this.addClass('selected');
        displayDeleteAllLink($(`#${title}`), originalId);
    });

    /**
     * Deselect item
     */
    $('body').on('click', '.acpt-relation-field-selector .selected-items .delete', function(e) {
        e.preventDefault();

        const $this = $(this);
        const value = $this.parent().data('value');
        const parent = $this.parent().parent();
        const originalId = parent.attr('id').replace("selected_items_", "");
        const valuesId = `values_${originalId}`;
        const title = `title_${originalId}`;

        let $saveValues = $(`#${valuesId}`).val().split(',');

        $saveValues = $saveValues.filter(v => {
            if(isUUID(v)){
                return v !== value;
            }

            return parseInt(v) !== value;
        });

        $(`#${valuesId}`).val($saveValues.join(','));

        // dispatch change event on change
        document.getElementById(valuesId).dispatchEvent(new Event("change"));

        $(`#${$this.parent().attr('id')}`).removeClass('hidden');
        $(`#${$this.parent().attr('id')}`).removeClass('selected');
        $this.parent().remove();
        displayDeleteAllLink($(`#${title}`), originalId);
    });

    /**
     * Delete all items selected
     */
    $('body').on('click', '.acpt-relation-field-selector .delete-all', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const $this = $(this);
        const id = $this.attr('id');

        $(`#selected_items_${id}`).find('.value').each(function () {
            $(this).remove();
        });

        $(`#options_${id}`).find('.value').each(function () {
            $(this).removeClass("hidden")
            $(this).removeClass("selected")
        });

        $(`#values_${id}`).val('');

        // dispatch change event on change
        document.getElementById(`values_${id}`).dispatchEvent(new Event("change"));

        $this.remove();
    });

    /**
     * Search items
     */
    $('body').on('keyup', '.acpt-relation-field-selector .acpt-form-control', function() {
        const $this = $(this);
        const value = $this.val();
        const originalId = $this.attr('id').replace("search_", "");

        $(`#options_${originalId}`).find('.value').each(function () {
            const expression = `.*${value}.*`;
            const re = new RegExp(expression, 'gi');

            if(!$(this).hasClass('selected')){
                if(re.test($(this).text())){
                    $(this).removeClass("hidden")
                } else {
                    $(this).addClass("hidden")
                }
            }
        });
    });

    /**
     * Display delete all link
     * @param element
     * @param id
     */
    const displayDeleteAllLink = (element, id) => {
        if($(`#selected_items_${id}`).children().length === 0){
            $(`#${id}`).remove();
        } else if(element.find(".delete-all").length === 0){
            element.append(`<a href="#" id="${id}" class="delete-all">${useTranslation("Delete all")}</a>`);
        }
    };

    /**
     * ===================================================================
     * SORTABLE SECTION
     * ===================================================================
     */

    /**
     * Sortable functions
     * @see https://github.com/lukasoppermann/html5sortable
     */
    const initSortable = () => {
        try {
            if(typeof sortable !== 'undefined'){

                // gallery
                if($('.gallery-preview').length){

                    sortable('.gallery-preview', {
                        acceptFrom: '.gallery-preview',
                        forcePlaceholderSize: true,
                        items: '.image',
                        hoverClass: 'hover',
                        copy: false
                    });

                    // sortable gallery items feature
                    $('.gallery-preview').each(function(index) {
                        sortable('.gallery-preview')[index].addEventListener('sortupdate', function(e) {

                            const sortedItems = e.detail.destination.items;
                            let sortedIndexArray = [];

                            sortedItems.map((sortedItem)=>{
                                sortedIndexArray.push($(sortedItem).data('index'));
                            });

                            const $imageWrapper = $(this);
                            const $target = $imageWrapper.data('target');
                            const $placeholder = $('#'+$target+'_copy');
                            const $placeholderIds = $('#'+$target+'_id'); // @TODO update it !!!!!!
                            const $inputWrapper = $placeholder.next( '.inputs-wrapper' );

                            // update input readonly && update input hidden
                            const $savedIds = $placeholderIds.val().split(',');
                            const $savedValues = $placeholder.val().split(',');
                            const $savedInputs = $inputWrapper.children('input');

                            let $sortedIds = [];
                            let $sortedValues = [];
                            let $sortedInputs = [];

                            sortedIndexArray.map((sortedIndex) => {
                                $sortedIds.push($savedIds[sortedIndex]);
                                $sortedValues.push($savedValues[sortedIndex]);
                                $savedInputs.each(function () {
                                    if($(this).data('index') === sortedIndex){
                                        $sortedInputs.push($(this));
                                    }
                                });
                            });

                            $placeholderIds.val($sortedIds.join(','));
                            $placeholder.val($sortedValues.join(','));
                            $inputWrapper.html($sortedInputs);
                        });
                    });

                    sortable('.gallery-preview', 'reload');
                }

                // repeater fields
                if($('.acpt-sortable').length > 0){

                    $('.acpt-sortable').each(function() {

                        const elementId = $(this).attr('id');
                        const id = elementId.replace("acpt-sortable-", "");

                        sortable(`#${elementId}`, {
                            acceptFrom: `#${elementId}`,
                            forcePlaceholderSize: true,
                            items: `.sortable-li-${id}`,
                            handle: '.handle',
                            hoverClass: 'hover',
                            copy: false
                        });

                        sortable(`#${elementId}`, 'reload');
                    });
                }

                // nested flexible fields
                if($('.acpt-nested-sortable').length > 0){

                    $('.acpt-nested-sortable').each(function() {
                        const elementId = $(this).attr('id');
                        const id = elementId.replace("block-elements-", "");

                        sortable('#'+elementId, {
                            acceptFrom: '#'+elementId,
                            forcePlaceholderSize: true,
                            items: `.sortable-li-${id}`,
                            handle: '.handle',
                            hoverClass: 'hover',
                            copy: false
                        });

                        sortable('#'+elementId, 'reload');
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * ===================================================================
     * REPEATER ELEMENTS HANDLING
     * ===================================================================
     */

    $(document).on("click", function (event) {
        if ($(event.target).closest(".sortable-li-active").length === 0) {
            const activeSortableElements = $('.sortable-li-active');

            if(!activeSortableElements){
                return;
            }

            activeSortableElements.each(function() {
                $(this).removeClass('sortable-li-active');
            });
        }
    });

    $('body').on('mousedown', '.sortable-li', function(){

        const $this = $(this);
        const classes = $this.attr('class');

        // if the element is already active, don't do anything
        if(classes.includes('sortable-li-active')){
            return;
        }

        // check if there is nested sortable-li-active
        if($this.find('.sortable-li-active').length > 0){
            return;
        }

        $('.sortable-li-active').each(function() {
            $(this).removeClass('sortable-li-active');
        });

        $this.addClass('sortable-li-active');
    });

    /**
     * Leading fields on repeater contracted elements
     */
    $('body').on('change', '.acpt-leading-field', function(e) {

        const $this = $(this);
        const type = $this.attr('type');
        const value = (typeof $this.val() === 'object') ? $this.val().join(", ") : $this.val();

        $this.parents().each(function () {
            const $this = $(this);
            const className = $this.attr('class');

            if(className && className.includes('sortable-li')){

                if(type === 'checkbox'){
                    const checked = e.target.checked;
                    const placeholder = $this.find('.sortable-li_collapsed_placeholder').find('span.value');
                    const placeholderText = placeholder.text();
                    const placeholderTextArray = placeholderText.split(", ").filter(s => s !== '');

                    if(checked){
                        placeholderTextArray.push(value);
                        placeholder.text(placeholderTextArray.join(", "));
                    } else {
                        placeholder.text(placeholderTextArray.filter(s => s !== value).join(", "));
                    }

                } else {
                    $this.find('.sortable-li_collapsed_placeholder').find('span.value').text(value);
                }
            }
        });
    });

    /**
     * Remove all grouped elements
     */
    $('body').on('click', '.remove-all-grouped-elements', function(e) {
        e.preventDefault();

        const $this = $(this);
        const layout = $this.data('layout');
        const element = $this.data('element');
        const elements = $this.data('elements');
        const parentId = $this.data('groupId');
        const addButton = $(`.add-grouped-element[data-group-id=${parentId}]`);

        let list;
        if(layout === 'table'){
            list = $this.prev('a').prev('.acpt-table-responsive').find('.acpt-table').find('.acpt-sortable');
        } else {
            list = $this.prev('a').prev('.acpt-sortable');
        }

        const maxBlocks = list.data('max-blocks');
        const parentListId = list.attr('id');
        const parentGroupId = $this.data('group-id');
        const fieldsCount = list.find('tr').children.length;

        if(list){
            const warningMessage = useTranslation(`No fields saved, generate the first one clicking on "Add ${element}" button`);
            const warningElement = `<p data-message-id="${parentGroupId}" class="update-nag notice notice-warning inline no-records">${warningMessage}</p>`;

            if(layout === 'table'){
                list.children('tr').each(function(index, el){
                    if(index > 0){
                        el.remove();
                    }
                });

                const colspan = fieldsCount + 2;
                $('#'+parentListId).append(`<tr><td colspan="${colspan}">${warningElement}</td></tr>`);
            } else {
                list.empty();
                $('#'+parentListId).html('').append(warningElement);
            }

            if(maxBlocks && maxBlocks > 0){
                addButton.removeAttr('disabled')
            }
        }
    });

    /**
     * Add grouped element
     */
    $('body').on('click', '.add-grouped-element', function(e) {

        e.preventDefault();

        const $this = $(this);
        const id = $this.data('group-id');
        const layout = $this.data('layout');
        const mediaType = $this.data('media-type');
        const parentIndex = $this.data('parent-index');
        const parentName = $this.data('parent-name');
        const noRecordsMessageDiv = $('[data-message-id="'+id+'"]');

        let list;
        let index = 0;

        if(layout === 'table'){
            list = $this.prev('.acpt-table-responsive').find('.acpt-table').find('.acpt-sortable').first();
            index = list.find("tr.sortable-li").length;
        } else {
            list = $this.prev('ul.acpt-sortable');
            index = list.find("li").length;
        }

        const minBlocks = list.data('min-blocks');
        const maxBlocks = list.data('max-blocks');

        const newBlocksAllowed = () => {
            if(typeof maxBlocks === 'undefined'){
                return true;
            }

            return list.find(".sortable-li").length < maxBlocks;
        };

        const checkButton = () => {
            if(!newBlocksAllowed()){
                $this.attr('disabled', 'disabled');
            } else {
                $this.removeAttr('disabled');
            }
        };

        if(newBlocksAllowed()){
            $.ajax({
                type: 'POST',
                url: ajaxurl,
                data: {
                    "action": "generateGroupedFieldsAction",
                    "data": JSON.stringify({
                        "id": id,
                        "mediaType": mediaType,
                        "index": index,
                        "parentName": parentName,
                        "parentIndex": parentIndex
                    }),
                },
                success: function(data) {

                    list.append(data.fields);
                    initSortable();
                    initValidator();
                    checkButton();

                    const evt = new Event("acpt_grouped_element_added");
                    document.dispatchEvent(evt);

                    if(noRecordsMessageDiv){
                        if(layout === 'table'){
                            noRecordsMessageDiv.parent("td").parent("tr").remove();
                        } else {
                            noRecordsMessageDiv.remove();
                        }
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const dateRangePickerElements = list.find('.acpt-daterangepicker');
                    if(dateRangePickerElements && dateRangePickerElements.length > 0){
                        initDateRangePicker(dateRangePickerElements[dateRangePickerElements.length-1].id);
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const codeMirrorElements = list.find('textarea.acpt-codemirror');
                    if(codeMirrorElements && codeMirrorElements.length > 0){
                        initCodeMirror(codeMirrorElements[codeMirrorElements.length-1].id);
                    }

                    // init colorpicker only on last .colorpicker element
                    const colorPickerElements = list.find('.acpt-color-picker');
                    if(colorPickerElements && colorPickerElements.length > 0){
                        initColorPicker(colorPickerElements[colorPickerElements.length-1].id);
                    }

                    // init selectize only on last .acpt-select2 element
                    const selectizeElements = list.find('select.acpt-select2');
                    if(selectizeElements && selectizeElements.length > 0){
                        initSelectize(selectizeElements[selectizeElements.length-1].id);
                    }

                    // init TinyMCE on last wp-editor element
                    const wpEditors = list.find('textarea.wp-editor-area');
                    if(wpEditors && wpEditors.length > 0){
                        initTinyMCE(wpEditors[wpEditors.length-1].id);
                    }

                    // init intlTelInput on last .acpt-phone element
                    const phoneElements = list.find('input.acpt-phone');
                    if(phoneElements && phoneElements.length > 0){
                        initIntlTelInput(phoneElements[phoneElements.length-1].id);
                    }

                    // init countrySelect on last .acpt-phone element
                    const countryElements = list.find('input.acpt-country');
                    if(countryElements && countryElements.length > 0){
                        initCountrySelect(countryElements[countryElements.length-1].id);
                    }
                },
                dataType: 'json'
            });
        }
    });

    /**
     * Toggle grouped element visibility
     */
    $('body').on('click', '.sortable-li_toggle_visibility', function(e){
        e.preventDefault();

        const $this = $(this);
        const elementId = $this.data('target-id');
        const element = $(`#${elementId}`);

        if($this.hasClass('reverse')){ $this.removeClass('reverse'); } else { $this.addClass('reverse'); }
        if(element.hasClass('hidden')){ element.removeClass('hidden'); } else { element.addClass('hidden'); }
    });

    /**
     * Remove single grouped element
     */
    $('body').on('click', 'a.remove-grouped-element', function(e) {

        e.preventDefault();

        const $this = $(this);
        const parentId = $this.data('parent-id');
        const id = $this.data('target-id');
        const layout = $this.data('layout');
        const element = $this.data('element');
        const elements = $this.data('elements');
        const $target = $('#'+id);
        const fieldsCount = $target.children.length;
        const parentList = $target.parent();
        const parentListId = parentList.attr('id');
        const minBlocks = parentList.data('min-blocks');
        const maxBlocks = parentList.data('max-blocks');
        const addButton = $(`.add-grouped-element[data-group-id=${parentId}]`);

        const newBlocksAllowed = () => {
            if(typeof maxBlocks === 'undefined'){
                return true;
            }

            return parentList.find(".sortable-li ").length < maxBlocks;
        };

        const checkButton = () => {
            if(!newBlocksAllowed()){
                addButton.attr('disabled', 'disabled');
            } else {
                addButton.removeAttr('disabled')
            }
        };

        $target.remove();
        checkButton();

        let parentListElementCount;
        if(layout === 'table'){
            parentListElementCount = (parentList.find('tr').length - 1);
        } else {
            parentListElementCount = parentList.find('li').length;
        }

        if(parentListElementCount === 0){
            const warningMessage = useTranslation(`No fields saved, generate the first one clicking on "Add ${element}" button`);
            const warningElement = `<p data-message-id="${parentId}" class="update-nag notice notice-warning inline no-records">${warningMessage}</p>`;

            if(layout === 'table'){
                const colspan = fieldsCount + 2;
                $('#'+parentListId).append(`<tr><td colspan="${colspan}">${warningElement}</td></tr>`);
            } else {
                $('#'+parentListId).html('').append(warningElement);
            }
        }

        const evt = new Event("acpt_grouped_element_removed");
        document.dispatchEvent(evt);
    });

    /**
     * ===================================================================
     * FLEXIBLE ELEMENTS HANDLING
     * ===================================================================
     */

    /**
     * Add block button
     */
    $('body').on('click', '.acpt_add_flexible_btn', function(e) {

        e.preventDefault();

        const $this = $(this);
        const list = $this.next('.acpt_flexible_block_items');

        ($this.hasClass('active')) ? $this.removeClass('active') : $this.addClass('active');
        (list.hasClass('active')) ? list.removeClass('active') : list.addClass('active');
    });

    document.addEventListener("click", function(evt) {

        const targetEl = evt.target;
        const showAddBlockMenu = targetEl.classList.contains('acpt_flexible_block_item') || targetEl.classList.contains('acpt_add_flexible_btn') || targetEl.classList.contains('acpt_add_flexible_btn_label');

        if(showAddBlockMenu === false){
            $('.acpt_flexible_block_items').removeClass('active');
            $('.acpt_add_flexible_btn').removeClass('active');
        }
    });

    /**
     * Delete all blocks
     */
    $('body').on('click', '.remove-all-blocks', function(e){

        e.preventDefault();

        const $this = $(this);
        const blockListId = $this.data('block-list-id');
        const blockList = $("ul#acpt-sortable-"+blockListId);
        const minBlocks = $this.data('min-blocks');
        const maxBlocks = $this.data('max-blocks');
        const addBlockButton = $this.prev().prev();

        if(blockList){
            blockList.empty();

            const warningMessage = useTranslation(`No blocks saved, generate the first one clicking on "Add block" button`);
            const warningElement = `<p data-message-id="${blockListId}" class="update-nag notice notice-warning inline no-records">${warningMessage}</p>`;

            blockList.append(warningElement);

            if(maxBlocks && maxBlocks > 0){
                addBlockButton.attr("disabled", false);
            }
        }
    });

    /**
     * Add block from context menu
     */
    $('body').on('click', '.acpt_flexible_block_items > li', function(e) {

        e.preventDefault();

        const $this = $(this);
        const dropdownList = $this.parent();
        const layout = $this.data('layout');
        const blockId = $this.data('value');
        const blockListId = $this.data('block-list-id');
        const parentName = $this.data('parent-name');
        const blockIndex = $this.data('block-index');
        const mediaType = $this.data('media-type');
        const fieldId = $this.data('field-id');
        const minBlocks = $this.data('min-blocks');
        const maxBlocks = $this.data('max-blocks');
        const blockList = $("ul#acpt-sortable-"+blockListId);
        const blockListLength = blockList.find("li.acpt_blocks_list_item").length;
        const button = blockList.next(".acpt_add_flexible_block").find("button");
        const noRecordsMessageDiv = $('[data-message-id="'+fieldId+'"]');

        const newBlocksAllowed = () => {
            if(typeof maxBlocks === 'undefined' || maxBlocks === ''){
                return true;
            }

            return blockListLength < maxBlocks;
        };

        if(newBlocksAllowed()){
            $.ajax({
                type: 'POST',
                url: ajaxurl,
                data: {
                    "action": "generateFlexibleBlockAction",
                    "data": JSON.stringify({
                        "layout": layout,
                        "blockId": blockId,
                        "mediaType": mediaType,
                        "parentName": parentName,
                        "index": blockListLength,
                        "blockListId": blockListId,
                        "minBlocks": minBlocks,
                        "maxBlocks": maxBlocks
                    }),
                },
                success: function(data) {

                    blockList.append(data.block);

                    const newBlocksAllowed = () => {
                        if(typeof maxBlocks === 'undefined' || maxBlocks === ''){
                            return true;
                        }

                        return (blockListLength+1) >= maxBlocks;
                    };

                    if(!newBlocksAllowed()){
                        button.attr("disabled", true);
                    }

                    initSortable();
                    initValidator();

                    if(noRecordsMessageDiv){
                        noRecordsMessageDiv.remove();
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const dateRangePickerElements = blockList.find('.acpt-daterangepicker');
                    if(dateRangePickerElements && dateRangePickerElements.length > 0){
                        initDateRangePicker(dateRangePickerElements[dateRangePickerElements.length-1].id);
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const codeMirrorElements = blockList.find('textarea.acpt-codemirror');
                    if(codeMirrorElements && codeMirrorElements.length > 0){
                        initCodeMirror(codeMirrorElements[codeMirrorElements.length-1].id);
                    }

                    // init colorpicker only on last .colorpicker element
                    const colorPickerElements = blockList.find('.acpt-color-picker');
                    if(colorPickerElements && colorPickerElements.length > 0){
                        initColorPicker(colorPickerElements[colorPickerElements.length-1].id);
                    }

                    // init selectize only on last .acpt-select2 element
                    const selectizeElements = blockList.find('select.acpt-select2');
                    if(selectizeElements && selectizeElements.length > 0){
                        initSelectize(selectizeElements[selectizeElements.length-1].id);
                    }

                    // init TinyMCE on last wp-editor element
                    const wpEditors = blockList.find('textarea.wp-editor-area');
                    if(wpEditors && wpEditors.length > 0){
                        initTinyMCE(wpEditors[wpEditors.length-1].id);
                    }

                    // init intlTelInput on last .acpt-phone element
                    const phoneElements = blockList.find('input.acpt-phone');
                    if(phoneElements && phoneElements.length > 0){
                        initIntlTelInput(phoneElements[phoneElements.length-1].id);
                    }

                    // init countrySelect on last .acpt-phone element
                    const countryElements = blockList.find('input.acpt-country');
                    if(countryElements && countryElements.length > 0){
                        initCountrySelect(countryElements[countryElements.length-1].id);
                    }
                },
                dataType: 'json'
            });
        }

        dropdownList.removeClass('active');
    });

    /**
     * Delete all elements inside a block
     */
    $('body').on('click', '.acpt_delete_all_flexible_element_btn', function(e){
        e.preventDefault();

        const $this = $(this);
        const generatedBlockId = $this.data('block-id');
        const blockId = $this.data('group-id');
        const element = $this.data('element');
        const layout = $this.data('layout');
        const index = $this.data('index');
        const parentBlockList = $('[data-parent-id="'+generatedBlockId+'"]');
        const list = $(`#block-elements-${blockId}-${index}`);
        const parentListId = `block-elements-${blockId}-${index}`;

        if(list){
            const warningMessage = useTranslation(`No fields saved, generate the first one clicking on "Add ${element}" button`);
            const warningElement = `<p data-message-id="${parentListId}" class="update-nag notice notice-warning inline no-records">${warningMessage}</p>`;

            if(layout === 'table'){

                const fieldsCount = list.find('tr').children.length;

                list.children('tr').each(function(index, el){
                    if(index > 0){
                        el.remove();
                    }
                });

                const colspan = fieldsCount + 2;
                $('#'+parentListId).append(`<tr><td colspan="${colspan}">${warningElement}</td></tr>`);
            } else {
                list.empty();
                $('#'+parentListId).html('').append(warningElement);
            }
        }
    });

    /**
     * Add element inside a block
     */
    $('body').on('click', '.acpt_add_flexible_element_btn', function(e){
        e.preventDefault();

        const $this = $(this);
        const generatedBlockId = $this.data('block-id');
        const layout = $this.data('layout');
        const blockId = $this.data('group-id');
        const mediaType = $this.data('media-type');
        const parentName = $this.data('parent-name');
        const index = $this.data('index');
        const minBlocks = $this.data('min-blocks');
        const maxBlocks = $this.data('max-blocks');
        const parentBlockList = $('[data-parent-id="'+generatedBlockId+'"]');
        const list = $(`#block-elements-${blockId}-${index}`);
        const elementCount = (layout === 'table') ? (list.find('tr').length - 1) : list.find('li').length;
        const noRecordsMessageDiv = $('[data-message-id="block-elements-'+blockId+ '-' + index+'"]');

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                "action": "generateFlexibleGroupedFieldsAction",
                "data": JSON.stringify({
                    "blockId": blockId,
                    "mediaType": mediaType,
                    "elementIndex": elementCount,
                    "blockIndex": index,
                    "layout": layout,
                    "parentName": parentName,
                    "minBlocks": minBlocks,
                    "maxBlocks": maxBlocks
                }),
            },
            success: function(data) {

                if(list){
                    list.append(data.fields);
                    initSortable();
                    initValidator();

                    const evt = new Event("acpt_flexible_element_added");
                    document.dispatchEvent(evt);

                    if(noRecordsMessageDiv){
                        if(layout === 'table'){
                            noRecordsMessageDiv.parent("td").parent("tr").remove();
                        } else {
                            noRecordsMessageDiv.remove();
                        }
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const dateRangePickerElements = list.find('.acpt-daterangepicker');
                    if(dateRangePickerElements && dateRangePickerElements.length > 0){
                        initDateRangePicker(dateRangePickerElements[dateRangePickerElements.length-1].id);
                    }

                    // init codeMirror only on last .acpt-codemirror element
                    const codeMirrorElements = list.find('textarea.acpt-codemirror');
                    if(codeMirrorElements && codeMirrorElements.length > 0){
                        initCodeMirror(codeMirrorElements[codeMirrorElements.length-1].id);
                    }

                    // init colorpicker only on last .colorpicker element
                    const colorPickerElements = list.find('.acpt-color-picker');
                    if(colorPickerElements && colorPickerElements.length > 0){
                        initColorPicker(colorPickerElements[colorPickerElements.length-1].id);
                    }

                    // init selectize only on last .acpt-select2 element
                    const selectizeElements = list.find('select.acpt-select2');
                    if(selectizeElements && selectizeElements.length > 0){
                        initSelectize(selectizeElements[selectizeElements.length-1].id);
                    }

                    // init TinyMCE on last wp-editor element
                    const wpEditors = list.find('textarea.wp-editor-area');
                    if(wpEditors && wpEditors.length > 0){
                        initTinyMCE(wpEditors[wpEditors.length-1].id);
                    }

                    // init intlTelInput on last .acpt-phone element
                    const phoneElements = list.find('input.acpt-phone');
                    if(phoneElements && phoneElements.length > 0){
                        initIntlTelInput(phoneElements[phoneElements.length-1].id);
                    }

                    // init countrySelect on last .acpt-phone element
                    const countryElements = list.find('input.acpt-country');
                    if(countryElements && countryElements.length > 0){
                        initCountrySelect(countryElements[countryElements.length-1].id);
                    }
                }
            },
            dataType: 'json'
        });
    });

    /**
     * Toggle block visibility
     */
    $('body').on('click', '.acpt_blocks_list_item_toggle_visibility', function(e){
        e.preventDefault();

        const $this = $(this);
        const blockId = $this.data('target-id');
        const targetList = $('*[data-parent-id='+blockId+']');
        const addElementButton = $('*[data-block-id='+blockId+']');
        const parentTitleElement = $this.parent().parent();

        if($this.hasClass('reverse')){ $this.removeClass('reverse'); } else { $this.addClass('reverse'); }
        if(parentTitleElement.hasClass('no-margin')){ parentTitleElement.removeClass('no-margin'); } else { parentTitleElement.addClass('no-margin'); }
        if(targetList.hasClass('hidden')){ targetList.removeClass('hidden'); } else { targetList.addClass('hidden'); }
        if(addElementButton.hasClass('hidden')){ addElementButton.removeClass('hidden'); } else { addElementButton.addClass('hidden'); }
    });

    /**
     * Delete block
     */
    $('body').on('click', '.acpt_blocks_list_item_delete', function(e){
        e.preventDefault();

        const $this = $(this);
        const blockId = $this.data('target-id');
        const block = $('#'+blockId);
        const blockList = block.parent();
        const blockListId = blockList.attr('id');
        const blockListLength = blockList.find("li.acpt_blocks_list_item").length;
        const minBlocks = blockList.data('min-blocks');
        const maxBlocks = blockList.data('max-blocks');
        const button = blockList.next(".acpt_add_flexible_block").find("button");

        const newBlocksAllowed = () => {
            if(typeof maxBlocks === 'undefined' || maxBlocks === ''){
                return true;
            }

            return blockListLength >= maxBlocks;
        };

        if(newBlocksAllowed()){
            button.attr("disabled", false);
        }

        block.remove();

        if(blockListLength === 1){
            const warningMessage = useTranslation(`No blocks saved, generate the first one clicking on "Add block" button`);
            const warningElement = `<p data-message-id="${blockListId}" class="update-nag notice notice-warning inline no-records">${warningMessage}</p>`;

            blockList.append(warningElement);
        }
    });

    /**
     * ===================================================================
     * LIST ELEMENTS HANDLING
     * ===================================================================
     */

    /**
     * Add list element
     */
    $('body').on('click', '#list-add-element', function(e) {

        e.preventDefault();

        const $this = $(this);
        const $listWrapper = $this.prev('.list-wrapper');
        const $lastElement = $listWrapper.children('.list-element').last();
        const $nextId = $listWrapper.children('.list-element').length;
        const $baseId = $listWrapper.parent().find('input[type=hidden]:first-child').val();

        let $cloned = $lastElement.find('input').clone();
        $cloned.val('');
        $cloned.prop('id', $baseId  + '_' + $nextId);

        $listWrapper.append('<div class="list-element">' + $cloned.prop('outerHTML') + '<a class="list-remove-element" data-target-id="'+$cloned.prop('id')+'" href="#">'+useTranslation('Remove element')+'</a></div>');
    });

    /**
     * Remove list element
     */
    $('body').on('click', 'a.list-remove-element', function(e) {

        e.preventDefault();

        const $this = $(this);
        const $targetId = $this.data('target-id');
        const $target = document.getElementById($targetId);

        $target.parentNode.remove();
        $this.remove();
    });

    /**
     * ===================================================================
     * RELATIONAL ELEMENTS HANDLING
     * ===================================================================
     */

    /**
     * Post relationships handling
     */
    $('body').on('change', '.post-relationship', function(e) {

        e.preventDefault();

        let $val = $( this ).val();

        if(Array.isArray($val)){
            $val = $val.join(',');
        }

        $("#inversedBy").val($val);
    });

    /**
     * ===================================================================
     * FILE FIELD HANDLING
     * ===================================================================
     */

    /**
     * Single file delete
     */
    $('body').on('click', '.file-delete-btn', function(e) {
        const $this = $( this );
        e.preventDefault();

        const target = $this.data('target-id');
        $('#'+target).val('');
        $('#'+target+'_id').val('');
        $this.parent('div').next( '.file-preview' ).html( '' );
    });

    /**
     * Upload file button
     */
    $('body').on('click', '.upload-file-btn', function(e) {

        const $this = $( this );
        const id = $this.data("id");
        const accepts = $this.data("accepts");
        const maxSize = $this.data("max-size");
        const minSize = $this.data("min-size");
        const input = $this.prev( 'input' );
        const inputId = input.prev( 'input' );
        const errors = $( "#file-errors-"+id );
        const parentDiv = $this.parent('div');
        e.preventDefault();

        if (!wp || !wp.media) {
            alert(useTranslation('The media gallery is not available. You must admin_enqueue this function: wp_enqueue_media()'));
            return;
        }

        const file = wp.media( {
            title: 'Upload a File',
            library: {
                type: accepts.replace("document", "application").split(",")
            },
            multiple: false
        });

        file.on('open', function (e) {
            if(inputId.val() !== ''){
                let selection = file.state().get('selection');
                let attachment = wp.media.attachment(inputId.val());
                selection.add(attachment);
            }
        });

        file.on( 'select', function ( e ) {
            const uploaded_file = file.state().get( 'selection' ).first();
            const file_size = uploaded_file.attributes.filesizeInBytes;

            if(maxSize){
                const maxSizeInBytes = maxSize * 1048576;

                if(file_size > maxSizeInBytes){
                    errors.html("Max size: " + maxSize + "Mb");

                    return;
                }
            }

            if(minSize){
                const minSizeInBytes = minSize * 1048576;

                if(file_size < minSizeInBytes){
                    errors.html("Min size: " + minSize + "Mb");

                    return;
                }
            }

            const file_url = uploaded_file.toJSON().url;
            const file_id = uploaded_file.toJSON().id;

            inputId.val(file_id);
            input.val( file_url );
        } );

        file.open();
    });

    /**
     * Delete all images button
     */
    $('body').on('click', '.upload-delete-btn', function(e) {
        const $this = $( this );
        e.preventDefault();
        e.stopPropagation();

        const target = $this.data('target-id');
        $('#'+target).val('');
        $('#'+target+'_copy').val('');
        $('#'+target+'_id').val('');

        $this.prev('.button').prev( '.inputs-wrapper' ).html('');
        $this.parent('div').next( '.image-preview' ).html( '' );
        $this.addClass('hidden');
    });

    /**
     * Single image upload
     */
    $('body').on('click', '.upload-image-btn', function(e) {
        const $this = $( this );
        const input = $this.prev( 'input' );
        const inputId = input.prev( 'input' );
        const parentDiv = $this.parent('div');

        e.preventDefault();
        e.stopPropagation();

        if (!wp || !wp.media) {
            alert(useTranslation('The media gallery is not available. You must admin_enqueue this function: wp_enqueue_media()'));
            return;
        }

        const image = wp.media( {
            title: useTranslation('Upload an Image'),
            library: {
                type: [ 'image' ]
            },
            multiple: false
        });

        image.on('open', function (e) {
            if(inputId.val() !== ''){
                let selection = image.state().get('selection');
                let attachment = wp.media.attachment(inputId.val());
                selection.add(attachment);
            }
        });

        image.on( 'select', function ( e ) {
            const uploaded_image = image.state().get( 'selection' ).first();
            const image_url = uploaded_image.toJSON().url;
            const image_id = uploaded_image.toJSON().id;
            const image_name = uploaded_image.toJSON().name;

            inputId.val(image_id);
            input.val(image_url);
            parentDiv.next( '.image-preview' ).html( '<div class="image"><img src="'+image_url+'" alt="'+image_name+'"/></div>' );
        } );

        image.open();
    });

    /**
     * Upload video button
     */
    $('body').on('click', '.upload-video-btn', function(e) {
        const $this = $( this );
        const input = $this.prev( 'input' );
        const inputId = input.prev( 'input' );
        const parentDiv = $this.parent('div');

        e.preventDefault();
        e.stopPropagation();

        if (!wp || !wp.media) {
            alert(useTranslation('The media gallery is not available. You must admin_enqueue this function: wp_enqueue_media()'));
            return;
        }

        const video = wp.media( {
            title: useTranslation('Upload a Video'),
            library: {
                type: [ 'video' ]
            },
            multiple: false
        });

        video.on('open', function (e) {
            if(inputId.val() !== ''){
                let selection = video.state().get('selection');
                let attachment = wp.media.attachment(inputId.val());
                selection.add(attachment);
            }
        });

        video.on( 'select', function ( e ) {
            const uploaded_video = video.state().get( 'selection' ).first();
            const video_url = uploaded_video.toJSON().url;
            const video_id = uploaded_video.toJSON().id;

            inputId.val(video_id);
            input.val(video_url);
            parentDiv.next( '.image-preview' ).html( '<div class="image"><video controls><source src="'+video_url+'" type="video/mp4"></video></div>' );
        } );

        video.open();
    });

    /**
     * Gallery upload
     */
    $('body').on('click', '.upload-gallery-btn', function(e) {
        const $this = $( this );
        const $inputWrapper = $this.prev( '.inputs-wrapper' );
        const $inputIds = $inputWrapper.prev( 'input' ).prev( 'input' );
        const $target = $inputWrapper.data('target');
        const $targetCopy = $inputWrapper.data('target-copy');
        const $placeholder = $('#'+$target+'_copy');
        e.preventDefault();
        e.stopPropagation();

        if (!wp || !wp.media) {
            alert(useTranslation('The media gallery is not available. You must admin_enqueue this function: wp_enqueue_media()'));
            return;
        }

        const gallery = wp.media( {
            title: useTranslation('Select images'),
            library: {
                type: [ 'image' ]
            },
            multiple: true
        });

        gallery.on('open', function (e) {
            if($inputIds.val() !== ''){
                let attachments = [];
                let selection = gallery.state().get('selection');
                $inputIds.val().split(',').forEach((id)=>{
                    attachments.push(wp.media.attachment(id));
                });

                selection.add(attachments);
            }
        });

        gallery.on( 'select', function ( e ) {

            const imageIds = [];
            const imageUrls = [];
            const imageNames = [];

            gallery.state().get( 'selection' ).map(
                function ( attachment ) {
                    attachment.toJSON();
                    imageIds.push(attachment.attributes.id);
                    imageUrls.push(attachment.attributes.url);
                    imageNames.push(attachment.attributes.name);
                } );

            const imagesUrls = [];
            $inputWrapper.html('');

            imageUrls.map((imageUrl, index) => {

                const targetToReplace = ($targetCopy) ? $targetCopy : $target;

                $inputWrapper.append('<input name="'+targetToReplace+'[]" type="hidden" data-index="'+index+'" value="'+imageUrl+'">');
                imagesUrls.push(imageUrl);
            });

            let preview = '';

            if(imageUrls.length > 0){
                $this.next('button').removeClass('hidden');
            }

            imageUrls.map((imageUrl, index)=> {
                preview += '<div class="image" data-index="'+index+'"><img src="'+imageUrl+'" alt="'+imageNames[index]+'"/><div><a class="delete-gallery-img-btn" data-index="'+index+'" href="#">'+useTranslation("Delete")+'</a></div></div>';
            });

            $this.parent('div').next( '.image-preview' ).html( preview );
            $placeholder.val(imagesUrls.join(','));
            $inputIds.val(imageIds.join(','));
        } );

        gallery.open();
    });

    /**
     * Delete single gallery item
     */
    $('body').on('click', '.delete-gallery-img-btn', function(e) {
        const $this = $( this );
        e.preventDefault();
        e.stopPropagation();

        const $index = $this.data('index');
        const $image = $this.parent().parent();
        const $imageWrapper = $image.parent();
        const $target = $imageWrapper.data('target');
        const $inputIds = $('#'+$target+'_id');
        const $placeholder = $('#'+$target+'_copy');
        const $inputWrapper = $placeholder.next( '.inputs-wrapper' );

        // update input readonly
        const $saveValues = $placeholder.val().split(',');
        $saveValues.splice($index, 1);
        $placeholder.val($saveValues.join(','));

        // update input hidden
        $inputWrapper.children('input').each(function () {
            const $childIndex = $(this).data('index');

            if($childIndex === $index){
                $(this).remove();
            }
        });

        // update ids
        const $newInputIdsArray = [];
        const $inputIdsArray = $inputIds.val().split(",");

        $inputIdsArray.forEach((id, index)=>{
            if(index !== $index){
                $newInputIdsArray.push(id);
            }
        });

        $inputIds.val($newInputIdsArray.join(","));

        // delete this image
        $image.remove();
    });

    /**
     * Coremirror
     * @see https://codemirror.net/docs/
     */
    const initCodeMirror = (idSelector = null) => {

        try {
            let selector = 'textarea.acpt-codemirror';
            if(idSelector){
                selector = `#${idSelector}`;
            }

            if($$(selector).length){
                $$(selector).each(function() {
                    const id = '#'+ $( this ).attr('id');

                    if(typeof wp !== 'undefined'){
                        const wpEditor = wp.codeEditor.initialize($$(id), {
                            indentUnit: 2,
                            tabSize: 2,
                            mode: 'text/html',
                            autoRefresh: true,
                        });

                        $(document).on('keyup', '.CodeMirror-code', function(){
                            $(id).html(wpEditor.codemirror.getValue());
                            $(id).trigger('change');
                        });
                    } else if(typeof CodeMirror === 'function') {

                        CodeMirror.fromTextArea(document.getElementById($( this ).attr('id')), {
                            lineNumbers: true,
                            indentUnit: 2,
                            tabSize: 2,
                            mode: 'text/html',
                        });
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * Toggle input
     */
    $('.wppd-ui-toggle').on( 'change', function () {
        const valId = $(this).attr('id');
        $('#'+valId).val(($(this).is(':checked')) ? 1 : 0 );
    });

    /**
     * Currency selector
     */
    $(".currency-selector").on("change", function () {

        const selected = $(this).find( "option:selected" );
        const amount = $(this).parent('div').prev();
        const symbol = amount.prev();

        symbol.text(selected.data("symbol"));
        amount.prop("placeholder", selected.data("placeholder"));
    });

    /**
     * selectize
     * @see https://selectize.dev/docs/api
     */
    const initSelectize = (id = null) => {
        try {
            if(jQuery().selectize) {

                const formatSelectizeItem = (item, escape) => {

                    const relation_label_separator =  "<-------->";

                    if(!item.text.includes(relation_label_separator)){
                        return `<div>${item.text}</div>`;
                    }

                    let explode = item.text.split(relation_label_separator);
                    const thumbnail = explode[0];
                    const cpt = explode[1];
                    const label = explode[2];
                    const thumbnailDiv = (thumbnail) ? `<div class="selectize-thumbnail"><img src="${thumbnail}" alt="${label}" width="50" /></div>` : `<div class="selectize-thumbnail"><span class="selectize-thumbnail-no-image"></span></div>`;

                    return `<div class="selectize-item">${thumbnailDiv}<div class="selectize-details"><span class='acpt-badge'>${cpt}</span><span>${label}</span></div></div>`;
                };

                let selector = `.acpt-select2`;
                if(id){
                    selector = `#${id}`;
                }

                $$(selector).selectize({
                    plugins: ["restore_on_backspace", "clear_button", "remove_button"],
                    placeholder: '--Select--',
                    onChange: function() {
                        this.$input[0].dispatchEvent(new Event("change")) // dispatch change event on change
                    },
                    render: {
                        option: function(option, escape) {
                            return formatSelectizeItem(option, escape);
                        },
                        item: function(item, escape) {
                            return formatSelectizeItem(item, escape);
                        }
                    },
                });
            }
        } catch (e) {
            console.log(e);
        }
    };

    /**
     * Color picker
     */
    const initColorPicker = (id = null) => {

        try {
            let selector = '.acpt-color-picker';
            if(id){
                selector = `#${id}`;
            }

            if($$(selector).length){
                if(typeof wp !== 'undefined'){
                    $$(selector).wpColorPicker();
                }
            }
        } catch (e) {
            console.log(e);
        }
    };

    /**
     * Eye dropper
     */
    $('body').on('click', '.acpt-eye-dropper-button', function(e) {

        e.preventDefault();

        const $this = $(this);
        const targetId = $this.data('target-id');

        if(!targetId){
            return;
        }

        if (!window.EyeDropper) {
            resultElement.textContent =
                "Your browser does not support the EyeDropper API";
            return;
        }

        const eyeDropper = new EyeDropper();

        eyeDropper
            .open()
            .then((result) => {

                /**
                 *
                 * @param rgba
                 * @param forceRemoveAlpha
                 * @return {string}
                 * @constructor
                 */
                const RGBAToHexA = (rgba, forceRemoveAlpha = false) => {
                    return "#" + rgba.replace(/^rgba?\(|\s+|\)$/g, '') // Get's rgba / rgb string values
                        .split(',') // splits them at ","
                        .filter((string, index) => !forceRemoveAlpha || index !== 3)
                        .map(string => parseFloat(string)) // Converts them to numbers
                        .map((number, index) => index === 3 ? Math.round(number * 255) : number) // Converts alpha to 255 number
                        .map(number => number.toString(16)) // Converts numbers to hex
                        .map(string => string.length === 1 ? "0" + string : string) // Adds 0 when length of one number is 1
                        .join("") // Puts the array to togehter to a string
                };

                $(`#${targetId}`).val(RGBAToHexA(result.sRGBHex, true));
                $this.prev(`.wp-picker-container`).find('.wp-color-result').css('background-color',RGBAToHexA(result.sRGBHex, true));
            })
            .catch((e) => {
                console.error(e);
            });
    });

    /**
     * Icon picker
     */
    const ICONIFY_API_ROOT = 'https://api.iconify.design/';

    $('body').on('click', '.acpt-icon-picker-button', function(e) {
        e.preventDefault();

        const $this = $(this);
        const targetId = $this.data('target-id');
        const targetModalId = targetId+'_modal';
        const targetModal = $('#'+targetModalId);

        (targetModal.hasClass('hidden')) ? targetModal.removeClass('hidden') : targetModal.addClass('hidden');
    });

    $('.acpt-icon-picker-delete').on('click', function (e) {
        e.preventDefault();

        const $this = $(this);
        const targetId = $this.data('target-id');

        $(`.acpt-icon-picker-preview[data-target-id=${targetId}]`).html('');
        $(`#${targetId}`).val('');
        $this.addClass('hidden');
    });

    $('body').on('click', '.acpt-icon-picker-provider', function (e) {

        const $this = $(this);
        ($this.hasClass('active')) ? $this.removeClass('active') : $this.addClass('active');

        let visibleProviders = [];
        $('.acpt-icon-picker-provider.active').each(function() {
            const provider =  $(this).data('value');
            visibleProviders.push(provider);
        });

        $('.acpt-icon-picker-icon').each(function () {
            const provider =  $(this).data('prefix');
            const $this = $(this);

            if(visibleProviders.length > 0){
                (visibleProviders.includes(provider)) ? $this.removeClass('hidden') : $this.addClass('hidden');
            } else {
                $this.removeClass('hidden');
            }
        });
    });

    $('body').on('input', '.acpt-icon-picker-search', function(e) {

        const $this = $(this);
        const search = e.target.value;
        const results = $this.next('.acpt-icon-picker-results');
        const targetId = results.data('target-id');

        if(search.length >= 3){
            $.ajax({
                type: 'GET',
                url: `${ICONIFY_API_ROOT}search?query=${search}&limit=96`,
                success: function(data) {
                    results.html('');

                    // create the filter by provider
                    if(data.collections){

                        const providers = Object.keys(data.collections).sort();
                        let providerFilter = `<div class="acpt-icon-picker-providers">`;

                        providers.forEach((provider) => {
                            if(data.collections[provider] && data.collections[provider]?.name){
                                providerFilter += `<div data-target-id="${targetId}" data-value="${provider}" class="acpt-icon-picker-provider">${data.collections[provider]?.name}</div>`;
                            }
                        });

                        providerFilter += `</div>`;

                        results.append(providerFilter);
                    }

                    // append icons
                    if(data.icons.length > 0){
                        data.icons.forEach((icon)=>{
                            const iconSplitted = icon.split(':');
                            const prefix = iconSplitted[0];
                            const iconName = iconSplitted[1];
                            const svgUrl = `${ICONIFY_API_ROOT}${prefix}/${iconName}.svg`;
                            results.append(`<div data-target-id="${targetId}" data-value="${icon}" data-prefix="${prefix}" class="acpt-icon-picker-icon" title="${icon}"><img src="${svgUrl}" width="32" height="32"></div>`);
                        });
                    } else {
                        results.append(`<div>${useTranslation("Sorry, no result match.")}</div>`);
                    }

                    const deleteButton = $(`.acpt-icon-picker-delete[data-target-id="${targetId}"]`);
                    deleteButton.removeClass('hidden');
                },
                error: function(error) {
                    console.error(error);
                    results.append(useTranslation("There was an error fetching icons, retry later."));
                },
            });
        }
    });

    $('body').on('click', '.acpt-icon-picker-icon', function(e) {
        e.preventDefault();

        const $this = $(this);
        const value = $this.data('value');
        const targetId = $this.data('target-id');
        const iconSplitted = value.split(':');
        const prefix = iconSplitted[0];
        const iconName = iconSplitted[1];
        const svgUrl = `${ICONIFY_API_ROOT}${prefix}/${iconName}.svg`;

        $.ajax({
            type: 'GET',
            url: svgUrl,
            success: function(data) {
               const svg = data.children[0].outerHTML;
                $(`.acpt-icon-picker-value[data-target-id="${targetId}"]`).val(svg);
                const targetModal = $('#'+targetId+'_modal');
                $('.acpt-icon-picker-preview[data-target-id="'+targetId+'"]').html(svg);
                (targetModal.hasClass('hidden')) ? targetModal.removeClass('hidden') : targetModal.addClass('hidden');
           },
            error: function(error) {
                console.error(error);

                results.append(useTranslation("There was an error fetching icons, retry later."));
            },
        });
    });

    $('body').on('click', '.close-acpt-icon-picker', function(e) {
        e.preventDefault();

        const $this = $(this);
        const targetModalId = $this.data('target-id');
        const targetModal = $('#'+targetModalId);

        (targetModal.hasClass('hidden')) ? targetModal.removeClass('hidden') : targetModal.addClass('hidden');
    });

    /**
     * Init DateRange picker
     */
    const initDateRangePicker = (idSelector = null) => {
        try {
            let selector = '.acpt-daterangepicker';
            if(idSelector){
                selector = `#${idSelector}`;
            }

            const daterangepickerElement = $$(selector);

            if(typeof daterangepicker !== 'undefined' && typeof daterangepickerElement !== 'undefined'){
                const maxDate = daterangepickerElement.data('max-date');
                const minDate = daterangepickerElement.data('min-date');

                daterangepickerElement.daterangepicker({
                        drops: 'up',
                        startDate: maxDate,
                        endDate: minDate,
                        locale: {
                            format: 'YYYY-MM-DD'
                        }
                    }
                );
            }
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * Init intlTelInput picker
     *
     * @param idSelector
     */
    const initIntlTelInput = (idSelector = null) => {
        try {
            let selector = '.acpt-phone';
            if(idSelector){
                selector = `#${idSelector}`;
            }

            const phoneElements = $$(selector).get();

            phoneElements.forEach((phoneElement) => {
                if(typeof window.intlTelInput !== 'undefined' && typeof phoneElement !== 'undefined'){

                    const country = phoneElement.previousSibling;
                    const dialCode = country.previousSibling;
                    const utilsPath = dialCode.previousSibling;

                    window.intlTelInput(phoneElement, {
                        initialCountry: country.value,
                        geoIpLookup: callback => {
                            fetch("https://ipapi.co/json")
                                .then(res => res.json())
                                .then(data => callback(data.country_code))
                                .catch(() => callback("us"));
                        },
                        utilsScript: utilsPath.value,
                    });

                    // on change country
                    phoneElement.addEventListener("countrychange", function(e) {
                        const iti = window.intlTelInputGlobals.getInstance(phoneElement);
                        country.value = iti.getSelectedCountryData().iso2;
                        dialCode.value = iti.getSelectedCountryData().dialCode;
                    });
                }
            });
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * Init Country select
     * @see https://github.com/mrmarkfrench/country-select-js
     *
     * @param idSelector
     */
    const initCountrySelect = (idSelector = null) => {
        try {
            let selector = '.acpt-country';
            if(idSelector){
                selector = `#${idSelector}`;
            }

            const countryElement = $$(selector);

            if(countryElement.length){
                const isoCodeElement = countryElement.prev();

                countryElement.countrySelect({
                    defaultCountry: isoCodeElement.val(),
                    preferredCountries: [],
                });

                countryElement.on("change",(e) => {
                    const countryData = countryElement.countrySelect("getSelectedCountryData");
                    isoCodeElement.val(countryData.iso2);
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * init TinyMCE on dynamic generated children fields
     *
     * @param id
     */
    const initTinyMCE = (id) => {
        try {
            if(typeof tinyMCE === 'undefined'){
                console.error("tinymce is not defined. Include it here");
                return;
            }

            tinyMCE.execCommand('mceAddEditor', false, id);
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * re-init form validator
     */
    const initValidator = () => {
        if(typeof ACPTFormValidator === 'function'){

            let action = null;
            switch (adminpage) {
                case "user-edit-php":
                case "edit-tags-php":
                    action = "add-tax";
                    break;

                case "post-php":
                    action = "save-cpt";
                    break;

                case "term-php":
                    action = "edit-tax";
                    break;

                case "admin-php":
                    action = "save-option-page";
                    break;
            }

            const validator = new ACPTFormValidator(action);
            validator.run();
        }
    };

    /*========== INIT ==========*/

    /**
     * Init the dependencies
     */
    function init() {
        initSelectize();
        initCodeMirror();
        initColorPicker();
        initSortable();
        initDateRangePicker();
        initIntlTelInput();
        initCountrySelect();
    }

    // call init() after click on media manager
    const attachments = $(".attachments-wrapper");

    if(attachments){
        $(attachments).on('click', function (e) {
            init();
        });
    }

    init();

    /*========== ADDRESS FIELDS COMMON FUNCTIONS ==========*/

    $('.acpt-reset-map').on('click', function (e) {

        e.preventDefault();

        const $this = $(this);
        const parentField = $this.parent();
        let fieldId;

        parentField.find('input').each(function(){
            const $this = $(this);
            const id = $this.attr('id');
            const type = $this.attr('type');

            if(id){
                if(type === 'text'){
                    fieldId = id;
                }

                $this.val('');
            }
        });

        if(fieldId){
            const event = new CustomEvent(
                "acpt-reset-map",
                {
                    detail: {
                        fieldId: fieldId+"_map"
                    }
                }
            );

            document.dispatchEvent(event);
        }
    });

    /*========== TABS, ACCORDIONS ==========*/

    $('.acpt-admin-horizontal-tab').on('click', function (e) {
        e.preventDefault();

        const $this = $(this);
        const parentTabs = $this.parent();
        const target = $this.data('target');
        const targetPanels = $(`#${target}`).parent();

        parentTabs.children().removeClass('active');
        targetPanels.children().removeClass('active');

        $(`#${target}`).addClass('active');
        $this.addClass('active');
    });

    $('.acpt-admin-vertical-tab').on('click', function (e) {
        e.preventDefault();

        const $this = $(this);
        const parentTabs = $this.parent();
        const target = $this.data('target');
        const targetPanels = $(`#${target}`).parent();

        parentTabs.children().removeClass('active');
        targetPanels.children().removeClass('active');

        $(`#${target}`).addClass('active');
        $this.addClass('active');
    });

    $('.acpt-admin-accordion-title').on('click', function (e) {
        e.preventDefault();

        const $this = $(this);
        const parent = $this.parent('div');
        const parentWrapper = parent.parent('div');
        const isAlreadyActive = parent.hasClass('active');

        parentWrapper.children().each(function () {
            $(this).removeClass('active');
        });

        if(isAlreadyActive){
            parent.removeClass('active');
        } else {
            parent.addClass('active');
        }
    });
});