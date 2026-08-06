(() => {
  "use strict";

  const canvas = document.querySelector(".metal-orb");
  const sun = document.querySelector(".sun");
  const temperatureInput = document.querySelector(".temp-input");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!canvas || !sun) {
    return;
  }

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    sun.classList.add("orb-fallback");
    return;
  }

  const vertexSource = `#version 300 es
    layout(location = 0) in vec2 aPosition;
    out vec2 vUv;

    void main() {
      vUv = aPosition * .5 + .5;
      gl_Position = vec4(aPosition, 0., 1.);
    }
  `;

  /* Liquid-glass sphere.
     Smooth domain-warped light fields inside a soft shell, a thin fresnel rim
     and a specular bloom — matching the bubble reference. Everything is
     low-frequency by construction: no 1/cos terms, no banding, no spikes. */
  const orbFragmentSource = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 fragColor;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uMotion;

    uniform float uRadius;
    uniform float uWobble;
    uniform float uEdgeSoft;

    uniform float uFlowScale;
    uniform float uFlowSpeed;
    uniform float uWarp;
    uniform float uContrast;
    uniform float uLift;

    uniform float uRimWidth;
    uniform float uRimGain;
    uniform float uSpecGain;
    uniform float uSpecTight;

    uniform float uGlowGain;
    uniform float uGlowFalloff;

    uniform float uExposure;
    uniform float uSaturation;

    uniform vec3 uC0;
    uniform vec3 uC1;
    uniform vec3 uC2;
    uniform vec3 uC3;
    uniform vec3 uC4;
    uniform vec3 uRimTint;
    uniform vec2 uUserRotation;

    float hash13(vec3 p) {
      p = fract(p * .3183099 + .1);
      p *= 17.;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise3(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3. - 2. * f);
      return mix(
        mix(
          mix(hash13(i + vec3(0, 0, 0)), hash13(i + vec3(1, 0, 0)), f.x),
          mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x),
          f.y
        ),
        mix(
          mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
          mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x),
          f.y
        ),
        f.z
      );
    }

    // Deliberately few octaves — the reference is soft, not detailed.
    float fbm(vec3 p) {
      float total = 0.;
      float amplitude = .58;
      for (int i = 0; i < 3; i += 1) {
        total += amplitude * noise3(p);
        p *= 2.02;
        amplitude *= .48;
      }
      return total;
    }

    mat2 rotation(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat2(c, -s, s, c);
    }

    // Warm five-stop ramp: ember core -> deep colour -> body -> highlight -> hot white.
    vec3 ramp(float x) {
      x = clamp(x, 0., 1.);
      vec3 c = mix(uC0, uC1, smoothstep(0., .26, x));
      c = mix(c, uC2, smoothstep(.22, .52, x));
      c = mix(c, uC3, smoothstep(.48, .78, x));
      c = mix(c, uC4, smoothstep(.74, 1., x));
      return c;
    }

    void main() {
      vec2 point = vUv * 2. - 1.;
      point.x *= uResolution.x / uResolution.y;
      point.y *= -1.;

      float time = uTime * uMotion;

      // Gentle organic deformation of the silhouette (low frequency only).
      float shapeNoise = fbm(
        vec3(normalize(point + 1e-5) * .9, time * .06)
      ) - .5;
      float radius = uRadius * (1. + shapeNoise * uWobble * 2.);

      float dist = length(point);
      float mask = smoothstep(radius, radius - uEdgeSoft, dist);

      // Spherize the disc so the light field wraps like a real volume.
      float depth = sqrt(max(0., radius * radius - dist * dist));
      vec3 normal = vec3(point, depth) / max(radius, 1e-4);

      vec3 samplePoint = normal;
      samplePoint.xz = rotation(uUserRotation.x) * samplePoint.xz;
      samplePoint.yz = rotation(uUserRotation.y) * samplePoint.yz;

      // Domain warp — this is what makes the light look liquid.
      vec3 drift = vec3(time * .05, time * -.07, time * .04) * uFlowSpeed;
      vec3 base = samplePoint * uFlowScale + drift;
      float warpA = fbm(base);
      float warpB = fbm(base + vec3(3.7, 1.3, -2.1));
      vec3 warped =
        base + vec3(warpA, warpB, warpA - warpB) * uWarp * 2.2;
      float field = fbm(warped);

      // Light pools toward the lower body of the sphere (y is negative at the
      // top after the flip), keeping the whole volume luminous.
      float pooling = smoothstep(-1., 1., normal.y * .85 + normal.x * .25);

      float value = (field - .5) * uContrast + pooling * .45 + uLift;
      vec3 color = ramp(value);

      // Glass shell: a slight falloff under the surface, then a thin bright
      // ring exactly at the edge. This pair is what reads as glass.
      float edgeRatio = clamp(dist / max(radius, 1e-4), 0., 1.);
      color *= 1. - smoothstep(.45, .96, edgeRatio) * .3;
      float ring = pow(edgeRatio, max(uRimWidth, 1.));
      color += uRimTint * ring * uRimGain * 2.4;

      // Specular highlight, upper-left (negative y = top), warm not grey.
      vec2 specOffset = point - vec2(-radius * .34, -radius * .4);
      float spec = exp(-dot(specOffset, specOffset) * uSpecTight);
      color += mix(uC4, vec3(1.), .35) * spec * uSpecGain;

      color *= mask;

      // Outer halo so the sphere sits in light.
      float halo = exp(-max(0., dist - radius) * uGlowFalloff);
      color += mix(uC2, uC3, .5) * halo * uGlowGain * (1. - mask);

      // Fade out before the canvas border, otherwise the clipped halo shows
      // up as a visible square around the orb.
      float bounds = 1. - smoothstep(.82, 1.04, dist);
      color *= bounds;

      float brightness = max(color.r, max(color.g, color.b));

      color = 1. - exp(-color * uExposure);
      float luminance = dot(color, vec3(.2126, .7152, .0722));
      color = clamp(mix(vec3(luminance), color, uSaturation), 0., 1.);
      color += (hash13(vec3(gl_FragCoord.xy, time)) - .5) / 320.;

      float alpha = clamp(max(brightness * 2.2, mask * bounds), 0., 1.);
      fragColor = vec4(color, alpha);
    }
  `;

  const blurFragmentSource = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D uTexture;
    uniform vec2 uDirection;
    uniform float uThreshold;

    vec4 sourceSample(vec2 uv) {
      vec4 sampleColor = texture(uTexture, uv);
      if (uThreshold <= 0.) {
        return sampleColor;
      }

      float brightness = max(
        sampleColor.r,
        max(sampleColor.g, sampleColor.b)
      );
      float contribution = smoothstep(
        uThreshold,
        min(1., uThreshold + .34),
        brightness
      );
      return sampleColor * contribution;
    }

    void main() {
      vec4 color = sourceSample(vUv) * .227027;
      color += sourceSample(vUv + uDirection * 1.384615) * .316216;
      color += sourceSample(vUv - uDirection * 1.384615) * .316216;
      color += sourceSample(vUv + uDirection * 3.230769) * .070270;
      color += sourceSample(vUv - uDirection * 3.230769) * .070270;
      fragColor = color;
    }
  `;

  const compositeFragmentSource = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D uScene;
    uniform sampler2D uBloom;
    uniform float uBloomStrength;

    void main() {
      vec4 scene = texture(uScene, vUv);
      vec4 bloom = texture(uBloom, vUv);
      vec3 color = scene.rgb + bloom.rgb * uBloomStrength;
      float bloomLight = max(bloom.r, max(bloom.g, bloom.b));
      float alpha = max(
        scene.a,
        min(.6, bloomLight * uBloomStrength * .7)
      );
      fragColor = vec4(color, clamp(alpha, 0., 1.));
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile error");
    }
    return shader;
  };

  const createProgram = (fragmentSource) => {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(
      program,
      compileShader(gl.FRAGMENT_SHADER, fragmentSource),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link error");
    }
    return program;
  };

  let orbProgram;
  let blurProgram;
  let compositeProgram;
  try {
    orbProgram = createProgram(orbFragmentSource);
    blurProgram = createProgram(blurFragmentSource);
    compositeProgram = createProgram(compositeFragmentSource);
  } catch (error) {
    console.error("mysun orb:", error);
    sun.classList.add("orb-fallback");
    return;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const scalarUniformNames = [
    "uTime",
    "uMotion",
    "uRadius",
    "uWobble",
    "uEdgeSoft",
    "uFlowScale",
    "uFlowSpeed",
    "uWarp",
    "uContrast",
    "uLift",
    "uRimWidth",
    "uRimGain",
    "uSpecGain",
    "uSpecTight",
    "uGlowGain",
    "uGlowFalloff",
    "uExposure",
    "uSaturation",
  ];
  const uniforms = Object.fromEntries(
    [
      ...scalarUniformNames,
      "uResolution",
      "uC0",
      "uC1",
      "uC2",
      "uC3",
      "uC4",
      "uRimTint",
      "uUserRotation",
    ].map((name) => [name, gl.getUniformLocation(orbProgram, name)]),
  );
  const blurUniforms = {
    texture: gl.getUniformLocation(blurProgram, "uTexture"),
    direction: gl.getUniformLocation(blurProgram, "uDirection"),
    threshold: gl.getUniformLocation(blurProgram, "uThreshold"),
  };
  const compositeUniforms = {
    scene: gl.getUniformLocation(compositeProgram, "uScene"),
    bloom: gl.getUniformLocation(compositeProgram, "uBloom"),
    strength: gl.getUniformLocation(compositeProgram, "uBloomStrength"),
  };

  const defaults = {
    motion: 1,
    sharpness: 0.85,
    radius: 0.66,
    wobble: 0.06,
    edgeSoft: 0.03,
    flowScale: 1.5,
    flowSpeed: 1,
    warp: 0.55,
    contrast: 1.05,
    lift: 0.3,
    rimWidth: 9,
    rimGain: 0.7,
    specGain: 0.3,
    specTight: 26,
    glowGain: 0.7,
    glowFalloff: 6.5,
    exposure: 1.5,
    saturation: 1.2,
    bloomStrength: 0.7,
    bloomRadius: 1.6,
    bloomThreshold: 0.42,
    color: "#ffb347",
  };

  // Sunny default gamut (each star preset overrides this).
  const defaultRamp = {
    c0: "#7a2200",
    c1: "#e04e00",
    c2: "#ff8c1a",
    c3: "#ffd166",
    c4: "#fff6df",
    rim: "#ffdca8",
  };

  const state = { ...defaults };

  const hexToRgb = (hex) => {
    const normalized = String(hex).replace("#", "");
    if (normalized.length !== 6) {
      return null;
    }
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(normalized.slice(offset, offset + 2), 16),
    );
    return channels.some(Number.isNaN)
      ? null
      : channels.map((channel) => channel / 255);
  };

  const rgbToHex = (rgb) =>
    `#${rgb
      .map((channel) =>
        Math.round(Math.min(1, Math.max(0, channel)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  let ramp = { ...defaultRamp };
  let rampRgb = {};
  const rebuildRamp = () => {
    rampRgb = Object.fromEntries(
      Object.entries(ramp).map(([key, value]) => [
        key,
        hexToRgb(value) || [1, 1, 1],
      ]),
    );
  };
  rebuildRamp();

  // Temperature tints the ramp without destroying the preset's identity.
  let tempTint = [1, 1, 1];

  let renderTargets = null;
  let animationFrame = 0;
  let visible = true;
  let rotationPointerId = null;
  let rotationPointerX = 0;
  let rotationPointerY = 0;
  const userRotation = { x: 0, y: 0 };
  const startedAt = performance.now();

  const createRenderTarget = (width, height) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    if (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
    ) {
      throw new Error("Incomplete WebGL framebuffer");
    }

    return { framebuffer, texture };
  };

  const destroyRenderTargets = () => {
    if (!renderTargets) {
      return;
    }
    Object.values(renderTargets).forEach((target) => {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    });
    renderTargets = null;
  };

  const resizeForSharpness = () => {
    const size = Math.round(220 + state.sharpness * 300);
    if (canvas.width === size && canvas.height === size && renderTargets) {
      return;
    }

    canvas.width = size;
    canvas.height = size;
    destroyRenderTargets();
    renderTargets = {
      scene: createRenderTarget(size, size),
      blurHorizontal: createRenderTarget(size, size),
      blurVertical: createRenderTarget(size, size),
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const blackbodyToRgb = (temperature) => {
    const value = Math.min(15000, Math.max(3000, Number(temperature))) / 100;
    const red =
      value <= 66
        ? 255
        : 329.698727446 * Math.pow(value - 60, -0.1332047592);
    const green =
      value <= 66
        ? 99.4708025861 * Math.log(value) - 161.1195681661
        : 288.1221695283 * Math.pow(value - 60, -0.0755148492);
    const blue =
      value >= 66
        ? 255
        : value <= 19
          ? 0
          : 138.5177312231 * Math.log(value - 10) - 305.0447927307;
    return [red, green, blue].map(
      (channel) => Math.min(255, Math.max(0, channel)) / 255,
    );
  };

  const setTemperature = (temperature) => {
    const kelvin = Math.min(
      15000,
      Math.max(3000, Number(temperature) || 5800),
    );
    const rgb = blackbodyToRgb(kelvin);
    const peak = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
    const normalized = rgb.map((channel) => channel / peak);
    // Keep some of the preset's own colour so a star stays recognisable.
    tempTint = normalized.map((channel) => 0.45 + 0.55 * channel);
    state.color = rgbToHex(rgb);
    window.dispatchEvent(
      new CustomEvent("mysun:orb-color-change", {
        detail: { color: state.color, source: "temperature" },
      }),
    );
    requestStaticRender();
  };

  const setRamp = (next) => {
    if (!next) {
      return;
    }
    ["c0", "c1", "c2", "c3", "c4", "rim"].forEach((key) => {
      if (typeof next[key] === "string" && hexToRgb(next[key])) {
        ramp[key] = next[key];
      }
    });
    rebuildRamp();
    requestStaticRender();
  };

  const setParam = (name, value) => {
    if (!(name in state)) {
      return;
    }

    if (name === "color") {
      const rgb = hexToRgb(value);
      if (!rgb) {
        return;
      }
      const peak = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
      tempTint = rgb.map((channel) => 0.45 + 0.55 * (channel / peak));
      state.color = String(value);
      requestStaticRender();
      return;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return;
    }

    state[name] = numeric;
    if (name === "sharpness") {
      resizeForSharpness();
    }
    requestStaticRender();
  };

  const bindTexture = (texture, unit, uniform) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniform, unit);
  };

  const clearTarget = (framebuffer) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  const tinted = (key) => {
    const rgb = rampRgb[key] || [1, 1, 1];
    return [rgb[0] * tempTint[0], rgb[1] * tempTint[1], rgb[2] * tempTint[2]];
  };

  const renderOrb = (time) => {
    clearTarget(renderTargets.scene.framebuffer);
    gl.useProgram(orbProgram);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTime, time);
    scalarUniformNames.forEach((name) => {
      if (name === "uTime") {
        return;
      }
      const key = name.slice(1, 2).toLowerCase() + name.slice(2);
      gl.uniform1f(uniforms[name], state[key]);
    });
    gl.uniform3fv(uniforms.uC0, tinted("c0"));
    gl.uniform3fv(uniforms.uC1, tinted("c1"));
    gl.uniform3fv(uniforms.uC2, tinted("c2"));
    gl.uniform3fv(uniforms.uC3, tinted("c3"));
    gl.uniform3fv(uniforms.uC4, tinted("c4"));
    gl.uniform3fv(uniforms.uRimTint, tinted("rim"));
    gl.uniform2f(uniforms.uUserRotation, userRotation.x, userRotation.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const renderBlur = (source, target, directionX, directionY, threshold) => {
    clearTarget(target.framebuffer);
    gl.useProgram(blurProgram);
    bindTexture(source.texture, 0, blurUniforms.texture);
    gl.uniform2f(
      blurUniforms.direction,
      directionX / canvas.width,
      directionY / canvas.height,
    );
    gl.uniform1f(blurUniforms.threshold, threshold);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const renderComposite = () => {
    clearTarget(null);
    gl.useProgram(compositeProgram);
    bindTexture(renderTargets.scene.texture, 0, compositeUniforms.scene);
    bindTexture(
      renderTargets.blurVertical.texture,
      1,
      compositeUniforms.bloom,
    );
    gl.uniform1f(compositeUniforms.strength, state.bloomStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  function render(now) {
    if (!renderTargets) {
      return;
    }

    const time = reducedMotion.matches ? 3.2 : (now - startedAt) / 1000;
    renderOrb(time);
    renderBlur(
      renderTargets.scene,
      renderTargets.blurHorizontal,
      state.bloomRadius,
      0,
      state.bloomThreshold,
    );
    renderBlur(
      renderTargets.blurHorizontal,
      renderTargets.blurVertical,
      0,
      state.bloomRadius,
      0,
    );
    renderComposite();

    if (!reducedMotion.matches && visible) {
      animationFrame = window.requestAnimationFrame(render);
    }
  }

  const restart = () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(render);
  };

  function requestStaticRender() {
    if (reducedMotion.matches && renderTargets) {
      render(startedAt + 3200);
    }
  }

  const resetRotation = () => {
    userRotation.x = 0;
    userRotation.y = 0;
    requestStaticRender();
  };

  const rotateBy = (deltaX, deltaY) => {
    userRotation.x += deltaX;
    userRotation.y += deltaY;
    requestStaticRender();
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (
      (event.button !== undefined && event.button !== 0) ||
      temperatureInput?.disabled
    ) {
      return;
    }

    rotationPointerId = event.pointerId;
    rotationPointerX = event.clientX;
    rotationPointerY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-pointer-focused");
    sun.classList.add("is-user-rotating");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== rotationPointerId) {
      return;
    }

    const deltaX = event.clientX - rotationPointerX;
    const deltaY = event.clientY - rotationPointerY;
    rotationPointerX = event.clientX;
    rotationPointerY = event.clientY;
    rotateBy(deltaX * 0.012, deltaY * 0.012);
  });

  const finishRotation = (event) => {
    if (event.pointerId !== rotationPointerId) {
      return;
    }
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      /* pointer already released */
    }
    rotationPointerId = null;
    sun.classList.remove("is-user-rotating");
  };

  canvas.addEventListener("pointerup", finishRotation);
  canvas.addEventListener("pointercancel", finishRotation);
  canvas.addEventListener("dblclick", resetRotation);
  canvas.addEventListener("keydown", (event) => {
    canvas.classList.remove("is-pointer-focused");
    const keyboardStep = event.shiftKey ? 0.28 : 0.12;
    const direction = {
      ArrowLeft: [-keyboardStep, 0],
      ArrowRight: [keyboardStep, 0],
      ArrowUp: [0, -keyboardStep],
      ArrowDown: [0, keyboardStep],
    }[event.key];

    if (direction) {
      event.preventDefault();
      rotateBy(direction[0], direction[1]);
    } else if (event.key === "Home") {
      event.preventDefault();
      resetRotation();
    }
  });
  canvas.addEventListener("blur", () => {
    canvas.classList.remove("is-pointer-focused");
  });

  window.addEventListener("mysun:temperature-change", (event) => {
    setTemperature(event.detail.temperature);
  });

  reducedMotion.addEventListener("change", restart);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        restart();
      } else {
        window.cancelAnimationFrame(animationFrame);
      }
    });
    observer.observe(canvas);
  }

  window.mysunOrb = {
    getState: () => ({
      ...state,
      ramp: { ...ramp },
      rotationX: userRotation.x,
      rotationY: userRotation.y,
    }),
    reset: () => {
      Object.entries(defaults).forEach(([name, value]) => {
        setParam(name, value);
      });
      setRamp(defaultRamp);
      resetRotation();
    },
    resetRotation,
    rotateBy,
    setRamp,
    setParam,
    setTemperature,
  };

  try {
    resizeForSharpness();
    // Цвет задаёт пресет звезды; слайдер управляет нагревом, не кельвинами.
    setTemperature(5800);
    restart();
  } catch (error) {
    console.error("mysun orb:", error);
    sun.classList.add("orb-fallback");
  }
})();
