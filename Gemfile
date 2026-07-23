source "https://rubygems.org"

# Not the `github-pages` gem: it pins liquid 4.0.3, which calls String#tainted?,
# removed in Ruby 3.2. That stack cannot boot on a current Ruby. Jekyll 4 renders
# this site identically as long as the markdown settings in _config.yml match
# what GitHub Pages uses (kramdown + GFM + rouge), which they now do explicitly.
gem "jekyll", "~> 4.4"

# Plugins declared in _config.yml.
group :jekyll_plugins do
  gem "jekyll-feed", "~> 0.17"
  gem "jekyll-seo-tag", "~> 2.8"
end

# Dropped from Ruby's default gems; Jekyll still expects them present.
gem "webrick"
gem "csv"
gem "base64"
gem "bigdecimal"
