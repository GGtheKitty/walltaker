class HelpController < ApplicationController
  def index
    @wallpaper_clients = NodeBrowserBackend.enabled? ? NodeBrowserBackend.request('site-clients').fetch('clients').map { |row| WallpaperClient.instantiate(row) } : WallpaperClient.in_section('clients')
  end

  def faq
  end

  def client_guide
  end

  def deprecated_client_guide
  end
end
