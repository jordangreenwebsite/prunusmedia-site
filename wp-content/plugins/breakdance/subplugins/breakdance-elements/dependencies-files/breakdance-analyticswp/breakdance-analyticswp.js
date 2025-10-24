const { mergeObjects } = BreakdanceFrontend.utils;

class BreakdanceAnalyticsWP {
  constructor(selector, options = {}) {
    this.options = {
      trigger: "",
      time_active_on_page: {
        seconds: 30,
      },
      label: "My Event",
    };

    this.selector = selector;

    this.options = mergeObjects(this.options, options);

    this.setup();
  }

  setup() {
    if (this.options.trigger === "time_active_on_page") {
      this.initTimeActiveOnPage();
    }

    if (this.options.trigger === "scrolled_into_view") {
      this.initScrolledIntoView();
    }
  }

  initScrolledIntoView() {
    const targetElement = document.querySelector(this.selector);
    if (targetElement) {
      const observer = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.fireEvent();
              observer.disconnect();
            }
          });
        },
        {
          root: null,
          rootMargin: "0px",
          threshold: 0.5,
        }
      );

      observer.observe(targetElement);
    }
  }

  initTimeActiveOnPage() {
    const seconds = Number(this.options.time_active_on_page.seconds) || 30;
    let activeTime = 0;
    let isActive = false;
    let timerInterval;
    let inactivityTimeout;

    const startActiveTimer = () => {
      timerInterval = setInterval(() => {
        activeTime++;
        if (activeTime >= seconds) {
          this.fireEvent();
          clearInterval(timerInterval);
        }
      }, 1000);
    };

    const handleActivity = () => {
      clearTimeout(inactivityTimeout);
      if (!isActive) {
        isActive = true;
        startActiveTimer();
      }

      inactivityTimeout = setTimeout(() => {
        isActive = false;
        clearInterval(timerInterval);
      }, 10000);
    };

    ["mousemove", "keydown", "scroll"].forEach((event) => {
      window.addEventListener(event, handleActivity);
    });
  }

  fireEvent() {
    AnalyticsWP.event(this.options.label, {
      unique_event_identifier: this.generateUniqueId(),
    });
  }

  generateUniqueId(length = 12) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

}

window.BreakdanceAnalyticsWP = BreakdanceAnalyticsWP;
