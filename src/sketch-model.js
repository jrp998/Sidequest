export const sketchColors = ['#243746', '#177b73', '#3460a7', '#a64458', '#e8b52e', '#8751a3'];
export const sketchTypes = ['pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'text', 'sticky', 'image'];
export const sketchMaxObjects = 500;
export const sketchMaxPoints = 1600;

export function validSketchObjects(objects) {
 const coordinate = value => Number.isFinite(value) && Math.abs(value) <= 1000000;
 const size = value => Number.isFinite(value) && value > 0 && value <= 2000000;
 return Array.isArray(objects) && objects.length <= sketchMaxObjects && objects.every(object => {
  if (!object || !sketchTypes.includes(object.type)) return false;
  if (object.type === 'image') {
   return coordinate(object.x) && coordinate(object.y) && size(object.width) && size(object.height) &&
    typeof object.src === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(object.src) && object.src.length <= 650000;
  }
  if (!sketchColors.includes(object.color)) return false;
  if (object.type === 'text' || object.type === 'sticky') {
   return coordinate(object.x) && coordinate(object.y) && typeof object.text === 'string' && object.text.length > 0 && object.text.length <= 600;
  }
  return Array.isArray(object.points) && object.points.length > 0 &&
   object.points.length <= (['pen', 'highlighter'].includes(object.type) ? sketchMaxPoints : 2) &&
   object.points.every(point => Array.isArray(point) && point.length === 2 && point.every(coordinate));
 });
}

export function sketchBounds(object) {
 if (object.type === 'image') return [object.x, object.y, object.width, object.height];
 if (object.type === 'text' || object.type === 'sticky') {
  const lines = sketchTextLines(object.text);
  return [object.x, object.y, object.type === 'sticky' ? 224 : 242, lines.length * 23 + 24];
 }
 const points = object.points;
 const xs = points.map(point => point[0]);
 const ys = points.map(point => point[1]);
 const x = Math.min(...xs);
 const y = Math.min(...ys);
 return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

export function sketchTextLines(text) {
 return text.split('\n').flatMap(line => {
  const lines = [''];
  for (const word of line.split(/\s+/).flatMap(word => Array.from(word).length > 24 ? word.match(/.{1,24}/gu) : [word])) {
   const last = lines.at(-1);
   if (Array.from(last + ' ' + word).length > 24) lines.push(word);
   else lines[lines.length - 1] = last ? last + ' ' + word : word;
  }
  return lines;
 });
}

export function sketchHit(object, x, y, radius) {
 const [left, top, width, height] = sketchBounds(object);
 if (x < left - radius || x > left + width + radius || y < top - radius || y > top + height + radius) return false;
 if (['text', 'sticky', 'image', 'rectangle', 'ellipse'].includes(object.type)) return true;
 return object.points.some(([bx, by], index) => {
  const [ax, ay] = object.points[Math.max(0, index - 1)];
  const dx = bx - ax;
  const dy = by - ay;
  const span = dx * dx + dy * dy;
  const ratio = span ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span)) : 0;
  return Math.hypot(x - ax - ratio * dx, y - ay - ratio * dy) <= radius;
 });
}
