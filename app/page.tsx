import LocationSetup from "./LocationSetup";

export const metadata = {
  title: "Карта сокровищ для детей от 5 до 85",
  description:
    "Создайте персональное приключение с маршрутом, загадками и настоящим кладом.",
};

export default function Home() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy" id="top">
          <h1 id="hero-title">
            Карта сокровищ
            <span>для детей от 5 до 85</span>
          </h1>
          <p className="hero-description">
            Превратите квартиру, дачу или двор в персональное приключение с
            маршрутом, загадками и настоящим кладом.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#start">
              Создать свою карту
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className="map-stage" id="example" aria-label="Пример персональной карты сокровищ">
          <div className="map-shadow" aria-hidden="true" />
          <div className="map-art">
            <img
              src="/treasure-map-transparent.png"
              alt="Персональная карта с домом, яблоней, скамейкой, маршрутом и местом клада"
            />
          </div>
        </div>
      </section>

      <LocationSetup />
    </main>
  );
}
