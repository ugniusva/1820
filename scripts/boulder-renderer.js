(() => {
  "use strict";

  const FLOATS_PER_VERTEX = 7;
  const VERTICES_PER_SPRITE = 6;
  const DEFAULT_CAPACITY = 160;
  const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  class BoulderRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.atlasUrl = options.atlasUrl;
      this.compactAtlasUrl = options.compactAtlasUrl || options.atlasUrl;
      this.atlasFallbackUrl = options.atlasFallbackUrl || "";
      this.compactAtlasFallbackUrl = options.compactAtlasFallbackUrl || this.atlasFallbackUrl;
      this.atlasColumns = options.atlasColumns || 3;
      this.atlasRows = options.atlasRows || 3;
      this.assetCount = options.assetCount || 8;
      this.mobilePixelRatio = options.mobilePixelRatio || 2;
      this.desktopPixelRatio = options.desktopPixelRatio || 1.5;
      this.preferCompact = Boolean(options.preferCompact);
      this.forceCanvas2D = Boolean(options.forceCanvas2D);
      this.onReady = typeof options.onReady === "function" ? options.onReady : () => {};
      this.onError = typeof options.onError === "function" ? options.onError : () => {};
      this.onContextLost = typeof options.onContextLost === "function" ? options.onContextLost : () => {};
      this.vertexData = new Float32Array(DEFAULT_CAPACITY * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);
      this.vertexCount = 0;
      this.spriteCount = 0;
      this.width = 1;
      this.height = 1;
      this.pixelRatio = 1;
      this.narrow = false;
      this.ready = false;
      this.contextLost = false;
      this.gl = null;
      this.context2d = null;
      this.atlasImage = null;
      this.atlasWidth = 1;
      this.atlasHeight = 1;
      this.program = null;
      this.buffer = null;
      this.texture = null;
      this.failed = false;

      if (this.preferCompact) {
        this.atlasUrl = this.compactAtlasUrl;
        this.atlasFallbackUrl = this.compactAtlasFallbackUrl;
        this.canvas.dataset.atlas = "compact";
      }

      this.handleContextLost = (event) => {
        event.preventDefault();
        this.ready = false;
        this.contextLost = true;
        this.canvas.dataset.ready = "false";
        this.onContextLost();
      };

      this.handleContextRestored = () => {
        this.contextLost = false;
        try {
          this.setupWebGLResources();
          this.loadAtlas();
        } catch (error) {
          this.reportError();
        }
      };

      let webglReady = false;
      if (!this.forceCanvas2D) {
        try {
          webglReady = this.initializeWebGL();
        } catch (error) {
          webglReady = false;
        }
      }

      if (!webglReady) {
        this.initializeCanvas2D();
      }

      this.resize(false, true);
      this.loadAtlas();
    }

    initializeWebGL() {
      const gl = this.canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      });

      if (!gl) {
        return false;
      }

      if (this.preferCompact || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 3072) {
        this.atlasUrl = this.compactAtlasUrl;
        this.atlasFallbackUrl = this.compactAtlasFallbackUrl;
        this.canvas.dataset.atlas = "compact";
      } else {
        this.canvas.dataset.atlas = "full";
      }

      this.gl = gl;
      this.mode = "webgl";
      this.canvas.dataset.renderer = "webgl";
      this.canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
      this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);
      this.setupWebGLResources();
      return true;
    }

    initializeCanvas2D() {
      try {
        this.context2d = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
      } catch (error) {
        this.context2d = null;
      }
      this.mode = this.context2d ? "canvas2d" : "none";
      this.canvas.dataset.renderer = this.mode;
    }

    reportError() {
      if (this.failed) {
        return;
      }
      this.failed = true;
      this.ready = false;
      this.canvas.dataset.ready = "error";
      this.onError();
    }

    createShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Shader compilation failed.";
        gl.deleteShader(shader);
        throw new Error(message);
      }

      return shader;
    }

    setupWebGLResources() {
      const gl = this.gl;
      const vertexShader = this.createShader(gl.VERTEX_SHADER, `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        attribute float a_opacity;
        attribute float a_brightness;
        attribute float a_contrast;

        varying vec2 v_texCoord;
        varying float v_opacity;
        varying float v_brightness;
        varying float v_contrast;

        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
          v_opacity = a_opacity;
          v_brightness = a_brightness;
          v_contrast = a_contrast;
        }
      `);
      const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, `
        precision mediump float;

        uniform sampler2D u_atlas;
        varying vec2 v_texCoord;
        varying float v_opacity;
        varying float v_brightness;
        varying float v_contrast;

        void main() {
          vec4 sampleColor = texture2D(u_atlas, v_texCoord);
          float alpha = sampleColor.a * v_opacity;
          float gray = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 color = vec3(gray);
          color = clamp((color - 0.5) * v_contrast + 0.5, 0.0, 1.0);
          color = clamp(color * v_brightness, 0.0, 1.0);
          gl_FragColor = vec4(color * alpha, alpha);
        }
      `);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || "Shader program linking failed.";
        gl.deleteProgram(program);
        throw new Error(message);
      }

      const buffer = gl.createBuffer();
      const texture = gl.createTexture();
      const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
      const positionLocation = gl.getAttribLocation(program, "a_position");
      const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
      const opacityLocation = gl.getAttribLocation(program, "a_opacity");
      const brightnessLocation = gl.getAttribLocation(program, "a_brightness");
      const contrastLocation = gl.getAttribLocation(program, "a_contrast");

      this.program = program;
      this.buffer = buffer;
      this.texture = texture;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(opacityLocation);
      gl.vertexAttribPointer(opacityLocation, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(brightnessLocation);
      gl.vertexAttribPointer(brightnessLocation, 1, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(contrastLocation);
      gl.vertexAttribPointer(contrastLocation, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, "u_atlas"), 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
    }

    loadAtlas() {
      this.ready = false;
      this.canvas.dataset.ready = "false";
      const image = new Image();
      let uploaded = false;
      let usingFallback = false;

      const finish = () => {
        if (uploaded || !image.naturalWidth) {
          return;
        }
        uploaded = true;
        try {
          this.uploadAtlas(image);
        } catch (error) {
          this.reportError();
        }
      };

      image.decoding = "async";
      image.fetchPriority = "high";
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", () => {
        if (!usingFallback && this.atlasFallbackUrl) {
          usingFallback = true;
          image.src = this.atlasFallbackUrl;
          return;
        }
        this.reportError();
      });
      image.src = this.atlasUrl;

      if (typeof image.decode === "function") {
        image.decode().then(finish).catch(() => {
          // The load event remains the decoding fallback.
        });
      }
    }

    uploadAtlas(image) {
      this.atlasWidth = image.naturalWidth;
      this.atlasHeight = image.naturalHeight;

      if (this.mode === "webgl") {
        if (this.contextLost) {
          return;
        }

        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        image.src = EMPTY_IMAGE;
      } else if (this.mode === "canvas2d") {
        this.atlasImage = image;
      }

      this.ready = true;
      this.canvas.dataset.ready = "true";
      this.onReady();
    }

    resize(narrow, force = false) {
      this.narrow = Boolean(narrow);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const ratioLimit = this.narrow ? this.mobilePixelRatio : this.desktopPixelRatio;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, ratioLimit);
      const pixelWidth = Math.round(width * pixelRatio);
      const pixelHeight = Math.round(height * pixelRatio);

      if (!force && pixelWidth === this.canvas.width && pixelHeight === this.canvas.height) {
        return;
      }

      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;

      if (this.mode === "webgl" && !this.contextLost) {
        this.gl.viewport(0, 0, pixelWidth, pixelHeight);
      } else if (this.context2d) {
        this.context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        this.context2d.imageSmoothingEnabled = true;
        this.context2d.imageSmoothingQuality = "high";
      }
    }

    beginFrame() {
      this.vertexCount = 0;
      this.spriteCount = 0;
      this.canvas.dataset.sprites = "0";
      this.canvas.dataset.drawCalls = "0";

      if (this.mode === "webgl") {
        if (this.contextLost) {
          return;
        }
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      } else if (this.context2d) {
        this.context2d.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        this.context2d.clearRect(0, 0, this.width, this.height);
      }
    }

    ensureCapacity(additionalVertices) {
      const requiredFloats = (this.vertexCount + additionalVertices) * FLOATS_PER_VERTEX;
      if (requiredFloats <= this.vertexData.length) {
        return;
      }

      let nextLength = this.vertexData.length;
      while (nextLength < requiredFloats) {
        nextLength *= 2;
      }
      this.vertexData = new Float32Array(nextLength);

      if (this.mode === "webgl" && !this.contextLost) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexData.byteLength, this.gl.DYNAMIC_DRAW);
      }
    }

    writeVertex(x, y, u, v, opacity, brightness, contrast) {
      const offset = this.vertexCount * FLOATS_PER_VERTEX;
      this.vertexData[offset] = x;
      this.vertexData[offset + 1] = y;
      this.vertexData[offset + 2] = u;
      this.vertexData[offset + 3] = v;
      this.vertexData[offset + 4] = opacity;
      this.vertexData[offset + 5] = brightness;
      this.vertexData[offset + 6] = contrast;
      this.vertexCount += 1;
    }

    addSprite(assetIndex, x, y, width, height, rotation, opacity, brightness, contrast) {
      if (!this.ready || opacity <= 0.003) {
        return;
      }

      this.spriteCount += 1;

      if (this.mode === "canvas2d") {
        this.drawCanvasSprite(assetIndex, x, y, width, height, rotation, opacity);
        return;
      }

      this.ensureCapacity(VERTICES_PER_SPRITE);
      const halfWidth = width * 0.5;
      const halfHeight = height * 0.5;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const clipScaleX = 2 / this.width;
      const clipScaleY = 2 / this.height;
      const topLeftX = ((x - (halfWidth * cosine) + (halfHeight * sine)) * clipScaleX) - 1;
      const topLeftY = 1 - ((y - (halfWidth * sine) - (halfHeight * cosine)) * clipScaleY);
      const bottomLeftX = ((x - (halfWidth * cosine) - (halfHeight * sine)) * clipScaleX) - 1;
      const bottomLeftY = 1 - ((y - (halfWidth * sine) + (halfHeight * cosine)) * clipScaleY);
      const bottomRightX = ((x + (halfWidth * cosine) - (halfHeight * sine)) * clipScaleX) - 1;
      const bottomRightY = 1 - ((y + (halfWidth * sine) + (halfHeight * cosine)) * clipScaleY);
      const topRightX = ((x + (halfWidth * cosine) + (halfHeight * sine)) * clipScaleX) - 1;
      const topRightY = 1 - ((y + (halfWidth * sine) - (halfHeight * cosine)) * clipScaleY);
      const index = Math.max(0, Math.min(this.assetCount - 1, Math.floor(assetIndex)));
      const column = index % this.atlasColumns;
      const row = Math.floor(index / this.atlasColumns);
      const insetU = 0.5 / this.atlasWidth;
      const insetV = 0.5 / this.atlasHeight;
      const u0 = (column / this.atlasColumns) + insetU;
      const u1 = ((column + 1) / this.atlasColumns) - insetU;
      const vTop = 1 - (row / this.atlasRows) - insetV;
      const vBottom = 1 - ((row + 1) / this.atlasRows) + insetV;
      const clampedOpacity = Math.max(0, Math.min(1, opacity));
      const finalBrightness = brightness || 1;
      const finalContrast = contrast || 1;

      this.writeVertex(topLeftX, topLeftY, u0, vTop, clampedOpacity, finalBrightness, finalContrast);
      this.writeVertex(bottomLeftX, bottomLeftY, u0, vBottom, clampedOpacity, finalBrightness, finalContrast);
      this.writeVertex(bottomRightX, bottomRightY, u1, vBottom, clampedOpacity, finalBrightness, finalContrast);
      this.writeVertex(topLeftX, topLeftY, u0, vTop, clampedOpacity, finalBrightness, finalContrast);
      this.writeVertex(bottomRightX, bottomRightY, u1, vBottom, clampedOpacity, finalBrightness, finalContrast);
      this.writeVertex(topRightX, topRightY, u1, vTop, clampedOpacity, finalBrightness, finalContrast);
    }

    drawCanvasSprite(assetIndex, x, y, width, height, rotation, opacity) {
      if (!this.atlasImage || !this.context2d) {
        return;
      }

      const context = this.context2d;
      const index = Math.max(0, Math.min(this.assetCount - 1, Math.floor(assetIndex)));
      const column = index % this.atlasColumns;
      const row = Math.floor(index / this.atlasColumns);
      const sourceWidth = this.atlasImage.naturalWidth / this.atlasColumns;
      const sourceHeight = this.atlasImage.naturalHeight / this.atlasRows;

      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, opacity));
      context.translate(x, y);
      context.rotate(rotation);
      context.drawImage(
        this.atlasImage,
        column * sourceWidth,
        row * sourceHeight,
        sourceWidth,
        sourceHeight,
        width * -0.5,
        height * -0.5,
        width,
        height
      );
      context.restore();
    }

    flush() {
      this.canvas.dataset.sprites = String(this.spriteCount);

      if (this.mode !== "webgl" || this.contextLost || !this.ready || !this.vertexCount) {
        if (this.mode === "canvas2d" && this.ready) {
          this.canvas.dataset.drawCalls = "1";
        }
        return;
      }

      const gl = this.gl;
      const usedFloats = this.vertexCount * FLOATS_PER_VERTEX;
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, usedFloats));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
      this.canvas.dataset.drawCalls = "1";
    }
  }

  window.BoulderRenderer = BoulderRenderer;
})();
