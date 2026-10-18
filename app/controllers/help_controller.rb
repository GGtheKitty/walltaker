class HelpController < ApplicationController
  def index
    @wallpaper_clients = WallpaperClient.in_section('clients')
  end

  def faq
  end

  def client_guide
  end

  def deprecated_client_guide
  end
end
