require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/string/inflections'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
class NodeBrowserCurrent
  class << self; attr_accessor :controller; end
end
module ActiveRecord
  class RecordNotFound < StandardError; end
end
require_relative '../../app/services/node_browser_backend'
require_relative '../../app/services/node_browser_collection'
require_relative '../../app/helpers/links_helper'
class WallpaperClient < OpenStruct
  def self.instantiate(row) = new(row)
end
class NodeBrowserBackendTest < Minitest::Test
  def setup
    @old = ENV['BROWSER_BACKEND_URL']; ENV['BROWSER_BACKEND_URL'] = 'http://wallpaper_api:3002'
    request = OpenStruct.new(remote_ip: '198.51.100.11', request_method: 'POST', path: '/settings', request_id: 'abc', headers: { 'Cookie'=>'walltaker_session=test-cookie', 'Origin'=>'https://example.test' })
    NodeBrowserCurrent.controller = OpenStruct.new(request: request)
  end
  def teardown
    @old ? ENV['BROWSER_BACKEND_URL'] = @old : ENV.delete('BROWSER_BACKEND_URL')
    NodeBrowserCurrent.controller = nil
  end
  def test_browser_transport_forwards_cookie_and_origin_with_distinct_authentication_and_keyword_input
    captured = nil; client = Object.new
    client.define_singleton_method(:request) do |request|
      captured = request
      Net::HTTPOK.new('1.1', '200', 'OK').tap { |r| r.define_singleton_method(:body) { '{"verified":true}' } }
    end
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(client) }) { assert NodeBrowserBackend.request('csrf', tokens: ['form-token'])['verified'] }
    assert_equal '/_internal/browser/csrf', captured.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256', 'test-secret', 'walltaker:browser:commands:v1')}", captured['Authorization']
    assert_equal 'walltaker_session=test-cookie', captured['Cookie']
    body = JSON.parse(captured.body)
    assert_equal ['form-token'], body['tokens']; assert_equal 'https://example.test', body['origin']; assert_equal 'POST', body['method']; assert_equal '/settings', body['path']
  end
  def test_rejected_and_unavailable_are_not_silent_database_fallbacks
    Net::HTTP.stub(:start, ->(*) { raise IOError }) { assert_raises(NodeBrowserBackend::Unavailable) { NodeBrowserBackend.request('context') } }
    client = Object.new
    client.define_singleton_method(:request) { |*| Net::HTTPForbidden.new('1.1', '403', 'Forbidden').tap { |r| r.define_singleton_method(:body) { '{"message":"Forbidden"}' } } }
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(client) }) { assert_equal 403, assert_raises(NodeBrowserBackend::Rejected) { NodeBrowserBackend.request('authorize') }.status }
  end
  def test_live_update_renderer_loads_clients_from_node_without_a_browser_controller
    NodeBrowserCurrent.controller = nil
    helper = Object.new.extend(LinksHelper)
    NodeBrowserBackend.stub(:request, { 'clients'=>[{ 'name'=>'Test client', 'match_text'=>'ExampleClient' }] }) do
      assert_equal 'Test client', helper.client_for_user_agent('ExampleClient/1').name
      assert_nil helper.client_for_user_agent('OtherClient/1')
    end
  end
  def test_loaded_snapshot_filters_and_orders_without_database_and_rejects_unimplemented_sql
    model = Struct.new(:id, :username, :score)
    records = NodeBrowserCollection.new([model.new(1, 'A', 4), model.new(2, 'B', 9), model.new(3, 'C', nil)], model)
    assert_equal [2, 1], records.where('score > ?', 0).order(score: :desc).pluck(:id)
    assert_equal [1, 3], records.where.not(username: 'B').pluck(:id)
    assert_equal 'A', records.find(1).username
    assert_equal 9, records.maximum(:score)
    assert records.exists?(username: 'B')
    assert_raises(ActiveRecord::RecordNotFound) { records.find(99) }
    assert_raises(ArgumentError) { records.where('SELECT * FROM users') }
  end
end
