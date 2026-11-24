import {dateOK} from './src/model.js';

const origin = 'https://api.themoviedb.org/3';
const media = new Set(['movie', 'tv']);
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';

function titleData(item, type) {
 const date = text(item.release_date || item.first_air_date, 10);
 return {
  tmdbId: item.id,
  mediaType: type,
  title: text(item.title || item.name, 1000),
  poster: /^\/[\w.-]+$/.test(item.poster_path || '') ? 'https://image.tmdb.org/t/p/w342' + item.poster_path : '',
  releaseDate: dateOK(date) ? date : '',
  overview: text(item.overview, 5000),
  tmdbRating: item.vote_count > 0 && Number.isFinite(item.vote_average) && item.vote_average >= 0 && item.vote_average <= 10 ? item.vote_average : null
 };
}

export async function tmdbResponse(url, token, fetcher, json) {
 const search = url.pathname === '/api/tmdb/search';
 const detail = /^\/api\/tmdb\/(movie|tv)\/([1-9]\d{0,9})$/.exec(url.pathname);
 if (!search && !detail) return json({error:'Not found'}, 404);
 const query = url.searchParams.get('q')?.trim();
 if (search && (!query || query.length > 200)) return json({error:'Enter a title of up to 200 characters.'}, 400);
 if (!token) return json({error:'Movie lookup is waiting for the Sidequest TMDB connection.'}, 503);

 const params = new URLSearchParams({language:'en-AU'});
 if (search) {
  params.set('query', query);
  params.set('include_adult', 'false');
 } else {
  params.set('append_to_response', 'watch/providers');
 }
 const path = search ? '/search/multi' : '/' + detail[1] + '/' + detail[2];
 try {
  const response = await fetcher(origin + path + '?' + params, {
   headers: {Authorization:'Bearer ' + token, Accept:'application/json'},
   redirect: 'manual'
  });
  if (response.status === 404) return json({error:'TMDB could not find this title.'}, 404);
  if (response.status === 429) return json({error:'TMDB is busy. Try again shortly.'}, 429);
  if (!response.ok) return json({error:'The TMDB connection is unavailable.'}, 502);
  const result = await response.json();
  if (search) {
   const results = (result.results || [])
    .filter(item => media.has(item.media_type) && Number.isSafeInteger(item.id) && item.id > 0 && (item.title || item.name))
    .slice(0, 10)
    .map(item => titleData(item, item.media_type));
   return json({results});
  }
  const providers = result['watch/providers']?.results?.AU;
  const names = kind => [...new Set((providers?.[kind] || []).map(item => text(item.provider_name, 100)).filter(Boolean))];
  const link = /^https:\/\/www\.themoviedb\.org\//.test(providers?.link || '') ? providers.link : '';
  return json({
   ...titleData({...result, id:Number(detail[2])}, detail[1]),
   genres: (result.genres || []).slice(0, 30).map(item => text(item.name, 100)).filter(Boolean),
   providers: {subscription:names('flatrate'), rent:names('rent'), buy:names('buy'), link}
  });
 } catch {
  return json({error:'The TMDB connection is unavailable.'}, 502);
 }
}
