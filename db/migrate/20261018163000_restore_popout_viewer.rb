class RestorePopoutViewer < ActiveRecord::Migration[7.2]
  def up
    wallpaper_client = Class.new(ActiveRecord::Base) do
      self.table_name = 'wallpaper_clients'
    end

    popout_viewer = wallpaper_client.find_by(name: 'Popout Viewer')
    return unless popout_viewer

    popout_viewer.update_columns(deprecated: false)

    desktop_client = wallpaper_client.find_by(name: 'Desktop Client')
    return unless desktop_client

    clients = wallpaper_client.where(section: 'clients').order(:position, :id).to_a
    clients.delete(popout_viewer)
    clients.insert(clients.index(desktop_client) || clients.length, popout_viewer)

    clients.each_with_index do |client, index|
      client.update_columns(position: (index + 1) * 10)
    end
  end

  def down
    wallpaper_client = Class.new(ActiveRecord::Base) do
      self.table_name = 'wallpaper_clients'
    end

    wallpaper_client.find_by(name: 'Popout Viewer')&.update_columns(deprecated: true)
  end
end
