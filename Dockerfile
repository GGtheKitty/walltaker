FROM ruby:3.3.4

# Prepare working directory.
WORKDIR /ror
COPY ./ /ror
RUN gem install bundler -v 2.4.13
RUN bundle _2.4.13_ install --jobs 1
RUN bundle exec rails assets:precompile

# Start app server.
CMD ["bundle", "exec", "rails", "server", "-e", "production", "-b", "0.0.0.0"]
