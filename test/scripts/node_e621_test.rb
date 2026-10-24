# Standalone adapter checks: no application boot, database, or network.
require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/object/json'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'json'
require 'logger'
require 'excon'

module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
require_relative '../../app/services/legacy_e621'
require_relative '../../app/services/node_e621'
require_relative '../../app/services/e621'
require_relative '../../app/helpers/message_thread_helper'

class NodeE621Test < Minitest::Test
  def setup
    @previous = ENV['E621_BACKEND_URL']
    ENV['E621_BACKEND_URL'] = 'http://wallpaper_api:3002'
    @kinks = Object.new
    @kinks.define_singleton_method(:pluck) { |*| %w[forest fox] }
    @link = OpenStruct.new(blacklist: 'gore', theme: 'forest', min_score: 50, user: OpenStruct.new(kinks: @kinks))
    @link.define_singleton_method(:check_ability) { |ability| ability == 'is_kink_aligned' }
  end

  def teardown
    @previous ? ENV['E621_BACKEND_URL'] = @previous : ENV.delete('E621_BACKEND_URL')
  end

  def test_policy_preserves_blacklist_theme_score_abilities_and_kinks
    assert_equal({ blacklist: 'gore', theme: 'forest', min_score: 50, can_show_videos: false,
                   is_kink_aligned: true, kinks: %w[forest fox] }, NodeE621.policy(@link))
    assert_nil NodeE621.policy(nil)
  end

  def test_unaligned_links_do_not_load_unneeded_kinks
    @link.define_singleton_method(:check_ability) { |*| false }
    @kinks.define_singleton_method(:pluck) { |*| raise 'Unnecessary database query' }
    assert_equal [], NodeE621.policy(@link)[:kinks]
  end

  def test_search_count_query_selection_and_metadata_all_use_node
    calls = []
    NodeE621.stub(:request, ->(operation, body) {
      calls << [operation, body]
      case operation
      when 'search' then [{ 'id' => 123 }]
      when 'query' then { 'suffix' => 'filtered suffix' }
      when 'select' then { 'id' => 123 }
      when 'post' then { 'post' => { 'file' => { 'url' => 'https://static1.e621.net/data/test.jpg' } } }
      end
    }) do
      service = E621.new
      assert_equal [{ 'id' => 123 }], service.get_tag_results('fox', '100', nil, @link)
      assert_equal 1, service.get_possible_post_count(@link)
      assert_equal 'filtered suffix', service.get_search_base(@link)
      assert_equal({ 'id' => 123 }, service.get_post(123, @link))
      assert_equal 'https://static1.e621.net/data/test.jpg', service.get_media_url(123)
    end
    assert_equal %w[search search query select post], calls.map(&:first)
    assert_equal 150, calls[1].last[:limit]
    assert_equal '100', calls.first.last[:after]
    assert_equal NodeE621.policy(@link), calls[3].last[:policy]
  end

  def test_outages_do_not_fall_back_to_unfiltered_search_or_external_browse_links
    NodeE621.stub(:request, ->(*) { raise NodeE621::Unavailable }) do
      service = E621.new
      assert_nil service.get_tag_results('fox', nil, nil, @link)
      assert_nil service.get_search_base(@link)
      assert_nil service.get_post(123, @link)
      assert_nil service.get_media_url(123)
    end
  end

  def test_rpc_has_separate_credentials_timeouts_and_json_parameters
    captured = nil
    connection = Object.new
    connection.define_singleton_method(:request) do |request|
      captured = request
      response = Net::HTTPOK.new('1.1', '200', 'OK')
      response.define_singleton_method(:body) { '[{"id":123}]' }
      response
    end
    NodeE621.stub(:policy, nil) do
      Net::HTTP.stub(:start, ->(host, port, **options, &block) {
        assert_equal 'wallpaper_api', host
        assert_equal 3002, port
        assert_equal 25, options[:read_timeout]
        block.call(connection)
      }) do
        assert_equal [{ 'id' => 123 }], E621.new.get_tag_results('fox', nil, nil, nil)
      end
    end
    assert_equal '/_internal/e621/search', captured.path
    assert_equal 'application/json', captured['Content-Type']
    assert_equal 'fox', JSON.parse(captured.body)['tags']
    expected = OpenSSL::HMAC.hexdigest('SHA256', 'test-secret', 'walltaker:e621:commands:v1')
    assert_equal "Bearer #{expected}", captured['Authorization']
    assert_nil captured['Cookie']
  end

  def test_network_failures_are_unavailable_errors
    Net::HTTP.stub(:start, ->(*) { raise Timeout::Error }) do
      assert_raises(NodeE621::Unavailable) { NodeE621.request('search', tags: '') }
    end
  end

  def test_chat_preview_uses_node_metadata_and_handles_dead_links
    helper = Class.new { include MessageThreadHelper }.new
    NodeE621.stub(:request, ->(operation, input) {
      assert_equal 'post', operation
      assert_equal '123', input[:post_id]
      { 'post' => { 'file' => { 'url' => 'https://static1.e621.net/data/test.jpg' } } }
    }) do
      assert_equal 'See https://static1.e621.net/data/test.jpg', helper.convert_all_e621_links_to_source_links('See https://e621.net/posts/123?foo=bar')
    end
    NodeE621.stub(:request, { 'post' => nil }) do
      assert_equal 'Dead link :(', helper.convert_all_e621_links_to_source_links('https://e621.net/posts/123')
    end
  end

  def test_deployments_without_the_node_url_keep_the_legacy_query_builder
    ENV.delete('E621_BACKEND_URL')
    NodeE621.stub(:request, ->(*) { flunk 'Disabled backend called' }) do
      assert_equal '-flash forest -gore score:>50 -animated ~forest ~fox', E621.new.get_search_base(@link)
    end
  end
end
