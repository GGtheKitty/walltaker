# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.3.4
FROM ruby:$RUBY_VERSION

ENV APP_DIR=/ror

# Prepare working directory.
WORKDIR ${APP_DIR}

# Copy gemfiles first, so they are cached for build
COPY Gemfile Gemfile.lock ${APP_DIR}
COPY ./nuttracker ${APP_DIR}/nuttracker

# Exec on image build
RUN <<EOF
    set -e
    echo "== versions == "
    ruby --version
    gem --version
    echo "== install bundler == "
    gem install bundler -v 2.4.13
    bundle _2.4.13_ --version
    echo "== install gems == "
    bundle _2.4.13_ install --jobs 1
    echo "== precompile assets == "
    bundle exec rails app:assets:precompile
EOF

#copy the rest of the files that don't need bu
COPY ./ ${APP_DIR}

# Exec on container start
#ENTRYPOINT ["./ror/bin/setup"]

# Expose port outside container
EXPOSE 3000

# Start app server.
CMD ["bundle", "exec", "rails", "server", "-e", "production", "-b", "0.0.0.0"]
