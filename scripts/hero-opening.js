(() => {
  const clamp = (value, minimum = 0, maximum = 1) => (
    Math.min(maximum, Math.max(minimum, value))
  );
  const smooth = (value) => {
    const bounded = clamp(value);
    return bounded * bounded * (3 - (2 * bounded));
  };
  const smoother = (value) => {
    const bounded = clamp(value);
    return bounded * bounded * bounded * ((bounded * ((bounded * 6) - 15)) + 10);
  };
  const phase = (progress, start, end, easing = smoother) => (
    easing((progress - start) / Math.max(0.0001, end - start))
  );
  const hash = (index, salt = 0) => {
    const value = Math.sin(((index + 1) * 91.173) + (salt * 17.719)) * 43758.5453;
    return value - Math.floor(value);
  };

  const presets = Object.freeze({
    anchored: {
      crossfade: [0.014, 0.062],
      firstVisible: [0.014, 0.066],
      extraVisible: [0.032, 0.104],
      release: 0.058,
      verticalStagger: 0.006,
      radialStagger: 0.004,
      randomStagger: 0.003,
      sourceScale: 0.88,
      extraScale: 0.42,
      gather: 0.08
    },
    woven: {
      crossfade: [0.016, 0.067],
      firstVisible: [0.016, 0.07],
      extraVisible: [0.038, 0.108],
      release: 0.056,
      verticalStagger: 0.011,
      radialStagger: 0.007,
      randomStagger: 0.005,
      sourceScale: 0.9,
      extraScale: 0.4,
      gather: 0.12
    },
    tension: {
      crossfade: [0.022, 0.074],
      firstVisible: [0.025, 0.076],
      extraVisible: [0.048, 0.116],
      release: 0.068,
      verticalStagger: 0.006,
      radialStagger: 0.008,
      randomStagger: 0.004,
      sourceScale: 0.91,
      extraScale: 0.39,
      gather: 0.18
    },
    cascade: {
      crossfade: [0.012, 0.062],
      firstVisible: [0.011, 0.063],
      extraVisible: [0.036, 0.108],
      release: 0.052,
      verticalStagger: 0.025,
      radialStagger: 0.004,
      randomStagger: 0.006,
      sourceScale: 0.88,
      extraScale: 0.4,
      gather: 0.06
    },
    veil: {
      crossfade: [0.014, 0.078],
      firstVisible: [0.015, 0.082],
      extraVisible: [0.04, 0.12],
      release: 0.06,
      verticalStagger: 0.012,
      radialStagger: 0.008,
      randomStagger: 0.005,
      sourceScale: 1.134,
      extraScale: 0.38,
      gather: 0.14
    }
  });

  function waitForImage(image) {
    if (!image || (image.complete && image.naturalWidth)) {
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

  window.HeroOpening = {
    mount(reference, { reducedMotion = false } = {}) {
      const root = document.documentElement;
      const requested = new URLSearchParams(window.location.search).get("opening")
        || root.dataset.openingVariant
        || "woven";
      const name = Object.hasOwn(presets, requested) ? requested : "woven";
      const preset = presets[name];
      const handoff = 0.145;
      const images = reference ? Array.from(reference.querySelectorAll("img")) : [];

      root.dataset.openingVariant = name;
      root.classList.toggle("has-hero-opening", Boolean(reference));

      function apply(progress) {
        const currentProgress = clamp(progress);
        const complete = reducedMotion || currentProgress >= handoff;
        const crossfade = complete ? 1 : phase(currentProgress, ...preset.crossfade);
        const snapshotAlpha = 1 - crossfade;
        const canvasAlpha = crossfade;
        const bodyVeilAlpha = complete ? 1 : phase(currentProgress, 0.033, 0.128);

        root.style.setProperty("--opening-snapshot-alpha", snapshotAlpha.toFixed(5));
        root.style.setProperty("--opening-canvas-alpha", canvasAlpha.toFixed(5));
        root.style.setProperty("--opening-body-veil-alpha", bodyVeilAlpha.toFixed(5));

        return {
          canvasAlpha,
          complete,
          handoff,
          snapshotAlpha
        };
      }

      function rock(index, metrics, progress) {
        if (reducedMotion || progress >= handoff) {
          return {
            alpha: 1,
            sourceGather: 0,
            sourceScale: 1,
            travel: 1
          };
        }

        const vertical = clamp(metrics.vertical);
        const radial = clamp(metrics.radial);
        const randomDelay = hash(index, 2) * preset.randomStagger;
        const release = preset.release
          + (vertical * preset.verticalStagger)
          + (radial * preset.radialStagger)
          + randomDelay;
        const travel = phase(progress, release, handoff);
        const visibilityRange = metrics.extra ? preset.extraVisible : preset.firstVisible;
        const alpha = phase(progress, visibilityRange[0] + (randomDelay * 0.35), visibilityRange[1]);
        const sourceScale = metrics.extra ? preset.extraScale : preset.sourceScale;

        return {
          alpha,
          sourceGather: preset.gather * (1 - travel),
          sourceScale,
          travel
        };
      }

      if (!reference) {
        return {
          handoff,
          name,
          ready: Promise.resolve(),
          rock() {
            return { alpha: 1, sourceGather: 0, sourceScale: 1, travel: 1 };
          },
          update() {
            return { canvasAlpha: 1, complete: true, handoff, snapshotAlpha: 0 };
          }
        };
      }

      const ready = Promise.all(images.map(waitForImage));
      apply(reducedMotion ? handoff : 0);

      return {
        handoff,
        name,
        ready,
        rock,
        update(progress) {
          return apply(progress);
        }
      };
    }
  };
})();
