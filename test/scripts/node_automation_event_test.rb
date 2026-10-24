require 'active_support'
require 'active_support/core_ext/time'
require 'active_support/core_ext/hash/keys'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
class ApplicationRecord
  attr_accessor :id, :generation, :effects, :delivered_at
  def with_lock = yield
  def update!(attributes) = self.delivered_at = attributes[:delivered_at]
end
class NodeNewsroomState
  class << self
    attr_accessor :current
    def find(*) = current
  end
end
class NewsEntry
  attr_reader :attributes
  def initialize(**attributes) = @attributes = attributes
end
module Turbo
  class StreamsChannel
    class << self
      attr_accessor :calls, :fail
      def broadcast_update_to(*args, **options)
        raise IOError if fail
        calls << [args, options]
      end
      def broadcast_remove_to(*args, **options) = calls << [args, options]
    end
  end
end
require_relative '../../app/models/node_automation_event'

class NodeAutomationEventTest < Minitest::Test
  def setup
    @state = OpenStruct.new(generation: 7, rendered_event_id: nil)
    def @state.with_lock = yield
    def @state.update!(attributes) = self.rendered_event_id = attributes[:rendered_event_id]
    NodeNewsroomState.current = @state
    Turbo::StreamsChannel.calls = []
    Turbo::StreamsChannel.fail = false
  end
  def event(id = 10, generation = 7)
    NodeAutomationEvent.new.tap do |e|
      e.id = id; e.generation = generation
      e.effects = { 'actions'=>[{ 'target'=>'desk', 'entry'=>{ 'message'=>'Hello', 'lizard_image_url'=>'mascot/news/TaylorDeskOpen.png' } }, { 'target'=>'chyron', 'remove'=>true }] }
    end
  end
  def test_successful_render_is_acknowledged_once
    e = event
    2.times { e.deliver! }
    assert e.delivered_at
    assert_equal 2, Turbo::StreamsChannel.calls.size
    assert_equal 10, @state.rendered_event_id
    assert_equal 'news_room/desk', Turbo::StreamsChannel.calls.first.last[:partial]
  end
  def test_an_old_generation_or_delayed_older_receipt_cannot_replace_current_news
    stale = event(10, 6); stale.deliver!
    assert stale.delivered_at
    @state.rendered_event_id = 20
    older = event(11); older.deliver!
    assert older.delivered_at
    assert_empty Turbo::StreamsChannel.calls
  end
  def test_failed_broadcast_remains_retryable
    e = event
    Turbo::StreamsChannel.fail = true
    assert_raises(IOError) { e.deliver! }
    assert_nil e.delivered_at
    assert_nil @state.rendered_event_id
    Turbo::StreamsChannel.fail = false
    e.deliver!
    assert e.delivered_at
  end
end
