# Lightweight adapter tests: no Rails boot, database or external requests.
require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/object/json'
require 'active_support/core_ext/hash'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'json'
require 'uri'

module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
require_relative '../../app/services/node_wallpaper_backend'

class NodeWallpaperBackendTest < Minitest::Test
  def setup
    @previous = ENV['WALLPAPER_BACKEND_URL']
    ENV['WALLPAPER_BACKEND_URL'] = 'http://wallpaper_api:3002'
    @link = OpenStruct.new(id: 123, attributes: { 'user_id' => 1, 'blacklist' => '', 'theme' => '',
      'min_score' => 0, 'friends_only' => false, 'never_expires' => true, 'expires' => nil })
    def @link.valid? = true
    def @link.reload = self
    @post = { 'id' => 456, 'file' => { 'url' => 'https://static1.e621.net/data/test.jpg' },
      'sample' => { 'url' => nil }, 'preview' => { 'url' => 'https://static1.e621.net/data/preview/test.jpg' },
      'description' => 'Test', 'rating' => 's', 'tags' => { 'general' => ['example'], 'species' => ['test'] } }
  end

  def teardown
    @previous ? ENV['WALLPAPER_BACKEND_URL'] = @previous : ENV.delete('WALLPAPER_BACKEND_URL')
  end

  def test_wallpaper_command_preserves_policy_thumbnail_setter_and_visit
    captured = nil
    NodeWallpaperBackend.stub(:request, ->(path, body) { captured = [path,body]; { 'event_id' => 1 } }) do
      assert NodeWallpaperBackend.apply(link: @link, post: @post, set_by: OpenStruct.new(id:2), request_key:'stable-request', ahoy_visit_id:3)
    end
    path,body = captured
    assert_equal '/_internal/wallpaper-updates', path
    assert_equal 456, body[:post_id]
    assert_equal 2, body[:set_by_id]
    assert_equal 3, body[:ahoy_visit_id]
    assert_equal 'example test rating:s', body[:tags]
    assert_equal @post['preview']['url'], body[:post_thumbnail_url]
    assert_equal @link.attributes, body[:expected_policy]
    assert_equal 'stable-request', body[:request_key]
  end

  def test_invalid_link_is_not_sent_to_node
    def @link.valid? = false
    NodeWallpaperBackend.stub(:request, ->(*) { flunk 'Invalid link reached Node' }) do
      refute NodeWallpaperBackend.apply(link: @link, post: @post)
    end
  end

  def test_backend_failure_does_not_report_a_successful_save
    messages = []
    errors = Object.new
    errors.define_singleton_method(:add) { |*args| messages << args }
    @link.errors = errors
    NodeWallpaperBackend.stub(:request, ->(*) { raise NodeWallpaperBackend::Unavailable, 'Please retry.' }) do
      refute NodeWallpaperBackend.apply(link: @link, post: @post)
    end
    assert_equal [[:base,'Please retry.']], messages
  end

  def test_reaction_preserves_other_pending_settings_and_uses_the_original_wallpaper
    captured = nil
    @link.response_type = 'disgust'
    @link.response_text = 'No thanks'
    @link.post_url_in_database = 'https://static1.e621.net/data/current.jpg'
    @link.changes = { 'terms' => ['old', 'new'], 'response_type' => [nil, 'disgust'], 'response_text' => [nil, 'No thanks'] }
    @link.define_singleton_method(:assign_attributes) { |attrs| self.pending = attrs }
    NodeWallpaperBackend.stub(:request, ->(path,body) { captured = [path,body]; {} }) do
      assert NodeWallpaperBackend.react(link: @link, request_key: 'reaction-request')
    end
    assert_equal '/_internal/wallpaper-reactions', captured.first
    assert_equal 'disgust', captured.last[:type]
    assert_equal @link.post_url_in_database, captured.last[:expected_post_url]
    assert_equal({ 'terms' => 'new' }, @link.pending)
  end
end
