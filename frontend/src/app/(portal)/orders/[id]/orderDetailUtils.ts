let clientMessageFallbackCounter = 0;

export const createClientMessageId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const entropy = new Uint32Array(2);
    window.crypto.getRandomValues(entropy);
    return `web-${Date.now()}-${entropy[0].toString(36)}${entropy[1].toString(36)}`;
  }
  clientMessageFallbackCounter += 1;
  return `web-${Date.now()}-${clientMessageFallbackCounter}`;
};

export function decodePolyline(encoded?: string | null): Array<{ lat: number; lng: number }> {
  if (!encoded) return [];
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byteValue = 0;
    do {
      if (index >= encoded.length) return points;
      byteValue = encoded.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      if (index >= encoded.length) return points;
      byteValue = encoded.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 100000, lng: lng / 100000 });
  }

  return points;
}

export function buildSvgRoute(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return "M28 112 C96 36, 150 130, 220 70 S320 44, 372 96";
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  return points.map((point, index) => {
    const x = 28 + ((point.lng - minLng) / lngSpan) * 344;
    const y = 24 + (1 - ((point.lat - minLat) / latSpan)) * 112;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

