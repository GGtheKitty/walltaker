require 'ahoy'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
  def self.env = OpenStruct.new(development?: false, test?: true)
end
class Ahoy::Visit < OpenStruct
  def self.instantiate(row)
    new(row.to_h { |key, value| [key, value && (key == 'id' || key.end_with?('_id')) ? value.to_i : value] })
  end
  def assign_attributes(row)
    row.each { |key, value| self[key] = value && (key == 'id' || key.end_with?('_id')) ? value.to_i : value }
  end
  def association(name)
    @associations ||= {}; @associations[name] ||= Struct.new(:target).new
  end
end
class BannedIp < OpenStruct
  def self.instantiate(row) = new(row)
end
require_relative '../../app/services/node_activity_backend'
require_relative '../../app/services/node_activity_store'
require_relative '../../config/initializers/ahoy'

class NodeActivityStoreTest < Minitest::Test
  def setup
    @old = ENV['ACTIVITY_BACKEND_URL']; ENV['ACTIVITY_BACKEND_URL'] = 'http://wallpaper_api:3002'
    @request = OpenStruct.new(path: '/', params: {}, cookies: {}, cookie_jar: {}, headers: {},
      remote_ip: '198.51.100.84', user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0', referer: nil, original_url: 'https://example.test/')
    @controller = OpenStruct.new(request: @request, current_user: nil)
  end
  def teardown
    @old ? ENV['ACTIVITY_BACKEND_URL'] = @old : ENV.delete('ACTIVITY_BACKEND_URL')
  end
  def test_actual_ahoy_tracker_sends_visit_metadata_and_events_to_node
    calls = []; row = nil
    NodeActivityBackend.stub(:request, ->(op, input) {
      calls << [op, input]
      case op
      when 'visit-create'
        row = input[:data].transform_keys(&:to_s).merge('id'=>'1')
        { 'visit'=>row, 'ban'=>nil }
      when 'visit' then { 'visit'=>row, 'ban'=>nil }
      when 'event-create' then { 'event_id'=>'2' }
      else raise "Unexpected operation #{op}"
      end
    }) do
      tracker = Ahoy::Tracker.new(controller: @controller)
      tracker.track_visit
      tracker.track('visit:/', { _url: 'https://example.test/' })
      assert_equal 1, tracker.visit.id
    end
    data = calls.find { |op, _| op == 'visit-create' }.last[:data]
    assert_match(/T\d\d:\d\d:/, data[:started_at])
    assert_equal '198.51.100.84', data[:ip]
    assert_match(/^[a-f0-9-]{36}$/, data[:visit_token])
    event = calls.find { |op, _| op == 'event-create' }.last
    assert_equal 'visit:/', event[:name]
    assert_equal data[:visitor_token], event[:visitor_token]
  end
  def test_authentication_updates_the_already_cached_visit_without_an_active_record_write
    row = { 'id'=>'1', 'visit_token'=>'visit', 'visitor_token'=>'visitor', 'user_id'=>nil }
    NodeActivityBackend.stub(:request, ->(op, input) { row = row.merge('user_id'=>input[:user_id]) if op == 'visit-authenticate'; { 'visit'=>row, 'ban'=>nil } }) do
      tracker = Ahoy::Tracker.new(controller: @controller)
      original = tracker.visit
      tracker.authenticate(OpenStruct.new(id: 42))
      assert_same original, tracker.visit
      assert_equal 42, tracker.visit.user_id
    end
  end
  def test_a_banned_ip_with_missing_cookies_produces_a_guard_object_without_a_visit_id
    NodeActivityBackend.stub(:request, ->(*) { { 'visit'=>nil, 'ban'=>{ 'id'=>9, 'ip_address'=>'198.51.100.84' } } }) do
      visit = Ahoy::Tracker.new(controller: @controller).visit
      assert_nil visit.id
      assert_equal 9, visit.association(:banned_ip).target.id
      assert_nil NodeActivityBackend.visit_proof(visit)
    end
  end
  def test_api_internal_and_health_requests_are_excluded_from_analytics
    %w[/api/links.json /_internal/wallpaper-events/1.json /_anycable /up].each do |path|
      @request.path = path
      NodeActivityBackend.stub(:request, ->(*) { raise 'Excluded request must not store a visit' }) do
        assert Ahoy::Tracker.new(controller: @controller).track_visit
      end
    end
  end
end
