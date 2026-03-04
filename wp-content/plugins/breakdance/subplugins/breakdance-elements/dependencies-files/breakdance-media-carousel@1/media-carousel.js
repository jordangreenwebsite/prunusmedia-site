(function () {
  const { mergeObjects } = BreakdanceFrontend.utils;

  class BreakdanceMediaCarousel {
    options = {
      navigation: "thumbnails",
      autoplay: false,
      speed: 3000,
      loop: false,
      slides_per_view: 1,
      gap: 10,
    };

    constructor(selector, options) {
      this.selector = selector;
      this.element = document.querySelector(`${this.selector} .ee-carousel`);
      this.options = mergeObjects(this.options, options);
      this.init();
    }

    playOrPauseVideo(video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }

    bindVideosListeners() {
      const videos = this.element.querySelectorAll(".ee-carousel-main video");

      videos.forEach((video) => {
        const button = video.parentElement.querySelector(
          ".ee-gallery-item-play"
        );

        video.addEventListener("play", () => {
          button.classList.add("ee-gallery-item-play--playing");
        });

        video.addEventListener("pause", () => {
          button.classList.remove("ee-gallery-item-play--playing");
        });

        video.addEventListener("click", () => this.playOrPauseVideo(video));
        button.addEventListener("click", () => this.playOrPauseVideo(video));
      });
    }

    pauseVideosAndIframes() {
      const iframes =
        this.element.querySelectorAll(".swiper-slide-prev iframe") || [];
      const videos =
        this.element.querySelectorAll(".swiper-slide-prev video") || [];
      iframes.forEach((iframe) => (iframe.src = iframe.src));
      videos.forEach((video) => video.pause());
    }

    init() {
      const settings = this.options;

      const options = {
        loop: settings.loop,
        slidesPerView: settings.slides_per_view,
        spaceBetween: settings.gap,
        navigation: {
          nextEl: ".swiper-button-next",
          prevEl: ".swiper-button-prev",
        },
        on: {
          slideChangeTransitionEnd: () => {
            this.pauseVideosAndIframes();
          },
        },
      };

      if (settings.autoplay) {
        options.autoplay = { delay: settings.speed };
      }

      if (settings.navigation === "bullets") {
        options.pagination = { el: ".swiper-pagination" };
      }

      if (settings.navigation === "thumbnails") {
        this.thumbSwiper = new Swiper(
          `${this.selector} .ee-carousel-thumbnails`,
          {
            spaceBetween: 10,
            slidesPerView: "auto",
            threshold: 10,
            freeMode: true,
            watchSlidesProgress: true,
            centerInsufficientSlides: true,
          }
        );

        options.thumbs = { swiper: this.thumbSwiper };
      }

      this.swiper = new Swiper(`${this.selector} .ee-carousel-main`, options);
      this.bindVideosListeners();
    }

    // Methods
    update(options = {}) {
      this.options = mergeObjects(this.options, options);
      this.destroy();
      this.init();
    }

    destroy() {
      if (!this.swiper) return;
      this.swiper.destroy();
      this.swiper = null;
    }
  }

  window.BreakdanceMediaCarousel = BreakdanceMediaCarousel;
})();
