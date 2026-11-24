try { sessionStorage.removeItem('tmdbKey'); } catch {}

async function movieRequest(path, signal) {
 const response = await fetch('/api/tmdb/' + path, {signal, cache:'no-store'});
 const result = await response.json().catch(() => null);
 if (!response.ok || !result) throw Error(result?.error || 'Movie lookup is unavailable.');
 return result;
}

function movieMetadata(movie) {
 const summary = [
  movie.tmdbId ? movie.mediaType === 'tv' ? 'TV series' : 'Movie' : '',
  movie.releaseDate || '',
  ...(movie.genres || []),
  movie.tmdbRating != null ? 'TMDB ' + movie.tmdbRating.toFixed(1) + '/10' : ''
 ].filter(Boolean).join(' · ');
 return `${summary ? `<p class="sub muted">${esc(summary)}</p>` : ''}${movie.overview ? `<p class="movie-overview">${esc(movie.overview)}</p>` : ''}`;
}

function addMoviePrompt() {
 showModal(`<div class="hrow"><h2>Add movie or series</h2><button class="ghost" aria-label="Close" onclick="closeModal()">✕</button></div>
  <form onsubmit="event.preventDefault(); searchMovies(this, this.elements.title.value);">
   <label for="newMovie">Title</label>
   <div class="add"><input class="field" id="newMovie" name="title" maxlength="200" required placeholder="Movie or TV title"><button class="btn accent">Search</button></div>
   <label for="newCollection">Collection</label><select id="newCollection"><option>Watchlist</option><option>Spoopy Season</option></select>
   <button class="ghost" type="button" onclick="addMovie()">Add manually</button>
   <div class="movie-results" aria-live="polite"></div>
  </form>`);
 document.getElementById('newMovie')?.focus();
}

function addMovie(match) {
 const title = match?.title || document.getElementById('newMovie')?.value.trim();
 if (!title) return;
 const existing = match && data.movies.find(m => m.tmdbId === match.tmdbId && m.mediaType === match.mediaType);
 if (existing) {
  showToast('Already on your list');
  openMovie(existing.id);
  return;
 }
 const movie = {
  id:id(), title, collection:document.getElementById('newCollection').value, watched:false,
  poster:'', tmdbId:null, mediaType:'movie', notes:'', ...match
 };
 data.movies.unshift(movie);
 save();
 if (match) openMovie(movie.id);
 else closeModal();
}

async function searchMovies(container, query, key) {
 const results = container.querySelector('.movie-results');
 results.request?.abort();
 const controller = new AbortController();
 results.request = controller;
 results.textContent = 'Searching TMDB…';
 try {
  const payload = await movieRequest('search?q=' + encodeURIComponent(query.trim()), controller.signal);
  if (controller.signal.aborted || !results.isConnected) return;
  results.replaceChildren();
  if (!payload.results.length) results.textContent = 'No matching movies or series.';
  for (const match of payload.results) {
   const button = document.createElement('button');
   button.type = 'button';
   button.className = 'movie-match';
   button.innerHTML = `${match.poster ? `<img src="${esc(match.poster)}" alt="">` : ''}
    <span><strong>${esc(match.title)}</strong><small>${esc([match.releaseDate?.slice(0, 4), match.mediaType === 'tv' ? 'TV series' : 'Movie'].filter(Boolean).join(' · '))}</small></span>`;
   button.onclick = () => key ? matchMovie(key, match) : addMovie(match);
   results.append(button);
  }
 } catch (error) {
  if (!controller.signal.aborted) results.textContent = error.message;
 }
}

function updateMovieFields(movie) {
 const title = document.getElementById('movieTitle');
 if (!title) return;
 movie.title = title.value.trim() || movie.title;
 movie.notes = document.getElementById('movieNotes').value;
 movie.collection = document.getElementById('movieCollection').value;
 movie.rating = Number(document.getElementById('movieRating').value) || null;
}

function matchMovie(key, match) {
 const movie = data.movies.find(item => item.id === key);
 if (!movie) return;
 updateMovieFields(movie);
 Object.assign(movie, match, {genres:[]});
 save();
 const heading = document.querySelector('#modal h2');
 if (heading) heading.innerHTML = esc(movie.title);
 openMovie(key);
}

