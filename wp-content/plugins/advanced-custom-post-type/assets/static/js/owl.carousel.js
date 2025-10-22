var $ = jQuery.noConflict();

$(function(){

    const oc = $('.acpt-owl-carousel');
    const ocOptions = oc.data('carousel-options');
    const elementsPerRow = ocOptions.items ? ocOptions.items : 1;

    const defaults = {
        loop: false,
        margin: 20,
        nav: false,
        responsive:{
            600:{
                items: 1,
                nav: true,
            },
            1000:{
                items: elementsPerRow
            }
        }
    };

    console.log(defaults);

    oc.owlCarousel( defaults );
});
