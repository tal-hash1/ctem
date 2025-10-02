import { useEffect, useRef, useState } from 'react';
export default function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 300, h: 300 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: Math.max(100, cr.width), h: Math.max(100, cr.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
