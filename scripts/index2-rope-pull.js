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

  window.Index2RopePull = {
    mount(host, { reducedMotion = false } = {}) {
      const stage = host?.querySelector("[data-index2-rope-pull]");
      const images = stage ? Array.from(stage.querySelectorAll("img")) : [];
      let ready = false;
      let lastProgress = 0;
      let lastNarrow = false;

      function values(progress, narrow) {
        const tension = smooth((progress - 0.012) / 0.1);
        const bite = Math.sin(clamp((progress - 0.012) / 0.11) * Math.PI) * (1 - tension * 0.34);

        return {
          figureX: tension * (narrow ? 0.45 : 0.65),
          figureY: (-tension * (narrow ? 0.7 : 0.95)) - (bite * 0.3),
          figureRotate: -tension * (narrow ? 0.12 : 0.18),
          figureScaleX: 1 + (tension * 0.006),
          ropeScaleY: 1 - (tension * (narrow ? 0.05 : 0.058)),
          ropeShiftY: -tension * (narrow ? 0.9 : 1.15),
          rockLift: tension * (narrow ? 23.5 : 24.5),
          rockShift: tension * (narrow ? 3 : 3.8)
        };
      }

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
          host.classList.add("is-rope-pull-ready");
        })
        .catch(() => {
          ready = false;
          host.classList.remove("is-rope-pull-ready");
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
          host.classList.remove("is-rope-pull-ready");
          stage.removeAttribute("style");
        }
      };
    }
  };
})();
