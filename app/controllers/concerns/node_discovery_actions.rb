module NodeDiscoveryActions
  extend ActiveSupport::Concern
  included do
    rescue_from NodeDiscoveryBackend::Unavailable do |error|
      render plain: error.message, status: :service_unavailable
    end
    rescue_from NodeDiscoveryBackend::Rejected do |error|
      render plain: error.message, status: error.status
    end
  end

  private

  def discovery(operation, **input)
    page = NodeDiscoveryBackend.page(operation, **input)
    response.set_header('X-Walltaker-Discovery', 'node')
    @recognized_wallpaper_clients = page.recognized_clients
    @emoji_link_decorations = page.decorations
    page
  end
end
