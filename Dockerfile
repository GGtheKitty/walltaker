# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.3.4
FROM ruby:$RUBY_VERSION

ENV APP_DIR=/ror

# Prepare working directory.
WORKDIR ${APP_DIR}

# Copy gemfiles first, so they are cached for build
COPY Gemfile Gemfile.lock ${APP_DIR}/
COPY ./nuttracker ${APP_DIR}/nuttracker/

# Install the exact Bundler version used by the application, then install gems.
# Separate RUN instructions also work with Docker's classic builder.
RUN ruby --version
RUN gem install bundler -v 2.4.13
RUN bundle _2.4.13_ install --jobs 1

# Copy the application after dependencies so Gemfile changes are the only
# application edits that invalidate the expensive bundle layer.
COPY ./ ${APP_DIR}

RUN SECRET_KEY_BASE_DUMMY=1 bundle exec rails app:assets:precompile

# Exec on container start
#ENTRYPOINT ["./ror/bin/setup"]

# Expose port outside container
EXPOSE 3000

# Start app server.
CMD ["bundle", "exec", "rails", "server", "-e", "production", "-b", "0.0.0.0"]
