require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/enumerable'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
class RenderRecord < OpenStruct
  def self.instantiate(row)
    new(row.to_h { |key,value| [key, value && (key == 'id' || key.end_with?('_id')) ? value.to_i : value] })
  end
  def association(name)
    @associations ||= {}
    @associations[name] ||= Struct.new(:target).new
  end
end
%w[User Kink KinkHaver Leash Link LinkAbility PastLink Scoop WallpaperClient].each { |name| Object.const_set(name, Class.new(RenderRecord)) }
require_relative '../../app/services/node_discovery_backend'
class NodeDiscoveryBackendTest < Minitest::Test
  def setup
    @old = ENV['DISCOVERY_BACKEND_URL']; ENV['DISCOVERY_BACKEND_URL'] = 'http://wallpaper_api:3002'
  end
  def teardown
    @old ? ENV['DISCOVERY_BACKEND_URL'] = @old : ENV.delete('DISCOVERY_BACKEND_URL')
  end
  def test_read_request_uses_its_own_credential_and_never_forwards_browser_cookies
    captured = nil
    client = Object.new
    client.define_singleton_method(:request) do |request|
      captured = request
      Net::HTTPOK.new('1.1', '200', 'OK').tap { |response| response.define_singleton_method(:body) { '{"total":12}' } }
    end
    Net::HTTP.stub(:start, ->(*args, **opts, &block) { block.call(client) }) do
      assert_equal 12, NodeDiscoveryBackend.request('search', query: '!canine', page: 2)['total']
    end
    assert_equal '/_internal/discovery/search', captured.path
    assert_equal "Bearer #{OpenSSL::HMAC.hexdigest('SHA256','test-secret','walltaker:discovery:commands:v1')}", captured['Authorization']
    assert_nil captured['Cookie']
    assert_equal({ 'query'=>'!canine', 'page'=>2 }, JSON.parse(captured.body))
  end
  def test_network_failures_fail_closed
    Net::HTTP.stub(:start, ->(*) { raise IOError }) { assert_raises(NodeDiscoveryBackend::Unavailable) { NodeDiscoveryBackend.request('browse') } }
  end
  def test_backend_rejections_keep_their_status
    client = Object.new
    client.define_singleton_method(:request) do |*|
      Net::HTTPUnprocessableEntity.new('1.1','422','Invalid').tap { |response| response.define_singleton_method(:body) { '{"message":"Invalid page."}' } }
    end
    Net::HTTP.stub(:start, ->(*args, **opts, &block) { block.call(client) }) do
      error = assert_raises(NodeDiscoveryBackend::Rejected) { NodeDiscoveryBackend.request('search', page: -1) }
      assert_equal 422, error.status
    end
  end
  def test_render_graph_preserves_order_and_preloads_card_feed_and_viewer_associations
    data = { 'links'=>[{ 'id'=>'9','user_id'=>'1','forked_from_id'=>'8' },{ 'id'=>'7','user_id'=>'1' }],
      'new_user_links'=>[{ 'id'=>'9','user_id'=>'1','forked_from_id'=>'8' }],
      'recent_posts'=>[{ 'id'=>'11','user_id'=>'1' }], 'viewers'=>[{ 'id'=>'2','viewing_link_id'=>'9' }],
      'recent_scoop'=>{ 'id'=>'12','user_id'=>'1' }, 'graph'=>{
        'users'=>[{ 'id'=>'1','username'=>'Owner' },{ 'id'=>'2','username'=>'Master' }],
        'parents'=>[{ 'id'=>'8','user_id'=>'2' }], 'viewed'=>[{ 'id'=>'9','user_id'=>'1' }],
        'abilities'=>[{ 'id'=>'5','link_id'=>'9','ability'=>'is_kink_aligned' }],
        'latest'=>[{ 'id'=>'13','link_id'=>'9' }], 'leashes'=>[{ 'id'=>'3','pet_id'=>'1','master_id'=>'2' }],
        'memberships'=>[{ 'id'=>'4','user_id'=>'1','kink_id'=>'6','is_starred'=>true }],
        'kinks'=>[{ 'id'=>'6','name'=>'canine' }], 'decorations'=>[{ 'link_id'=>'9','emoji'=>'🐱' }] } }
    page = NodeDiscoveryBackend::Page.new(data)
    assert_equal [9,7], page.links.map(&:id)
    link = page.links.first
    owner = link.association(:user).target
    assert_equal 'Owner', owner.username
    assert_equal 'Master', owner.association(:masters).target.first.username
    assert_equal true, owner.association(:kinks).target.first.association(:kink_havers).target.first.is_starred
    assert_equal 13, link.association(:past_links).target.last.id
    assert_equal 8, link.association(:forked_from).target.id
    assert_equal 5, link.association(:abilities).target.first.id
    assert_equal 'Owner', page.recent_posts.first.association(:user).target.username
    assert_equal 9, page.viewers.first.association(:viewing_link).target.id
    assert_equal 'Owner', page.scoop.association(:user).target.username
    assert_equal({ 9=>'🐱' }, page.decorations)
  end
  def test_empty_anonymous_page_needs_no_associated_records
    page = NodeDiscoveryBackend::Page.new('clients'=>[])
    assert_equal [], page.links
    assert_equal [], page.recent_posts
    assert_equal [], page.viewers
    assert_nil page.scoop
  end
end
