---
layout: default
title: All articles
permalink: /articles/
tcode: ZPOSTS
screen_title: "Display Articles: List"
---

{%- comment -%}
  ALV list of every post. On narrow screens the rows stack (see .alv CSS).
{%- endcomment -%}
<table class="alv">
  <thead>
    <tr>
      <th scope="col" class="alv__date">Posting date</th>
      <th scope="col">Title</th>
      <th scope="col">Source</th>
    </tr>
  </thead>
  <tbody>
    {%- for post in site.posts -%}
    {%- assign d = post.original_date | default: post.date -%}
    <tr>
      <td class="alv__date"><time datetime="{{ d | date_to_xmlschema }}">{{ d | date: "%d.%m.%Y" }}</time></td>
      <td>
        <a class="alv__title" href="{{ post.url | relative_url }}">{{ post.title | escape }}</a>
        <span class="alv__excerpt">{{ post.excerpt | strip_html | truncate: 180 }}</span>
      </td>
      <td class="alv__src">
        {%- if post.original_url -%}<a href="{{ post.original_url }}">{{ post.original_publication | default: "Elsewhere" }}</a>
        {%- else -%}This blog{%- endif -%}
      </td>
    </tr>
    {%- endfor -%}
  </tbody>
</table>
