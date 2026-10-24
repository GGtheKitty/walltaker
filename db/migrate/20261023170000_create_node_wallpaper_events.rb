class CreateNodeWallpaperEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :node_wallpaper_events do |t|
      t.string :request_key, null: false, limit: 160
      t.string :payload_digest, null: false, limit: 64
      t.bigint :link_id, null: false
      t.bigint :past_link_id, null: false
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_wallpaper_events, :request_key, unique: true
    add_index :node_wallpaper_events, :id, where: 'delivered_at IS NULL', name: 'index_pending_node_wallpaper_events'
  end
end
