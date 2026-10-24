require 'active_support'
require 'active_support/core_ext/object/blank'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
require_relative '../../app/services/node_tracker_backend'

class NodeTrackerBackendTest < Minitest::Test
  def setup
    @old = ENV['TRACKER_BACKEND_URL']
    ENV['TRACKER_BACKEND_URL'] = 'http://wallpaper_api:3002'
  end
  def teardown
    @old ? ENV['TRACKER_BACKEND_URL'] = @old : ENV.delete('TRACKER_BACKEND_URL')
  end
  def test_private_commands_use_separate_credentials_and_no_cookies
    captured = nil
    client = Object.new
    client.define_singleton_method(:request) do |request|
      captured = request
      response = Net::HTTPOK.new('1.1','200','OK')
      response.define_singleton_method(:body) { '{"user_id":42}' }
      response
    end
    Net::HTTP.stub(:start, ->(*args, **options, &block) { block.call(client) }) do
      result = NodeTrackerBackend.command('entry-delete', actor: OpenStruct.new(id: 1), entry_id: 2,
        request_key: 'same-key', surrender_id: 3)
      assert_equal 42, result['user_id']
    end
    assert_equal '/_internal/tracker/entry-delete', captured.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256','test-secret','walltaker:tracker:commands:v1')}", captured['Authorization']
    assert_nil captured['Cookie']
    assert_equal({ 'actor_id'=>1, 'request_key'=>'same-key', 'surrender_id'=>3, 'entry_id'=>2 }, JSON.parse(captured.body))
  end
  def test_rejections_preserve_field_errors_without_turning_them_into_success
    client = Object.new
    client.define_singleton_method(:request) do |*|
      response = Net::HTTPUnprocessableEntity.new('1.1','422','Invalid')
      response.define_singleton_method(:body) { '{"message":"Invalid","errors":{"username":["has already been taken."]}}' }
      response
    end
    Net::HTTP.stub(:start, ->(*args, **options, &block) { block.call(client) }) do
      error = assert_raises(NodeTrackerBackend::Rejected) { NodeTrackerBackend.request('entry-create', {}) }
      assert_equal 422, error.status
      assert_equal ['has already been taken.'], error.errors['username']
    end
  end
  def test_transport_errors_fail_closed
    Net::HTTP.stub(:start, ->(*) { raise IOError }) do
      assert_raises(NodeTrackerBackend::Unavailable) { NodeTrackerBackend.request('entries') }
    end
  end
end
