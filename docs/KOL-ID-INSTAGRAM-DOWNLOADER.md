# KOL.ID Instagram Downloader

The `.igdl` plugin adapts the owner-supplied `kol_instagram_scraper.js` into WHISKAY's ESM/media/plugin structure. It uses KOL.ID's public page and asynchronous downloader workflow; the adapter does not reuse the supplied CLI's arbitrary local output path or unbounded streaming approach.

## Commands

```text
.igdl <instagram_url>
.igdl extract <instagram_url>
.igdl info
.igdl help
```

Aliases: `.kolig`, `.igdownload`. The command processes public Instagram post/reel/reels/TV/story URLs accepted by the validator. It submits the URL to KOL.ID, polls the fixed KOL.ID status route when the job is queued, validates resolved media URLs, downloads bounded media buffers, and sends the resulting video/image items to the invoking chat.

## Supported outputs

- A public video or Reel returns a video item and optional thumbnail.
- A public carousel/slide post returns multiple image/video items within the per-item and total media limits.
- `.igdl info` reads the landing-page SEO/feature metadata. Dynamic HTML or API changes may affect this command.

## Network and safety controls

- Input must be an HTTPS URL on `instagram.com` or `www.instagram.com`, with a supported post/reel/TV/story path.
- The adapter acquires KOL.ID cookies and a page CSRF token for each extraction; it posts to the fixed downloader endpoint and polls only the fixed KOL.ID status route.
- Status URLs and media URLs are validated against allowlisted public HTTPS hosts. Redirect targets are revalidated before streaming.
- No arbitrary remote host, private Instagram login, cookie/session import, local file path, or shell command is accepted from WhatsApp chat.
- Per-item and total download sizes are bounded (40 MiB/item and 64 MiB for one extraction), the number of media items is capped at ten, and HTML/JSON/media response bodies have byte caps and read timeouts.
- The downloader does not like/follow/comment, send DMs, bypass private accounts, or automate engagement.

## Privacy and rights

The public Instagram URL is sent to KOL.ID for extraction; returned media is downloaded from approved hosts and sent to the request chat. Do not submit private content or media without permission. Respect the original creator's rights and platform terms. KOL.ID can change its API/HTML at any time; mock tests validate the adapter logic but do not guarantee the external service is currently available.

## Source

Adapted from the JavaScript supplied by the owner. Original reference: `kol_instagram_scraper.js` for KOL.ID Instagram Downloader. Service URL: https://kol.id/download-video/instagram.
