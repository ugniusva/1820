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
      return image.decode().catch(() => {});
    }
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  function values(progress, narrow) {
    const pull = clamp((progress - 0.01) / 0.108);
    const tension = smooth(pull);
    const strain = Math.sin(pull * Math.PI) * (1 - (tension * 0.28));

    return {
      figureX: tension * (narrow ? 0.62 : 0.88),
      figureY: (-tension * (narrow ? 0.95 : 1.3)) - (strain * 0.42),
      figureRotate: (-tension * (narrow ? 0.15 : 0.22)) - (strain * 0.05),
      figureScaleX: 1 + (tension * 0.007),
      ropeScaleY: 1 - (tension * (narrow ? 0.056 : 0.065)),
      ropeShiftY: -tension * (narrow ? 1.05 : 1.35),
      rockLift: tension * (narrow ? 24 : 26),
      rockShift: tension * (narrow ? 3.4 : 4.4)
    };
  }

  window.HeroRopePull = {
    mount(host, { reducedMotion = false } = {}) {
      const stage = host?.querySelector("[data-hero-rope-pull]");
      const images = stage ? Array.from(stage.querySelectorAll("img")) : [];
      let ready = false;
      let lastProgress = 0;
      let lastNarrow = false;

      function apply(progress, narrow) {
        const motion = values(progress, narrow);
        stage.style.setProperty("--rope-figure-x", `${motion.figureX.toFixed(3)}px`);
        stage.style.setProperty("--rope-figure-y", `${motion.figureY.toFixed(3)}px`);
        stage.style.setProperty("--rope-figure-rotate", `${motion.figureRotate.toFixed(3)}deg`);
        stage.style.setProperty("--rope-figure-scale-x", motion.figureScaleX.toFixed(5));
        stage.style.setProperty("--rope-line-scale-y", motion.ropeScaleY.toFixed(5));
        stage.style.setProperty("--rope-line-y", `${motion.ropeShiftY.toFixed(3)}px`);
        return motion;
      }

      if (!stage || images.length !== 2) {
        return {
          ready: Promise.resolve(),
          sample() {
            return { rockLift: 0, rockShift: 0 };
          },
          update() {
            return { rockLift: 0, rockShift: 0 };
          }
        };
      }

      const readyPromise = Promise.all(images.map(readyImage))
        .then(() => {
          apply(reducedMotion ? 0 : lastProgress, lastNarrow);
          ready = true;
          host.classList.add("is-rope-pull-ready");
        });

      return {
        ready: readyPromise,
        sample(progress, { narrow = false } = {}) {
          if (reducedMotion) {
            return { rockLift: 0, rockShift: 0 };
          }
          return values(clamp(progress), narrow);
        },
        update(progress, { narrow = false } = {}) {
          lastProgress = clamp(progress);
          lastNarrow = narrow;
          if (!ready || reducedMotion) {
            return { rockLift: 0, rockShift: 0 };
          }
          return apply(lastProgress, lastNarrow);
        }
      };
    }
  };
})();
