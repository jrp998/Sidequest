const sketchTools = [
 ['pen', 'Pen'], ['highlighter', 'Highlight'], ['eraser', 'Erase'], ['hand', 'Pan'],
 ['line', 'Line'], ['arrow', 'Arrow'], ['rectangle', 'Rectangle'], ['ellipse', 'Ellipse'],
 ['text', 'Text'], ['sticky', 'Sticky note']
];

function sketchShelf(projectId = '') {
 const sketches = data.sketches.filter(item => !projectId || item.projectId === projectId);
 return `<section class="card sketch-shelf">
  <div class="hrow"><h3>Sketchpad</h3><button class="ghost" type="button" onclick="createSketch('${projectId}')">+ New sketch</button></div>
  ${sketches.map(item => `<button class="sketch-link" type="button" onclick="openSketch('${item.id}')"><strong>${esc(item.title)}</strong>
   ${projectId ? '' : `<span>${esc(data.ideas.find(idea => idea.id === item.projectId)?.title || '')}</span>`}</button>`).join('')}
 </section>`;
}

function createSketch(projectId) {
 const sketch = {id:id(), title:'Untitled sketch', projectId, objects:[]};
 data.sketches.unshift(sketch);
 save();
 openSketch(sketch.id);
}

function openSketch(key) {
 const item = () => data.sketches.find(sketch => sketch.id === key);
 const sketch = item();
 if (!sketch) return;
 showModal(`<div class="sketch-editor" data-sketch="${key}">
  <header class="sketch-header"><h2>Sketchpad</h2><label class="sketch-name"><span class="sketch-sr">Sketch name</span><input data-sketch-title maxlength="1000" value="${esc(sketch.title)}"></label>
   <button class="ghost" type="button" aria-label="Close sketch" onclick="closeModal()">✕</button></header>
  <div class="sketch-toolbar" aria-label="Drawing tools">
   <div class="sketch-tool-row">${sketchTools.map(([value, label]) => `<button type="button" data-tool="${value}" aria-pressed="${value === 'pen'}">${label}</button>`).join('')}</div>
   <div class="sketch-tool-row sketch-controls">
    <label class="sketch-color"><span class="sketch-sr">Colour</span><select data-sketch-color>${sketchColors.map((color, index) => `<option value="${color}" style="color:${color}">${['Ink','Teal','Blue','Rose','Gold','Purple'][index]}</option>`).join('')}</select></label>
    <button type="button" data-image>Image</button><input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif">
    <button type="button" data-undo disabled>Undo</button><button type="button" data-redo disabled>Redo</button>
    <button type="button" data-zoom="0.8" aria-label="Zoom out">−</button><button type="button" data-fit>Fit</button><button type="button" data-zoom="1.25" aria-label="Zoom in">+</button>
    <details class="sketch-menu"><summary>More</summary><div>
     <div><label for="sketch-project">Project</label><select id="sketch-project" data-project><option value="">No linked project</option>${data.ideas.map(idea => `<option value="${idea.id}" ${sketch.projectId === idea.id ? 'selected' : ''}>${esc(idea.title)}</option>`).join('')}</select></div>
     <button type="button" data-export="png">Download PNG</button><button type="button" data-export="pdf">Download PDF</button><button type="button" data-export="json">Download sketch</button>
     <button type="button" data-import>Import sketch</button><input hidden data-sketch-file type="file" accept=".json,application/json">
     <button type="button" data-delete>Delete sketch</button>
    </div></details>
   </div>
  </div>
  <div class="sketch-text-entry" hidden><form><label for="sketch-text">Text</label><textarea id="sketch-text" maxlength="600" rows="3" required></textarea><div><button type="submit">Place text</button><button type="button" data-cancel-text>Cancel</button></div></form></div>
  <canvas class="sketch-canvas" aria-label="Drawing canvas" tabindex="0"></canvas>
  <p class="sketch-status" role="status"></p>
 </div>`);
 const editor = document.querySelector('.sketch-editor');
 if (!editor || editor.dataset.sketch !== key) return;
 const canvas = editor.querySelector('canvas');
 const context = canvas.getContext('2d');
 const status = editor.querySelector('.sketch-status');
 const textEntry = editor.querySelector('.sketch-text-entry');
 const undo = [];
 const redo = [];
 const pictures = new Map();
 const pointers = new Map();
 const view = {x:0, y:0, zoom:1};
 let tool = 'pen';
 let draft;
 let erased;
 let gesture;
 let textPoint;
 let frame = 0;
 let width = 0;
 let height = 0;

 function paint() {
  frame = 0;
  if (!editor.isConnected || !width || !height) return;
  const dpr = canvas.width / width;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = document.body.classList.contains('dark');
  context.fillStyle = dark ? '#202a30' : '#fbfcfb';
  context.fillRect(0, 0, width, height);
  context.fillStyle = dark ? '#48575c' : '#ced9d7';
  const gap = 24 * view.zoom * Math.max(1, Math.ceil(12 / (24 * view.zoom)));
  for (let x = view.x % gap; x < width; x += gap) {
   for (let y = view.y % gap; y < height; y += gap) context.fillRect(x, y, 1.4, 1.4);
  }
  context.translate(view.x, view.y);
  context.scale(view.zoom, view.zoom);
  const objects = item()?.objects || [];
  objects.forEach((object, index) => {
   if (!erased?.has(index)) drawSketchObject(context, object, pictures, schedule, dark);
  });
  if (draft) drawSketchObject(context, draft, pictures, schedule, dark);
 }

 function schedule() {
  if (!frame) frame = requestAnimationFrame(paint);
 }

 function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  width = rect.width;
  height = rect.height;
  const dpr = Math.min(3, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  schedule();
 }

 const resized = new ResizeObserver(resize);
 resized.observe(canvas);
 editor.addEventListener('boardrender', schedule);

 function commit(objects, record = true) {
  const current = item();
  if (!current) return false;
  if (!validSketchObjects(objects)) {
   status.textContent = 'This sketch has reached its drawing limit. Start another sketch or remove an object.';
   return false;
  }
  const previous = current.objects;
  current.objects = objects;
  if (new Blob([JSON.stringify(data)]).size >= 7400000) {
   current.objects = previous;
   status.textContent = 'The board is near its storage limit. Download this sketch or remove an attachment before adding more.';
   return false;
  }
  if (record) {
   undo.push({before:previous, after:objects});
   if (undo.length > 30) undo.shift();
   redo.length = 0;
  }
  status.textContent = '';
  editor.querySelector('[data-undo]').disabled = undo.length === 0;
  editor.querySelector('[data-redo]').disabled = redo.length === 0;
  save();
  schedule();
  return true;
 }

 function historyStep(back) {
  const from = back ? undo : redo;
  const to = back ? redo : undo;
  const action = from.at(-1);
  if (!action) return;
  const expected = back ? action.after : action.before;
  if (JSON.stringify(item()?.objects) !== JSON.stringify(expected)) {
   status.textContent = 'The sketch changed since this action. Use the current drawing to continue.';
   undo.length = 0;
   redo.length = 0;
   editor.querySelector('[data-undo]').disabled = true;
   editor.querySelector('[data-redo]').disabled = true;
   return;
  }
  from.pop();
  to.push(action);
  if (!commit(back ? action.before : action.after, false)) {
   to.pop();
   from.push(action);
  }
 }

 function local(event) {
  const rect = canvas.getBoundingClientRect();
  return {x:event.clientX - rect.left, y:event.clientY - rect.top};
 }

 function world({x, y}) {
  return [Math.round((x - view.x) / view.zoom), Math.round((y - view.y) / view.zoom)];
 }

 function zoomAt(x, y, amount) {
  const next = Math.max(0.15, Math.min(6, view.zoom * amount));
  const change = next / view.zoom;
  view.x = x - (x - view.x) * change;
  view.y = y - (y - view.y) * change;
  view.zoom = next;
  schedule();
 }

 function fit() {
  const bounds = drawingBounds(item()?.objects || []);
  if (!bounds) {
   Object.assign(view, {x:0, y:0, zoom:1});
  } else {
   const [x, y, w, h] = bounds;
   view.zoom = Math.max(0.15, Math.min(1.5, (width - 24) / w, (height - 24) / h));
   view.x = (width - w * view.zoom) / 2 - x * view.zoom;
   view.y = (height - h * view.zoom) / 2 - y * view.zoom;
  }
  schedule();
 }

 function eraseAt(point) {
  const objects = item()?.objects || [];
  for (let index = objects.length - 1; index >= 0; index--) {
   if (!erased.has(index) && sketchHit(objects[index], ...point, 13 / view.zoom)) {
    erased.add(index);
    break;
   }
  }
 }

 function pinch() {
  const [a, b] = [...pointers.values()];
  return {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2, distance:Math.hypot(a.x - b.x, a.y - b.y)};
 }

 function selectTool(next) {
  tool = next;
  canvas.dataset.tool = next;
  editor.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === next)));
 }

 canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.button !== 1) return;
  if (pointers.size >= 2) return;
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({preventScroll:true});
  pointers.set(event.pointerId, local(event));
  if (pointers.size === 2) {
   draft = undefined;
   erased = undefined;
   gesture = {type:'pinch', ...pinch()};
   schedule();
   return;
  }
  const point = world(local(event));
  if (tool === 'hand' || event.button === 1) gesture = {type:'pan'};
  else if (tool === 'eraser') {
   erased = new Set();
   eraseAt(point);
  } else if (tool === 'text' || tool === 'sticky') {
   textPoint = {type:tool, x:point[0], y:point[1]};
  } else {
   draft = {type:tool, color:editor.querySelector('[data-sketch-color]').value, points:[point]};
  }
  schedule();
 });

 canvas.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  const previous = pointers.get(event.pointerId);
  const current = local(event);
  pointers.set(event.pointerId, current);
  const point = world(current);
  if (gesture?.type === 'pinch' && pointers.size === 2) {
   const next = pinch();
   view.x += next.x - gesture.x;
   view.y += next.y - gesture.y;
   zoomAt(next.x, next.y, next.distance / Math.max(1, gesture.distance));
   gesture = {type:'pinch', ...next};
  } else if (gesture?.type === 'pan') {
   view.x += current.x - previous.x;
   view.y += current.y - previous.y;
  } else if (erased) eraseAt(point);
  else if (draft) {
   if (draft.type === 'pen' || draft.type === 'highlighter') {
    const last = draft.points.at(-1);
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 2 && draft.points.length < sketchMaxPoints) draft.points.push(point);
   } else draft.points[1] = point;
  }
  schedule();
 });

 function endPointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size) {
   gesture = {type:'pan'};
   textPoint = undefined;
   return;
  }
  if (event.type === 'pointerup') {
   const objects = item()?.objects || [];
   if (draft) commit([...objects, draft]);
   if (erased?.size) commit(objects.filter((_, index) => !erased.has(index)));
   if (textPoint) {
    textEntry.hidden = false;
    textEntry.querySelector('textarea').focus();
   }
  } else textPoint = undefined;
  draft = undefined;
  erased = undefined;
  gesture = undefined;
  schedule();
 }

 canvas.addEventListener('pointerup', endPointer);
 canvas.addEventListener('pointercancel', endPointer);
 canvas.addEventListener('lostpointercapture', endPointer);
 canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const point = local(event);
  if (event.ctrlKey || event.metaKey) zoomAt(point.x, point.y, Math.exp(-event.deltaY * 0.008));
  else {
   view.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
   view.y -= event.shiftKey ? 0 : event.deltaY;
   schedule();
  }
 }, {passive:false});
 canvas.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
   event.preventDefault();
   historyStep(event.key.toLowerCase() === 'z' && !event.shiftKey);
  }
 });

 editor.querySelector('[data-sketch-title]').onchange = event => {
  const current = item();
  if (!current) return;
  current.title = event.target.value.trim() || 'Untitled sketch';
  event.target.value = current.title;
  save();
 };
 editor.querySelector('[data-project]').onchange = event => {
  const current = item();
  if (!current) return;
  current.projectId = event.target.value;
  save();
 };
 editor.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => selectTool(button.dataset.tool));
 editor.querySelectorAll('[data-zoom]').forEach(button => button.onclick = () => zoomAt(width / 2, height / 2, Number(button.dataset.zoom)));
 editor.querySelector('[data-fit]').onclick = fit;
 editor.querySelector('[data-undo]').onclick = () => historyStep(true);
 editor.querySelector('[data-redo]').onclick = () => historyStep(false);
 function dismissText() {
  textEntry.querySelector('form').reset();
  textEntry.hidden = true;
  textPoint = undefined;
  canvas.focus({preventScroll:true});
 }
 textEntry.querySelector('[data-cancel-text]').onclick = dismissText;
 textEntry.querySelector('form').onsubmit = event => {
  event.preventDefault();
  const value = textEntry.querySelector('textarea').value.trim();
  const current = item();
  if (value && textPoint && current) commit([...current.objects, {...textPoint, text:value, color:editor.querySelector('[data-sketch-color]').value}]);
  dismissText();
 };
 const imageFile = editor.querySelector('input[accept^="image/"]');
 editor.querySelector('[data-image]').onclick = () => imageFile.click();
 imageFile.onchange = async () => {
  const file = imageFile.files[0];
  imageFile.value = '';
  if (!file) return;
  try {
   const image = await importSketchImage(file);
   if (!editor.isConnected || !item()) return;
   const [x, y] = world({x:width / 2, y:height / 2});
   commit([...item().objects, {...image, x:x - image.width / 2, y:y - image.height / 2}]);
  } catch (error) { status.textContent = error.message; }
 };
 const sketchFile = editor.querySelector('[data-sketch-file]');
 editor.querySelector('[data-import]').onclick = () => sketchFile.click();
 sketchFile.onchange = async () => {
  const file = sketchFile.files[0];
  sketchFile.value = '';
  if (!file) return;
  try {
   if (file.size >= 7400000) throw Error();
   const raw = JSON.parse(await file.text());
   if (raw.format !== 'sidequest-sketch' || raw.version !== 1 || !validSketchObjects(raw.objects)) throw Error();
   if (!editor.isConnected || !item()) return;
   if (commit([...item().objects, ...raw.objects])) fit();
  } catch { status.textContent = 'Could not import this Sidequest sketch file.'; }
 };
 editor.querySelectorAll('[data-export]').forEach(button => button.onclick = async () => {
  try { await exportSketch(item(), button.dataset.export, pictures); }
  catch (error) { status.textContent = error.message; }
 });
 editor.querySelector('[data-delete]').onclick = () => {
  if (!confirm('Delete this sketch?')) return;
  data.sketches = data.sketches.filter(entry => entry.id !== key);
  closeModal();
  save();
 };
 selectTool('pen');
 resize();
 fit();
 requestAnimationFrame(() => editor.querySelector('[aria-label="Close sketch"]').focus());
}

