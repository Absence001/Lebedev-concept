(() => {
  "use strict";

  const frame = document.querySelector(".frame");
  const scene = document.querySelector(".scene");
  const wordmark = document.querySelector(".wordmark");
  const wordmarkText = document.querySelector(".wordmark-text");
  const scrollHint = document.querySelector(".scroll-hint");
  const sunStage = document.querySelector(".sun-stage");
  const sun = document.querySelector(".sun");
  const refraction = document.querySelector(".refraction");
  const statusbar = document.querySelector(".statusbar");
  const controls = [...document.querySelectorAll(".gbtn")];
  const tabs = [...document.querySelectorAll(".tab")];
  const tabsRail = document.querySelector(".tabs");
  const tabsTrack = document.querySelector(".tabs-track");
  const tabPill = document.querySelector(".tab-pill");
  const rays = document.querySelector(".rays");
  const description = document.querySelector(".desc");
  const titleWords = [...document.querySelectorAll("[data-title-word]")];
  const tabLabels = [...document.querySelectorAll(".tab-label")];
  const uiLabels = [...document.querySelectorAll("[data-ui-label]")];
  const editIcon = document.querySelector(".title .edit");
  const sliderWrap = document.querySelector(".sliderwrap");
  const slider = document.querySelector(".slider");
  const temperatureInput = document.querySelector(".temp-input");
  const sizeReadout = document.querySelector(".size-readout");
  const sizeReadoutIn = document.querySelector(".size-readout-in");
  const subtitleLine = document.querySelector(".subtitle-line");
  const handle = document.querySelector(".handle");
  const orderButton = document.querySelector(".order");
  const homeIndicator = document.querySelector(".home");
  // Кнопка «назад» убрана из интерфейса (остался невидимый спейсер
  // для центрирования вордмарка) — управлять его disabled-состоянием
  // и слушать клики больше не нужно.
  const gearButton = document.querySelector(".gear");
  const titleButton = document.querySelector(".title");
  const titleName = document.querySelector(".title-name");
  const titleEditor = document.querySelector(".title-editor");
  const orderTransition = document.querySelector(".order-transition");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (
    !frame ||
    !scene ||
    !wordmark ||
    !sunStage ||
    !sun ||
    !temperatureInput ||
    !handle
  ) {
    return;
  }

  // Интерфейс выезжает снизу после градиентов — окна ревила смещены
  // в 0.62…1.0 общей шкалы, кнопка приходит последней.
  const revealSequence = [
    { elements: [statusbar, ...controls, homeIndicator], start: 0.62, end: 0.74 },
    { elements: [tabsRail], start: 0.66, end: 0.79 },
    { elements: [description], start: 0.7, end: 0.85, blur: 0 },
    { elements: [sliderWrap], start: 0.76, end: 0.91 },
    { elements: [orderButton], start: 0.83, end: 1 },
  ];

  // Интро-лого: расстояние от низа сцены до центра надписи и её масштаб.
  const INTRO_BOTTOM_GAP = 148;
  const INTRO_SCALE = 1.5;
  // Загрузка: короткая чёрная пауза → надпись и стрелка. Градиента здесь нет.
  const LOADER_MS = 420;
  // Клик → градиент под вуалью (последняя вспышка гаснет к ~2400мс),
  // затем вуаль растворяется и интерфейс виден целиком.
  const GRADIENT_MS = 2450;

  let logoOffsetX = 0;
  let logoOffsetY = 0;
  let currentProgress = -1;
  let progressFrame = 0;
  let scrubFrame = 0;
  let completionSent = false;
  let subtitleShown = false;
  let initialSliderVisual = true;
  let currentTemperature = 5800;
  let currentEnergy = 0.5;
  let currentDiameter = 1; // радиус Солнца — стартовый пресет
  let currentPreset = "sun";
  let sliderPointerId = null;
  let keyboardIdleTimer = 0;
  let orderInProgress = false;

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));

  const lerp = (from, to, progress) => from + (to - from) * progress;

  const range = (progress, start, end) =>
    clamp((progress - start) / (end - start));

  const ease = (progress) => {
    const value = clamp(progress);
    return 1 - Math.pow(1 - value, 3);
  };

  const cubicBezier = (progress, x1, y1, x2, y2) => {
    const target = clamp(progress);
    let lower = 0;
    let upper = 1;
    let t = target;

    for (let index = 0; index < 12; index += 1) {
      const inverse = 1 - t;
      const x =
        3 * inverse * inverse * t * x1 +
        3 * inverse * t * t * x2 +
        t * t * t;
      if (x < target) {
        lower = t;
      } else {
        upper = t;
      }
      t = (lower + upper) / 2;
    }

    const inverse = 1 - t;
    return (
      3 * inverse * inverse * t * y1 +
      3 * inverse * t * t * y2 +
      t * t * t
    );
  };

  const softBlurEase = (progress) =>
    cubicBezier(progress, 0.22, 1, 0.36, 1);

  const setMotionState = (
    element,
    progress,
    distance = 12,
    blur = 4,
  ) => {
    if (!element) {
      return;
    }

    const eased = ease(progress);
    element.style.opacity = eased.toFixed(4);
    element.style.transform = `translate3d(0, ${(
      distance *
      (1 - eased)
    ).toFixed(3)}px, 0)`;
    element.style.filter = `blur(${(blur * (1 - eased)).toFixed(3)}px)`;
    element.style.pointerEvents = eased > 0.98 ? "" : "none";
  };

  // Лёгкий, но заметный баунс: элемент чуть переезжает цель и садится обратно.
  const easeOutBack = (progress) => {
    const x = clamp(progress);
    const c = 2;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };

  const setBounceState = (
    element,
    progress,
    distance = 56,
    blur = 4,
    fromScale = 0.945,
  ) => {
    if (!element) {
      return;
    }

    const opacity = ease(progress);

    // Полностью проявлено — снимаем inline-стили, чтобы CSS-состояния
    // (:hover / :active scale(.96)) снова работали. Правило скилла.
    if (opacity > 0.999) {
      element.style.opacity = "";
      element.style.transform = "";
      element.style.filter = "";
      element.style.pointerEvents = "";
      return;
    }

    const bounced = easeOutBack(progress);
    element.style.opacity = opacity.toFixed(4);
    element.style.transform = `translate3d(0, ${(
      distance *
      (1 - bounced)
    ).toFixed(3)}px, 0) scale(${lerp(fromScale, 1, bounced).toFixed(4)})`;
    element.style.filter = `blur(${(
      blur * Math.max(0, 1 - bounced)
    ).toFixed(3)}px)`;
    element.style.pointerEvents = "none";
  };

  const setSoftBlurState = (
    element,
    progress,
    { distance = 9.28, blur = 12 } = {},
  ) => {
    if (!element) {
      return;
    }

    const eased = softBlurEase(progress);
    element.style.opacity = eased.toFixed(4);
    element.style.transform = `translate3d(0, ${(
      distance *
      (1 - eased)
    ).toFixed(3)}px, 0)`;
    element.style.filter = `blur(${(blur * (1 - eased)).toFixed(3)}px)`;
  };

  const measureMorph = () => {
    wordmark.style.transform = "none";

    // Интро: надпись стоит ВНИЗУ экрана (над стрелкой), как в лоадере-референсе.
    // По скроллу она доезжает в топбар — логотип становится элементом интерфейса.
    const wordmarkRect = wordmark.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    logoOffsetX =
      sceneRect.left +
      sceneRect.width / 2 -
      (wordmarkRect.left + wordmarkRect.width / 2);
    logoOffsetY =
      sceneRect.bottom -
      INTRO_BOTTOM_GAP -
      (wordmarkRect.top + wordmarkRect.height / 2);
    updateScene(currentProgress < 0 ? 0 : currentProgress, true);
  };

  const updateScene = (progress, force = false) => {
    const p = reducedMotion.matches ? 1 : clamp(progress);
    if (!force && Math.abs(p - currentProgress) < 0.0001) {
      return;
    }

    currentProgress = p;
    scene.classList.add("is-scrubbing");

    const ignition = ease(range(p, 0.15, 0.45));
    const glass = ease(range(p, 0.45, 0.75));
    const logoMorph = ease(range(p, 0.45, 0.75));
    const sphereScale =
      p < 0.45
        ? lerp(0.1, 0.7, ignition)
        : lerp(0.7, 1, glass);
    const sphereOpacity = ease(range(p, 0.15, 0.25));

    wordmark.style.transform = `translate3d(${(
      logoOffsetX *
      (1 - logoMorph)
    ).toFixed(3)}px, ${(logoOffsetY * (1 - logoMorph)).toFixed(
      3,
    )}px, 0) scale(${lerp(INTRO_SCALE, 1, logoMorph).toFixed(4)})`;

    sunStage.style.opacity = sphereOpacity.toFixed(4);
    sunStage.style.transform = `translate3d(0, ${lerp(
      -4,
      0,
      glass,
    ).toFixed(3)}px, 0) scale(${sphereScale.toFixed(4)})`;
    sun.style.setProperty("--light-progress", ignition.toFixed(4));
    sun.style.setProperty("--glass-progress", glass.toFixed(4));

    if (rays) {
      rays.style.opacity = (ignition * (0.55 + 0.55 * currentEnergy)).toFixed(4);
    }

    const refractionPeak =
      p < 0.75
        ? range(p, 0.45, 0.6)
        : 1 - range(p, 0.75, 0.95);
    const amplitude = lerp(3.7, 14.4, glass);
    refraction.style.opacity = (clamp(refractionPeak) * 0.46).toFixed(4);
    refraction.style.transform = `scale(${(
      1 +
      amplitude / 240
    ).toFixed(4)}) translate3d(${lerp(-1.5, 2.4, glass).toFixed(
      3,
    )}%, ${lerp(2, -1, glass).toFixed(3)}%, 0)`;
    refraction.style.filter = `blur(${lerp(2.4, 0.6, glass).toFixed(
      3,
    )}px) saturate(${lerp(1, 1.35, glass).toFixed(3)})`;

    const hintVisibility = 1 - ease(range(p, 0.02, 0.15));
    scrollHint.style.opacity = hintVisibility.toFixed(4);

    revealSequence.forEach(({ elements, start, end, blur = 4 }) => {
      const revealProgress = range(p, start, end);
      elements.forEach((element) =>
        setBounceState(element, revealProgress, 56, blur),
      );
    });

    titleWords.forEach((word, index) => {
      const wordProgress = range(p, 0.81 + index * 0.02, 0.89 + index * 0.02);
      setSoftBlurState(word, wordProgress);
    });

    tabLabels.forEach((label, index) => {
      const labelProgress = range(p, 0.78 + index * 0.008, 0.86 + index * 0.008);
      setSoftBlurState(label, labelProgress, { distance: 4, blur: 3 });
    });

    uiLabels.forEach((label, index) => {
      const labelProgress = range(p, 0.86 + index * 0.008, 0.93 + index * 0.008);
      setSoftBlurState(label, labelProgress, { distance: 4, blur: 3 });
    });
    setSoftBlurState(editIcon, range(p, 0.87, 0.94), {
      distance: 4,
      blur: 3,
    });

    const editorReady = p > 0.94;
    tabs.forEach((tab) => {
      tab.disabled = !editorReady;
      tab.setAttribute("aria-disabled", String(!editorReady));
    });
    temperatureInput.disabled = !editorReady;
    titleButton.disabled = !editorReady;
    orderButton.disabled = !editorReady;
    gearButton.disabled = !editorReady;

    // Подпись живёт ровно столько, сколько экран редактора активен, и
    // переключается только на переходе — иначе она залипала в зазоре
    // между editorReady (0.94) и порогом завершения ACT 1.
    if (editorReady !== subtitleShown) {
      subtitleShown = editorReady;
      if (editorReady) {
        revealSubtitle(phraseForEnergy(currentEnergy));
      } else {
        hideSubtitle();
      }
    }

    if (p >= 0.999 && !completionSent) {
      completionSent = true;
      window.dispatchEvent(
        new CustomEvent("mysun:act1-complete", {
          detail: { progress: 1 },
        }),
      );
    } else if (p < 0.99) {
      completionSent = false;
    }

    window.cancelAnimationFrame(scrubFrame);
    scrubFrame = window.requestAnimationFrame(() => {
      scrubFrame = 0;
      scene.classList.remove("is-scrubbing");
    });
  };

  // Скролл — основной драйвер метаморфозы (по ТЗ: логотип по мере скролла
  // превращается в элементы интерфейса). Клик по стрелке/фону — только
  // быстрая перемотка поверх того же прогресса, см. revealViaShortcut.
  const getScrollProgress = () => {
    const maximum = frame.scrollHeight - frame.clientHeight;
    return maximum <= 0 ? 1 : frame.scrollTop / maximum;
  };

  const requestProgressUpdate = () => {
    if (progressFrame) {
      return;
    }

    progressFrame = window.requestAnimationFrame(() => {
      progressFrame = 0;
      updateScene(getScrollProgress());
    });
  };

  const blackbodyToRgb = (temperature) => {
    const t = clamp(temperature, 3000, 15000) / 100;
    const red =
      t <= 66
        ? 255
        : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const green =
      t <= 66
        ? 99.4708025861 * Math.log(t) - 161.1195681661
        : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const blue =
      t >= 66
        ? 255
        : t <= 19
          ? 0
          : 138.5177312231 * Math.log(t - 10) - 305.0447927307;

    return [red, green, blue].map((channel) =>
      Math.round(clamp(channel, 0, 255)),
    );
  };

  const mixRgb = (source, target, amount) =>
    source.map((channel, index) =>
      Math.round(lerp(channel, target[index], amount)),
    );

  const rgbString = (rgb) => `rgb(${rgb.join(" ")})`;

  const hexToRgbTriplet = (hex) => {
    const normalized = String(hex || "").replace("#", "");
    if (normalized.length !== 6) {
      return null;
    }
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(normalized.slice(offset, offset + 2), 16),
    );
    return channels.some(Number.isNaN) ? null : channels.join(" ");
  };

  const moveSliderHandle = (energy) => {
    const value = clamp(energy);
    const handleWidth = handle.offsetWidth || 3;
    const trackWidth = slider.clientWidth;
    const x = (trackWidth - handleWidth) * value;

    slider.style.setProperty("--slider-x", `${x.toFixed(2)}px`);
    slider.style.setProperty("--slider-fill", `${(value * 100).toFixed(2)}%`);

    // Пилюля со значением едет за риской, но не вылезает за края линейки.
    if (sizeReadout) {
      // getBoundingClientRect, а не offsetWidth: округление до целых давало
      // выезд пилюли за край на доли пикселя.
      const badgeWidth = sizeReadout.getBoundingClientRect().width;
      const centered = x + handleWidth / 2 - badgeWidth / 2;
      const clamped = clamp(centered, 0, Math.max(0, trackWidth - badgeWidth));
      slider.style.setProperty("--readout-x", `${clamped.toFixed(2)}px`);
    }
  };

  // Нагрев — единственная ось персонализации после выбора звезды.
  // Слайдер ведёт светимость и активность магмы (calm → blaze, свой диапазон
  // у каждой звезды). Физический радиус звезды от него не зависит — это её
  // собственное свойство (STAR_PRESETS[x].radiusSolar), реальная величина в
  // солнечных радиусах, стандартная единица измерения размера звёзд.

  // --- Подпись состояния: посимвольное появление через skill serega-emotional.
  // Пока крутим ползунок — она уходит; как только отпустили, приходит фраза,
  // соответствующая выбранному радиусу. Уход добавлен по прямой просьбе
  // (сам скилл вход-only: «Exit: none»).
  let seregaInstance = null;
  let subtitlePhrase = "Ровное и ясное";

  const phraseForEnergy = (energy) =>
    energy < 0.25
      ? "Тихое и тёплое"
      : energy < 0.5
        ? "Ровное и ясное"
        : energy < 0.78
          ? "Яркое и живое"
          : "Раскалённое и бурное";

  const hideSubtitle = () => {
    // Вызывается в том числе покадрово на скролле — выходим, если уже скрыта.
    if (!subtitleLine || subtitleLine.classList.contains("is-hidden")) {
      return;
    }
    seregaInstance?.destroy();
    seregaInstance = null;
    subtitleLine.textContent = subtitlePhrase;
    subtitleLine.classList.add("is-hidden");
  };

  const revealSubtitle = (phrase = subtitlePhrase) => {
    if (!subtitleLine) {
      return;
    }
    subtitlePhrase = phrase;
    seregaInstance?.destroy();
    seregaInstance = null;
    subtitleLine.textContent = phrase;
    subtitleLine.classList.remove("is-hidden");

    if (reducedMotion.matches || typeof window.seregaEmotional !== "function") {
      return;
    }
    seregaInstance = window.seregaEmotional(subtitleLine, { text: phrase });
  };

  // Пилюля с радиусом видна только пока идёт взаимодействие со шкалой.
  // Модальность считаем сами: ни activeElement, ни :focus-visible не годятся —
  // клик мышью фокусирует нативный range, и пилюля залипала после отпускания.
  let sliderKeyboardActive = false;

  const syncSliderActive = () => {
    slider.classList.toggle(
      "is-active",
      sliderPointerId !== null || sliderKeyboardActive,
    );
  };

  const applyEnergy = (value, { moveHandle = true } = {}) => {
    const energy = clamp(Number(value));
    currentEnergy = energy;

    const presetConfig = STAR_PRESETS[currentPreset];
    if (presetConfig?.energy && window.mysunOrb?.setParam) {
      const { calm, blaze } = presetConfig.energy;
      Object.keys(calm).forEach((name) => {
        window.mysunOrb.setParam(name, lerp(calm[name], blaze[name], energy));
      });
    }

    currentDiameter = presetConfig?.radiusSolar ?? currentDiameter;
    if (sizeReadoutIn) {
      sizeReadoutIn.textContent = `${currentDiameter} R☉`;
    }

    const percent = Math.round(energy * 100);
    temperatureInput.value = String(percent);
    temperatureInput.setAttribute(
      "aria-valuetext",
      `Нагрев ${percent}%. Радиус звезды — ${currentDiameter} солнечных радиусов`,
    );
    sun.dataset.energy = String(percent);

    if (moveHandle) {
      initialSliderVisual = false;
      moveSliderHandle(energy);
    }
  };

  // Цвет звезды. Задаётся только пресетом — слайдер его больше не перетирает,
  // иначе выбранная звезда переставала быть собой.
  const applyTemperature = (temperature, { announce = true } = {}) => {
    const value = Math.round(clamp(Number(temperature), 3000, 15000));
    const rgb = blackbodyToRgb(value);
    const white = [255, 255, 255];
    const black = [0, 0, 0];

    currentTemperature = value;
    sun.dataset.temperature = String(value);
    sun.style.setProperty("--bb-rgb", rgb.join(" "));
    slider.style.setProperty("--bb-rgb", rgb.join(" "));
    scene.style.setProperty("--ray-rgb", rgb.join(" "));
    sun.style.setProperty("--core", rgbString(mixRgb(rgb, white, 0.84)));
    sun.style.setProperty("--c1", rgbString(mixRgb(rgb, white, 0.58)));
    sun.style.setProperty("--c2", rgbString(mixRgb(rgb, white, 0.28)));
    sun.style.setProperty("--c3", rgbString(rgb));
    sun.style.setProperty("--c4", rgbString(mixRgb(rgb, black, 0.2)));
    sun.style.setProperty("--c5", rgbString(mixRgb(rgb, black, 0.48)));
    sun.style.setProperty("--top", rgbString(mixRgb(rgb, black, 0.72)));
    sun.style.setProperty("--halo", `rgb(${rgb.join(" ")} / .45)`);

    if (announce) {
      window.dispatchEvent(
        new CustomEvent("mysun:temperature-change", {
          detail: { temperature: value, rgb },
        }),
      );
    }
  };

  // Пресеты звёзд для стеклянного шейдера (orb.js):
  //   ramp   — цветовая гамма звезды: c0 (тень) → c4 (раскалённый центр) + rim
  //   params — характер: размер, турбулентность потока, скорость, светимость
  //   temperature — тонировка по blackbody (шкала сдвигает её дальше)
  const STAR_PRESETS = {
    // G2V, ~5800K — золотое солнце: живой поток, тёплый белый центр
    sun: {
      temperature: 5800,
      // Реальный радиус звезды в солнечных радиусах (R☉) — 1 R☉ = радиус Солнца.
      radiusSolar: 1,
      // Нагрев: размер + светимость + активность магмы
      energy: {
        calm:  { radius: 0.52, exposure: 1.15, glowGain: 0.38, bloomStrength: 0.45,
                 flowSpeed: 0.35, warp: 0.30, contrast: 0.85, lift: 0.12, rimGain: 0.50 },
        blaze: { radius: 0.74, exposure: 1.95, glowGain: 1.05, bloomStrength: 0.95,
                 flowSpeed: 1.90, warp: 0.85, contrast: 1.35, lift: 0.46, rimGain: 0.90 },
      },
      ramp: {
        c0: "#7a2200", c1: "#e04e00", c2: "#ff8c1a",
        c3: "#ffd166", c4: "#fff6df", rim: "#ffdca8",
      },
      params: {
        radius: 0.66, wobble: 0.06, edgeSoft: 0.03,
        flowScale: 1.5, flowSpeed: 1.0, warp: 0.55,
        contrast: 1.05, lift: 0.3,
        rimWidth: 9, rimGain: 0.7, specGain: 0.3, specTight: 26,
        glowGain: 0.7, glowFalloff: 6.5,
        exposure: 1.5, saturation: 1.2, bloomStrength: 0.7, sharpness: 0.85,
      },
    },
    // K1.5 III оранжевый гигант, ~4300K — крупный, медный, спокойный
    arcturus: {
      temperature: 4300,
      // Реальный радиус звезды в солнечных радиусах (R☉) — 1 R☉ = радиус Солнца.
      radiusSolar: 25,
      energy: {
        calm:  { radius: 0.56, exposure: 1.10, glowGain: 0.45, bloomStrength: 0.50,
                 flowSpeed: 0.20, warp: 0.35, contrast: 0.80, lift: 0.16, rimGain: 0.46 },
        blaze: { radius: 0.76, exposure: 1.85, glowGain: 1.15, bloomStrength: 1.00,
                 flowSpeed: 1.10, warp: 0.95, contrast: 1.25, lift: 0.50, rimGain: 0.82 },
      },
      ramp: {
        c0: "#6e1c02", c1: "#c94100", c2: "#ff801f",
        c3: "#ffc06b", c4: "#fff0d8", rim: "#ffcf9a",
      },
      params: {
        radius: 0.68, wobble: 0.05, edgeSoft: 0.035,
        flowScale: 1.2, flowSpeed: 0.55, warp: 0.62,
        contrast: 0.95, lift: 0.34,
        rimWidth: 8, rimGain: 0.64, specGain: 0.26, specTight: 22,
        glowGain: 0.82, glowFalloff: 5.6,
        exposure: 1.45, saturation: 1.24, bloomStrength: 0.76, sharpness: 0.84,
      },
    },
    // G-гиганты, ~5000K — яркая золотисто-кремовая, энергичная
    capella: {
      temperature: 5000,
      // Реальный радиус звезды в солнечных радиусах (R☉) — 1 R☉ = радиус Солнца.
      radiusSolar: 12,
      energy: {
        calm:  { radius: 0.50, exposure: 1.20, glowGain: 0.40, bloomStrength: 0.48,
                 flowSpeed: 0.45, warp: 0.28, contrast: 0.90, lift: 0.16, rimGain: 0.55 },
        blaze: { radius: 0.72, exposure: 2.05, glowGain: 1.10, bloomStrength: 1.00,
                 flowSpeed: 2.30, warp: 0.78, contrast: 1.42, lift: 0.50, rimGain: 0.98 },
      },
      ramp: {
        c0: "#7a4a02", c1: "#d99200", c2: "#ffc23d",
        c3: "#ffe89a", c4: "#fffdf4", rim: "#ffefc6",
      },
      params: {
        radius: 0.63, wobble: 0.07, edgeSoft: 0.028,
        flowScale: 1.75, flowSpeed: 1.25, warp: 0.5,
        contrast: 1.12, lift: 0.34,
        rimWidth: 10, rimGain: 0.76, specGain: 0.34, specTight: 28,
        glowGain: 0.74, glowFalloff: 6.8,
        exposure: 1.6, saturation: 1.16, bloomStrength: 0.8, sharpness: 0.86,
      },
    },
    // M2 Iab красный сверхгигант, ~3500K — огромный, медленный, бурный
    betelgeuse: {
      temperature: 3500,
      // Реальный радиус звезды в солнечных радиусах (R☉) — 1 R☉ = радиус Солнца.
      radiusSolar: 700,
      energy: {
        calm:  { radius: 0.58, exposure: 1.00, glowGain: 0.50, bloomStrength: 0.55,
                 flowSpeed: 0.12, warp: 0.50, contrast: 0.95, lift: 0.06, rimGain: 0.40 },
        blaze: { radius: 0.76, exposure: 1.75, glowGain: 1.25, bloomStrength: 1.05,
                 flowSpeed: 0.75, warp: 1.25, contrast: 1.50, lift: 0.42, rimGain: 0.74 },
      },
      ramp: {
        c0: "#6b0a10", c1: "#b81f18", c2: "#f5551f",
        c3: "#ff9f57", c4: "#ffe6c4", rim: "#ffa878",
      },
      params: {
        radius: 0.72, wobble: 0.1, edgeSoft: 0.045,
        flowScale: 1.0, flowSpeed: 0.32, warp: 0.8,
        contrast: 1.2, lift: 0.24,
        rimWidth: 7, rimGain: 0.58, specGain: 0.22, specTight: 18,
        glowGain: 0.95, glowFalloff: 4.8,
        exposure: 1.38, saturation: 1.3, bloomStrength: 0.86, sharpness: 0.82,
      },
    },
    // B8 Ia голубой сверхгигант, ~12000K — горячий, стремительный, слепящий
    rigel: {
      temperature: 12000,
      // Реальный радиус звезды в солнечных радиусах (R☉) — 1 R☉ = радиус Солнца.
      radiusSolar: 79,
      energy: {
        calm:  { radius: 0.48, exposure: 1.30, glowGain: 0.45, bloomStrength: 0.55,
                 flowSpeed: 0.60, warp: 0.25, contrast: 0.85, lift: 0.20, rimGain: 0.62 },
        blaze: { radius: 0.70, exposure: 2.20, glowGain: 1.20, bloomStrength: 1.15,
                 flowSpeed: 2.80, warp: 0.70, contrast: 1.30, lift: 0.55, rimGain: 1.15 },
      },
      ramp: {
        c0: "#12306e", c1: "#2a63c9", c2: "#5ba0ff",
        c3: "#b8dbff", c4: "#ffffff", rim: "#d8ebff",
      },
      params: {
        radius: 0.6, wobble: 0.04, edgeSoft: 0.026,
        flowScale: 2.0, flowSpeed: 1.6, warp: 0.42,
        contrast: 1.0, lift: 0.36,
        rimWidth: 12, rimGain: 0.88, specGain: 0.4, specTight: 32,
        glowGain: 0.88, glowFalloff: 7.6,
        exposure: 1.72, saturation: 1.1, bloomStrength: 0.92, sharpness: 0.9,
      },
    },
  };

  const selectPreset = (preset) => {
    const selectedTab = tabs.find((tab) => tab.dataset.preset === preset);
    if (!selectedTab) {
      return;
    }

    currentPreset = preset;
    tabs.forEach((tab) => {
      const selected = tab === selectedTab;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    sun.dataset.preset = preset;

    positionPill();
    scrollTabIntoView(selectedTab);

    const presetConfig = STAR_PRESETS[preset];
    if (presetConfig) {
      window.mysunOrb?.setRamp?.(presetConfig.ramp);
      if (window.mysunOrb?.setParam) {
        Object.entries(presetConfig.params).forEach(([name, value]) => {
          window.mysunOrb.setParam(name, value);
        });
      }
      // Акцент шкалы — насыщенный цвет из гаммы звезды, а не бело-жёлтая
      // тонировка по blackbody: иначе пройденные штрихи сливаются с обычными.
      const accent = hexToRgbTriplet(presetConfig.ramp?.c2);
      if (accent) {
        slider.style.setProperty("--accent-rgb", accent);
      }
      applyTemperature(presetConfig.temperature);
      // Нагрев сохраняется при смене звезды, но пересчитывается в её диапазоне.
      applyEnergy(currentEnergy, { moveHandle: false });
    }

    window.dispatchEvent(
      new CustomEvent("mysun:preset-change", {
        detail: {
          preset,
          label: selectedTab.textContent.trim(),
          temperature: currentTemperature,
          energy: currentEnergy,
          diameter: currentDiameter,
        },
      }),
    );
  };

  const finishNameEditing = ({ cancel = false } = {}) => {
    if (!description.classList.contains("is-editing")) {
      return;
    }

    const nextValue = titleEditor.value.trim().slice(0, 24);
    if (!cancel && nextValue) {
      titleName.textContent = nextValue;
      window.dispatchEvent(
        new CustomEvent("mysun:name-change", {
          detail: { name: titleName.textContent },
        }),
      );
    }
    description.classList.remove("is-editing");
    titleEditor.classList.remove("is-editing");
    titleEditor.setAttribute("aria-hidden", "true");
    titleButton.removeAttribute("aria-hidden");
    titleButton.focus({ preventScroll: true });
  };

  // Клика больше нет: единственный драйвер метаморфозы — скролл (по ТЗ).
  // Вспышки градиента теперь играют один раз в лоадере при заходе на
  // страницу, см. finishLoader ниже, а не по действию пользователя.
  frame.addEventListener("scroll", requestProgressUpdate, { passive: true });

  // --- Switcher control: sliding pill + drag-scroll + overflow fade ---
  function positionPill() {
    const active = tabs.find((tab) => tab.classList.contains("active"));
    if (!active || !tabPill) {
      return;
    }
    tabPill.style.height = `${active.offsetHeight}px`;
    tabPill.style.width = `${active.offsetWidth}px`;
    tabPill.style.top = `${active.offsetTop}px`;
    tabPill.style.transform = `translate3d(${active.offsetLeft}px, 0, 0)`;
  }

  function scrollTabIntoView(tab) {
    if (!tab || !tabsTrack) {
      return;
    }
    const pad = 12;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    const viewLeft = tabsTrack.scrollLeft;
    const viewRight = viewLeft + tabsTrack.clientWidth;
    const behavior = reducedMotion.matches ? "auto" : "smooth";
    if (left - pad < viewLeft) {
      tabsTrack.scrollTo({ left: left - pad, behavior });
    } else if (right + pad > viewRight) {
      tabsTrack.scrollTo({ left: right + pad - tabsTrack.clientWidth, behavior });
    }
  }

  function updateEdgeFade() {
    if (!tabsTrack || !tabsRail) {
      return;
    }
    const maximum = tabsTrack.scrollWidth - tabsTrack.clientWidth;
    const x = tabsTrack.scrollLeft;
    const hasLeft = x > 1;
    const hasRight = x < maximum - 1;
    let mask = "none";
    if (hasLeft && hasRight) {
      mask = "linear-gradient(90deg,transparent 0,#000 12%,#000 88%,transparent 100%)";
    } else if (hasRight) {
      mask = "linear-gradient(90deg,#000 84%,transparent 100%)";
    } else if (hasLeft) {
      mask = "linear-gradient(90deg,transparent 0,#000 16%)";
    }
    tabsRail.style.webkitMaskImage = mask;
    tabsRail.style.maskImage = mask;
  }

  if (tabsTrack) {
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let moved = false;
    let pointerId = null;

    tabsTrack.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      dragging = true;
      moved = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = tabsTrack.scrollLeft;
      delete tabsTrack.dataset.suppressClick;
      tabsTrack.classList.add("is-dragging");
    });

    tabsTrack.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }
      const dx = event.clientX - startX;
      if (!moved && Math.abs(dx) > 3) {
        moved = true;
        try {
          tabsTrack.setPointerCapture?.(pointerId);
        } catch (error) {
          /* pointer not capturable (e.g. synthetic event) */
        }
      }
      if (moved) {
        tabsTrack.scrollLeft = startScroll - dx;
      }
    });

    const endDrag = (event) => {
      if (!dragging || (event.pointerId !== undefined && event.pointerId !== pointerId)) {
        return;
      }
      dragging = false;
      tabsTrack.classList.remove("is-dragging");
      try {
        tabsTrack.releasePointerCapture?.(pointerId);
      } catch (error) {
        /* pointer already released */
      }
      if (moved) {
        tabsTrack.dataset.suppressClick = "1";
      }
    };

    tabsTrack.addEventListener("pointerup", endDrag);
    tabsTrack.addEventListener("pointercancel", endDrag);
    tabsTrack.addEventListener("scroll", updateEdgeFade, { passive: true });

    tabsTrack.addEventListener("keydown", (event) => {
      const direction =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!direction) {
        return;
      }
      event.preventDefault();
      const index = tabs.findIndex((tab) => tab.classList.contains("active"));
      const next = tabs[Math.min(tabs.length - 1, Math.max(0, index + direction))];
      if (next && next.dataset.preset !== currentPreset) {
        selectPreset(next.dataset.preset);
        next.focus({ preventScroll: true });
      }
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tabsTrack && tabsTrack.dataset.suppressClick) {
        delete tabsTrack.dataset.suppressClick;
        return;
      }
      selectPreset(tab.dataset.preset);
    });
  });

  // Place the pill without animating on first paint, then enable transitions.
  // orb.js loads after this file, so the starting star is applied on the next
  // frame — by then window.mysunOrb exists (or we are in the CSS fallback).
  window.requestAnimationFrame(() => {
    positionPill();
    updateEdgeFade();
    selectPreset(currentPreset);
    window.requestAnimationFrame(() => tabsTrack?.classList.add("is-ready"));
  });

  // Web fonts change tab widths — recompute once Inter has loaded.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      measureMorph();
      positionPill();
      updateEdgeFade();
    });
  }

  temperatureInput.addEventListener("input", () => {
    applyEnergy(Number(temperatureInput.value) / 100);
  });

  const applyEnergyFromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    applyEnergy(clamp((event.clientX - rect.left) / rect.width));
  };

  slider.addEventListener("pointerdown", (event) => {
    if (temperatureInput.disabled) {
      return;
    }

    sliderPointerId = event.pointerId;
    try {
      slider.setPointerCapture?.(event.pointerId);
    } catch (error) {
      /* pointer not capturable — dragging still works */
    }
    slider.classList.add("is-dragging");
    syncSliderActive();
    hideSubtitle();
    applyEnergyFromPointer(event);
  });

  slider.addEventListener("pointermove", (event) => {
    if (sliderPointerId !== event.pointerId) {
      return;
    }
    applyEnergyFromPointer(event);
  });

  const finishSliderPointer = (event) => {
    if (sliderPointerId !== event.pointerId) {
      return;
    }
    try {
      slider.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      /* pointer already released */
    }
    sliderPointerId = null;
    slider.classList.remove("is-dragging");
    syncSliderActive();
    revealSubtitle(phraseForEnergy(currentEnergy));
  };

  slider.addEventListener("pointerup", finishSliderPointer);
  slider.addEventListener("pointercancel", finishSliderPointer);

  window.addEventListener("blur", () => {
    sliderPointerId = null;
    slider.classList.remove("is-dragging");
  });

  window.addEventListener("pointerup", () => {
    slider.classList.remove("is-dragging");
    syncSliderActive();
  });

  temperatureInput.addEventListener("keydown", () => {
    slider.classList.add("is-keyboard-control");
    sliderKeyboardActive = true;
    syncSliderActive();
    hideSubtitle();
  });

  temperatureInput.addEventListener("keyup", () => {
    slider.classList.remove("is-keyboard-control");
    revealSubtitle(phraseForEnergy(currentEnergy));
    // Клавиатурная правка идёт сериями — прячем пилюлю не сразу.
    window.clearTimeout(keyboardIdleTimer);
    keyboardIdleTimer = window.setTimeout(() => {
      sliderKeyboardActive = false;
      syncSliderActive();
    }, 900);
  });

  temperatureInput.addEventListener("blur", () => {
    window.clearTimeout(keyboardIdleTimer);
    sliderKeyboardActive = false;
    syncSliderActive();
  });

  titleButton.addEventListener("click", () => {
    titleEditor.value = titleName.textContent.trim();
    description.classList.add("is-editing");
    titleEditor.classList.add("is-editing");
    titleEditor.setAttribute("aria-hidden", "false");
    titleButton.setAttribute("aria-hidden", "true");
    titleEditor.focus({ preventScroll: true });
    // Каретка в конец, без выделения текста — просьба: только мигающая
    // белая линия, без синей подсветки.
    const caretPosition = titleEditor.value.length;
    titleEditor.setSelectionRange(caretPosition, caretPosition);
  });

  titleEditor.addEventListener("blur", () => {
    finishNameEditing();
  });

  titleEditor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishNameEditing();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishNameEditing({ cancel: true });
    }
  });

  const openReadyScreen = () => {
    if (orderInProgress) {
      return;
    }

    orderInProgress = true;
    orderButton.disabled = true;
    frame.dataset.orderRequested = "true";

    // Переносим на финал ровно то солнце, что настроил пользователь:
    // полное состояние орба (цвет/параметры шейдера/поворот) + имя + пресет.
    try {
      window.sessionStorage.setItem(
        "mysun:order",
        JSON.stringify({
          orb: window.mysunOrb?.getState?.() ?? null,
          name: titleName.textContent.trim(),
          preset: currentPreset,
          temperature: currentTemperature,
          energy: currentEnergy,
          diameter: currentDiameter,
        }),
      );
    } catch (error) {
      /* sessionStorage недоступен — финал откроется с дефолтным орбом */
    }

    scene.classList.add("is-ordering");

    const delay = reducedMotion.matches ? 80 : 420;
    window.setTimeout(() => {
      window.location.href = "./ready.html";
    }, delay);
  };

  orderButton.addEventListener("click", () => {
    const detail = {
      name: titleName.textContent.trim(),
      preset: currentPreset,
      temperature: currentTemperature,
      energy: currentEnergy,
      diameter: currentDiameter,
    };
    window.dispatchEvent(new CustomEvent("mysun:order-requested", { detail }));
    if (typeof window.mysunOrderFlow?.open === "function") {
      window.mysunOrderFlow.open(detail);
    }
    openReadyScreen();
  });

  gearButton.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("mysun:settings-requested", {
        detail: {
          preset: currentPreset,
          temperature: currentTemperature,
        },
      }),
    );
  });

  reducedMotion.addEventListener("change", () => {
    updateScene(reducedMotion.matches ? 1 : getScrollProgress(), true);
  });

  window.addEventListener("resize", () => {
    measureMorph();
    if (!initialSliderVisual) {
      moveSliderHandle(currentEnergy);
    }
    positionPill();
    updateEdgeFade();
  });

  window.mysunPrototype = {
    getProgress: () => currentProgress,
    getState: () => ({
      name: titleName.textContent.trim(),
      preset: currentPreset,
      temperature: currentTemperature,
      energy: currentEnergy,
      diameter: currentDiameter,
    }),
    selectPreset,
    setProgress: (progress) => {
      const maximum = frame.scrollHeight - frame.clientHeight;
      const target = clamp(progress);
      frame.scrollTop = maximum * target;
      updateScene(target, true);
    },
    setEnergy: (energy) => applyEnergy(energy),
  };

  measureMorph();
  applyTemperature(currentTemperature, { announce: false });
  applyEnergy(currentEnergy);
  updateScene(reducedMotion.matches ? 1 : getScrollProgress(), true);

  const requestedProgressParam = new URLSearchParams(
    window.location.search,
  ).get("p");
  const requestedProgress = Number(requestedProgressParam);
  if (
    requestedProgressParam !== null &&
    Number.isFinite(requestedProgress)
  ) {
    window.mysunPrototype.setProgress(requestedProgress);
  }

  // --- Лоадер: чёрный экран → вспышки градиентов (один раз) → надпись и
  // стрелка. Класс is-loading стоит в разметке, поэтому первый кадр уже
  // чёрный. Дальше — только скролл, никакого повторного клика/градиента.
  const finishLoader = () => {
    if (!frame.classList.contains("is-loading")) {
      return;
    }
    frame.classList.remove("is-loading");

    if (reducedMotion.matches) {
      frame.classList.add("is-loaded");
      return;
    }

    frame.classList.add("is-gradient");
    window.setTimeout(() => {
      frame.classList.remove("is-gradient");
      frame.classList.add("is-loaded");
    }, GRADIENT_MS);
  };

  if (requestedProgressParam !== null) {
    frame.classList.remove("is-loading");
    frame.classList.add("is-loaded");
  } else {
    window.setTimeout(finishLoader, LOADER_MS);
  }
})();
