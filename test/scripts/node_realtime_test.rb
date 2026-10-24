# Standalone adapter checks; no Rails boot, database or network.
require 'active_support'
require 'active_support/core_ext/object/blank'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
end
require_relative '../../app/services/node_realtime'

class NodeRealtimeTest < Minitest::Test
  def setup
    @url = ENV['NODE_REALTIME_URL']
    ENV['NODE_REALTIME_URL'] = 'http://wallpaper_api:3002'
    @redis = $redis
  end
  def teardown
    @url ? ENV['NODE_REALTIME_URL'] = @url : ENV.delete('NODE_REALTIME_URL')
    $redis = @redis
  end
  def test_enqueues_the_same_durable_versioned_job_as_node
    captured = nil
    $redis = Object.new
    $redis.define_singleton_method(:eval) { |script, **options| captured = [script, options] }
    NodeRealtime.enqueue('user:Alice')
    assert_match /HINCRBY/, captured[0]
    assert_equal ['node:realtime:pending', 'node:realtime:versions'], captured[1][:keys]
    assert_equal 'user:Alice', captured[1][:argv][0]
    assert_operator captured[1][:argv][1], :>, 1_000_000_000_000
  end
  def test_poll_uses_the_private_rpc_credential_and_sends_no_cookie
    request = nil
    client = Object.new
    client.define_singleton_method(:request) do |value|
      request = value
      Net::HTTPNoContent.new('1.1', '204', 'No Content')
    end
    Net::HTTP.stub(:start, ->(host, port, **options, &block) {
      assert_equal 'wallpaper_api', host
      assert_equal 3002, port
      assert_equal 5, options[:read_timeout]
      block.call(client)
    }) { NodeRealtime.poll(OpenStruct.new(id:42), { 'user-agent'=>'Desktop' }) }
    assert_equal '/_internal/realtime-rpc/poll', request.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', 'test-secret', 'rpc-cable')}", request['Authorization']
    assert_nil request['Cookie']
    assert_equal({ 'id'=>42, 'headers'=>{ 'user-agent'=>'Desktop' } }, JSON.parse(request.body))
  end
  def test_failures_are_not_reported_as_delivered
    client = Object.new
    client.define_singleton_method(:request) { |*| Net::HTTPServiceUnavailable.new('1.1', '503', 'Unavailable') }
    Net::HTTP.stub(:start, ->(*args, **options, &block) { block.call(client) }) do
      assert_raises(RuntimeError) { NodeRealtime.poll(OpenStruct.new(id:42), {}) }
    end
  end
end
