"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Preset = {
  name: string;
  temperature: number;
  color: string;
  halo: string;
  description: string;
};

type Screen = "loader" | "editor" | "result";

const presets: Preset[] = [
  { name: "Ахернар", temperature: 15000, color: "#b9ddff", halo: "#497dff", description: "холодное и ясное" },
  { name: "Бетельгейзе", temperature: 3500, color: "#ff7b4a", halo: "#d62828", description: "тёплое и объёмное" },
  { name: "Процион", temperature: 6500, color: "#fff4da", halo: "#efc57b", description: "лёгкое и светлое" },
  { name: "Ригель", temperature: 12100, color: "#cce6ff", halo: "#4579ff", description: "яркое и холодное" },
  { name: "Капелла", temperature: 5000, color: "#ffd59a", halo: "#e8872f", description: "золотое и мягкое" },
  { name: "Вега", temperature: 9600, color: "#e6f2ff", halo: "#778ee8", description: "светлое и звонкое" },
  { name: "Арктур", temperature: 4300, color: "#ffb56e", halo: "#ce5723", description: "медное и спокойное" },
  { name: "Канопус", temperature: 7400, color: "#f7f0dc", halo: "#c7a762", description: "ровное и большое" },
  { name: "Сириус", temperature: 9900, color: "#d9ecff", halo: "#5d98ff", description: "белое и смелое" },
];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function interpolateColor(temperature: number) {
  const normalized = (clamp(temperature, 3000, 15000) - 3000) / 12000;
  const hue = 18 + normalized * 202;
  const lightness = 63 + normalized * 26;
  return `hsl(${hue} 94% ${lightness}%)`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("loader");
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(presets[4]);
  const [temperature, setTemperature] = useState(presets[4].temperature);

  useEffect(() => {
    if (screen !== "loader") {
      return undefined;
    }

    const timeout = window.setTimeout(() => setIsLoaderReady(true), 2900);
    return () => window.clearTimeout(timeout);
  }, [screen]);

  const color = interpolateColor(temperature);
  const handlePreset = (preset: Preset) => {
    setSelectedPreset(preset);
    setTemperature(preset.temperature);
  };

  const handleSave = () => {
    setScreen("result");
  };

  return (
    <main className="site-stage">
      <section className="phone-shell" aria-label="Интерактивный прототип mysun">
        <div className="phone-screen">
          {screen !== "loader" && <header className="brand" aria-label="mysun">mysun</header>}

          {screen === "loader" && (
            <div className="loader-screen" aria-live="polite">
              <div className="loader-light" aria-hidden="true" />
              <p className="loader-word">mysun</p>
              <button
                className={isLoaderReady ? "loader-start loader-start-ready" : "loader-start"}
                disabled={!isLoaderReady}
                onClick={() => setScreen("editor")}
                type="button"
              >
                Start
              </button>
            </div>
          )}

          {screen === "editor" && (
            <div className="editor-screen">
              <nav className="preset-list" aria-label="Пресеты звёзд">
                {presets.map((preset) => (
                  <button
                    className={preset.name === selectedPreset.name ? "preset preset-active" : "preset"}
                    key={preset.name}
                    onClick={() => handlePreset(preset)}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </nav>

              <div className="star-workspace">
                <div
                  className="star-orbit"
                  style={{ "--star-color": color, "--halo-color": selectedPreset.halo } as CSSProperties}
                >
                  <div className="star-glass" aria-label={`Солнце: ${temperature.toLocaleString("ru-RU")} кельвинов`}>
                    <div className="star-core" />
                    <div className="glass-glare" />
                    <div className="glass-refraction" />
                  </div>
                </div>

                <label className="temperature-control">
                  <span className="temperature-current">{temperature.toLocaleString("ru-RU")}</span>
                  <span className="temperature-unit">K</span>
                  <input
                    aria-label="Температура звезды в кельвинах"
                    max="15000"
                    min="3000"
                    onChange={(event) => setTemperature(Number(event.target.value))}
                    step="100"
                    type="range"
                    value={temperature}
                  />
                  <span className="temperature-endpoint temperature-hot">15k</span>
                  <span className="temperature-endpoint temperature-cool">3k</span>
                </label>
              </div>

              <div className="sun-copy">
                <h1>моё солнце</h1>
                <p>{selectedPreset.description}</p>
              </div>

              <button className="primary-action" onClick={handleSave} type="button">
                сохранить моё солнце
              </button>
            </div>
          )}

          {screen === "result" && (
            <div className="result-screen">
              <div
                className="result-star"
                style={{ "--star-color": color, "--halo-color": selectedPreset.halo } as CSSProperties}
              >
                <div className="result-core" />
                <div className="glass-glare" />
              </div>
              <div className="result-copy">
                <p className="eyebrow">твоё солнце готово</p>
                <h1>{selectedPreset.name}</h1>
                <p>{temperature.toLocaleString("ru-RU")} K · {selectedPreset.description}</p>
              </div>
              <button className="primary-action" onClick={() => setScreen("editor")} type="button">
                заказать солнце
              </button>
              <button className="secondary-action" onClick={() => setScreen("editor")} type="button">
                изменить настройки
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
