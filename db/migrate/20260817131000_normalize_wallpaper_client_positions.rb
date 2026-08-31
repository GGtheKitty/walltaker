class NormalizeWallpaperClientPositions < ActiveRecord::Migration[7.2]
  def up
    wallpaper_client = Class.new(ActiveRecord::Base) do
      self.table_name = 'wallpaper_clients'
    end

    section_order = Arel.sql("CASE section WHEN 'clients' THEN 0 WHEN 'companion_apps' THEN 1 ELSE 2 END")
    legacy_order = Arel.sql("CASE name WHEN 'iOS Widget' THEN 50 WHEN 'macOS Client' THEN 60 ELSE position END")
    wallpaper_client.order(section_order, legacy_order, :match_position, :id).each_with_index do |client, index|
      position = (index + 1) * 10
      client.update_columns(position:, match_position: position)
    end
  end

  def down
  end
end
