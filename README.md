# fernandocucci.github.io

Personal site. Articles I've written on SAP, AI, and enterprise systems.
Jekyll + GitHub Pages.

## Adding a post

1. Create `_posts/YYYY-MM-DD-slug.md`. The date prefix is required — Jekyll
   ignores files without it.
2. Front matter:

   ```yaml
   ---
   layout: post
   title: "Title of the article"
   date: 2026-06-10
   original_url: https://code10it.com/the-article/
   original_publication: Code10 blog
   original_date: 2026-06-10
   ---
   ```

   The `original_*` fields are optional. If `original_url` is set, the post
   renders a line crediting where it first appeared; otherwise nothing shows.
3. Paste the markdown below the front matter.
4. Images go in `assets/<slug>/`, referenced with an absolute path:
   `![alt](/assets/<slug>/image.png)`. Obsidian-style `![[image.png]]` embeds
   do not work here.
5. `git push`. Pages rebuilds automatically, ~1 minute.

## Local preview (optional)

Not needed to publish.

```sh
bundle init && bundle add github-pages jekyll-feed jekyll-seo-tag
bundle exec jekyll serve
```

## Custom domain (later)

Add a `CNAME` file with the domain and point DNS at GitHub Pages. The
`fernandocucci.github.io` URL keeps redirecting, so existing links don't break.