function openMovie(key) {
 const movie = data.movies.find(item => item.id === key);
 if (!movie) return;
 const collections = [...new Set(['Watchlist', 'Spoopy Season', movie.collection].filter(Boolean))];
 showModal(`<div class="hrow"><h2>${esc(movie.title)}</h2><button class="ghost" aria-label="Close" onclick="closeModal()">✕</button></div>
  <div class="movie-summary">
   ${movie.poster ? `<img src="${esc(movie.poster)}" alt="" class="movie-detail-poster">` : ''}
   <div id="movieMetadata">${movieMetadata(movie)}</div>
  </div>
  <label for="movieTitle">Title</label><input class="field" id="movieTitle" maxlength="1000" value="${esc(movie.title)}">
  <div class="formpair"><div><label for="movieCollection">Collection</label><select id="movieCollection">${collections.map(value => `<option ${value === movie.collection ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>
  <div><label for="movieRating">My rating</label><select id="movieRating"><option value="">Unrated</option>${Array.from({length:10}, (_, index) => index + 1).map(value => `<option value="${value}" ${movie.rating === value ? 'selected' : ''}>${value}/10</option>`).join('')}</select></div></div>
  <label for="movieNotes">Notes</label><textarea id="movieNotes" maxlength="30000" rows="3">${esc(movie.notes)}</textarea>
  <div class="actions">
   <button class="btn accent" onclick="saveMovie('${key}')">Save</button>
   <button class="ghost" onclick="saveMovie('${key}', true)">${movie.watched ? 'Mark unwatched' : '✓ Watched'}</button>
   <button class="ghost" onclick="searchMovies(this.closest('.sheet'), document.getElementById('movieTitle').value, '${key}')">${movie.tmdbId ? 'Change TMDB match' : 'Find on TMDB'}</button>
   <button class="ghost" onclick="deleteMovie('${key}')">Remove</button>
  </div>
  <div class="movie-results" aria-live="polite"></div>
  <div id="movieProviders" aria-live="polite"></div>`);
 if (movie.tmdbId) loadMovieDetails(key, movie.mediaType, movie.tmdbId);
}

function saveMovie(key, toggleWatched = false) {
 const movie = data.movies.find(item => item.id === key);
 if (!movie) return;
 updateMovieFields(movie);
 if (toggleWatched) movie.watched = !movie.watched;
 closeModal();
 save();
}

function deleteMovie(key) {
 if (!confirm('Remove this title?')) return;
 data.movies = data.movies.filter(item => item.id !== key);
 closeModal();
 save();
}

async function loadMovieDetails(key, type, tmdbId) {
 const panel = document.getElementById('movieProviders');
 if (!panel || panel.loading) return;
 panel.loading = true;
 panel.textContent = 'Checking Australian streaming providers…';
 try {
  const details = await movieRequest(encodeURIComponent(type) + '/' + encodeURIComponent(tmdbId));
  const movie = data.movies.find(item => item.id === key);
  if (!panel.isConnected || movie?.tmdbId !== tmdbId || movie?.mediaType !== type) return;
  const {overview, releaseDate, genres, tmdbRating, providers} = details;
  const metadata = {overview, releaseDate, genres, tmdbRating};
  if (Object.keys(metadata).some(field => JSON.stringify(movie[field]) !== JSON.stringify(metadata[field]))) {
   Object.assign(movie, metadata);
   // This is a background metadata refresh. Keep the editor and its unsaved fields intact.
   lastSaved = clone(data);
   queueSave();
  }
  document.getElementById('movieMetadata').innerHTML = movieMetadata(movie);
  const subscribed = providers.subscription.filter(name => /disney|amazon prime|prime video/i.test(name) || (data.settings.netflix && /netflix/i.test(name)));
  const other = providers.subscription.filter(name => !subscribed.includes(name));
  const line = (label, values) => `<p><strong>${label}</strong> ${esc(values.join(', ') || 'None listed')}</p>`;
  panel.innerHTML = `<h3>Streaming in Australia</h3>
   ${line('Your services', subscribed)}${line('Other subscriptions', other)}${line('Rent', providers.rent)}${line('Buy', providers.buy)}
   <p class="tiny">Provider data by JustWatch via TMDB. Availability may change. ${providers.link ? `<a href="${esc(providers.link)}" target="_blank" rel="noopener">Provider details ↗</a>` : ''}</p>`;
 } catch (error) {
  panel.textContent = error.message + ' ';
  const retry = document.createElement('button');
  retry.className = 'ghost';
  retry.textContent = 'Retry';
  retry.onclick = () => loadMovieDetails(key, type, tmdbId);
  panel.append(retry);
 } finally {
  panel.loading = false;
 }
}

const movieRender = render;
render = () => {
 movieRender();
 if (tab === 'more') document.getElementById('app').insertAdjacentHTML('beforeend',
  '<section class="card movie-credits"><h3>Credits</h3><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org/" target="_blank" rel="noopener"><img src="/tmdb-logo.svg" width="110" height="15" alt="The Movie Database"></a></section>');
};
