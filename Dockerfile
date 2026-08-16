# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.3.4
FROM ruby:$RUBY_VERSION

# Prepare working directory.
WORKDIR /ror
COPY ./ /ror

# Exec on image build
RUN gem install bundler
RUN bundle install
RUN bundle exec rails assets:precompile

# Exec on container start
#ENTRYPOINT ["./ror/bin/setup"]

# Expose port outside container
EXPOSE 3000

# Start app server.
CMD ["bundle", "exec", "rails", "server", "-e", "production", "-b", "0.0.0.0"]