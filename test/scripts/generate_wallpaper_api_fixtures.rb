# Run with bundle exec rails runner; only renders unsaved records and reads Redis.
require 'minitest/mock'

secret = 'node-proxy-test-secret'
owner = User.new(id: 9_876_543_210, username: 'FixtureOwner')
setter = User.new(id: 9_876_543_211, username: 'FixtureSetter')
link = Link.new(
  id: 9_876_543_210, user: owner, set_by: setter,
  expires: Time.utc(2100), created_at: Time.utc(2024), updated_at: Time.utc(2025),
  terms: 'Fixture terms', blacklist: 'fixture_blacklist',
  post_url: 'https://static1.e621.net/data/ab/cd/0123456789abcdef0123456789abcdef.jpg',
  post_thumbnail_url: 'https://static1.e621.net/data/sample/fixture.jpg',
  post_description: '😀' * 101, response_type: :ok, response_text: 'Thanks',
  last_ping: nil, last_ping_user_agent: 'FixtureClient/1.0'
)
renderer = ApiController.renderer.new(http_host: 'devenv.playctrl.me', https: true)
verifier = ActiveSupport::MessageVerifier.new(Rails.application.key_generator(secret).generate_key('e621_media'))
fixture = { secretKeyBase: secret, baseUrl: 'https://devenv.playctrl.me' }
E621MediaProxy.stub(:verifier, verifier) do
  fixture[:detail] = JSON.parse(renderer.render(template: 'api/show_link', formats: [:json], assigns: { link: link, set_by: setter }))
  fixture[:listEntry] = JSON.parse(renderer.render(partial: 'api/link', formats: [:json], locals: { link: link }))
  fixture[:widget] = JSON.parse(renderer.render(template: 'api/show_link_widget', formats: [:json], assigns: { link: link, set_by: setter }))
end
fixture[:row] = JSON.parse(link.to_json(only: %w[id expires terms blacklist post_url post_thumbnail_url created_at updated_at response_text post_description last_ping last_ping_user_agent]))
fixture[:row][:response_type] = Link.response_types.fetch(link.response_type)
fixture[:row][:username] = owner.username
fixture[:row][:set_by_username] = setter.username
path = Rails.root.join('services/wallpaper-api/test/fixtures/rails.json')
FileUtils.mkdir_p(path.dirname)
File.write(path, JSON.pretty_generate(fixture))
puts 'Wrote Rails JSON contract fixture using a dummy signing key.'
