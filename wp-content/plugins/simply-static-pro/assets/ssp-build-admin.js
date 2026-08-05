'use strict';


var checkInterval = null;

function checkIfRunning() {
    fetch(sspb_ajax.rest_url + 'simplystatic/v1/is-running',
        {
            credentials: 'same-origin',
            headers: {
                "Content-Type": "application/json",
                'X-WP-Nonce' : sspb_ajax.rest_nonce
            },
        }
    )
        .then(resp => resp.json() )
        .then( resp  => {
			var json = (typeof resp === 'string') ? JSON.parse(resp) : resp;

			if ( json && json.running ) {
                jQuery('.generate-build').attr('disabled', 'disabled');
                showRunningLabel();
            } else {
                jQuery('.generate-build').removeAttr('disabled');
                hideRunningLabel();
                clearInterval(checkInterval);
            }
		} )
		.catch(function () {
			clearInterval(checkInterval);
		});
}

function showRunningLabel() {
    var tableForm = jQuery('#posts-filter'),
        spinner   = tableForm.find('.simply-static-spinner');

    if ( ! spinner.length ) {
        var html = '<span class="simply-static-spinner hidden">' + sspb_ajax.button_exporting + '</span>';
        tableForm.find('.tablenav.top .bulkactions').append( html );
        spinner = tableForm.find('.simply-static-spinner');
    }

    spinner.removeClass('hidden');
}

function hideRunningLabel() {
    var tableForm = jQuery('#posts-filter'),
        spinner   = tableForm.find('.simply-static-spinner');

    if ( ! spinner.length ) {
        return;
    }

    spinner.addClass('hidden');
}

function startCheckIfRunning() {
	clearInterval(checkInterval);
    checkIfRunning();
    checkInterval = setInterval(
        function() {
            checkIfRunning();
        },
        5000
    );
}

jQuery(document).ready(function ($) {

    startCheckIfRunning();

    // Start generation of build.
    $('.generate-build').on('click', function () {
        if ( $(this).attr('disabled') ) {
            return;
        }

        var term_id = $(this).attr('data-term-id');

        $('.generate-build').attr('disabled', 'disabled');
        $('#export-file-container .spinner').addClass('is-active');

        $.ajax({
            type: 'POST',
            url: sspb_ajax.ajax_url,
            data: {'action': 'apply_build', 'nonce': sspb_ajax.run_build_nonce, 'term_id': term_id},
            dataType: 'json',
            success: function (response) {
                if (response.success) {
					$('#export-file-container .spinner').removeClass('is-active');
					startCheckIfRunning();
				} else {
					$('.generate-build').removeAttr('disabled');
					$('#export-file-container .spinner').removeClass('is-active');
					if (response.data && response.data.message) {
						window.alert(response.data.message);
					}
				}
            },
			error: function (xhr) {
				$('.generate-build').removeAttr('disabled');
				$('#export-file-container .spinner').removeClass('is-active');
				if (xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message) {
					window.alert(xhr.responseJSON.data.message);
				}
			},
        });
    });

    // Start deletion of build.
    $('.delete-build').on('click', function () {
        if ( $(this).attr('disabled') ) {
            return;
        }

        var term_id = $(this).attr('data-term-id');
        var btn = $(this);
		if (!window.confirm(sspb_ajax.delete_confirm)) {
			return;
		}
		btn.attr('disabled', 'disabled');

        $.ajax({
            type: 'POST',
            url: sspb_ajax.ajax_url,
            data: {'action': 'delete_build', 'delete_nonce': sspb_ajax.delete_build_nonce, 'term_id': term_id},
            dataType: 'json',
            success: function (response) {
				btn.removeAttr('disabled');
                if (response.success) {
                    $(btn).parent().append('<p>' + sspb_ajax.delete_success + '</p>');
                } else {
                    $(btn).parent().append('<p>' + sspb_ajax.delete_error + '</p>');
                }
            },
            error: function () {
				btn.removeAttr('disabled');
                $(btn).parent().append('<p>' + sspb_ajax.delete_error + '</p>');
            },
        });
    });
});
