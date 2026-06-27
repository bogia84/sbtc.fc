export const REPO = localStorage.getItem('gh_repo') || '';
export const GITHUB_TOKEN = localStorage.getItem('gh_token') || '';
export const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : '';
