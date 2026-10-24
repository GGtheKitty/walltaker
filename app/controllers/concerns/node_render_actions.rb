module NodeRenderActions
  extend ActiveSupport::Concern
  included do
    rescue_from NodeRenderBackend::Unavailable do
      render plain: 'Page rendering is temporarily unavailable. Please try again.', status: :service_unavailable
    end
  end
  def render(*args, **options, &block)
    return super unless node_template_render?(args, options)
    spec = node_render_spec(args, options)
    html = NodeRenderBackend.render(self, **spec.slice(:template, :partial, :locals, :layout, :status))
    response.set_header('X-Walltaker-Renderer', 'node')
    result = super(html: html, layout: false, status: spec[:status])
    # Rails' HTML renderer assigns text/html even for a pre-rendered Turbo/JSON
    # body. Set the final media type after handing the body to the HTTP layer.
    response.content_type = spec[:content_type] || (request.format.json? ? 'application/json' : request.format.turbo_stream? ? 'text/vnd.turbo-stream.html' : 'text/html')
    result
  end
  def render_to_string(*args, **options, &block)
    return super unless node_template_render?(args, options)
    spec = node_render_spec(args, options)
    NodeRenderBackend.render(self, **spec.slice(:template, :partial, :locals, :layout, :status))
  end
  private
  def node_template_render?(args, options)
    return false unless NodeRenderBackend.enabled?
    return false if controller_path.start_with?('blazer/')
    return false if (options.keys & %i[plain json html body inline turbo_stream file js xml]).any?
    return false if args.first.is_a?(Hash) && (args.first.keys & %i[plain json html body inline turbo_stream file js xml]).any?
    request.format.html? || request.format.turbo_stream? || request.format.json?
  end
  def node_render_spec(args, options)
    options = (args.first.is_a?(Hash) ? args.first : {}).merge(args[1].is_a?(Hash) ? args[1] : {}).merge(options)
    template = options[:partial] || options[:template] || (args.first unless args.first.is_a?(Hash)) || options[:action] || action_name
    template = "#{controller_path}/#{template}" if template.is_a?(String) && !template.include?('/')
    partial = options[:partial].present?
    layout = if request.format.json? || request.format.turbo_stream? || partial || options.key?(:layout) && !options[:layout]
      nil
    elsif options[:layout].is_a?(String)
      options[:layout]
    elsif controller_path == 'news_room'
      'full_width'
    elsif controller_path == 'links' && action_name == 'embed'
      'base'
    elsif controller_path == 'link_wizard'
      'link_wizard'
    elsif self.class.name.start_with?('Nuttracker::')
      'nuttracker/application'
    else
      'application'
    end
    { template:, partial:, locals: options[:locals] || {}, layout:,
      status: Rack::Utils.status_code(options[:status] || response.status || 200), content_type: options[:content_type] }
  end
end
