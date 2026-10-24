# Only unsaved records and stubbed relations: no application data is changed.
require 'minitest/mock'

source = JSON.parse(File.read(Rails.root.join('services/wallpaper-api/test/fixtures/rails.json')))
user = User.new(id: 9_876_543_210, username: 'FixtureOwner', set_count: 42,
                is_reporter: true, is_cutie: false, is_supporter: true)
link = Link.new(source.fetch('row').except('username', 'set_by_username', 'response_type').merge(user: user, response_type: :ok))
scope = Object.new
scope.define_singleton_method(:where) { |*| self }
scope.define_singleton_method(:and) { |*| self }
scope.define_singleton_method(:or) { |*| self }
scope.define_singleton_method(:is_online) { self }
scope.define_singleton_method(:pluck) { |*| [] }
scope.define_singleton_method(:map) { |&block| [link].map(&block) }
verifier = ActiveSupport::MessageVerifier.new(Rails.application.key_generator(source.fetch('secretKeyBase')).generate_key('e621_media'))
result = {}
user.stub(:link, scope) do
  user.stub(:flair, 'Fixture flair') do
    user.stub(:master, User.new(username: 'FixtureMaster')) do
      user.stub(:pets, [User.new(username: 'FixturePet')]) do
        E621MediaProxy.stub(:verifier, verifier) do
          LinkPresence.stub(:online?, false) do
            User::API_AUDIENCES.each { |audience| result[audience] = JSON.parse(user.api_payload(audience:).to_json) }
          end
        end
      end
    end
  end
end
File.write(Rails.root.join('services/wallpaper-api/test/fixtures/users.json'), JSON.pretty_generate(result))
puts 'Wrote user-status contract fixtures from Rails with unsaved records and a dummy key.'
