# Standalone checks: no Rails application boot, database, or network.
require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/object/json'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'json'
require 'logger'

module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
class Link
  def self.instantiate(row) = OpenStruct.new(row)
end
require_relative '../../app/services/node_link_backend'

class NodeLinkBackendTest < Minitest::Test
  def setup
    @previous = ENV['LINK_MANAGEMENT_URL']
    ENV['LINK_MANAGEMENT_URL'] = 'http://wallpaper_api:3002'
    @actor = OpenStruct.new(id: 1)
    @link = OpenStruct.new(id: 2)
    @link.define_singleton_method(:new_record?) { false }
  end

  def teardown
    @previous ? ENV['LINK_MANAGEMENT_URL'] = @previous : ENV.delete('LINK_MANAGEMENT_URL')
  end

  def test_save_delegates_settings_and_returns_a_persisted_record
    captured = nil
    NodeLinkBackend.stub(:request, ->(operation, input) { captured = [operation,input]; { 'link' => { 'id' => 2,'theme' => 'forest' } } }) do
      saved = NodeLinkBackend.save(link: @link,actor: @actor,attributes: { theme:'forest' },request_key:'same-key',ahoy_visit_id:42)
      assert_equal 2, saved.id
      assert_equal 'forest', saved.theme
    end
    assert_equal 'update', captured.first
    assert_equal 1, captured.last[:actor_id]
    assert_equal 'same-key', captured.last[:request_key]
    assert_equal 42, captured.last[:ahoy_visit_id]
    assert_equal({ theme:'forest' }, captured.last[:attributes])
  end

  def test_rejected_settings_are_added_to_the_existing_form_errors
    messages = []
    errors = Object.new
    errors.define_singleton_method(:add) { |*args| messages << args }
    @link.errors = errors
    NodeLinkBackend.stub(:request, ->(*) { raise NodeLinkBackend::Rejected.new(422,{ 'errors'=>{ 'theme'=>['must be only 1 tag.'] } }) }) do
      assert_nil NodeLinkBackend.save(link:@link,actor:@actor,attributes:{ theme:'two tags' })
    end
    assert_equal [['theme','must be only 1 tag.']], messages
  end

  def test_lists_commands_and_exports_use_their_correct_operations
    calls = []
    NodeLinkBackend.stub(:request, ->(operation,input) {
      calls << [operation,input]
      { 'links'=>[{ 'id'=>2 }],'text'=>'config','link'=>{ 'id'=>2 } }
    }) do
      assert_equal 2, NodeLinkBackend.list(actor:@actor).first.id
      assert_equal 'config', NodeLinkBackend.export(link:@link)
      NodeLinkBackend.command('wizard-apply',actor:@actor,link:@link,step:'intro',choices:{ gooner:'false' },surrender_id:3)
    end
    assert_equal %w[list export wizard-apply], calls.map(&:first)
    assert_equal 3, calls.last.last[:surrender_id]
    assert_equal 'intro', calls.last.last[:step]
  end

  def test_rpc_uses_its_own_credentials_and_never_browser_cookies
    captured = nil
    connection = Object.new
    connection.define_singleton_method(:request) do |request|
      captured = request
      response = Net::HTTPOK.new('1.1','200','OK')
      response.define_singleton_method(:body) { '{"ok":true}' }
      response
    end
    Net::HTTP.stub(:start, ->(host,port,**options,&block) {
      assert_equal 'wallpaper_api',host
      assert_equal 3002,port
      assert_equal 15,options[:read_timeout]
      block.call(connection)
    }) { assert_equal({ 'ok'=>true }, NodeLinkBackend.request('create',actor_id:1)) }
    assert_equal '/_internal/links/create',captured.path
    assert_equal({ 'actor_id'=>1 },JSON.parse(captured.body))
    expected = OpenSSL::HMAC.hexdigest('SHA256','test-secret','walltaker:links:commands:v1')
    assert_equal "Bearer #{expected}",captured['Authorization']
    assert_nil captured['Cookie']
  end

  def test_network_errors_fail_instead_of_saving_through_rails
    Net::HTTP.stub(:start, ->(*) { raise Timeout::Error }) do
      assert_raises(NodeLinkBackend::Unavailable) { NodeLinkBackend.request('create',actor_id:1) }
    end
  end
end
