import { API_BASE_URL } from 'src/constants/auth.constants';

/**
 * Address of an uploaded image. The API stores a site-relative path ("/uploads/posts/x.png")
 * for local disk storage and an absolute URL when uploads live in an S3-compatible bucket;
 * the web app must accept both (prefixing the API address onto an absolute URL breaks it).
 */
export function mediaUrl(url: string | null | undefined, apiBase: string = API_BASE_URL): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  return `${apiBase.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}
