# Standalone tests avoid booting Rails or touching the application's database.
require 'active_support'
require 'active_support/core_ext'
require 'active_support/testing/time_helpers'
require 'minitest/autorun'
require 'ostruct'
require 'redis'
module Rails
  def self.env = ActiveSupport::StringInquirer.new('test')
end
require_relative '../../app/services/link_presence'

class LinkPresenceLeaseTest < Minitest::Test
  include ActiveSupport::Testing::TimeHelpers

  def setup
    LinkPresence.reset!
    if ENV['PRESENCE_TEST_REDIS_URL']
      @redis = Redis.new(url: ENV.fetch('PRESENCE_TEST_REDIS_URL'))
      @redis.scan_each(match: 'link:99000*:ws_client_leases') { |key| @redis.del(key) }
    end
  end

  def teardown
    travel_back
    @redis&.scan_each(match: 'link:99000*:ws_client_leases') { |key| @redis.del(key) }
    LinkPresence.reset!
  end

  def test_abandoned_connection_expires_after_five_minutes
    assert_equal 300, LinkPresence::TTL.to_i
    LinkPresence.join_id(990001, 'dead')
    assert LinkPresence.online_id?(990001)
    travel LinkPresence::TTL + 1.second
    refute LinkPresence.online_id?(990001)
    refute_includes LinkPresence.online_link_ids, 990001
  end

  def test_node_loaded_graph_uses_its_explicit_presence_snapshot
    link = Struct.new(:id).new(990001)
    link.instance_variable_set(:@node_browser_connected, true)
    assert LinkPresence.online?(link)
    link.instance_variable_set(:@node_browser_connected, false)
    refute LinkPresence.online?(link)
  end

  def test_pongs_keep_healthy_idle_connections_online_beyond_original_expiry
    LinkPresence.join_id(990001, 'healthy')
    20.times do
      travel 30.seconds
      LinkPresence.refresh_many('990001' => 'healthy')
    end
    assert LinkPresence.online_id?(990001)
    travel LinkPresence::TTL + 1.second
    refute LinkPresence.online_id?(990001)
  end

  def test_healthy_connections_do_not_extend_a_dead_connections_lease
    LinkPresence.join_id(990001, 'dead')
    LinkPresence.join_id(990001, 'healthy')
    travel 4.minutes
    LinkPresence.refresh_id(990001, 'healthy')
    travel 2.minutes
    assert LinkPresence.online_id?(990001)
    assert LinkPresence.leave_id(990001, 'healthy')
    refute LinkPresence.online_id?(990001)
  end

  def test_disconnect_removes_only_that_connection_and_is_idempotent
    LinkPresence.join_id(990001, 'one')
    LinkPresence.join_id(990001, 'two')
    refute LinkPresence.leave_id(990001, 'one')
    assert LinkPresence.online_id?(990001)
    assert LinkPresence.leave_id(990001, 'two')
    refute LinkPresence.leave_id(990001, 'two')
  end

  def test_heartbeat_renews_all_links_owned_by_that_socket
    LinkPresence.refresh_many('990001' => 'socket-one', '990002' => 'socket-two')
    travel 4.minutes
    LinkPresence.refresh_many('990001' => 'socket-one', '990002' => 'socket-two')
    travel 2.minutes
    assert LinkPresence.online_id?(990001)
    assert LinkPresence.online_id?(990002)
  end
end
