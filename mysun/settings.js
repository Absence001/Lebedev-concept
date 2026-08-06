(() => {
  "use strict";

  const frame = document.querySelector(".frame");
  const panel = document.querySelector(".settings-panel");
  const gearButton = document.querySelector(".gear");
  const doneButton = document.querySelector(".settings-done");
  const resetButton = document.querySelector(".settings-reset");
  const rotationResetButton = document.querySelector(".rotation-reset");
  const picker = document.querySelector(".settings-picker");
  const controls = [
    ...document.querySelectorAll("[data-orb-param]"),
  ];

  if (
    !frame ||
    !panel ||
    !gearButton ||
    !doneButton ||
    !resetButton ||
    !picker
  ) {
    return;
  }

  const defaults = Object.fromEntries(
    controls.map((control) => [control.dataset.orbParam, control.value]),
  );

  const formatValue = (name, rawValue) => {
    const value = Number(rawValue);
    if (name === "sharpness") {
      return (value * 10).toFixed(1);
    }
    if (name === "softEdge") {
      return String(Math.round(value));
    }
    if (name === "color") {
      return rawValue;
    }
    return value.toFixed(2).replace("-", "−");
  };

  const syncRangeFill = (control) => {
    if (control.type !== "range") {
      return;
    }
    const minimum = Number(control.min);
    const maximum = Number(control.max);
    const value = Number(control.value);
    const fill = ((value - minimum) / (maximum - minimum)) * 100;
    control.style.setProperty("--settings-fill", `${fill.toFixed(2)}%`);
  };

  const syncControl = (control, { apply = true } = {}) => {
    const name = control.dataset.orbParam;
    const output = document.querySelector(`[data-output-for="${name}"]`);
    syncRangeFill(control);
    if (output) {
      output.value = formatValue(name, control.value);
      output.textContent = output.value;
    }

    if (name === "color") {
      panel.style.setProperty("--orb-picked-color", control.value);
    }

    if (apply) {
      const value = control.type === "color" ? control.value : Number(control.value);
      window.mysunOrb?.setParam(name, value);
    }
  };

  const selectControl = (name) => {
    controls.forEach((control) => {
      const container = control.closest(
        ".settings-control, .settings-color",
      );
      container?.classList.toggle(
        "is-selected",
        control.dataset.orbParam === name,
      );
    });
    panel.querySelectorAll(".settings-group").forEach((group) => {
      group.classList.toggle(
        "has-selected-control",
        Boolean(group.querySelector(".settings-control.is-selected")),
      );
    });
  };

  controls.forEach((control) => {
    const option = document.createElement("option");
    option.value = control.dataset.orbParam;
    option.textContent =
      control.getAttribute("aria-label") || control.dataset.orbParam;
    picker.append(option);
  });
  picker.value = controls.some(
    (control) => control.dataset.orbParam === "warpStrength",
  )
    ? "warpStrength"
    : controls[0]?.dataset.orbParam;
  selectControl(picker.value);

  const open = () => {
    frame.classList.add("settings-open");
    panel.setAttribute("aria-hidden", "false");
  };

  const close = () => {
    panel.setAttribute("aria-hidden", "true");
    frame.classList.remove("settings-open");
    gearButton.focus({ preventScroll: true });
  };

  controls.forEach((control) => {
    syncControl(control, { apply: false });
    control.addEventListener("input", () => {
      syncControl(control);
    });
  });

  picker.addEventListener("change", () => {
    selectControl(picker.value);
  });

  resetButton.addEventListener("click", () => {
    controls.forEach((control) => {
      control.value = defaults[control.dataset.orbParam];
      syncControl(control);
    });
    window.mysunOrb?.resetRotation();
  });

  rotationResetButton?.addEventListener("click", () => {
    window.mysunOrb?.resetRotation();
  });

  doneButton.addEventListener("click", close);
  window.addEventListener("mysun:settings-requested", open);
  window.addEventListener("mysun:orb-color-change", (event) => {
    const colorControl = controls.find(
      (control) => control.dataset.orbParam === "color",
    );
    if (!colorControl || !event.detail?.color) {
      return;
    }
    colorControl.value = event.detail.color;
    syncControl(colorControl, { apply: false });
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
})();
