export function pointOnPolyline(points: {x:number, y:number}[], t: number) {
  if (points.length === 0) return {x: 0, y: 0};
  if (points.length === 1) return points[0];
  let totalLen = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    lengths.push(l);
    totalLen += l;
  }
  const target = totalLen * Math.max(0, Math.min(1, t));
  let current = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (current + lengths[i] >= target || i === points.length - 2) {
      const remaining = target - current;
      const segmentT = lengths[i] > 0 ? remaining / lengths[i] : 0;
      return {
        x: points[i].x + (points[i+1].x - points[i].x) * segmentT,
        y: points[i].y + (points[i+1].y - points[i].y) * segmentT,
      };
    }
    current += lengths[i];
  }
  return points[points.length - 1];
}
