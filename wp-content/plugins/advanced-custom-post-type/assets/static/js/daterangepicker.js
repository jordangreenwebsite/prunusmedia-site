var $ = jQuery.noConflict();

jQuery(function() {
    const daterangepickerElement = $('.acpt-daterangepicker');
    const maxDate = daterangepickerElement.data('max-date');
    const minDate = daterangepickerElement.data('min-date');

    // https://www.daterangepicker.com/#options
    daterangepickerElement.daterangepicker({
            drops: 'up',
            startDate: maxDate,
            endDate: minDate,
            locale: {
                format: 'YYYY-MM-DD'
            }
        }
    );
});