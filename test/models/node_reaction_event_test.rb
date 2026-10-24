require 'test_helper'
require 'minitest/mock'

class NodeReactionEventTest < ActiveSupport::TestCase
  self.fixture_table_names = [] if respond_to?(:fixture_table_names=)

  def event
    record = NodeReactionEvent.new(link_id: 123, comment_ids: [456], notification_id: 789)
    record.define_singleton_method(:with_lock) { |&block| block.call }
    record.define_singleton_method(:update!) { |attributes| assign_attributes(attributes) }
    record
  end

  def with_adapters(fail_pages: false, missing_link: false)
    calls = []
    link = Struct.new(:id, :user).new(123, Object.new)
    link.define_singleton_method(:broadcast_link_page_updates) do |raise_on_error:|
      raise IOError, 'Redis unavailable' if fail_pages
      calls << [:page, raise_on_error]
    end
    link.define_singleton_method(:broadcast_api_update) { calls << [:cable] }
    comment = Object.new
    comment.define_singleton_method(:broadcast_updates) { calls << [:comment] }
    notification = Object.new
    notification.define_singleton_method(:broadcast_updates) { calls << [:notification] }
    scope = Object.new
    scope.define_singleton_method(:order) { |*| [comment] }
    Link.stub(:find_by, missing_link ? nil : link) do
      Comment.stub(:where, scope) do
        Notification.stub(:find_by, notification) do
          User.stub(:broadcast_api_update, ->(*) { calls << [:user] }) do
            ActionCable.server.stub(:broadcast, ->(*) { calls << [:cable] }) { yield calls }
          end
        end
      end
    end
  end

  test 'broadcasts comments notifications and client updates once per receipt' do
    record = event
    with_adapters do |calls|
      2.times { record.deliver! }
      assert record.delivered_at
      %i[page comment notification user cable].each { |kind| assert_equal 1, calls.count { |call| call.first == kind } }
    end
  end

  test 'a failed broadcast remains pending' do
    record = event
    with_adapters(fail_pages: true) do
      assert_raises(IOError) { record.deliver! }
      assert_nil record.delivered_at
    end
  end

  test 'a deleted link does not publish stale reactions' do
    record = event
    with_adapters(missing_link: true) do |calls|
      record.deliver!
      assert record.delivered_at
      assert_empty calls
    end
  end
end