function drawSketchObject(context, object, pictures, schedule, dark = false) {
 const {type, points, color} = object;
 context.save();
 context.strokeStyle = context.fillStyle = dark && color === '#243746' ? '#dfeaed' : (color || '#243746');
 context.lineCap = 'round';
 context.lineJoin = 'round';
 context.lineWidth = type === 'highlighter' ? 15 : 2.8;
 if (type === 'highlighter') context.globalAlpha = 0.33;
 if (type === 'image') {
  let image = pictures.get(object.src);
  if (!image) {
   image = new Image();
   image.onload = schedule;
   image.src = object.src;
   pictures.set(object.src, image);
  }
  if (image.complete && image.naturalWidth) context.drawImage(image, object.x, object.y, object.width, object.height);
 } else if (type === 'text' || type === 'sticky') {
  const lines = sketchTextLines(object.text);
  if (type === 'sticky') {
   context.fillStyle = '#fff0aa';
   context.fillRect(object.x, object.y, 224, lines.length * 23 + 24);
   context.fillStyle = '#243746';
  }
  context.font = '16px system-ui, sans-serif';
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, object.x + 12, object.y + 12 + index * 23, 200));
 } else {
  const [[x, y]] = points;
  const [ex, ey] = points.at(-1);
  context.beginPath();
  if (type === 'rectangle') context.rect(x, y, ex - x, ey - y);
  else if (type === 'ellipse') context.ellipse((x + ex) / 2, (y + ey) / 2, Math.abs(ex - x) / 2, Math.abs(ey - y) / 2, 0, 0, Math.PI * 2);
  else {
   context.moveTo(x, y);
   if (points.length === 1) context.lineTo(x + 0.1, y);
   else for (const [px, py] of points.slice(1)) context.lineTo(px, py);
   if (type === 'arrow' && points.length > 1) {
    const angle = Math.atan2(ey - y, ex - x);
    const head = Math.min(15, Math.hypot(ex - x, ey - y) * 0.5);
    for (const offset of [-0.55, 0.55]) {
     context.moveTo(ex, ey);
     context.lineTo(ex - head * Math.cos(angle + offset), ey - head * Math.sin(angle + offset));
    }
   }
  }
  context.stroke();
 }
 context.restore();
}

