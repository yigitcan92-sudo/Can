import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext.jsx';

// Klein bolletje dat oplicht wanneer er een live wijziging binnenkomt
export default function LiveIndicator() {
  const { lastEvent } = useData();
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!lastEvent) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [lastEvent]);
  return (
    <span className={`live ${flash ? 'flash' : ''}`} title="Live verbonden — wijzigingen van anderen verschijnen meteen">
      ● live
    </span>
  );
}
