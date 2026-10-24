require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/string'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
require 'logger'
require 'set'
require 'nokogiri'
require 'commonmarker'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
  def self.logger = Logger.new(File::NULL)
end
class ProfileDomain
  def self.instantiate(row)
    OpenStruct.new(row.merge('blocked?' => row['status'] == 2))
  end
end
require_relative '../../app/services/node_moderation_backend'
require_relative '../../app/services/profile_markdown'
require_relative '../../app/services/profile_domain_filter'
class NodeModerationScrubTest < Minitest::Test
  Event = Struct.new(:id, :effects) do
    def update!(attributes)
      self.effects = attributes.fetch(:effects)
    end
  end
  def rules
    [{ 'id'=>1, 'domain'=>'blocked.test', 'status'=>2 }, { 'id'=>2, 'domain'=>'safe.blocked.test', 'status'=>1 }]
  end
  def test_actual_html_css_and_markdown_parser_uses_node_rules_and_preserves_more_specific_approval
    html = '<a href="https://sub.blocked.test/x">blocked</a><img src="https://safe.blocked.test/ok"><style>p{background:url(https://blocked.test/a.png)}</style>'
    result = ProfileDomainFilter.filter(html, rules:)
    refute_includes result.content, 'sub.blocked.test'
    refute_includes result.content, 'https://blocked.test/a.png'
    assert_includes result.content, 'https://safe.blocked.test/ok'
    markdown = ProfileMarkdown.dump('[bad](https://blocked.test) ![good](https://safe.blocked.test/a.png)')
    filtered = ProfileDomainFilter.filter(markdown, rules:)
    assert_includes filtered.content, '[bad]()'
    assert_includes filtered.content, 'https://safe.blocked.test/a.png'
  end
  def test_scrub_is_bounded_persists_prepared_content_through_node_and_advances_only_after_success
    event = Event.new(42,{ 'scrub'=>true }); calls = []
    handler = ->(operation, input = {}) do
      calls << [operation,input]
      case operation
      when 'domain-scrub-page' then { 'profiles'=>[{ 'id'=>'9', 'content'=>'<img src="https://blocked.test/a.png">' }] }
      when 'domain-rules' then { 'rules'=>rules }
      when 'domain-scrub-save'
        assert_equal 42, input[:event_id]
        refute_includes input[:content], 'blocked.test'
        assert_includes input[:expected_content], 'blocked.test'
        { 'saved'=>true, 'exists'=>true }
      end
    end
    NodeModerationBackend.stub(:request,handler) { refute NodeModerationBackend.scrub_page!(event) }
    assert_equal '9', event.effects['scrub_cursor']
    assert_equal %w[domain-scrub-page domain-rules domain-scrub-save], calls.map(&:first)
  end
  def test_compare_and_swap_conflict_retries_without_advancing_the_cursor
    event = Event.new(42,{ 'scrub'=>true, 'scrub_cursor'=>'4' })
    handler = ->(operation, input = {}) do
      case operation
      when 'domain-scrub-page' then { 'profiles'=>[{ 'id'=>'9', 'content'=>'<img src="https://blocked.test/a.png">' }] }
      when 'domain-rules' then { 'rules'=>rules }
      when 'domain-scrub-save' then { 'saved'=>false, 'exists'=>true }
      end
    end
    NodeModerationBackend.stub(:request,handler) { refute NodeModerationBackend.scrub_page!(event) }
    assert_equal '4', event.effects['scrub_cursor']
  end
  def test_empty_page_completes_without_reading_rules_or_writing_profiles
    event = Event.new(42,{ 'scrub'=>true, 'scrub_cursor'=>'9' })
    handler = ->(operation,input) do
      assert_equal 'domain-scrub-page', operation
      assert_equal '9', input[:after_id]
      { 'profiles'=>[] }
    end
    NodeModerationBackend.stub(:request,handler) { assert NodeModerationBackend.scrub_page!(event) }
  end
end