function drawingBounds(objects) {
 if (!objects.length) return null;
 let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
 for (const object of objects) {
  const [x, y, width, height] = sketchBounds(object);
  left = Math.min(left, x);
  top = Math.min(top, y);
  right = Math.max(right, x + width);
  bottom = Math.max(bottom, y + height);
 }
 return [left - 24, top - 24, right - left + 48, bottom - top + 48];
}

async function importSketchImage(file) {
 if (file.size > 12000000) throw Error('Choose an image under 12 MB.');
 const url = URL.createObjectURL(file);
 try {
  const image = new Image();
  image.src = url;
  await image.decode();
  const picture = document.createElement('canvas');
  const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
  picture.width = Math.max(1, Math.round(image.naturalWidth * scale));
  picture.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = picture.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, picture.width, picture.height);
  context.drawImage(image, 0, 0, picture.width, picture.height);
  let src = picture.toDataURL('image/jpeg', 0.8);
  if (src.length > 650000) src = picture.toDataURL('image/jpeg', 0.55);
  if (src.length > 650000) throw Error();
  return {type:'image', src, width:picture.width, height:picture.height};
 } catch { throw Error('Could not add this image. Try a smaller PNG or JPEG.'); }
 finally { URL.revokeObjectURL(url); }
}

async function exportSketch(sketch, format, pictures) {
 if (!sketch) return;
 const filename = sketch.title.replace(/[^\p{L}\p{N} ._-]/gu, '-').slice(0, 80) || 'Sketch';
 if (format === 'json') {
  const value = {format:'sidequest-sketch', version:1, title:sketch.title, objects:sketch.objects};
  return downloadSketch(new Blob([JSON.stringify(value)], {type:'application/json'}), filename + '.json');
 }
 const bounds = drawingBounds(sketch.objects);
 if (!bounds) throw Error('Draw something before exporting.');
 const [x, y, width, height] = bounds;
 const scale = Math.min(2, 2800 / Math.max(width, height));
 const surface = document.createElement('canvas');
 surface.width = Math.max(1, Math.ceil(width * scale));
 surface.height = Math.max(1, Math.ceil(height * scale));
 const context = surface.getContext('2d');
 context.fillStyle = '#fff';
 context.fillRect(0, 0, surface.width, surface.height);
 context.scale(scale, scale);
 context.translate(-x, -y);
 await Promise.all(sketch.objects.filter(object => object.type === 'image').map(object => {
  if (!pictures.has(object.src)) {
   const image = new Image();
   image.src = object.src;
   pictures.set(object.src, image);
  }
  return pictures.get(object.src).decode();
 }));
 for (const object of sketch.objects) drawSketchObject(context, object, pictures, () => {});
 const photo = await new Promise(resolve => surface.toBlob(resolve, format === 'pdf' ? 'image/jpeg' : 'image/png', 0.92));
 if (!photo) throw Error('Could not export this drawing.');
 const file = format === 'pdf' ? sketchPDF(await photo.arrayBuffer(), surface.width, surface.height) : photo;
 downloadSketch(file, filename + '.' + format);
}

