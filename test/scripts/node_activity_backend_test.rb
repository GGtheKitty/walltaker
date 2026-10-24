require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/enumerable'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
require 'time'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
class ActivityRenderRecord < OpenStruct
  def self.instantiate(row)
    new(row.to_h do |key, value|
      value = value.to_i if value && (key == 'id' || key.end_with?('_id'))
      value = Time.iso8601(value) if value.is_a?(String) && %w[created_at started_at].include?(key)
      [key, value]
    end)
  end
  def association(name)
    @associations ||= {}
    @associations[name] ||= Struct.new(:target).new
  end
  def method_missing(name, *)
    return @associations[name].target if @associations&.key?(name)
    super
  end
end
%w[User Kink KinkHaver Leash Link LinkAbility PastLink Scoop WallpaperClient HistoryEvent].each { |name| Object.const_set(name, Class.new(ActivityRenderRecord)) }
module Ahoy
  class Visit < ActivityRenderRecord; end
end
require_relative '../../app/services/node_discovery_backend'
require_relative '../../app/services/node_activity_backend'

class NodeActivityBackendTest < Minitest::Test
  def setup
    @old = ENV['ACTIVITY_BACKEND_URL']; ENV['ACTIVITY_BACKEND_URL'] = 'http://wallpaper_api:3002'
  end
  def teardown
    @old ? ENV['ACTIVITY_BACKEND_URL'] = @old : ENV.delete('ACTIVITY_BACKEND_URL')
  end
  def test_private_transport_uses_its_own_token_and_never_forwards_browser_credentials
    captured = nil; client = Object.new
    client.define_singleton_method(:request) do |request|
      captured = request
      Net::HTTPOK.new('1.1', '200', 'OK').tap { |r| r.define_singleton_method(:body) { '{"events":[]}' } }
    end
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(client) }) { assert_equal [], NodeActivityBackend.request('history', actor_id: 1)['events'] }
    assert_equal '/_internal/activity/history', captured.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', 'test-secret', 'walltaker:activity:commands:v1')}", captured['Authorization']
    assert_nil captured['Cookie']
  end
  def test_transport_and_rejection_failures_remain_errors
    Net::HTTP.stub(:start, ->(*) { raise IOError }) { assert_raises(NodeActivityBackend::Unavailable) { NodeActivityBackend.request('history') } }
    client = Object.new
    client.define_singleton_method(:request) { |*| Net::HTTPForbidden.new('1.1', '403', 'Forbidden').tap { |r| r.define_singleton_method(:body) { '{"message":"Denied"}' } } }
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(client) }) do
      assert_equal 403, assert_raises(NodeActivityBackend::Rejected) { NodeActivityBackend.request('history') }.status
    end
  end
  def test_models_and_exceptions_are_not_serialized_into_tracking_properties
    record = User.new(id: 42, password_digest: 'private', api_key: 'private')
    def record.as_json = raise('Must not serialize model')
    result = NodeActivityBackend.safe_properties({ actor: record, exception: IOError.new('private'), items: [record] })
    assert_equal({ id: 42 }, result[:actor]); assert_equal 'IOError', result[:exception]
    refute_includes JSON.generate(result), 'private'
    assert_nil NodeActivityBackend.visit_proof(Ahoy::Visit.new(ip: '198.51.100.8'))
  end
  def test_history_preserves_visitless_grouping_and_preloads_all_event_and_card_associations
    data = { 'events'=>[
      { 'id'=>'2', 'user_id'=>'1', 'surrender_controller_id'=>'4', 'link_id'=>'3', 'ahoy_visit_id'=>'10', 'created_at'=>'2026-10-01T03:00:00Z' },
      { 'id'=>'1', 'user_id'=>'1', 'link_id'=>'9', 'created_at'=>'2026-10-01T01:00:00Z' }
    ], 'visits'=>[{ 'id'=>'10', 'started_at'=>'2026-10-01T02:00:00Z' }],
      'users'=>[{ 'id'=>'1', 'username'=>'Alice' }, { 'id'=>'4', 'username'=>'Controller' }],
      'links'=>[{ 'id'=>'3', 'user_id'=>'1' }], 'graph'=>{ 'users'=>[{ 'id'=>'1', 'username'=>'Alice' }],
        'abilities'=>[{ 'link_id'=>'3', 'ability'=>'can_show_videos' }], 'latest'=>[{ 'id'=>'11', 'link_id'=>'3' }],
        'decorations'=>[{ 'link_id'=>'3', 'emoji'=>'🐱' }] } }
    result = NodeActivityBackend::History.new(data)
    assert_equal 10, result.events.first.first.id
    event = result.events.first.last.first
    assert_equal 'Controller', event.surrender_controller.username
    assert_equal 'Alice', event.link.user.username
    assert_equal 11, event.link.past_links.first.id
    assert_nil result.events.last.first
    assert_nil result.events.last.last.first.link
    assert_equal({ 3=>'🐱' }, result.decorations)
  end
end
