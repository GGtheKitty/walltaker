FROM ruby:3.3.4

# Prepare working directory.
WORKDIR /ror
COPY ./ /ror
RUN gem install bundler
RUN bundle install
RUN SECRET_KEY_BASE=asset_precompile_secret REDIS_URL=redis://localhost:6379/1 RAILS_ENV=production bundle exec rails assets:precompile

# Start app server.
CMD ["bundle", "exec", "rails", "server", "-e", "production", "-b", "0.0.0.0"]
