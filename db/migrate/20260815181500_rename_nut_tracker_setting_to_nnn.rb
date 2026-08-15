class RenameNutTrackerSettingToNnn < ActiveRecord::Migration[7.2]
  def up
    execute <<~SQL.squish
      UPDATE site_settings
      SET key = 'nnn_enabled'
      WHERE key = 'nut_tracker_enabled'
        AND NOT EXISTS (
          SELECT 1 FROM site_settings WHERE key = 'nnn_enabled'
        )
    SQL

    execute "DELETE FROM site_settings WHERE key = 'nut_tracker_enabled'"
    Rails.cache.delete("site_settings/nnn_enabled")
    Rails.cache.delete("site_settings/nut_tracker_enabled")
  end

  def down
    execute <<~SQL.squish
      UPDATE site_settings
      SET key = 'nut_tracker_enabled'
      WHERE key = 'nnn_enabled'
        AND NOT EXISTS (
          SELECT 1 FROM site_settings WHERE key = 'nut_tracker_enabled'
        )
    SQL

    execute "DELETE FROM site_settings WHERE key = 'nnn_enabled'"
    Rails.cache.delete("site_settings/nnn_enabled")
    Rails.cache.delete("site_settings/nut_tracker_enabled")
  end
end
