(() => {
  "use strict";

  const screen = document.querySelector(".screen");
  const orb = document.querySelector(".orb-box");
  const eyebrow = document.querySelector(".eyebrow");
  const heading = document.querySelector(".h1");
  const phrase = document.querySelector(".sub");
  const backButton = document.querySelector(".btn");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!screen || !orb || !eyebrow || !heading || !phrase || !backButton) {
    return;
  }

  const splitWords = (element) => {
    const text = element.textContent ?? "";
    const fragment = document.createDocumentFragment();

    text.split(/(\s+)/).forEach((part) => {
      if (!part) {
        return;
      }
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        return;
      }

      const word = document.createElement("span");
      word.className = "ready-word";
      word.textContent = part;
      fragment.appendChild(word);
    });

    element.replaceChildren(fragment);
    return [...element.querySelectorAll(".ready-word")];
  };

  const headingWords = splitWords(heading);
  const phraseWords = splitWords(phrase);
  const easing = "cubic-bezier(.22, 1, .36, 1)";

  const showImmediately = () => {
    [orb, eyebrow, heading, phrase, backButton].forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "none";
      element.style.filter = "none";
    });
    [...headingWords, ...phraseWords].forEach((word) => {
      word.style.opacity = "1";
      word.style.transform = "none";
      word.style.filter = "none";
    });
  };

  const animateIn = (
    element,
    {
      delay = 0,
      duration = 648,
      distance = 9.28,
      blur = 12,
      scale = 1,
    } = {},
  ) => {
    const animation = element.animate(
      [
        {
          opacity: 0,
          transform: `translate3d(0, ${distance}px, 0) scale(${scale})`,
          filter: `blur(${blur}px)`,
        },
        {
          opacity: 1,
          transform: "translate3d(0, 0, 0) scale(1)",
          filter: "blur(0)",
        },
      ],
      { delay, duration, easing, fill: "both" },
    );
    animation.finished
      .then(() => {
        element.style.opacity = "1";
        element.style.transform = "none";
        element.style.filter = "none";
        animation.cancel();
      })
      .catch(() => {});
  };

  if (reducedMotion.matches || !Element.prototype.animate) {
    showImmediately();
  } else {
    heading.style.opacity = "1";
    phrase.style.opacity = "1";
    animateIn(orb, {
      duration: 720,
      distance: 12,
      blur: 8,
      scale: .96,
    });
    animateIn(eyebrow, {
      delay: 120,
      duration: 520,
      distance: 6,
      blur: 5,
    });
    headingWords.forEach((word, index) => {
      animateIn(word, { delay: 230 + index * 80 });
    });
    phraseWords.forEach((word, index) => {
      animateIn(word, {
        delay: 560 + index * 34,
        duration: 560,
        distance: 6,
        blur: 6,
      });
    });
    animateIn(backButton, {
      delay: 930,
      duration: 520,
      distance: 8,
      blur: 5,
      scale: .98,
    });
  }

  backButton.addEventListener("click", () => {
    backButton.disabled = true;
    if (reducedMotion.matches || !screen.animate) {
      window.location.href = "./index.html?p=0";
      return;
    }

    const exit = screen.animate(
      [
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: "scale(.99)", filter: "blur(6px)" },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(.4, 0, 1, 1)",
        fill: "forwards",
      },
    );
    exit.finished.finally(() => {
      window.location.href = "./index.html?p=0";
    });
  });
})();
