# Exercise the preserved Rails implementation with fake links and upstream data.
# No database writes, Redis changes, or e621 requests are made.
require 'minitest/mock'
require 'ostruct'
require 'pathname'
require 'json'
require 'cgi'
require 'uri'
require 'excon'
require 'active_support'
require 'active_support/cache'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/object/json'

# Also runs without booting Rails, keeping fixture generation small on the VPS.
unless defined?(Rails)
  module Rails
    def self.root = Pathname.new(File.expand_path('../..', __dir__))
    def self.cache = @cache ||= ActiveSupport::Cache::NullStore.new
  end
  class SiteConfig
    def self.e621_user_agent = 'Walltaker-fixture-test'
  end
  require_relative '../../app/services/legacy_e621'
end

base = { blacklist: '', theme: nil, min_score: 0, can_show_videos: false, is_kink_aligned: false, kinks: [] }
cases = [
  { tags: '', policy: base },
  { tags: 'foo foo blocked', policy: base.merge(blacklist: 'BLOCKED gore', theme: 'forest', min_score: 50) },
  { tags: 'order:random ~foo', policy: base.merge(can_show_videos: true, is_kink_aligned: true, kinks: %w[foo bar]) },
  { tags: 'foo', policy: base.merge(is_kink_aligned: true, kinks: %w[foo bar]) },
  { tags: '', policy: base.merge(is_kink_aligned: true, kinks: []) },
  { tags: 'a a', policy: nil },
  { tags: 'fox', after: '123', limit: 150, policy: base.merge(blacklist: 'MALE/MALE -gore rating:e <script>') },
  { tags: 'forest', before: '456', policy: base.merge(theme: 'forest', min_score: 300) },
  { tags: 'foo', after: '123', before: '456', policy: base }
]
fixture = cases.map do |input|
  policy = input[:policy]
  link = if policy
    kinks = Object.new
    kinks.define_singleton_method(:pluck) { |*| policy[:kinks] }
    record = OpenStruct.new(blacklist: policy[:blacklist], theme: policy[:theme], min_score: policy[:min_score], user: OpenStruct.new(kinks:))
    record.define_singleton_method(:check_ability) { |name| policy[name.to_sym] }
    record
  end
  service = LegacyE621.new
  captured = nil
  response = OpenStruct.new(status: 200, body: { posts: [] }.to_json)
  Rails.stub(:cache, ActiveSupport::Cache::NullStore.new) do
    Object.instance_method(:stub).bind_call(Excon, :get, ->(url, **) { captured = URI.decode_www_form(URI(url).query).to_h; response }) do
      service.get_tag_results(input[:tags], input[:after], input[:before], link, input[:limit] || 15)
    end
  end
  blacklist = link ? service.make_blacklist(link) : ''
  query = input[:tags].split(' ').reject { |tag| blacklist.split(' ').include?(tag) }.uniq.join(' ')
  { input:, expected: { tags: captured.fetch('tags'), limit: captured.fetch('limit').to_i, page: captured['page'],
    suffix: link ? service.make_tag_suffix(link, blacklist, query) : '', blacklist:, videos: policy ? policy[:can_show_videos] : true } }
end
File.write(Rails.root.join('services/wallpaper-api/test/fixtures/e621.json'), JSON.pretty_generate(fixture))
puts 'Wrote e621 query contract fixtures with fake upstream responses and unsaved policies.'
