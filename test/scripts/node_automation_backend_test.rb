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
require_relative '../../app/services/node_automation_backend'

class NodeAutomationBackendTest < Minitest::Test
  def setup
    @old = ENV['AUTOMATION_BACKEND_URL']
    ENV['AUTOMATION_BACKEND_URL'] = 'http://wallpaper_api:3002'
  end
  def teardown
    @old ? ENV['AUTOMATION_BACKEND_URL'] = @old : ENV.delete('AUTOMATION_BACKEND_URL')
  end
  def test_legacy_jobs_forward_to_the_private_namespace_without_browser_credentials
    captured = nil
    client = Object.new
    client.define_singleton_method(:request) do |request|
      captured = request
      response = Net::HTTPOK.new('1.1', '200', 'OK')
      response.define_singleton_method(:body) { '{"job_id":"12"}' }
      response
    end
    Net::HTTP.stub(:start, ->(*, **, &block) { block.call(client) }) do
      assert_equal '12', NodeAutomationBackend.round('ki', request_key: 'same-job')['job_id']
    end
    assert_equal '/_internal/automation/round', captured.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256','test-secret','walltaker:automation:commands:v1')}", captured['Authorization']
    assert_nil captured['Cookie']
    assert_equal({ 'bot'=>'ki', 'request_key'=>'same-job' }, JSON.parse(captured.body))
  end
  def test_news_steps_preserve_the_phase_and_retry_key
    captured = nil
    NodeAutomationBackend.stub(:request, ->(operation, input) { captured = [operation, input] }) do
      NodeAutomationBackend.enqueue_news('{"message":"Hello"}', request_key: 'news-1', transitioning: :away, done: true)
    end
    assert_equal ['news-entry', { entry: { 'message'=>'Hello' }, request_key: 'news-1', phase: 'away', done: true }], captured
  end
  def test_transport_failure_does_not_drop_the_original_job
    Net::HTTP.stub(:start, ->(*) { raise IOError }) do
      assert_raises(NodeAutomationBackend::Unavailable) { NodeAutomationBackend.round('ki') }
    end
  end
end