function sketchPDF(jpeg, width, height) {
 const [pageWidth, pageHeight] = width >= height ? [842, 595] : [595, 842];
 const scale = Math.min((pageWidth - 48) / width, (pageHeight - 48) / height);
 const w = Math.round(width * scale);
 const h = Math.round(height * scale);
 const commands = `q ${w} 0 0 ${h} ${(pageWidth - w) / 2} ${(pageHeight - h) / 2} cm /Sketch Do Q\n`;
 const chunks = ['%PDF-1.4\n'];
 const offsets = [0];
 let position = chunks[0].length;
 function append(value) {
  chunks.push(value);
  position += typeof value === 'string' ? value.length : value.byteLength;
 }
 function object(number, content, stream) {
  offsets.push(position);
  append(`${number} 0 obj\n${content}\n`);
  if (stream) {
   append('stream\n');
   append(stream);
   append('\nendstream\n');
  }
  append('endobj\n');
 }
 object(1, '<< /Type /Catalog /Pages 2 0 R >>');
 object(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
 object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /XObject << /Sketch 5 0 R >> >> >>`);
 object(4, `<< /Length ${commands.length} >>`, commands);
 object(5, `<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 /Width ${width} /Height ${height} /Filter /DCTDecode /Length ${jpeg.byteLength} >>`, jpeg);
 const crossReferences = position;
 append('xref\n0 6\n0000000000 65535 f \n');
 for (const offset of offsets.slice(1)) append(String(offset).padStart(10, '0') + ' 00000 n \n');
 append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${crossReferences}\n%%EOF\n`);
 return new Blob(chunks, {type:'application/pdf'});
}

function downloadSketch(blob, filename) {
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 link.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sketchRender = render;
render = () => {
 sketchRender();
 document.querySelector('.sketch-editor')?.dispatchEvent(new Event('boardrender'));
};
