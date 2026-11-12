---
layout: default
title: Profile
permalink: /cv/
tcode: ZCV
screen_title: "Display Employee: Fernando Cucci"
status: "Personnel data displayed"
---

<section class="group">
  <h2 class="group__title">Personal data</h2>
  <dl class="fields">
    <dt>Name</dt><dd><span class="field">{{ site.author }}</span></dd>
    <dt>Position</dt><dd><span class="field field--wide">Solutions Architect &amp; Technical Presales, Code10</span></dd>
    <dt>Location</dt><dd><span class="field">Barcelona, Spain</span></dd>
    <dt>Focus</dt><dd><span class="field field--wide">Bridging SAP &amp; AI for enterprise. 15+ years in SAP. AWS, generative AI, Python.</span></dd>
    <dt>Contact</dt><dd><a class="field field--link" href="{{ site.linkedin_url }}" rel="me">LinkedIn profile</a></dd>
  </dl>
</section>

<section class="group" id="certifications">
  <h2 class="group__title">Certifications</h2>
  <table class="alv alv--compact">
    <thead>
      <tr>
        <th scope="col">Certification</th>
        <th scope="col">Issuer</th>
        <th scope="col" class="alv__date">Issued</th>
        <th scope="col" class="alv__date">Valid to</th>
      </tr>
    </thead>
    <tbody>
      {%- for c in site.data.certifications -%}
      <tr>
        <td>{{ c.name }}</td>
        <td>{{ c.issuer }}</td>
        <td class="alv__date">{{ c.issued}}</td>
        <td class="alv__date">{% if c.expires %}{{ c.expires}}{% else %}&nbsp;{% endif %}</td>
      </tr>
      {%- endfor -%}
    </tbody>
  </table>
</section>

<section class="group" id="experience">
  <h2 class="group__title">Employment history</h2>
  {%- for job in site.data.experience -%}
  <article class="job">
    <h3 class="job__role">{{ job.role }}</h3>
    <p class="job__meta">
      {{ job.company }} · {{ job.from}} to {% if job.to == "Present" %}today{% else %}{{ job.to}}{% endif %} · {{ job.location }}
    </p>
    {%- if job.points -%}
    <ul class="job__points">
      {%- for p in job.points -%}<li>{{ p }}</li>{%- endfor -%}
    </ul>
    {%- endif -%}
  </article>
  {%- endfor -%}
</section>

<section class="group" id="education">
  <h2 class="group__title">Education</h2>
  <table class="alv alv--compact">
    <thead>
      <tr><th scope="col">Degree</th><th scope="col">Institution</th><th scope="col" class="alv__date">Period</th></tr>
    </thead>
    <tbody>
      <tr><td>Postgraduate Degree, Data Science and Machine Learning</td><td>Universitat de Barcelona</td><td class="alv__date">09.2024 to 04.2025</td></tr>
      <tr><td>Bachelor's degree, Computer Science</td><td>University of Buenos Aires</td><td class="alv__date">2003 to 2010</td></tr>
    </tbody>
  </table>
</section>
