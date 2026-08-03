(() => {
  const clamp = (value, minimum = 0, maximum = 1) => (
    Math.min(maximum, Math.max(minimum, value))
  );
  const smooth = (value) => {
    const bounded = clamp(value);
    return bounded * bounded * (3 - (2 * bounded));
  };

  function readyImage(image) {
    if (image.complete && image.naturalWidth) {
      return Promise.resolve();
    }

    if (typeof image.decode === "function") {
      return image.decode();
    }

    return new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
    });
  }

  function readyFallback(host) {
    const picture = host?.querySelector(".hero-figure-original");
    const image = picture?.querySelector("img");
    if (!image) {
      return Promise.resolve();
    }

    picture.querySelectorAll("source[data-srcset]").forEach((source) => {
      source.srcset = source.dataset.srcset;
    });
    if (image.dataset.src) {
      image.src = image.dataset.src;
    }
    return readyImage(image).catch(() => {});
  }

  window.HeroArmPull = {
    mount(host, { reducedMotion = false } = {}) {
      const stage = host?.querySelector("[data-hero-arm-pull]");
      const images = stage ? Array.from(stage.querySelectorAll("img")) : [];
      let ready = false;
      let lastProgress = 0;
      let lastNarrow = false;

      function values(progress, narrow) {
        const tension = smooth((progress - 0.012) / 0.1);

        return {
          scaleY: 1 - (tension * (narrow ? 0.125 : 0.12)),
          shiftY: tension * (narrow ? -1.6 : -1.9),
          rockLift: tension * (narrow ? 23.5 : 24.5),
          rockShift: tension * (narrow ? 3 : 3.8)
        };
      }

      function apply(progress, narrow) {
        const motion = values(progress, narrow);
        stage.style.setProperty("--arm-pull-scale-y", motion.scaleY.toFixed(5));
        stage.style.setProperty("--arm-pull-shift-y", `${motion.shiftY.toFixed(3)}px`);
        return motion;
      }

      if (!stage || images.length !== 2) {
        return {
          ready: readyFallback(host),
          update() {
            return { rockLift: 0, rockShift: 0 };
          },
          destroy() {}
        };
      }

      const readyPromise = Promise.all(images.map(readyImage))
        .then(() => {
          apply(reducedMotion ? 0 : lastProgress, lastNarrow);
          ready = true;
          host.classList.add("is-arm-pull-ready");
        })
        .catch(() => {
          ready = false;
          host.classList.remove("is-arm-pull-ready");
          return readyFallback(host);
        });

      return {
        ready: readyPromise,
        update(progress, { narrow = false } = {}) {
          lastProgress = clamp(progress);
          lastNarrow = narrow;
          if (!ready || reducedMotion) {
            return { rockLift: 0, rockShift: 0 };
          }
          return apply(lastProgress, lastNarrow);
        },
        destroy() {
          ready = false;
          host.classList.remove("is-arm-pull-ready");
          stage.style.removeProperty("--arm-pull-scale-y");
          stage.style.removeProperty("--arm-pull-shift-y");
        }
      };
    }
  };
})();
