import { REPO, GITHUB_TOKEN } from './config.js';

const DATA_FILES = {
  players: 'data/players.json',
  matches: 'data/matches.json',
  tournaments: 'data/tournaments.json',
  siteContent: 'data/site-content.json',
  siteStatus: 'data/site-status.json',
};

function getToken() {
  return sessionStorage.getItem('cms_token') || '';
}

async function serverWrite(filename, data) {
  const res = await fetch('/api/github-write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ filename, content: JSON.stringify(data, null, 2) })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function clientWrite(filename, data) {
  const repo = REPO;
  const token = GITHUB_TOKEN;
  if (!repo || !token) throw new Error('No repo/token configured for client-side writes');

  const url = `https://api.github.com/repos/${repo}/contents/${filename}`;
  const getRes = await fetch(url, { headers: { Authorization: `token ${token}` } });
  const existing = getRes.ok ? await getRes.json() : null;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = { message: `CMS update: ${filename}`, content };
  if (existing?.sha) body.sha = existing.sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!putRes.ok) throw new Error(await putRes.text());
  return putRes.json();
}

async function fetchJSON(path) {
  const cacheBust = `?t=${Date.now()}`;
  const res = await fetch(path + cacheBust);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function getPlayers() { return fetchJSON(DATA_FILES.players); }
export async function savePlayers(data) {
  try { return await serverWrite(DATA_FILES.players, data); }
  catch { return clientWrite(DATA_FILES.players, data); }
}

export async function getMatches() { return fetchJSON(DATA_FILES.matches); }
export async function saveMatches(data) {
  try { return await serverWrite(DATA_FILES.matches, data); }
  catch { return clientWrite(DATA_FILES.matches, data); }
}

export async function getTournaments() { return fetchJSON(DATA_FILES.tournaments); }
export async function saveTournaments(data) {
  try { return await serverWrite(DATA_FILES.tournaments, data); }
  catch { return clientWrite(DATA_FILES.tournaments, data); }
}

export async function getSiteContent() { return fetchJSON(DATA_FILES.siteContent); }
export async function saveSiteContent(data) {
  try { return await serverWrite(DATA_FILES.siteContent, data); }
  catch { return clientWrite(DATA_FILES.siteContent, data); }
}

export async function getSiteStatus() { return fetchJSON(DATA_FILES.siteStatus); }
export async function saveSiteStatus(data) {
  try { return await serverWrite(DATA_FILES.siteStatus, data); }
  catch { return clientWrite(DATA_FILES.siteStatus, data); }
}
