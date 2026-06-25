import { getWeatherForAddress } from "@/lib/weather";
import styles from "./site.module.css";

interface WeatherWidgetProps {
  address: string | null;
}

export async function WeatherWidget({ address }: WeatherWidgetProps) {
  const weather = await getWeatherForAddress(address);
  if (!weather) return <div className={styles.headerAside} aria-hidden />;

  return (
    <aside
      className={styles.weatherWidget}
      aria-label={`Tempo em ${weather.city}: ${weather.label}, ${Math.round(weather.temperature)} graus`}
    >
      <span className={styles.weatherIcon} aria-hidden>
        {weather.icon}
      </span>
      <span className={styles.weatherMeta}>
        <strong className={styles.weatherTemp}>{Math.round(weather.temperature)}°</strong>
        <span className={styles.weatherCity}>{weather.city}</span>
      </span>
    </aside>
  );
}
