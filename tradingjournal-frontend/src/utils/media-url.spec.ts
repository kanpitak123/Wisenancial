import { describe, expect, it } from 'vitest';
import { mediaUrl } from './media-url';

describe('mediaUrl', () => {
  it('prefixes the API address onto a site-relative upload path', () => {
    expect(mediaUrl('/uploads/posts/a.png', 'https://api.example.com')).toBe(
      'https://api.example.com/uploads/posts/a.png',
    );
    expect(mediaUrl('/uploads/posts/a.png', 'https://api.example.com/')).toBe(
      'https://api.example.com/uploads/posts/a.png',
    );
  });

  it('leaves an absolute URL (bucket / CDN) untouched', () => {
    expect(mediaUrl('https://cdn.example.com/posts/a.png', 'https://api.example.com')).toBe(
      'https://cdn.example.com/posts/a.png',
    );
    expect(mediaUrl('http://cdn.example.com/a.png', 'https://api.example.com')).toBe(
      'http://cdn.example.com/a.png',
    );
  });

  it('empty input gives an empty string, not "undefined"', () => {
    expect(mediaUrl(undefined, 'https://api.example.com')).toBe('');
    expect(mediaUrl(null, 'https://api.example.com')).toBe('');
    expect(mediaUrl('', 'https://api.example.com')).toBe('');
  });
});
