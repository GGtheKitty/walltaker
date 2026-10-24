# Rails controllers keep HTTP flow while Node owns template/helper execution.
ActiveSupport.on_load(:action_view) do
  module NativeNodePartialRendering
    def turbo_stream
      return super unless NodeRenderBackend.enabled? && !controller&.controller_path.to_s.start_with?('blazer/')
      NodeRenderBackend::TurboBuilder.new(self)
    end
    def render(options = {}, locals = {}, &block)
      return super unless NodeRenderBackend.enabled? && !controller&.controller_path.to_s.start_with?('blazer/')
      if options.is_a?(String)
        return NodeRenderBackend.render(self, template: options, partial: true, locals:)
      elsif options.is_a?(Hash) && (options[:partial].is_a?(String) || options[:template].is_a?(String))
        return NodeRenderBackend.render(self, template: options[:partial] || options[:template], partial: !!options[:partial], locals: options[:locals] || {}, layout: nil)
      end
      super
    end
  end
  prepend NativeNodePartialRendering
end

Rails.application.config.after_initialize do
  module NativeNodeTurboDelivery
    def broadcast_action_to(*streamables, action:, target: nil, targets: nil, attributes: {}, **rendering)
      return super unless NodeRenderBackend.enabled?
      streamables = streamables.flatten.compact_blank
      return if streamables.empty?
      target = ActionView::RecordIdentifier.dom_id(target) if target.respond_to?(:to_key)
      targets = ActionView::RecordIdentifier.dom_id(targets) if targets.respond_to?(:to_key)
      NodeRenderBackend.broadcast(stream: send(:stream_name_from, streamables), action:, target:, targets:, **rendering)
    end
  end
  Turbo::StreamsChannel.singleton_class.prepend(NativeNodeTurboDelivery)
end
