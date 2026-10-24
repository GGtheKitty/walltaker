class NodeAutomationEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      state = NodeNewsroomState.find(1)
      state.with_lock do
        if state.generation == generation && state.rendered_event_id.to_i < id
          Array(effects['actions']).each do |action|
            case action['target']
            when 'chyron'
              if action['remove']
                Turbo::StreamsChannel.broadcast_remove_to :chyron, target: :chyron
              else
                Turbo::StreamsChannel.broadcast_update_to :chyron, target: :chyron, partial: 'application/chyron', locals: { message: action['message'] }
              end
            when 'desk', 'news_backdrop'
              entry = NewsEntry.new(**action.fetch('entry').slice('image_url', 'message', 'lizard_image_url', 'type', 'transition_message').symbolize_keys)
              target = action['target'].to_sym
              partial = target == :desk ? 'news_room/desk' : 'news_room/backdrop'
              Turbo::StreamsChannel.broadcast_update_to target, target:, partial:, locals: { news_entry: entry }
            else
              raise ArgumentError, 'Unknown newsroom render target'
            end
          end
          state.update!(rendered_event_id: id)
        end
      end
      update!(delivered_at: Time.current)
    end
  end
end
